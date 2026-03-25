import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ClientGrpc,
  ClientKafka,
  ClientProxy,
} from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';

export interface PostData {
  id: string;
  userId: string;
  username: string;
  content: string;
  likes: number;
  createdAt: string;
}
export interface PostListResponse {
  posts: PostData[];
}
export interface CommentData {
  id: string;
  postId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}
export interface CommentListResponse {
  comments: CommentData[];
}

interface PostGrpcService {
  getPosts(data: Record<string, never>): Observable<PostListResponse>;
  getPostsByIds(data: { ids: string[] }): Observable<PostListResponse>;
  getPostsByUserId(data: { userId: string }): Observable<PostListResponse>;
  likePost(data: { postId: string; userId: string }): Observable<PostData>;
  addComment(data: {
    postId: string;
    userId: string;
    username: string;
    content: string;
  }): Observable<CommentData>;
  getCommentsByPostId(data: {
    postId: string;
  }): Observable<CommentListResponse>;
}

@Injectable()
export class PostsService implements OnModuleInit {
  private postGrpcService: PostGrpcService;

  constructor(
    @Inject('POST_SERVICE_RABBITMQ')
    private readonly postRabbitClient: ClientProxy,
    @Inject('POST_SERVICE_GRPC') private readonly postGrpcClient: ClientGrpc,
    @Inject('FEED_SERVICE') private readonly feedKafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    this.postGrpcService =
      this.postGrpcClient.getService<PostGrpcService>('PostService');
    this.feedKafkaClient.subscribeToResponseOf('get_user_feed');
    await this.feedKafkaClient.connect();
  }

  createPost(userId: string, username: string, content: string) {
    this.postRabbitClient.emit('create_post', { userId, username, content });
    return { message: 'ระบบกำลังสร้างโพสต์ของคุณอยู่เบื้องหลัง' };
  }

  getFeed() {
    return this.postGrpcService.getPosts({});
  }

  async getUserFeedById(userId: string) {
    console.log(`[GATEWAY] กำลังดึงหน้า Feed ผู้ใช้: ${userId}`);
    const postIds: string[] = await firstValueFrom(
      this.feedKafkaClient.send('get_user_feed', { userId }),
    );

    if (!postIds || postIds.length === 0) {
      return { posts: [] };
    }
    return firstValueFrom(this.postGrpcService.getPostsByIds({ ids: postIds }));
  }

  getPostsByUserId(targetUserId: string) {
    return this.postGrpcService.getPostsByUserId({ userId: targetUserId });
  }

  likePost(postId: string, userId: string) {
    return this.postGrpcService.likePost({ postId, userId });
  }

  addComment(
    postId: string,
    userId: string,
    username: string,
    content: string,
  ) {
    return this.postGrpcService.addComment({
      postId,
      userId,
      username,
      content,
    });
  }

  getComments(postId: string) {
    return this.postGrpcService.getCommentsByPostId({ postId });
  }
}
