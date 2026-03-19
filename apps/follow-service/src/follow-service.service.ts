import { InjectModel } from '@nestjs/mongoose';
import { Follow } from './follow.schema';
import { Model } from 'mongoose';
import { ClientKafka, RpcException } from '@nestjs/microservices';
import { MongoError } from 'mongodb';
import { status } from '@grpc/grpc-js';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class FollowService {
  constructor(
    @InjectModel(Follow.name) private followModel: Model<Follow>,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
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

    this.kafkaClient.emit('unfollowed', {
      followerId: data.followerId,
      followingId: data.followingId,
    });

    return { success: true, message: 'เลิกติดตามเรียบร้อยแล้ว' };
  }

  async getFollowersList(userId: string): Promise<string[]> {
    // ดึงว่าใคร follow userId นี้
    const follow = await this.followModel.find({ followingId: userId }).exec();

    return follow.map((doc) => doc.followerId);
  }
}
