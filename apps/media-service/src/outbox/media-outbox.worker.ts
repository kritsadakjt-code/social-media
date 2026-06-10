import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { OutboxDocument, OutboxEvent } from './outbox.schema';
import { Model } from 'mongoose';
import { ClientKafka } from '@nestjs/microservices';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MediaOutBoxWorker implements OnModuleInit {
  private readonly logger = new Logger(MediaOutBoxWorker.name);
  private readonly publishedRetentionDays = 7;
  private readonly cleanupBatchSize = 500;
  private readonly maxCleanupPerRun = 5000;

  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: Model<OutboxDocument>,

    @Inject('KAFKA_SERVICE')
    private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
    this.logger.log('✅ Outbox Worker started');
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox() {
    const MaxAttempts = 10;
    const now = new Date();

    const events = await this.outboxModel
      .find({
        status: 'pending',
        attempts: { $lt: MaxAttempts },
        $or: [
          { nextRetryAt: { $lte: now } },
          { nextRetryAt: null },
          // รันครั้งเเรกไม่มี field nextRetryAt
          { nextRetryAt: { $exists: false } },
        ],
      })
      .sort({ createdAt: 1 })
      .limit(50)
      .exec();

    // ถ้าไม่มีออกจาก func นี้ทันที
    if (events.length === 0) return;

    this.logger.log(`📤 กำลังส่ง ${events.length} events จาก Outbox`);

    // วนลูปใน events
    for (const event of events) {
      try {
        // เช็คว่าเป็น Obj หรือ BSON Binary จาก mongo มั้ย เพราะ buffer ใน mongo ถูกเก็บเป็น binary
        const normalizedValue = this.normalizeOutboxValue(event);

        // ถ้า error จะ retry รอบละ 3 ครั้ง เพราะ woker วนมาทํางานใหม่
        await firstValueFrom(
          this.kafkaClient.emit(event.topic, {
            key: event.key,
            value: normalizedValue,
            headers: event.headers,
          }),
        );

        await this.outboxModel.updateOne(
          { _id: event._id },
          {
            status: 'published',
            publishedAt: new Date(),
            lastError: null,
            nextRetryAt: null,
            failedAt: null,
          },
        );

        this.logger.log(`✅ ส่ง event สำเร็จ: ${event.eventId}`);
      } catch (error) {
        const err = error as Error;
        const nextAttempts = event.attempts + 1;
        const nextRetryAt = this.calculateBackoff(event.attempts);
        await this.outboxModel.updateOne(
          { _id: event._id },
          {
            // จบการทําการเเล้วค่อย +1 ถ้ามีการเช็คเงื่อนไขต้อง + มาก่อนเเล้วค่อยเช็คเงื่อนไข
            $inc: { attempts: 1 },
            lastError: err.message,
            // spread operator + ternary condition ดึงค่าใน obj ออกมา
            ...(nextAttempts >= MaxAttempts
              ? // ถ้า retry 10 ครั้งเเล้วยัง failed ต้อง alert (slack, pagerDuty) หรือ monitoring(prometheus, grafana) ต่อให้ทีมมาเช็คเเบบ manual
                { status: 'failed', failedAt: new Date() }
              : { nextRetryAt }),
          },
        );

        this.logger.error(
          `Publish outbox failed: ${event.eventId}`,
          err.stack ?? err.message,
        );
      }
    }
  }

  // outbox เหมาะกับ TTL มากกว่า เพราะไม่มี side effect ต่อ
  // batch cleanup เเบบนี้เหมาะกับงานที่ซับซ้อนมีการ audit ก่อนลบ, มี side effect เช่น การลบ user auto ต้องลบข้อมูลอะไรที่เกี่ยวข้องอีกบ้าง
  // ลบ status ที่ published ลบวันละ 5000 record เพิ่มได้หากมีข้อมูลเยอะ
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupPublishedOutboxEvents() {
    // ถอยไป 7 วัน
    const cutoff = new Date(
      Date.now() - this.publishedRetentionDays * 24 * 60 * 60 * 1000,
    );

    let totalDeleted = 0;
    while (totalDeleted < this.maxCleanupPerRun) {
      const events = await this.outboxModel
        .find({
          status: 'published',
          // ถ้าน้อยกว่า cutoff เเสดงว่าถึง 7 วันเเล้ว
          publishedAt: { $lt: cutoff },
        })
        .select('_id')
        .limit(this.cleanupBatchSize) // ดึงทีละ 500
        .lean() // ไม่เอา method มาด้วย เช่น .save .update เพราะไม่ได้นําข้อมูลมา เเก้ไข บันทึก
        .exec();

      if (events.length === 0) break;

      const result = await this.outboxModel.deleteMany({
        _id: { $in: events.map((event) => event._id) },
      });

      totalDeleted += result.deletedCount;
      // ถ้า event น้อยกว่า 500 เเสดงว่าไม่มีข้อมูลให้ลบเเล้ว
      if (events.length < this.cleanupBatchSize) break;
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `🧹 ลบ published outbox ที่เก่ากว่า ${this.publishedRetentionDays} วันแล้ว ${totalDeleted} records`,
      );
    }
  }

  // ใช้ jitter กระจายเวลาเพื่อไม่ให้ event เวลาใกล้กันเกินไปจะทําให้ server overload
  private calculateBackoff(attempts: number): Date {
    const maxDelayMs = 5 * 60 * 1000; // 5m = 300000ms
    // 1s 2s 4s 8s 16s ... 5m
    const baseDelayMs = Math.min(1000 * 2 ** attempts, maxDelayMs);
    // กระจาย 30% ของเวลาที่ delay
    const jitterMs = Math.random() * 0.3 * baseDelayMs;
    return new Date(Date.now() + baseDelayMs + jitterMs);
  }

  // เเปลง BSON Binary จาก mongo เป็น buffer ก่อนส่งให้ kafka เพราะ buffer ใน mongo ถูกเก็บเป็น binary
  private normalizeOutboxValue(event: OutboxDocument) {
    // ถ้าไม่ใช่ avro เเสดงว่าเป็น json ส่งได้เลย
    if (event.payloadEncodingType !== 'avro') {
      return event.value;
    }

    if (Buffer.isBuffer(event.value)) {
      return event.value;
    }

    // ดึงค่าจาก property buffer ใน Binary object mongo
    if (
      event.value &&
      typeof event.value === 'object' &&
      'buffer' in event.value
    ) {
      return Buffer.from((event.value as { buffer: Buffer }).buffer);
    }

    // fallback ถ้าเป็น avro เเต่ไม่ใช่ buffer หรือ Binary object mongo
    return event.value;
  }
}
