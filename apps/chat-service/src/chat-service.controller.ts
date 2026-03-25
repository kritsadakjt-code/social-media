import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { ChatHistoryResponse, ChatService } from './chat-service.service';
import { GrpcMethod } from '@nestjs/microservices';
import { GetChatHistoryDto } from '@app/shared';

@Controller()
export class ChatServiceController {
  constructor(private readonly chatService: ChatService) {}

  @GrpcMethod('ChatService', 'GetChatHistory')
  // chk dto ก่อนเข้า controller
  @UsePipes(new ValidationPipe({ transform: true }))
  async getChatHistory(data: GetChatHistoryDto): Promise<ChatHistoryResponse> {
    return this.chatService.getChatHistory(
      data.userId1,
      data.userId2,
      data.limit,
      data.cursor,
    );
  }
}
