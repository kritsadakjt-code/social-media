import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Follow } from './follow.schema';
import { Model } from 'mongoose';
import { RpcException } from '@nestjs/microservices';
import { MongoError } from 'mongodb';

@Injectable()
export class FollowService {
  constructor(@InjectModel(Follow.name) private followModel: Model<Follow>) {}

  // func follow
  async followUser(data: { followerId: string; followingId: string }) {
    if (data.followerId === data.followingId) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'คุณไม่สามารถติดตามตัวเองได้',
      });
    }

    try {
      const newFollow = new this.followModel({
        followerId: data.followerId,
        followingId: data.followingId,
      });

      await newFollow.save();
      return { success: true, message: 'ติดตามผู้ใช้นี้เรียบร้อยแล้ว' };
    } catch (error) {
      if (error instanceof MongoError && error.code === 11000) {
        throw new RpcException({
          status: HttpStatus.CONFLICT, // 409
          message: 'คุณติดตามผู้ใช้นี้ไปแล้ว',
        });
      }

      throw new RpcException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
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
        status: HttpStatus.BAD_REQUEST,
        message: 'คุณยังไม่ได้ติดตามผู้ใช้นี้',
      });
    }

    return { success: true, message: 'เลิกติดตามเรียบร้อยแล้ว' };
  }
}
