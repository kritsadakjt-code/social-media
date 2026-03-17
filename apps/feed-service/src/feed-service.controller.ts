import { Controller, Inject, OnModuleInit } from '@nestjs/common';
import {
  ClientKafka,
  EventPattern,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import Redis from 'ioredis';
import { firstValueFrom } from 'rxjs';

@Controller()
export class FeedServiceController implements OnModuleInit {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    this.kafkaClient.subscribeToResponseOf('get_followers');
    await this.kafkaClient.connect();
  }

  @EventPattern('post_created')
  async handlePostCreated(
    @Payload()
    message: {
      postId: string;
      authorId: string;
      content: string;
      timestamp: string;
    },
  ) {
    console.log(
      `\n📢 [FEED SERVICE] ได้รับโพสต์ใหม่จาก User ID: ${message.authorId}`,
    );

    console.log(`กำลังขอรายชื่อผู้ติดตามของ ${message.authorId}...`);
    const followers: string[] = await firstValueFrom(
      this.kafkaClient.send('get_followers', { userId: message.authorId }),
    );

    if (!followers || followers.length === 0) {
      console.log('🤷‍♂️ ไม่มีใครติดตามผู้ใช้นี้เลย ไม่ต้องอัปเดต Feed');
      return;
    }

    console.log(`มีผู้ติดตาม ${followers.length} คน, กำลังอัปเดต Redis...`);

    // แปลงเวลา เป็น Timestamp เพื่อเรียงลำดับใน Redis
    const score = new Date(message.timestamp).getTime();

    const pipeline = this.redis.pipeline();

    followers.forEach((followerId) => {
      // โครงสร้างคีย์คือ feed:{followerId}
      // zadd ยัดลง Sorted Set โดยใช้ score (เวลา) เป็นตัวเรียงลำดับ
      pipeline.zadd(`feed:${followerId}`, score, message.postId);

      // เก็บ 500 post เพื่อไม่ให้ ram เต็ม
      pipeline.zremrangebyrank(`feed:${followerId}`, 0, -21);
      // หมดอายุ 7 วัน กันกรณีที่โพสต์ไม่เต็มจะค้างอยู่ที่ redis
      pipeline.expire(`feed:${followerId}`, 604800);
    });
    // set ข้อมูลไว้ที่ redis ก่อนเพื่อเตรียมนําไปใช้
    await pipeline.exec();
    console.log('✅ อัปเดต News Feed ให้ผู้ติดตามสำเร็จแล้ว!\n');
  }

  @MessagePattern('get_user_feed')
  async getUserFeed(@Payload() data: { userId: string }) {
    console.log(`[FEED SERVICE] ดูหน้า Feed ของ User ID: ${data.userId}`);

    const postIds = await this.redis.zrevrange(`feed:${data.userId}`, 0, 19);

    console.log(`ดึง Post IDs สำเร็จ จำนวน ${postIds.length} โพสต์`);
    return postIds;
  }
}
