import {
  Controller,
  Delete,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { FollowsService } from './follows.service';
import type { RequestWithUser } from './interfaces/request.interface';

@ApiTags('Follows')
@Controller('follows')
export class FollowsController {
  private readonly followService: FollowsService;

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
