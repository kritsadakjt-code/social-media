import { Controller } from '@nestjs/common';
import { FollowService } from './follow-service.service';
import { GrpcMethod } from '@nestjs/microservices';

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
}
