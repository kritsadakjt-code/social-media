import { Controller } from '@nestjs/common';
import { NotificationService } from './notification-service.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationGateway } from './notification.gateway';

@Controller()
export class NotificationServiceController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  // รอฟัง event follow_created
  @EventPattern('follow_created')
  handleFollowCreated(
    @Payload()
    message: {
      followerId: string;
      followingId: string;
      timestamp: string;
    },
  ) {
    console.log('\n====================================');
    console.log('🚨 [NEW NOTIFICATION RECEIVED!]');
    console.log(`👤 ผู้ใช้ ID: ${message.followerId}`);
    console.log(`👉 ได้กดติดตาม ID: ${message.followingId}`);
    console.log(`⏰ เวลา: ${message.timestamp}`);
    console.log('====================================\n');
  }

  @EventPattern('post_liked')
  handlePostLiked(
    @Payload()
    message: {
      postId: string;
      postOwnerId: string;
      likedByUserId: string;
      timestamp: string;
    },
  ) {
    if (message.postOwnerId === message.likedByUserId) {
      console.log(`\n👤 ผู้ใช้ ID: ${message.likedByUserId} กดไลก์โพสต์ตัวเอง`);
      return;
    }

    console.log('\n====================================');
    console.log('❤️ [NEW LIKE NOTIFICATION RECEIVED!]');
    console.log(`👤 ผู้ใช้ ID: ${message.likedByUserId}`);
    console.log(`👉 ได้กดไลก์โพสต์ ID: ${message.postId} ของคุณ!`);
    console.log(`⏰ เวลา: ${message.timestamp}`);

    this.notificationGateway.sendNotificationToUser(message.postOwnerId, {
      title: 'มีคนกดไลก์โพสต์ของคุณ!',
      body: `User ID: ${message.likedByUserId} กดไลก์โพสต์ของคุณ`,
      postId: message.postId,
      time: message.timestamp,
    });
    console.log('====================================\n');
  }

  // comment from post
  @EventPattern('post_commented')
  handlePostCommented(
    @Payload()
    message: {
      postId: string;
      postOwnerId: string;
      commenterId: string;
      commenterName: string;
      content: string;
      timestamp: string;
    },
  ) {
    // ถ้าคอมเเมนต์โพสต์ตัวเองไม่ต้องเเจ้งเตือน
    if (message.postOwnerId === message.commenterId) {
      console.log(`\n👤 ผู้ใช้ ID: ${message.postOwnerId} คอมเมนต์โพสต์ตัวเอง`);
      return;
    }

    console.log('\n====================================');
    console.log('💬 [NEW COMMENT NOTIFICATION RECEIVED!]');
    console.log(`👤 ผู้ใช้: ${message.commenterName} (${message.commenterId})`);
    console.log(`👉 ได้คอมเมนต์โพสต์ ID: ${message.postId} ของคุณ!`);
    console.log(`📝 ข้อความ: "${message.content}"`);

    this.notificationGateway.sendNotificationToUser(message.postOwnerId, {
      title: 'มีคนคอมเมนต์โพสต์ของคุณ!',
      body: `${message.commenterName} คอมเมนต์ว่า: "${message.content}"`,
      postId: message.postId,
      time: message.timestamp,
    });

    console.log('====================================\n');
  }
}
