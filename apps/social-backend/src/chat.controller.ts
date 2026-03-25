import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatHistoryQueryDto } from './dto/chat-history-query.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

export interface RequestWithUser extends Request {
  user: { userId: string };
}

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ transform: true }))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('history/:targetUserId')
  @ApiBearerAuth() // เเสดง icon กุญเเจ
  @ApiOperation({ summary: 'Get chat history with a user' })
  async getChatHistory(
    @Request() req: RequestWithUser,
    @Param('targetUserId') targetUserId: string,
    @Query() query: ChatHistoryQueryDto,
  ) {
    return this.chatService.getHistory(req.user.userId, targetUserId, query);
  }
}
