import { Controller } from '@nestjs/common';
import { FollowService } from './follow-service.service';
import {
  Ctx,
  EventPattern,
  GrpcMethod,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';

@Controller()
export class FollowServiceController {
  constructor(private readonly followService: FollowService) {}

  @GrpcMethod('FollowService', 'FollowUser')
  async followUser(data: { followerId: string; followingId: string }) {
    return this.followService.followUser(data);
  }

  @GrpcMethod('FollowService', 'UnfollowUser')
  async unfollowUser(data: { followerId: string; followingId: string }) {
    return this.followService.unfollowUser(data);
  }

  // old
  @MessagePattern('get_followers')
  async handleGetFollowers(@Payload() data: { userId: string }) {
    console.log(`[FOLLOW SERVICE] มีคนมาขอรายชื่อผู้ติดตามของ: ${data.userId}`);
    return this.followService.getFollowersList(data.userId);
  }

  /**
   * NEW: ส่ง followers เป็น batch (pagination)
   * Request: { userId, page, limit }
   * Response: { followers, page, limit, total, totalPages, hasMore }
   */
  @MessagePattern('get_followers_batch')
  async handleGetFollowersBatch(
    @Payload() data: { userId: string; page?: number; limit?: number },
  ) {
    const page = data.page || 1;
    const limit = data.limit || 1000;

    console.log(
      `[FOLLOW] ขอ followers ของ ${data.userId} (page ${page}, limit ${limit})`,
    );

    return this.followService.getFollowersBatch(data.userId, page, limit);
  }

  /**
   * NEW: trigger chunked emit (สำหรับ event-driven pattern)
   * Request: { requestId, userId, chunkSize }
   * Response: { success, totalChunks }
   */
  // @MessagePattern('get_followers_chunked')
  @EventPattern('get_followers_chunked')
  async handleGetFollowersChunked(
    @Payload()
    data: {
      requestId: string;
      userId: string;
      postId: string;
      score: number;
      chunkSize?: number;
    },
    @Ctx() context: KafkaContext,
  ) {
    const chunkSize = data.chunkSize || 1000;

    // console.log(
    //   `[FOLLOW] ขอ followers chunked ของ ${data.userId} (${chunkSize}/chunk)`,
    // );

    const t0 = Date.now();
    const partition = context.getPartition();
    console.log(
      `[TRACE follow get_followers_chunked] START partition=${partition} author=${data.userId} post=${data.postId} t=${t0}`,
    );

    // Emit ไป topic 'followers_chunk' ทีละ chunk
    await this.followService.sendFollowersInChunks(
      data.requestId,
      data.userId,
      data.postId,
      data.score,
      chunkSize,
    );

    console.log(
      `[TRACE follow get_followers_chunked] END   partition=${partition} author=${data.userId} post=${data.postId} took=${Date.now() - t0}ms t=${Date.now()}`,
    );

    // คืน metadata
    // const total = await this.followService
    //   .getFollowersList(data.userId)
    //   .then((f) => f.length);
    // const totalChunks = Math.ceil(total / chunkSize);

    // return {
    //   success: true,
    //   requestId: data.requestId,
    //   totalChunks,
    //   totalFollowers: total,
    // };
  }
}
