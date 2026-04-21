import { OnEvent } from '@nestjs/event-emitter';
import { NotificationGateway } from './../../notification.gateway';
import { Injectable } from '@nestjs/common';

export interface PostLikedEventPayload {
  postId: string;
  postOwnerId: string;
  likedByUserId: string;
  timestamp: string;
}

@Injectable()
export class PostLikedHandler {
  constructor(private readonly notificationGateway: NotificationGateway) {}

  @OnEvent('notification.post_liked')
  handle(decodedData: PostLikedEventPayload) {
    if (decodedData.postOwnerId === decodedData.likedByUserId) {
      console.log(
        '🛑 [หยุดทำงาน] เพราะเป็นการกดไลก์โพสต์ของตัวเอง ไม่ต้องแจ้งเตือน!',
      );
      return;
    }

    console.log(`❤️ [NEW LIKE] ส่งแจ้งเตือนให้ ${decodedData.postOwnerId}`);

    this.notificationGateway.sendNotificationToUser(decodedData.postOwnerId, {
      title: 'มีคนกดไลก์โพสต์ของคุณ!',
      body: `User ID: ${decodedData.likedByUserId} กดไลก์โพสต์ของคุณ`,
      postId: decodedData.postId,
      time: decodedData.timestamp,
    });
  }
}
