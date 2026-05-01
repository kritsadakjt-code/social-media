import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Like, LikeDocument } from './like.schema';
import { Model } from 'mongoose';
import { Post } from './post.schema';
import Redis from 'ioredis';
import { ClientKafka, RpcException } from '@nestjs/microservices';
import { PostLikedSchema, registry } from '@app/shared';
import { SchemaType } from '@kafkajs/confluent-schema-registry';
import { status } from '@grpc/grpc-js';

@Injectable()
export class LikeSerivce {
  private postLikedSchemaId!: number;

  constructor(
    @InjectModel(Like.name) private readonly likeModel: Model<LikeDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    @Inject('KAFKA_SERVICE')
    private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    const postLiked = await registry.register({
      type: SchemaType.AVRO,
      schema: JSON.stringify(PostLikedSchema),
    });
    this.postLikedSchemaId = postLiked.id;
  }

  async Like(postId: string, userId: string, idempotencyKey: string) {
    // chk idempotency กัน request ซํ้า
    const idempotencyRedisKey = `idempotency:like:${idempotencyKey}`;
    const alreadyProcessed = await this.redis.get(idempotencyRedisKey);
    if (alreadyProcessed) {
      return JSON.parse(alreadyProcessed) as {
        success: boolean;
        liked: boolean;
        likes: number;
      };
    }

    // chk post มีจริงมั้ย
    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'ไม่พบโพสต์นี้ในระบบ',
      });
    }

    // เช็คว่าเคยกดไลก์แล้วหรือยัง;
    const existingLike = await this.likeModel.findOne({ postId, userId });

    let liked: boolean;
    let likeDelta: number;

    if (existingLike) {
      // ถ้าเคยกดไลก์เเล้ว Unlike ลบ like record ออก
      await this.likeModel.deleteOne({ postId, userId });
      liked = false;
      likeDelta = -1;
    } else {
      // ยังไม่เคยกดไลก์ สร้าง like record ใหม่
      await this.likeModel.create({ postId, userId });
      liked = true;
      likeDelta = 1;
    }

    // update redis counter
    const redisCounterKey = `likes:post:${postId}`;
    const newCount = await this.redis.incrby(redisCounterKey, likeDelta);
    // expire 7 วัน กัน key ค้าง
    await this.redis.expire(redisCounterKey, 604800);

    // Push ลง Batch Queue (จะ sync ลง MongoDB ทีหลัง) lpush ให้ข้อมูลใหม่อยู่ซ้ายสุด
    await this.redis.lpush(
      'likes:batch:queue',
      JSON.stringify({ postId, delta: likeDelta }),
    );

    // ส่ง emit kafka ตอนกดไลก์ให้ noti
    if (liked) {
      try {
        const encodedPayload = await registry.encode(this.postLikedSchemaId, {
          postId,
          postOwnerId: post.userId,
          likedByUserId: userId,
          timestamp: new Date().toISOString(),
        });

        this.kafkaClient.emit('post_events', {
          key: postId,
          value: encodedPayload,
          headers: { event_type: 'post_liked' },
        });
        console.error('✅ ส่ง post_liked event สำเร็จ:');
      } catch (error) {
        console.error('❌ ส่ง post_liked event ไม่สำเร็จ:', error);
      }
    }

    const result = { success: true, liked, likes: newCount };

    // บันทึก Idempotency result ไว้ 24 ชั่วโมง
    await this.redis.setex(idempotencyKey, 86400, JSON.stringify(result));

    return result;
  }

  // ดึง like count จาก Redis ก่อน ถ้าไม่มีค่อย fallback ไป MongoDB
  async getLikeCount(postId: string): Promise<number> {
    const redisKey = `likes:post:${postId}`;
    const cached = await this.redis.get(redisKey);

    if (cached !== null) return parseInt(cached);

    // fallback  ดึงจาก MongoDB แล้ว sync กลับ Redis
    const post = await this.postModel.findById(postId);
    const count = post?.likes ?? 0;
    await this.redis.setex(redisKey, 604800, count);
    return count;
  }

  // เช็คว่า user กดไลก์โพสต์นี้แล้วหรือยัง
  async isLiked(postId: string, userId: string): Promise<boolean> {
    const like = await this.likeModel.findOne({ postId, userId });
    return !!like; //ถ้ากดเเล้ว return false
  }
}
