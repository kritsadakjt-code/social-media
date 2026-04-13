import { Observable } from 'rxjs';

export interface FollowResponse {
  success: boolean;
  message: string;
}

export interface FollowGrpcService {
  followUser(data: {
    followerId: string;
    followingId: string;
  }): Observable<FollowResponse>;
  unfollowUser(data: {
    followerId: string;
    followingId: string;
  }): Observable<FollowResponse>;
}
