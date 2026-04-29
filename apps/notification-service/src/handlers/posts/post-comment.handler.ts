import { NotificationGateway } from './../../notification.gateway';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PostCommentEvent } from '../../events-mappers/posts/post-comment.event';

@EventsHandler(PostCommentEvent)
export class PostCommentHandler implements IEventHandler<PostCommentEvent> {
  constructor(private readonly notificationGateway: NotificationGateway) {}

  handle(event: PostCommentEvent) {
    const { payload } = event;

    if ((payload.postOwnerId = payload.commenterId)) return;

    console.log(`💬 [NEW COMMENT] ส่งแจ้งเตือนให้ ${payload.postOwnerId}`);
    this.notificationGateway.sendNotificationToUser(payload.postOwnerId, {
      title: 'มีคนคอมเมนต์โพสต์ของคุณ!',
      body: `${payload.commenterName} คอมเมนต์ว่า: "${payload.content}"`,
      postId: payload.postId,
      time: payload.timestamp,
    });
  }
}
