import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

export interface FollowResponse {
  success: boolean;
  message: string;
}

interface FollowGrpcService {
  followUser(data: {
    followerId: string;
    followingId: string;
  }): Observable<FollowResponse>;
  unfollowUser(data: {
    followerId: string;
    followingId: string;
  }): Observable<FollowResponse>;
}

@Injectable()
export class FollowsService implements OnModuleInit {
  private followGrpcService: FollowGrpcService;
  constructor(
    @Inject('FOLLOW_SERVICE') private readonly followClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.followGrpcService =
      this.followClient.getService<FollowGrpcService>('FollowService');
  }

  followUser(followerId: string, followingId: string) {
    return this.followGrpcService.followUser({ followerId, followingId });
  }

  unfollowUser(followerId: string, followingId: string) {
    return this.followGrpcService.unfollowUser({ followerId, followingId });
  }
}
