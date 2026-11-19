import { registry } from '@app/shared';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka, Payload } from '@nestjs/microservices';
import Redis from 'ioredis';
import { firstValueFrom, lastValueFrom } from 'rxjs';

// interface PostItem {
//   id: string;
//   userId: string;
//   username: string;
//   content: string;
//   likes: number;
//   createdAt: string;
// }

// interface UserPostsResponse {
//   posts: PostItem[];
// }

export interface PostCreatedEventPayload {
  postId: string;
  authorId: string;
  content: string;
  timestamp: string;
  // imageUrl: string | null;
}
// chunk
export interface FollowerChunkPayload {
  requestId: string;
  userId: string;
  postId: string;
  score: number;
  chunkIndex: number;
  totalChunks: number;
  followers: string[];
  isLast: boolean;
}

@Injectable()
export class FeedService implements OnModuleInit {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    // this.kafkaClient.subscribeToResponseOf('get_followers'); //old
    // this.kafkaClient.subscribeToResponseOf('get_followers_batch'); // new batch
    // this.kafkaClient.subscribeToResponseOf('get_followers_chunked'); // new chunk
    this.kafkaClient.subscribeToResponseOf('get_post_ids_for_feed_cleanup');
    await this.kafkaClient.connect();
  }

  async handlePostCreated(encodedMessage: Buffer | { value: Buffer | string }) {
    let message: PostCreatedEventPayload;

    try {
      const bufferData = Buffer.isBuffer(encodedMessage)
        ? encodedMessage
        : Buffer.from(encodedMessage.value || '');
      message = (await registry.decode(bufferData)) as PostCreatedEventPayload;
    } catch (error) {
      this.logger.error(
        '❌ ข้อมูลผิดโครงสร้าง (ทิ้งข้อความ)!:',
        (error as Error).message,
      );
      return;
    }
    // this.logger.log(
    //   `\n📢 [FEED SERVICE] ได้รับโพสต์ใหม่ (ถอดรหัสสำเร็จ) จาก: ${message.authorId}`,
    // );
    this.logger.log(
      `[TRACE feed decoded] author=${message.authorId} postId=${message.postId} t=${Date.now()}`,
    );
    // this.logger.log(
    //   `รูปภาพที่แนบมา: ${message.imageUrl ? message.imageUrl : 'ไม่มีรูปภาพ'}`,
    // );

    // await this.fanOutWithPagination(message);

    // ใช้ chunked pattern
    // requestId อาจเกิดปัญหากรณี redeliver เพราะ date.now เปลี่ยนทําให้จะถือว่า key นี้ เป็น post ใหม่ ส่งผลให้ post ซํ้า
    // const requestId = `${message.postId}-${Date.now()}`;
    // const score = new Date(message.timestamp).getTime();

    // try {
    //   const meta = await firstValueFrom<{
    //     success: boolean;
    //     totalChunks: number;
    //     totalFollowers: number;
    //   }>(
    //     // ควรเพิ่ม parition กรณีที่มีหลายๆ โพสต์ต่อกัน เพื่อไม่ให้ post เล็กรอ post ใหญ่ ซึ่งตอนผ่าน controller ทุกรอบก่อน
    //     this.kafkaClient.send('get_followers_chunked', {
    //       requestId,
    //       userId: message.authorId,
    //       postId: message.postId,
    //       score,
    //       chunkSize: 10000,
    //     }),
    //   );

    //   this.logger.log(
    //     `📤 Follow Service จะส่ง ${meta.totalChunks} chunks (${meta.totalFollowers} followers)`,
    //   );
    // } catch (error) {
    //   this.logger.error(
    //     '❌ Trigger chunked ล้มเหลว:',
    //     (error as Error).message,
    //   );
    // }
    const requestId = message.postId;
    const score = new Date(message.timestamp).getTime();

    try {
      await lastValueFrom(
        this.kafkaClient.emit('get_followers_chunked', {
          requestId,
          userId: message.authorId,
          postId: message.postId,
          score,
          chunkSize: 1000,
        }),
      );
      this.logger.log(`📤 ส่งคำขอ fan-out ของโพสต์ ${message.postId} แล้ว`);
    } catch (error) {
      this.logger.error(
        '❌ ส่งคำขอ fan-out ล้มเหลว:',
        (error as Error).message,
      );
      throw error; // ให้ Kafka retry ดีกว่ากลืน error
    }
  }

  /**
   * Fan-out ด้วย pagination
   * ดึง followers ทีละ 1,000 → fan-out → หน้าถัดไป
   */
  private async fanOutWithPagination(message: PostCreatedEventPayload) {
    const PAGE_SIZE = 10000;
    let page = 1;
    let totalProcessed = 0;
    const score = new Date(message.timestamp).getTime();

    while (true) {
      try {
        const batch = await firstValueFrom<{
          followers: string[];
          page: number;
          total: number;
          totalPages: number;
          hasMore: boolean;
        }>(
          this.kafkaClient.send('get_followers_batch', {
            userId: message.authorId,
            page,
            limit: PAGE_SIZE,
          }),
        );

        if (!batch.followers || batch.followers.length === 0) {
          this.logger.log(
            `✅ Fan-out เสร็จ: ${totalProcessed} followers (${page - 1} pages)`,
          );
          break;
        }

        // Fan-out followers ใน batch นี้
        const pipeline = this.redis.pipeline();
        batch.followers.forEach((followerId) => {
          pipeline.zadd(`feed:${followerId}`, score, message.postId);
          pipeline.zremrangebyrank(`feed:${followerId}`, 0, -21);
          pipeline.expire(`feed:${followerId}`, 604800);
        });
        await pipeline.exec();

        totalProcessed += batch.followers.length;
        this.logger.log(
          `  → page ${page}/${batch.totalPages}: ${batch.followers.length} followers (total: ${totalProcessed}/${batch.total})`,
        );

        if (!batch.hasMore) {
          this.logger.log(`✅ Fan-out เสร็จ: ${totalProcessed} followers`);
          break;
        }

        page++;
      } catch (error) {
        this.logger.error(
          `❌ Fan-out page ${page} ล้มเหลว:`,
          (error as Error).message,
        );
        break;
      }
    }
  }

  /**
   * รับ chunk จาก Follow Service
   * วิธี async streaming
   */
  async handleFollowersChunk(@Payload() chunk: FollowerChunkPayload) {
    const {
      requestId,
      postId,
      score,
      chunkIndex,
      totalChunks,
      followers,
      isLast,
    } = chunk;

    try {
      // Batch 10,000 followers (จาก chunk size) จากก่อน 500000
      const pipeline = this.redis.pipeline();
      followers.forEach((followerId) => {
        // 10,000 followers
        pipeline.zadd(`feed:${followerId}`, score, postId);
        pipeline.zremrangebyrank(`feed:${followerId}`, 0, -21);
        pipeline.expire(`feed:${followerId}`, 604800);
      });
      await pipeline.exec(); // 30,000 commands (ไม่ใช่ 1,500,000)

      if (chunkIndex === 0 || isLast) {
        this.logger.log(
          `[TRACE feed chunk-done] post=${postId} chunk=${chunkIndex + 1}/${totalChunks} t=${Date.now()}`,
        );
      }

      // this.logger.log(
      //   `[${requestId}] ← chunk ${chunkIndex + 1}/${totalChunks}: ${followers.length} followers → Redis ✅`,
      // );
    } catch (error) {
      this.logger.error(
        `❌ [${requestId}] Chunk ${chunkIndex + 1}/${totalChunks} fail:`,
        (error as Error).message,
      );
    }

    if (isLast) {
      this.logger.log(`✅ ครบ ${totalChunks}/${totalChunks} chunks`);
    }
  }

  // old
  // async handlePostCreated(encodedMessage: Buffer | { value: Buffer | string }) {
  //   let message: PostCreatedEventPayload;

  //   try {
  //     const bufferData = Buffer.isBuffer(encodedMessage)
  //       ? encodedMessage
  //       : Buffer.from(encodedMessage.value || '');
  //     message = (await registry.decode(bufferData)) as PostCreatedEventPayload;
  //   } catch (error) {
  //     this.logger.error(
  //       '❌ ข้อมูลผิดโครงสร้าง (ทิ้งข้อความ)!:',
  //       (error as Error).message,
  //     );
  //     return;
  //   }
  //   this.logger.log(
  //     `\n📢 [FEED SERVICE] ได้รับโพสต์ใหม่ (ถอดรหัสสำเร็จ) จาก: ${message.authorId}`,
  //   );
  //   // this.logger.log(
  //   //   `รูปภาพที่แนบมา: ${message.imageUrl ? message.imageUrl : 'ไม่มีรูปภาพ'}`,
  //   // );

  //   this.logger.log(`กำลังขอรายชื่อผู้ติดตามของ ${message.authorId}...`);
  //   const followers: string[] = await firstValueFrom(
  //     this.kafkaClient.send('get_followers', { userId: message.authorId }),
  //   );

  //   if (!followers || followers.length === 0) {
  //     this.logger.log('🤷‍♂️ ไม่มีใครติดตามผู้ใช้นี้เลย ไม่ต้องอัปเดต Feed');
  //     return;
  //   }

  //   this.logger.log(`มีผู้ติดตาม ${followers.length} คน, กำลังอัปเดต Redis...`);

  //   // แปลงเวลา เป็น Timestamp เพื่อเรียงลำดับใน Redis
  //   const score = new Date(message.timestamp).getTime();

  //   const pipeline = this.redis.pipeline();

  //   followers.forEach((followerId) => {
  //     // โครงสร้างคีย์คือ feed:{followerId}
  //     // zadd ยัดลง Sorted Set โดยใช้ score (เวลา) เป็นตัวเรียงลำดับ
  //     pipeline.zadd(`feed:${followerId}`, score, message.postId);
  //     // เก็บ 20 โพสต์ ลบอันดับที่ 0 ถึง -21 จะเหลือ อันดับที่ -20 ถึง -1 จะได้ 20 โพสต์ล่าสุด// - คือนับจากด้านหลัง
  //     pipeline.zremrangebyrank(`feed:${followerId}`, 0, -21);
  //     // หมดอายุ 7 วัน
  //     pipeline.expire(`feed:${followerId}`, 604800);
  //   });
  //   // set ข้อมูลไว้ที่ redis ก่อนเพื่อเตรียมนําไปใช้
  //   await pipeline.exec();
  //   this.logger.log('✅ อัปเดต News Feed ให้ผู้ติดตามสำเร็จแล้ว!\n');
  // }

  async handleUnfollowed(
    // อาจเป็น string ได้ถ้าส่งมาตรงๆ เเบบยังไม่ใช้ schema registry
    encodedMessage: Buffer | { value: Buffer | string },
  ) {
    let message: { followerId: string; followingId: string };

    try {
      let bufferData: Buffer;
      if (Buffer.isBuffer(encodedMessage)) {
        bufferData = encodedMessage;
      } else {
        // .from เเปลงเป็น buffer ถ้าส่งมาเป็น object หรือ string
        bufferData = Buffer.from(encodedMessage.value || '');
      }
      message = (await registry.decode(bufferData)) as typeof message;
    } catch (error) {
      this.logger.error(
        '❌ ข้อมูลผิดโครงสร้าง (ทิ้งข้อความ)!:',
        (error as Error).message,
      );
      return;
    }
    this.logger.log(
      `\n🧹 [FEED CLEANUP] User ${message.followerId} เลิกติดตาม ${message.followingId}`,
    );

    try {
      const userPosts = await firstValueFrom<{ ids: string[] }>(
        this.kafkaClient.send('get_post_ids_for_feed_cleanup', {
          userId: message.followingId,
        }),
      );

      if (!userPosts?.ids?.length) {
        this.logger.log('🤷‍♂️ ไม่มีโพสต์ให้ลบออกจาก Feed');
        return;
      }

      this.logger.log(
        `กำลังลบ ${userPosts?.ids?.length} โพสต์ ออกจาก Feed ของ ${message.followerId}...`,
      );

      const pipeline = this.redis.pipeline();
      pipeline.zrem(`feed:${message.followerId}`, ...userPosts.ids);
      await pipeline.exec();

      this.logger.log('✅ ล้างหน้า Feed สำเร็จ!\n');
    } catch (error) {
      const err = error as Error;
      this.logger.error('❌ ล้างหน้า Feed ไม่สำเร็จ:', err.message || err);
    }
  }

  async getUserFeed(userId: string): Promise<string[]> {
    this.logger.log(`[FEED SERVICE] ดูหน้า Feed ของ User ID: ${userId}`);

    const postIds = await this.redis.zrevrange(`feed:${userId}`, 0, 19);

    this.logger.log(`ดึง Post IDs สำเร็จ จำนวน ${postIds.length} โพสต์`);
    return postIds;
  }
}
