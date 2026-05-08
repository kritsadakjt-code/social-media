import { LikeThrottleService } from './../../like-throttle.service';
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
  constructor(
    private readonly notificationGateway: NotificationGateway,
    private readonly likeThrottleService: LikeThrottleService,
  ) {}

  // @OnEvent('notification.post_liked')
  async handle(event: PostLikedEvent) {
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

    // เก็บว่ามีใครไลก์โพสต์ไหนบ้างเพื่อเก็บจํานวนคนกดไลก์
    await this.likeThrottleService.trackPendingLike(
      payload.postId,
      payload.postOwnerId,
      payload.likedByUserId,
    );

    // check throttle
    const shouldNotify = await this.likeThrottleService.shouldNotify(
      payload.postId,
      payload.postOwnerId,
    );

    if (!shouldNotify) {
      console.log(
        `⏳ Throttled: ยังไม่ส่ง notification โพสต์ ${payload.postId}`,
      );
      return;
    }

    // ดึง pending count เพื่อแสดงว่ามีกี่คนกดไลก์
    const pendingCount = await this.likeThrottleService.getPendingCount(
      payload.postId,
      payload.postOwnerId,
    );

    const body =
      pendingCount > 1
        ? `${payload.likedByUserId} และอีก ${pendingCount - 1} คน กดไลก์โพสต์ของคุณ`
        : `${payload.likedByUserId} กดไลก์โพสต์ของคุณ`;

    console.log(`❤️ ส่งแจ้งเตือนให้ ${payload.postOwnerId}: ${body}`);

    this.notificationGateway.sendNotificationToUser(payload.postOwnerId, {
      title: 'มีคนกดไลก์โพสต์ของคุณ!',
      body: body,
      postId: payload.postId,
      time: payload.timestamp,
    });

    // clear pending หลังส่งแล้ว
    await this.likeThrottleService.clearPending(
      payload.postId,
      payload.postOwnerId,
    );
  }
}
