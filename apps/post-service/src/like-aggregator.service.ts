import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Post } from './post.schema';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { Cron, CronExpression } from '@nestjs/schedule';

interface BatchItem {
  postId: string;
  delta: number;
}

@Injectable()
export class LikeAggregatorService implements OnModuleInit {
  private readonly logger = new Logger(LikeAggregatorService.name);

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  onModuleInit() {
    this.logger.log('✅ Like Aggregator Service started');
  }

  // รับ request ทุกๆ 5วิ บันทึกลง mongo
  @Cron(CronExpression.EVERY_5_SECONDS)
  async flushLikesToDatabase() {
    // ดึงทุก item ออกจาก queue
    const items = await this.drainQueue();
    if (items.length === 0) return;

    // รวมจํานวนไลก์ ของเเต่ละ post
    const aggregated = this.aggregateDeltas(items);

    // batch ลง mongo ทั้งหมด
    await this.bulkUpdateLikes(aggregated);

    this.logger.log(
      `✅ Flushed ${items.length} like events → ${Object.keys(aggregated).length} posts updated`,
    );
  }

  private async drainQueue(): Promise<BatchItem[]> {
    const items: BatchItem[] = [];
    const batchSize = 1000; // ดึงครั้งละ 1000 รายการ

    for (let i = 0; i < batchSize; i++) {
      // ดึงข้อมูลจากขวาสุด ซึ่งจะเป็นข้อมูลเก่าสุดจาก lpush FIFO
      const raw = await this.redis.rpop('likes:batch:queue');
      if (!raw) break;

      try {
        items.push(JSON.parse(raw) as BatchItem);
      } catch {
        this.logger.error(`❌ Parse batch item failed: ${raw}`);
      }
    }

    return items;
  }

  private aggregateDeltas(items: BatchItem[]): Record<string, number> {
    // รวมจํานวนไลก์ ของเเต่ละ post
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.postId] = (acc[item.postId] ?? 0) + item.delta;
      // ตัวอย่าง รอบที่ 1
      // acc["123"] = (acc["123"] ?? 0) + 1
      // acc["123"] = (undefined ?? 0) + 1
      // acc["123"] = 0 + 1
      // acc["123"] = 1
      // ตัวอย่าง รอบที่ 2
      // acc = { "123": 1} จากรอบที่ 1
      // acc["123"] = (acc["123" ?? 0]) + 1
      // acc["123"] = 1 + 1
      // acc["123"] = 2

      return acc;
      // ตัวอย่าง รอบที่ 1
      // acc = { "123": 1 }
      // ตัวอย่าง รอบที่ 2
      // acc = { "123": 2 }
    }, {}); // กําหนดค่าเริ่มต้น acc = {} ตัวอย่างผลลัพธ์สุดท้ายที่ต้องการ acc = { "123": 2, "456": 3 }
  }

  private async bulkUpdateLikes(
    aggregated: Record<string, number>,
  ): Promise<void> {
    // เตรียม query เเต่ละ post
    const bulkOps = Object.entries(aggregated).map(([postId, delta]) => ({
      updateOne: {
        filter: { _id: postId },
        update: { $inc: { likes: delta } },
      },
    }));

    // update ลง db ทั้งหมด
    if (bulkOps.length > 0) {
      await this.postModel.bulkWrite(bulkOps, { ordered: false });
    }
  }
}
