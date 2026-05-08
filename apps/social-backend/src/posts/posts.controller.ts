import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreatePostDto } from '@app/shared/dto/users/posts/create-post.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCommentDto } from '@app/shared/dto/users/posts/create-comment.dto';

import type { RequestWithUser } from '../interfaces/request.interface';
import { PostsService } from './posts.service';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new post' })
  createPost(
    @Request() req: RequestWithUser,
    @Body() createPostDto: CreatePostDto,
  ) {
    return this.postsService.createPost(
      req.user.userId,
      req.user.username,
      createPostDto.content,
    );
  }

  @Get('all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all posts' })
  getFeed() {
    return this.postsService.getFeed();
  }

  // ดึงหน้า feed ว่าคนนั้นต้องเห็น post อะไรบ้างจาก redis
  @Get('feed')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user feed By ID' })
  async getUserFeedById(@Request() req: RequestWithUser) {
    console.log(`[GATEWAY] กำลังดึงหน้า Feed ผู้ใช้: ${req.user.userId}`);
    return this.postsService.getUserFeedById(req.user.userId);
  }

  // get profile
  @Get('user/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get posts by a specific user (Profile Page)' })
  getPostsByUserId(@Param('userId') targetUserId: string) {
    console.log(`[GATEWAY] ดึงโพสต์หน้าโปรไฟล์ของ: ${targetUserId}`);
    return this.postsService.getPostsByUserId(targetUserId);
  }

  // กดไลก์
  @Post(':id/like')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Like or Unlike a post' })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
  })
  likePost(
    @Request() req: RequestWithUser,
    @Param('id') postId: string,
    @Headers('x-idempotency-key') idempotencyKey?: string, //รับจาก client ถ้าไม่มีสร้างเอง
  ) {
    console.log(`[GATEWAY] User ${req.user.userId} กำลังกดไลก์โพสต์ ${postId}`);

    return this.postsService.likePost(
      postId,
      req.user.userId,
      idempotencyKey ?? uuidv4(),
    );
  }

  // add comment
  @Post(':id/comments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add a comment to a post' })
  addComment(
    @Request() req: RequestWithUser,
    @Param('id') postId: string,
    @Body() comment: CreateCommentDto,
  ) {
    console.log(`[GATEWAY] User ${req.user.username} คอมเมนต์โพสต์ ${postId}`);

    return this.postsService.addComment(
      postId,
      req.user.userId,
      req.user.username,
      comment.content,
    );
  }

  // ดึงคอมเมนต์ทั้งหมดของโพสต์
  @Get(':id/comments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get comments of a post' })
  getComments(@Param('id') postId: string) {
    console.log(`[GATEWAY] ดึงคอมเมนต์ของโพสต์: ${postId}`);
    return this.postsService.getComments(postId);
  }
}
