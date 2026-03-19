import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  OnModuleInit,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClientGrpc } from '@nestjs/microservices';
import { UpdateUserDto } from '@app/shared';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Observable } from 'rxjs';

// user.proto
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

interface UserGrpcService {
  getUser(data: { id: string }): Observable<UserResponse>;
  updateUser(data: {
    id: string;
    bio?: string;
    avatarUrl?: string;
  }): Observable<UserResponse>;
  deleteUser(data: { id: string }): Observable<{ success: boolean }>;
}

@ApiTags('Users')
@Controller('users')
export class UsersController implements OnModuleInit {
  private userGrpcService: UserGrpcService;

  constructor(@Inject('USER_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.userGrpcService =
      this.client.getService<UserGrpcService>('UserService');
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current profile' })
  getProfile(@Request() req: RequestWithUser) {
    return this.userGrpcService.getUser({ id: req.user.userId });
  }

  @Put('me')
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

  @Delete('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete user account' })
  deleteAccount(@Request() req: RequestWithUser) {
    return this.userGrpcService.deleteUser({ id: req.user.userId });
  }
}
