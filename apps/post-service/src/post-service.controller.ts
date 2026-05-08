import { LikeService } from './like.service';

import { Controller } from '@nestjs/common';
import { PostService } from './post-service.service';
import {
  EventPattern,
  GrpcMethod,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';

@Controller()
export class PostServiceController {
  constructor(
    private readonly postService: PostService,
    private readonly likeService: LikeService,
  ) {}

  // queue RabbitMQ ชื่อ 'create_post'
  @EventPattern('create_post')
  async handlePostCreate(
    @Payload() data: { userId: string; username: string; content: string },
  ) {
    console.log('📥 [Post Service] ได้รับคำสั่งสร้างโพสต์ใหม่จาก Gateway');
    try {
      await this.postService.createPost(data);
    } catch (error) {
      console.error('❌ เซฟโพสต์ไม่สำเร็จ:', error);
    }
  }

  @GrpcMethod('PostService', 'GetPosts')
  async getPosts() {
    return this.postService.getPosts();
  }

  @GrpcMethod('PostService', 'getPostsByPostIdsRedis')
  async getPostsByPostIdsRedis(data: { ids: string[] }) {
    // ป้องกันกรณีส่ง Array ว่างมา
    const idsToSearch = data.ids || [];
    return this.postService.getPostsByPostIdsRedis(idsToSearch);
  }

  @GrpcMethod('PostService', 'GetPostsByUserId')
  async getPostsByUserId(data: { userId: string }) {
    return this.postService.getPostsWithDetailByUserId(data.userId);
  }

  @GrpcMethod('PostService', 'LikePost')
  async likePost(data: {
    postId: string;
    userId: string;
    idempotencyKey: string;
  }) {
    try {
      return await this.likeService.likePost(
        data.postId,
        data.userId,
        data.idempotencyKey,
      );
    } catch (error) {
      console.error('❌ กดไลก์ไม่สำเร็จ:', error);
      throw error;
    }
  }

  @GrpcMethod('PostService', 'AddComment')
  async addComment(data: {
    postId: string;
    userId: string;
    username: string;
    content: string;
  }) {
    return this.postService.addComment(data);
  }

  @GrpcMethod('PostService', 'GetCommentsByPostId')
  async getCommentsByPostId(data: { postId: string }) {
    return this.postService.getCommentsByPostId(data.postId);
  }

  @MessagePattern('get_post_ids_for_feed_cleanup')
  async getPostsForCleanup(@Payload() data: { userId: string }) {
    return this.postService.getPostsByUserId(data.userId);
  }
}
