import { Controller } from '@nestjs/common';
import { NotificationService } from './notification-service.service';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller()
export class NotificationServiceController {
  constructor(private readonly notificationService: NotificationService) {}

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
    console.log('====================================\n');
  }
}
