import { registry } from '@app/shared';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import Redis from 'ioredis';
import { firstValueFrom } from 'rxjs';

// interface PostItem {
//   id: string;
//   userId: string;
//   username: string;
//   content: string;
//   likes: number;
//   createdAt: string;
// }

// interface UserPostsResponse {
//   posts: PostItem[];
// }

export interface PostCreatedEventPayload {
  postId: string;
  authorId: string;
  content: string;
  timestamp: string;
  // imageUrl: string | null;
}

@Injectable()
export class FeedService implements OnModuleInit {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    this.kafkaClient.subscribeToResponseOf('get_followers');
    this.kafkaClient.subscribeToResponseOf('get_post_ids_for_feed_cleanup');
    await this.kafkaClient.connect();
  }

  async handlePostCreated(encodedMessage: Buffer | { value: Buffer | string }) {
    let message: PostCreatedEventPayload;

    try {
      const bufferData = Buffer.isBuffer(encodedMessage)
        ? encodedMessage
        : Buffer.from(encodedMessage.value || '');
      message = (await registry.decode(bufferData)) as PostCreatedEventPayload;
    } catch (error) {
      this.logger.error(
        '❌ ข้อมูลผิดโครงสร้าง (ทิ้งข้อความ)!:',
        (error as Error).message,
      );
      return;
    }
    this.logger.log(
      `\n📢 [FEED SERVICE] ได้รับโพสต์ใหม่ (ถอดรหัสสำเร็จ) จาก: ${message.authorId}`,
    );
    // this.logger.log(
    //   `รูปภาพที่แนบมา: ${message.imageUrl ? message.imageUrl : 'ไม่มีรูปภาพ'}`,
    // );

    this.logger.log(`กำลังขอรายชื่อผู้ติดตามของ ${message.authorId}...`);
    const followers: string[] = await firstValueFrom(
      this.kafkaClient.send('get_followers', { userId: message.authorId }),
    );

    if (!followers || followers.length === 0) {
      this.logger.log('🤷‍♂️ ไม่มีใครติดตามผู้ใช้นี้เลย ไม่ต้องอัปเดต Feed');
      return;
    }

    this.logger.log(`มีผู้ติดตาม ${followers.length} คน, กำลังอัปเดต Redis...`);

    // แปลงเวลา เป็น Timestamp เพื่อเรียงลำดับใน Redis
    const score = new Date(message.timestamp).getTime();

    const pipeline = this.redis.pipeline();

    followers.forEach((followerId) => {
      // โครงสร้างคีย์คือ feed:{followerId}
      // zadd ยัดลง Sorted Set โดยใช้ score (เวลา) เป็นตัวเรียงลำดับ
      pipeline.zadd(`feed:${followerId}`, score, message.postId);
      // เก็บ 20 โพสต์ ลบอันดับที่ 0 ถึง -21 จะเหลือ อันดับที่ -20 ถึง -1 จะได้ 20 โพสต์ล่าสุด// - คือนับจากด้านหลัง
      pipeline.zremrangebyrank(`feed:${followerId}`, 0, -21);
      // หมดอายุ 7 วัน
      pipeline.expire(`feed:${followerId}`, 604800);
    });
    // set ข้อมูลไว้ที่ redis ก่อนเพื่อเตรียมนําไปใช้
    await pipeline.exec();
    this.logger.log('✅ อัปเดต News Feed ให้ผู้ติดตามสำเร็จแล้ว!\n');
  }

  async handleUnfollowed(
    // อาจเป็น string ได้ถ้าส่งมาตรงๆ เเบบยังไม่ใช้ schema registry
    encodedMessage: Buffer | { value: Buffer | string },
  ) {
    let message: { followerId: string; followingId: string };

    try {
      let bufferData: Buffer;
      if (Buffer.isBuffer(encodedMessage)) {
        bufferData = encodedMessage;
      } else {
        // .from เเปลงเป็น buffer ถ้าส่งมาเป็น object หรือ string
        bufferData = Buffer.from(encodedMessage.value || '');
      }
      message = (await registry.decode(bufferData)) as typeof message;
    } catch (error) {
      this.logger.error(
        '❌ ข้อมูลผิดโครงสร้าง (ทิ้งข้อความ)!:',
        (error as Error).message,
      );
      return;
    }
    this.logger.log(
      `\n🧹 [FEED CLEANUP] User ${message.followerId} เลิกติดตาม ${message.followingId}`,
    );

    try {
      const userPosts = await firstValueFrom<{ ids: string[] }>(
        this.kafkaClient.send('get_post_ids_for_feed_cleanup', {
          userId: message.followingId,
        }),
      );

      if (!userPosts?.ids?.length) {
        this.logger.log('🤷‍♂️ ไม่มีโพสต์ให้ลบออกจาก Feed');
        return;
      }

      this.logger.log(
        `กำลังลบ ${userPosts?.ids?.length} โพสต์ ออกจาก Feed ของ ${message.followerId}...`,
      );

      const pipeline = this.redis.pipeline();
      pipeline.zrem(`feed:${message.followerId}`, ...userPosts.ids);
      await pipeline.exec();

      this.logger.log('✅ ล้างหน้า Feed สำเร็จ!\n');
    } catch (error) {
      const err = error as Error;
      this.logger.error('❌ ล้างหน้า Feed ไม่สำเร็จ:', err.message || err);
    }
  }

  async getUserFeed(userId: string): Promise<string[]> {
    this.logger.log(`[FEED SERVICE] ดูหน้า Feed ของ User ID: ${userId}`);

    const postIds = await this.redis.zrevrange(`feed:${userId}`, 0, 19);

    this.logger.log(`ดึง Post IDs สำเร็จ จำนวน ${postIds.length} โพสต์`);
    return postIds;
  }
}
