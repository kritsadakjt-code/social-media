// import { OnEvent } from '@nestjs/event-emitter';
import { NotificationGateway } from './../../notification.gateway';
// import { Injectable } from '@nestjs/common';
// ระบุเป็น type เพราะว่าเอามาเช็ค type ข้อมูล ไม่ได้ต้องการเเบบ value มาใช้
// import type { PostLikedEventPayload } from '@app/shared';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PostLikedEvent } from '../../events-mappers/posts/post-liked.event';

// @Injectable()
@EventsHandler(PostLikedEvent)
// export class PostLikedHandler {
export class PostLikedHandler implements IEventHandler<PostLikedEvent> {
  constructor(private readonly notificationGateway: NotificationGateway) {}

  // @OnEvent('notification.post_liked')
  handle(event: PostLikedEvent) {
    const { payload } = event;
    if (payload.postOwnerId === payload.likedByUserId) {
      console.log(
        '🛑 [หยุดทำงาน] เพราะเป็นการกดไลก์โพสต์ของตัวเอง ไม่ต้องแจ้งเตือน!',
      );
      return;
    }
    // if (decodedData.postOwnerId === decodedData.likedByUserId) {
    //   console.log(
    //     '🛑 [หยุดทำงาน] เพราะเป็นการกดไลก์โพสต์ของตัวเอง ไม่ต้องแจ้งเตือน!',
    //   );
    //   return;
    // }

    console.log(`❤️ [NEW LIKE] ส่งแจ้งเตือนให้ ${payload.postOwnerId}`);

    this.notificationGateway.sendNotificationToUser(payload.postOwnerId, {
      title: 'มีคนกดไลก์โพสต์ของคุณ!',
      body: `User ID: ${payload.likedByUserId} กดไลก์โพสต์ของคุณ`,
      postId: payload.postId,
      time: payload.timestamp,
    });
  }
}
