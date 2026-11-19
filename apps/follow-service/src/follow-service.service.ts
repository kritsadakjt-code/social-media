import { InjectModel } from '@nestjs/mongoose';
import { Follow } from './follow.schema';
import { Model } from 'mongoose';
import { ClientKafka, RpcException } from '@nestjs/microservices';
import { MongoError } from 'mongodb';
import { status } from '@grpc/grpc-js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { registry, UnfollowedSchema } from '@app/shared';
import { SchemaType } from '@kafkajs/confluent-schema-registry';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class FollowService {
  private unfollowedSchemaId!: number;
  private readonly logger = new Logger(FollowService.name);

  constructor(
    @InjectModel(Follow.name) private followModel: Model<Follow>,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();

    const unfollowed = await registry.register({
      type: SchemaType.AVRO,
      schema: JSON.stringify(UnfollowedSchema),
    });

    this.unfollowedSchemaId = unfollowed.id;
  }
  // func follow
  async followUser(data: { followerId: string; followingId: string }) {
    if (data.followerId === data.followingId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'คุณไม่สามารถติดตามตัวเองได้',
      });
    }

    try {
      const newFollow = new this.followModel({
        followerId: data.followerId,
        followingId: data.followingId,
      });

      await newFollow.save();

      this.kafkaClient.emit('follow_created', {
        followerId: data.followerId,
        followingId: data.followingId,
        timestamp: new Date().toISOString(),
      });

      return { success: true, message: 'ติดตามผู้ใช้นี้เรียบร้อยแล้ว' };
    } catch (error) {
      if (error instanceof MongoError && error.code === 11000) {
        throw new RpcException({
          code: status.ALREADY_EXISTS, // 409
          message: 'คุณติดตามผู้ใช้นี้ไปแล้ว',
        });
      }

      throw new RpcException({
        code: status.INTERNAL,
        message: 'เกิดข้อผิดพลาดในการติดตามผู้ใช้',
      });
    }
  }

  // func unfollow
  async unfollowUser(data: { followerId: string; followingId: string }) {
    const result = await this.followModel.findOneAndDelete({
      followerId: data.followerId,
      followingId: data.followingId,
    });

    if (!result) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'คุณยังไม่ได้ติดตามผู้ใช้นี้',
      });
    }

    const rawData = {
      followerId: data.followerId,
      followingId: data.followingId,
    };
    try {
      const encodedPayload = await registry.encode(
        this.unfollowedSchemaId,
        rawData,
      );
      this.kafkaClient.emit('unfollowed', { value: encodedPayload });
      console.log(`✅ ส่งข้อความผ่าน Unfollowed Registry สำเร็จ! `);
    } catch (error) {
      console.log(
        '❌ ไม่สามารถส่งข้อความผ่าน Unfollowed Schema Registry ได้:',
        error,
      );
    }

    return { success: true, message: 'เลิกติดตามเรียบร้อยแล้ว' };
  }

  // วิธี pagination
  async getFollowersBatch(
    userId: string,
    page: number = 1,
    limit: number = 1000,
  ): Promise<{
    followers: string[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const skip = (page - 1) * limit;

    // ดึง total (นับ)
    const total = await this.followModel.countDocuments({
      followingId: userId,
    });

    if (total === 0) {
      return {
        followers: [],
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasMore: false,
      };
    }

    // ดึง followers เฉพาะ batch นี้
    const follows = await this.followModel
      .find({ followingId: userId })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const followers = follows.map((doc) => doc.followerId);
    const totalPages = Math.ceil(total / limit);
    // ทํางานเเบบ sync ไม่เหมาะกับส่งข้อมูลเยอะมากๆ เเต่ทํางานกว่า chunk
    return {
      followers,
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  /**
   * NEW: ส่ง followers ทั้งหมดเป็น batch ผ่าน Kafka
   * แบ่งส่งทีละ 1,000 คน → message เล็ก
   */
  // วิธี async aggregation
  async sendFollowersInChunks(
    requestId: string,
    userId: string,
    postId: string,
    score: number,
    chunkSize: number = 1000,
  ): Promise<void> {
    const total = await this.followModel.countDocuments({
      followingId: userId,
    });

    if (total === 0) {
      // ส่ง empty response
      this.kafkaClient.emit('followers_chunk', {
        requestId,
        userId,
        postId,
        score,
        chunkIndex: 0,
        totalChunks: 0,
        followers: [],
        isLast: true,
      });
      return;
    }

    const totalChunks = Math.ceil(total / chunkSize);
    this.logger.log(
      `📤 [CHUNK] ส่ง ${total} followers ของ ${userId} เป็น ${totalChunks} chunks`,
    );

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const skip = chunkIndex * chunkSize;

      const follows = await this.followModel
        .find({ followingId: userId })
        .skip(skip)
        .limit(chunkSize)
        .lean()
        .exec();

      const followers = follows.map((doc) => doc.followerId);
      // ใช้ kafka ที่เป็น async เข้ามาช่วย เพราะเหมาะกับงานที่ข้อมูลเยอะๆ เเต่จะซับซ้อนกว่า batch ที่เป็น sync
      await lastValueFrom(
        this.kafkaClient.emit('followers_chunk', {
          requestId,
          userId,
          postId,
          score,
          chunkIndex,
          totalChunks,
          followers,
          isLast: chunkIndex === totalChunks - 1,
        }),
      );

      if (chunkIndex === 0 || chunkIndex === totalChunks - 1) {
        this.logger.log(
          `[TRACE follow emit] post=${postId} chunk=${chunkIndex + 1}/${totalChunks} t=${Date.now()}`,
        );
      }

      // Sleep ทุก 10 chunks (ให้ heartbeat) ลบได้
      // if ((chunkIndex + 1) % 10 === 0) {
      //   await new Promise((r) => setTimeout(r, 100));
      // }

      this.logger.log(
        `[requestId: ${requestId}] chunk ${chunkIndex + 1}/${totalChunks}: ${followers.length} followers`,
      );
    }
  }

  // old
  async getFollowersList(userId: string): Promise<string[]> {
    // ดึงว่าใคร follow userId นี้
    const follow = await this.followModel.find({ followingId: userId }).exec();

    return follow.map((doc) => doc.followerId);
  }
}
