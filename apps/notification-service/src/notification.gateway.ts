import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';

interface WsJwtPayLoad {
  sub: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

interface ClientSocketData {
  userId: string;
  username: string;
  role: string;
}

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  ClientSocketData
>;

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/notification' })
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  private readonly server!: Server;
  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    server.use((socket: AuthenticatedSocket, next) => {
      const auth = socket.handshake.auth as Record<string, unknown>;
      const headers = socket.handshake.headers as Record<string, unknown>;

      let token: string | undefined;

      if (typeof auth?.token === 'string') {
        token = auth.token;
      } else if (typeof headers?.authorization === 'string') {
        token = headers.authorization.split(' ')[1];
      }

      if (!token) {
        return next(new WsException('Unauthorized: Missing token'));
      }

      this.jwtService
        .verifyAsync<WsJwtPayLoad>(token, {
          secret: this.configService.get<string>('JWT_SECRET'),
        })
        .then((payload) => {
          socket.data = {
            userId: payload.sub,
            username: payload.username,
            role: payload.role,
          };
          next();
        })
        .catch(() => {
          next(new Error('Unauthorized: Invalid token'));
        });
    });
  }
  // กรณีเปิดเเอปอยู่
  handleConnection(client: AuthenticatedSocket): void {
    const userId = client.data?.userId;

    if (!userId) {
      client.disconnect(true);
      return;
    }

    console.log(`[WebSockets] User ID: ${userId} เปิดเเอปอยู่!`);
    // สร้างห้องเเจ้งเตือน
    void client.join(`notify_user_${userId}`);
    this.logger.log(
      `✅ Secure Connection: User ${userId} listening for notifications`,
    );
  }

  // กรณีปิดเเอป
  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(
      `❌ User ${client.data?.userId} disconnected from notifications`,
    );
  }

  // ให้ controller เรียก
  sendNotificationToUser(userId: string, payload: any) {
    const roomName = `notify_user_${userId}`;

    this.server.to(roomName).emit('new_notification', payload);

    this.logger.log(`⚡ [WebSockets] ส่งแจ้งเตือนให้ห้อง: ${roomName} สำเร็จ`);
  }
}
