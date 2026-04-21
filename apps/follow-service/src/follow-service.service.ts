import { InjectModel } from '@nestjs/mongoose';
import { Follow } from './follow.schema';
import { Model } from 'mongoose';
import { ClientKafka, RpcException } from '@nestjs/microservices';
import { MongoError } from 'mongodb';
import { status } from '@grpc/grpc-js';
import { Inject, Injectable } from '@nestjs/common';
import { registry, UnfollowedSchema } from '@app/shared';
import { SchemaType } from '@kafkajs/confluent-schema-registry';

@Injectable()
export class FollowService {
  private unfollowedSchemaId!: number;

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
      this.kafkaClient.emit('unfollowed', {
        encodedPayload,
      });
      console.log(`✅ ส่งข้อความผ่าน Unfollowed Registry สำเร็จ! `);
    } catch (error) {
      console.log(
        '❌ ไม่สามารถส่งข้อความผ่าน Unfollowed Schema Registry ได้:',
        error,
      );
    }

    return { success: true, message: 'เลิกติดตามเรียบร้อยแล้ว' };
  }

  async getFollowersList(userId: string): Promise<string[]> {
    // ดึงว่าใคร follow userId นี้
    const follow = await this.followModel.find({ followingId: userId }).exec();

    return follow.map((doc) => doc.followerId);
  }
}
