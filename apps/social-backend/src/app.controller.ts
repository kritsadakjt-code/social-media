import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  OnModuleInit,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClientGrpc, ClientProxy } from '@nestjs/microservices';
import { LoginDto, RegisterDto, UpdateUserDto } from '@app/shared';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Observable } from 'rxjs';
import { CreatePostDto } from '@app/shared/dto/users/posts/create-post.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    username: string;
    role: string;
  };
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  role: string;
  bio: string;
  avatarUrl: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserResponse;
}

interface UserGrpcService {
  register(data: RegisterDto): Observable<UserResponse>;
  login(data: LoginDto): Observable<LoginResponse>;
  getUser(data: { id: string }): Observable<UserResponse>;
  updateUser(data: {
    id: string;
    bio?: string;
    avatarUrl?: string;
  }): Observable<UserResponse>;
  deleteUser(data: { id: string }): Observable<{ success: boolean }>;
}

@ApiTags('authentication')
@Controller('auth')
export class AppController implements OnModuleInit {
  private userGrpcService: UserGrpcService;

  constructor(
    @Inject('USER_SERVICE') private readonly client: ClientGrpc,
    @Inject('POST_SERVICE') private readonly postClient: ClientProxy,
  ) {}

  onModuleInit() {
    this.userGrpcService =
      this.client.getService<UserGrpcService>('UserService');
  }

  @Post('register')
  @ApiOperation({ summary: 'register a new user' })
  registerUser(@Body() registerDto: RegisterDto) {
    return this.userGrpcService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'login user' })
  loginUser(@Body() loginDto: LoginDto) {
    return this.userGrpcService.login(loginDto);
  }

  @Get('user/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'get current profile' })
  getProfile(@Request() req: RequestWithUser) {
    return this.userGrpcService.getUser({ id: req.user.userId });
  }

  @Put('users/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile' })
  updateProfile(
    @Request() req: RequestWithUser,
    @Body() updateDto: UpdateUserDto,
  ) {
    return this.userGrpcService.updateUser({
      id: req.user.userId,
      ...updateDto,
    });
  }

  @Delete('users/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete user account' })
  deleteAccount(@Request() req: RequestWithUser) {
    return this.userGrpcService.deleteUser({ id: req.user.userId });
  }

  // Post
  @Post('posts')
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
}
