import { Controller } from '@nestjs/common';
import { PostService } from './post-service.service';
import { EventPattern, GrpcMethod, Payload } from '@nestjs/microservices';

@Controller()
export class PostServiceController {
  constructor(private readonly postService: PostService) {}

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
}
