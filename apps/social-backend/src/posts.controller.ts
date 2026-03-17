import {
  Body,
  Controller,
  Get,
  Inject,
  OnModuleInit,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ClientGrpc,
  ClientKafka,
  ClientProxy,
} from '@nestjs/microservices';
import { CreatePostDto } from '@app/shared/dto/users/posts/create-post.dto';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { firstValueFrom, Observable } from 'rxjs';

interface RequestWithUser extends Request {
  user: { userId: string; username: string; role: string };
}

// สร้างตัวเเทน post proto
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

interface PostGrpcService {
  getPosts(data: Record<string, never>): Observable<PostListResponse>;
  getPostsByIds(data: { ids: string[] }): Observable<PostListResponse>;
  getPostsByUserId(data: { userId: string }): Observable<PostListResponse>;
  likePost(data: { postId: string; userId: string }): Observable<PostData>;
}

@ApiTags('Posts')
@Controller('posts')
export class PostsController implements OnModuleInit {
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

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new post' })
  createPost(
    @Request() req: RequestWithUser,
    @Body() createPostDto: CreatePostDto,
  ) {
    const payload = {
      userId: req.user.userId,
      username: req.user.username,
      content: createPostDto.content,
    };
    this.postRabbitClient.emit('create_post', payload);
    return { message: 'ระบบกำลังสร้างโพสต์ของคุณอยู่เบื้องหลัง' };
  }

  @Get('all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all posts' })
  getFeed() {
    return this.postGrpcService.getPosts({});
  }

  @Get('feed')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user feed By ID' })
  async getUserFeedById(@Request() req: RequestWithUser) {
    console.log(`[GATEWAY] กำลังดึงหน้า Feed ผู้ใช้: ${req.user.userId}`);

    const postIds: string[] = await firstValueFrom(
      this.feedKafkaClient.send('get_user_feed', { userId: req.user.userId }),
    );

    if (!postIds || postIds.length === 0) {
      return { posts: [] };
    }
    // ส่ง postIds ไปที่ service ด้วย gRPC
    const postsResult = await firstValueFrom(
      this.postGrpcService.getPostsByIds({ ids: postIds }),
    );

    return postsResult;
  }

  @Get('user/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get posts by a specific user (Profile Page)' })
  getPostsByUserId(@Param('userId') targetUserId: string) {
    console.log(`[GATEWAY] ดึงโพสต์หน้าโปรไฟล์ของ: ${targetUserId}`);
    return this.postGrpcService.getPostsByUserId({ userId: targetUserId });
  }

  @Post(':id/like')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Like a post' })
  likePost(@Request() req: RequestWithUser, @Param('id') postId: string) {
    console.log(`[GATEWAY] User ${req.user.userId} กำลังกดไลก์โพสต์ ${postId}`);

    return this.postGrpcService.likePost({
      postId: postId,
      userId: req.user.userId,
    });
  }
}
