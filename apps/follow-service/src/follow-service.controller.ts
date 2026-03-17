import { Controller } from '@nestjs/common';
import { FollowService } from './follow-service.service';
import { GrpcMethod, MessagePattern, Payload } from '@nestjs/microservices';

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

  @MessagePattern('get_followers')
  async handleGetFollowers(@Payload() data: { userId: string }) {
    console.log(`[FOLLOW SERVICE] มีคนมาขอรายชื่อผู้ติดตามของ: ${data.userId}`);
    return this.followService.getFollowersList(data.userId);
  }
}
