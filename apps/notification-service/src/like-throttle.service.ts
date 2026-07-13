import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class LikeThrottleService {
  // ส่ง notification ได้ทุก 30 วินาทีต่อโพสต์
  private readonly THROTTLE_TTL = 30;
  // เก็บ pending likes ไว้รวมส่งทีเดียว
  private readonly PENDING_TTL = 30;

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  // ป้องการเเจ้งเตือนซํ้า เช่น ได้กดไลก์ 100 ครั้ง เเจ้งเตือน 100 ครั้ง
  async shouldNotify(postId: string, postOwnerId: string): Promise<boolean> {
    const throttleKey = `noti:throttle:like:${postOwnerId}:${postId}`;

    const result = await this.redis.set(
      throttleKey, // key
      '1', // value เป็นอะไรก็ได้เพราะไม่ได้เอา value ไปทําอะไร เเต่มันต้องใส่คู่กับ key เพื่อระบุว่ามี key นี้อยู่
      'EX', // option: set expiration
      this.THROTTLE_TTL, // 30 วินาที
      'NX', // set key ได้แค่ครั้งแรก ถ้ามี key อยู่แล้วจะ return null
    );
    // ถ้าเป็น true เเสดงว่าพึ่งสร้าง key ใหม่ควรส่ง notification
    return result === 'OK';
  }

  // เก็บข้อมูลว่ามีใครกดไลก์บ้าง เพื่อที่จะให้ noti นําข้อมูลไปเเจ้งเตือนต่อ
  async trackPendingLike(
    postId: string,
    postOwnerId: string,
    likedByUserId: string,
  ): Promise<void> {
    const pendingKey = `noti:pending:like:${postOwnerId}:${postId}`;
    // เก็บ userId ที่กดไลก์ไว้ใน Set
    await this.redis.sadd(pendingKey, likedByUserId);
    // reset ใหม่ทุกครั้งเพิ่มเข้ามา
    await this.redis.expire(pendingKey, this.PENDING_TTL);
  }

  // นับจํานวนคนกดไลก์ใน set
  async getPendingCount(postId: string, postOwnerId: string): Promise<number> {
    const pendingKey = `noti:pending:like:${postOwnerId}:${postId}`;
    return this.redis.scard(pendingKey);
  }

  // ลบ key หลังจากส่ง noti เรียบร้อย
  async clearPending(postId: string, postOwnerId: string): Promise<void> {
    const pendingKey = `noti:pending:like:${postOwnerId}:${postId}`;
    await this.redis.del(pendingKey);
  }
}
