import {
  Controller,
  Delete,
  Inject,
  OnModuleInit,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClientGrpc } from '@nestjs/microservices';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Observable } from 'rxjs';

interface RequestWithUser extends Request {
  user: { userId: string; username: string; role: string };
}

export interface FollowResponse {
  success: boolean;
  message: string;
}

interface FollowGrpcService {
  followUser(data: {
    followerId: string;
    followingId: string;
  }): Observable<FollowResponse>;
  unfollowUser(data: {
    followerId: string;
    followingId: string;
  }): Observable<FollowResponse>;
}

@ApiTags('Follows')
@Controller('follows')
export class FollowsController implements OnModuleInit {
  private followGrpcService: FollowGrpcService;

  constructor(
    @Inject('FOLLOW_SERVICE') private readonly followClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.followGrpcService =
      this.followClient.getService<FollowGrpcService>('FollowService');
  }

  @Post(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Follow a user' })
  followUser(
    @Request() req: RequestWithUser,
    @Param('id') followingId: string,
  ) {
    return this.followGrpcService.followUser({
      followerId: req.user.userId,
      followingId: followingId,
    });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollowUser(
    @Request() req: RequestWithUser,
    @Param('id') followingId: string,
  ) {
    return this.followGrpcService.unfollowUser({
      followerId: req.user.userId,
      followingId: followingId,
    });
  }
}
