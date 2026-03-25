import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService, ChatMessageResponse } from './chat-service.service';

// client ส่งมา
export interface SendMessagePayload {
  receiverId: string;
  content: string;
}

// โครงสร้างที่จะเก็บข้อมูลใน session
export interface ClientSocketData {
  userId: string;
}

// โครงสร้างสำหรับ Handshake Query และ Auth
export interface HandshakeAuth {
  token?: string;
}

export interface HandshakeQuery {
  userId?: string; // userId ที่ส่งมาตอนเชื่อมต่อ
  [key: string]: unknown; // รองรับ query อื่นๆ
}

// ตั้ง generic Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>
export type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  ClientSocketData
>;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const query = client.handshake.query as HandshakeQuery; //ดึงข้อมูลที่ client ส่งมา
      const userId = query.userId;

      if (!userId) {
        this.logger.warn(
          `Client ${client.id} attempted to connect without userId. Disconnecting.`,
        );
        client.disconnect(true);
        return;
      }

      // ฝัง userId ลงใน Session
      client.data = { userId };

      const userRoom = `user_${userId}`;
      // ใช้เพื่อให้ user มีที่อยู่เเน่นอนในการส่งข้อความเพราะ socket.id เปลี่ยนเเปลงตลอดที่ refresh หน้า
      await client.join(userRoom);

      this.logger.log(
        `✅ Client Connected: ${client.id} | User ID: ${userId} joined ${userRoom}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Connection Error: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.data?.userId || 'Unknown';
    this.logger.log(
      `❌ Client Disconnected: ${client.id} | User ID: ${userId}`,
    );
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessagePayload,
  ): Promise<{ status: string; data?: ChatMessageResponse; error?: string }> {
    try {
      const senderId = client.data.userId;

      if (!payload.receiverId || !payload.content) {
        return {
          status: 'error',
          error: 'receiverId and content are required',
        };
      }

      const savedMessage = await this.chatService.saveMessage(
        senderId,
        payload.receiverId,
        payload.content,
      );

      const messageResponse: ChatMessageResponse = {
        id: String(savedMessage._id),
        conversationId: savedMessage.conversationId,
        senderId: savedMessage.senderId,
        receiverId: savedMessage.receiverId,
        content: savedMessage.content,
        createdAt: savedMessage.createdAt
          ? savedMessage.createdAt.toISOString()
          : new Date().toISOString(),
        isRead: savedMessage.isRead,
      };

      this.server
        // ส่งไปที่ room ผู้รับ
        .to(`user_${payload.receiverId}`)
        .emit('receive_message', messageResponse);

      return { status: 'success', data: messageResponse };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error sending message: ${err.message}`);
      return { status: 'error', error: 'Internal Server Error' };
    }
  }
}
