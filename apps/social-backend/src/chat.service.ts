import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ChatHistoryResponse, ChatServiceClient } from '@app/shared';
import { ChatHistoryQueryDto } from './dto/chat-history-query.dto';
import { firstValueFrom } from 'rxjs';
import type { ClientGrpc } from '@nestjs/microservices';

@Injectable()
export class ChatService implements OnModuleInit {
  private chatService!: ChatServiceClient;

  constructor(@Inject('CHAT_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.chatService = this.client.getService<ChatServiceClient>('ChatService');
  }

  async getHistory(
    currentUserId: string,
    targetUserId: string,
    query: ChatHistoryQueryDto,
  ): Promise<ChatHistoryResponse> {
    if (currentUserId === targetUserId) {
      // error ที่อยู่ใน gateway return เป็น http เลย เพราะเป็นด่านเเรกที่ติดต่อกับผู้ใช้อยู่เเล้ว ไม่ได้ใช้ grpc
      throw new BadRequestException('ไม่สามารถดึงประวัติการแชทกับตัวเองได้');
    }

    try {
      const response = await firstValueFrom(
        this.chatService.getChatHistory({
          userId1: currentUserId,
          userId2: targetUserId,
          limit: query.limit,
          cursor: query.cursor,
        }),
      );

      return {
        ...response,
        messages: response.messages || [],
      };
    } catch (error) {
      console.error('[ChatGatewayService] getHistory error:', error);

      throw new InternalServerErrorException(
        'เกิดข้อผิดพลาดในการดึงประวัติแชทจากเซิร์ฟเวอร์',
      );
    }
  }
}
