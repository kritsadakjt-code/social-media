import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateUserDto } from '@app/shared';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersService } from './users.service';
import type { RequestWithUser } from './interfaces/request.interface';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersSerivce: UsersService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current profile' })
  getProfile(@Request() req: RequestWithUser) {
    return this.usersSerivce.getProfile(req.user.userId);
  }

  @Put('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile' })
  updateProfile(
    @Request() req: RequestWithUser,
    @Body() updateDto: UpdateUserDto,
  ) {
    return this.usersSerivce.updateProfile(req.user.userId, updateDto);
  }

  @Delete('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete user account' })
  deleteAccount(@Request() req: RequestWithUser) {
    return this.usersSerivce.deleteAccount(req.user.userId);
  }
}
