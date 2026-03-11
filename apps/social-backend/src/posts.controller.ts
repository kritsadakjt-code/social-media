import {
  Body,
  Controller,
  Get,
  Inject,
  OnModuleInit,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClientGrpc, ClientProxy } from '@nestjs/microservices';
import { CreatePostDto } from '@app/shared/dto/users/posts/create-post.dto';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Observable } from 'rxjs';

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
}

@ApiTags('Posts')
@Controller('posts')
export class PostsController implements OnModuleInit {
  private postGrpcService: PostGrpcService;

  constructor(
    @Inject('POST_SERVICE') private readonly postClient: ClientProxy,
    @Inject('POST_SERVICE_GRPC') private readonly postGrpcClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.postGrpcService =
      this.postGrpcClient.getService<PostGrpcService>('PostService');
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
    this.postClient.emit('create_post', payload);
    return { message: 'ระบบกำลังสร้างโพสต์ของคุณอยู่เบื้องหลัง' };
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all posts' })
  getFeed() {
    return this.postGrpcService.getPosts({});
  }
}
