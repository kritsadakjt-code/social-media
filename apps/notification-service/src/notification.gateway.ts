import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// เปิดให้หน้าบ้านเข้ามาเชื่อมได้อิสระ
@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  //บันทึกว่า userID ไหน กําลังใช้ socket id อะไรอยู่ เพื่อให้ส่งถูกคน
  private activeUsers = new Map<string, string>();
  // กรณีเปิดเเอปอยู่
  handleConnection(client: Socket) {
    // ดึง userId จาก URL ที่ Frontend ส่งมาตอนเชื่อมต่อ
    const userId = client.handshake.query.userId as string;

    if (userId) {
      this.activeUsers.set(userId, client.id);
      console.log(
        `🟢 [WebSockets] User ID: ${userId} เปิดแอปและเชื่อมต่อแล้ว!`,
      );
    }
  }

  // กรณีปิดเเอป
  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.activeUsers.delete(userId);
      console.log(`🔴 [WebSockets] User ID: ${userId} ปิดแอปไปแล้ว`);
    }
  }

  // ให้ controller เรียก
  sendNotificationToUser(userId: string, payload: any) {
    const socketId = this.activeUsers.get(userId);

    if (socketId) {
      // ถ้าเปิดเเอปอยู่
      this.server.to(socketId).emit('new_notification', payload);
      console.log(
        `⚡ [WebSockets] ยิงแจ้งเตือนทะลุจอไปหา User: ${userId} สำเร็จ!`,
      );
    } else {
      console.log(`💤 [WebSockets] User: ${userId} ไม่ได้เปิดแอปอยู่`);
    }
  }
}
