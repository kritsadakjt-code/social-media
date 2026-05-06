import { PostGrpcService } from '@app/shared';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ClientGrpc,
  ClientKafka,
  ClientProxy,
} from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PostsService implements OnModuleInit {
  private postGrpcService!: PostGrpcService;

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

  likePost(postId: string, userId: string, idempotencyKey: string) {
    return this.postGrpcService.likePost({ postId, userId, idempotencyKey });
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
