import {
  Controller,
  Delete,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import type { RequestWithUser } from '../interfaces/request.interface';
import { FollowsService } from './follows.service';

@ApiTags('Follows')
@Controller('follows')
export class FollowsController {
  constructor(private readonly followService: FollowsService) {}

  @Post(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Follow a user' })
  followUser(
    @Request() req: RequestWithUser,
    @Param('id') followingId: string,
  ) {
    return this.followService.followUser(req.user.userId, followingId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollowUser(
    @Request() req: RequestWithUser,
    @Param('id') followingId: string,
  ) {
    return this.followService.unfollowUser(req.user.userId, followingId);
  }
}
