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

  // event like/unlike ทั้งหมด
  private totalEventsProcessed = 0;
  // จํานวนที่ เขียนลง db จริง
  private totalWriteOps = 0;

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
    // ดึงจํานวน key ออกมาเพื่อนําจํานวน writeOps ที่จะต้องเขียนลง db กี่ครั้ง
    const writeOpsThisFlush = Object.keys(aggregated).length;

    // batch ลง mongo ทั้งหมด
    await this.bulkUpdateLikes(aggregated);

    this.totalEventsProcessed += items.length;
    this.totalWriteOps += writeOpsThisFlush;

    // หาอัตราส่วนการลดจํานวนครั้งในการเขียนลงใน db เมื่อเทียบกับ event ทั้งหมด/จํานวนที่เขียนล db จริง
    // เช่น like = 1000 เเต่เขียนลง db เเค่ 1 ครั้ง ; 1000/1 = 1000x เท่ากับลดการเขียนลงไป 1000เท่า
    // ถ้ากระจายหลาย post reduction ratio จะลดตํ่าลง, ถ้า post เดียว reduction ratio จะสูง
    const reductionRatio =
      this.totalWriteOps > 0
        ? (this.totalEventsProcessed / this.totalWriteOps).toFixed(1)
        : 'N/A';

    this.logger.log(
      `✅ Flushed ${items.length} like events → ${writeOpsThisFlush} posts updated`,
    );
    this.logger.log(
      `📊 [Cumulative] events=${this.totalEventsProcessed} writeOps=${this.totalWriteOps} reduction=${reductionRatio}x`,
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
      // ordered: false อัปเดตเเบบขนาน อัปพร้อมกันใครพังค่อย err ออกมา, defualt = true อัปเดตเเบบเป็นลําดับ post a,b,c ถ้า a พัง b,c ไม่ทําต่อ
      await this.postModel.bulkWrite(bulkOps, { ordered: false });
    }
  }
}
