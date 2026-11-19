import { Observable } from 'rxjs';

export interface FeedGrpcService {
  getUserFeed(data: { userId: string }): Observable<{ postIds: string[] }>;
}
