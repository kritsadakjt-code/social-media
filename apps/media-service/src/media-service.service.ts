import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Media, MediaDocument, MediaPurpose } from './media.schema';
import { S3Service } from './storage/s3.service';
import {
  MediaProcessorService,
  ProcessedUrls,
} from './processor/media-processor.service';
import { ClientKafka } from '@nestjs/microservices';
import { Model } from 'mongoose';
import {
  MediaProcessedSchema,
  MediaProcessFailedSchema,
  MediaUploadedSchema,
  registry,
} from '@app/shared';
import { SchemaType } from '@kafkajs/confluent-schema-registry';
import { SnowflakeIdService } from './snowflake.service';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { OutboxDocument, OutboxEvent } from './outbox/outbox.schema';

// MIME ควรเช็คว่าเป็นรูปหรือวิดีโอจริงมั้ยด้วย

// validate file type
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
];

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/avi'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB

@Injectable()
export class MediaService implements OnModuleInit {
  private mediaUploadedSchemaId!: number;
  private mediaProcessedSchemaId!: number;
  private mediaProcessFailedSchemaId!: number;
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectModel(Media.name)
    private readonly mediaModel: Model<MediaDocument>,
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: Model<OutboxDocument>,
    private readonly s3Service: S3Service,
    private readonly mediaProcessorService: MediaProcessorService,
    @Inject('KAFKA_SERVICE')
    private readonly kafkaClient: ClientKafka,
    private readonly snowflakeIdService: SnowflakeIdService,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();

    const [uploaded, processed, processFailed] = await Promise.all([
      registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(MediaUploadedSchema),
      }),
      registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(MediaProcessedSchema),
      }),
      registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(MediaProcessFailedSchema),
      }),
    ]);

    this.mediaUploadedSchemaId = uploaded.id;
    this.mediaProcessedSchemaId = processed.id;
    this.mediaProcessFailedSchemaId = processFailed.id;
    this.logger.log('✅ Media Schema โหลดสำเร็จ');
  }

  async createPresignedUrl(
    userId: string,
    fileType: string,
    fileSize: number, // byte
    purpose: MediaPurpose,
  ) {
    // validate file type
    const isImage = ALLOWED_IMAGE_TYPES.includes(fileType);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(fileType);

    if (!isImage && !isVideo) {
      throw new Error(`ไม่รองรับไฟล์ประเภท ${fileType}`);
    }

    // validate file size
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (fileSize > maxSize) {
      throw new Error(`ไฟล์ใหญ่เกินไป สูงสุด ${maxSize / 1024 / 1024}MB`);
    }

    // จัดระเบียบที่เก็บไฟล์ เพื่อป้องกัน hot partition ไม่ให้ overload
    const mediaId = this.snowflakeIdService.next();
    const ext = fileType.split('/')[1];

    // hashing ด้วย algorithm sha256 เลือก sha256 เพราะ เร็ว ปลอดภัย กระจายดี
    const shard = createHash('sha256')
      .update(mediaId)
      .digest('hex') // output hex pattern 256/4 = 64 ตัว
      .slice(0, 2);
    const key = `uploads/${shard}/${userId}/${mediaId}.${ext}`;

    // สร้าง presigned URL
    const presignedUrl = await this.s3Service.createPresignedUploadUrl(
      key,
      fileType,
      300, // 5 นาที
    );

    // บันทึก metadata เเค่นี้ก่อน เพราะยังไม่ได้บันทึกไฟล์จริง
    await this.mediaModel.create({
      _id: mediaId,
      userId,
      key,
      fileType,
      purpose,
      status: 'pending',
    });

    this.logger.log(`✅ สร้าง Presigned URL สำหรับ ${userId} สำเร็จ`);

    return { mediaId, presignedUrl, key };
  }

  async confirmUpload(mediaId: string, userId: string) {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('ไม่พบไฟล์นี้ในระบบ');
    }

    if (media.userId !== userId) {
      throw new Error('ไม่มีสิทธิ์เข้าถึงไฟล์นี้');
    }

    if (media.status !== 'pending') {
      throw new Error(`ไฟล์นี้อยู่ในสถานะ ${media.status} แล้ว`);
    }

    // update status
    await this.mediaModel.findByIdAndUpdate(mediaId, {
      status: 'processing',
    });

    // emit Kafka ให้ processor รับ
    const encodedPayload = await registry.encode(this.mediaUploadedSchemaId, {
      mediaId,
      userId,
      key: media.key,
      fileType: media.fileType,
      purpose: media.purpose,
    });

    this.kafkaClient.emit('media_events', {
      key: mediaId,
      value: encodedPayload,
      headers: { event_type: 'media_uploaded' },
    });

    this.logger.log(`📤 ส่ง media_uploaded event สำเร็จ: ${mediaId}`);

    return { mediaId, status: 'processing' };
  }

  async processMedia(
    mediaId: string,
    key: string,
    fileType: string,
    userId: string,
    purpose: string,
  ) {
    try {
      // ป้องกันไม่ให้ทํางานซํ้าจากการ retry network ของการบันทึกลง func createDlqOutboxTransaction
      const currentMedia = await this.mediaModel.findById(mediaId);

      // ถ้าไม่มีข้อมูล หรือสถานะเป็น completed / failed ไปแล้ว แปลว่าเคยบันทึกสําเร็จเเล้ว
      if (!currentMedia) {
        this.logger.warn(`⚠️ ไม่พบข้อมูล mediaId: ${mediaId} ข้ามการทำงาน`);
        // ไปทํา queue ต่อไปได้
        return;
      }

      if (
        currentMedia.status === 'completed' ||
        currentMedia.status === 'failed'
      ) {
        this.logger.log(
          `⏩ ข้ามการทำงาน: ${mediaId} เคยถูกประมวลผลไปแล้ว (สถานะปัจจุบัน: ${currentMedia.status})`,
        );
        return;
      }

      const isImage = ALLOWED_IMAGE_TYPES.includes(fileType);
      let urls: ProcessedUrls;

      if (isImage) {
        urls = await this.mediaProcessorService.processImage(key, mediaId);
        this.logger.log('urls from processorImage', urls);
      } else {
        urls = await this.mediaProcessorService.processVideo(key, mediaId);
      }

      // update DB
      await this.mediaModel.findByIdAndUpdate(mediaId, {
        status: 'completed',
        ...urls,
      });

      const encodedPayload = await registry.encode(
        this.mediaProcessedSchemaId,
        {
          mediaId,
          userId,
          purpose,
          originalUrl: urls.originalUrl,
          thumbnailUrl: urls.thumbnailUrl ?? null,
          mediumUrl: urls.mediumUrl ?? null,
          p360Url: urls.p360Url ?? null,
          p720Url: urls.p720Url ?? null,
          p1080Url: urls.p1080Url ?? null,
        },
      );
      // emit Kafka แจ้ง post-service
      await firstValueFrom(
        this.kafkaClient.emit('media_events', {
          key: mediaId,
          value: encodedPayload,
          headers: { event_type: 'media_processed' },
        }),
      );

      this.logger.log(`✅ Process media สำเร็จ: ${mediaId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Process media ล้มเหลว: ${mediaId}`, err.message);

      // pipeline update กัน race condition
      const updatedMedia = await this.mediaModel.findByIdAndUpdate(
        mediaId,
        [
          {
            $set: {
              retryCount: { $add: [{ $ifNull: ['$retryCount', 0] }, 1] },
              errorMessage: err.message,
            },
          },
          {
            $set: {
              status: {
                $cond: {
                  if: { $gte: ['$retryCount', 3] },
                  then: 'failed',
                  else: 'pending',
                },
              },
            },
          },
        ],
        // คืนค่าที่อัปเดตล่าสุดเเล้ว เพื่อเอาไปใช้ต่อ
        { new: true },
      );

      // กรณีที่ user ลบรูปทิ้งไประหว่างประมวลผล
      if (!updatedMedia) {
        this.logger.warn(
          `⚠️ ข้อมูล mediaId: ${mediaId} หายไปจากระบบแล้ว จบการทำงานทันที`,
        );
        return;
      }

      // ครบ retry 3 ครั้ง
      if (updatedMedia.retryCount >= 3) {
        this.logger.warn(
          `🗑️ โยนไฟล์ ${mediaId} ทิ้งเข้า DLQ เพราะพังครบ 3 รอบแล้ว!`,
        );

        await this.createDlqOutboxTransaction({
          mediaId,
          userId,
          key,
          fileType,
          purpose,
          retryCount: updatedMedia.retryCount,
          originalError: err.message,
        });

        // บอก kafka ทํางานต่อไปได้ ส่งเข้า outbox ให้จัดการต่อเเล้ว
        return;
      }

      // ให้ระบบ retry 3 ครั้ง
      throw error;
    }
  }

  async getMediaStatus(mediaId: string, userId: string) {
    const media = await this.mediaModel.findById(mediaId);

    if (!media || media.userId !== userId) {
      throw new NotFoundException('ไม่พบไฟล์นี้');
    }

    return {
      mediaId,
      status: media.status,
      urls: {
        original: media.originalUrl,
        thumbnail: media.thumbnailUrl,
        medium: media.mediumUrl,
        p360: media.p360Url,
        p720: media.p720Url,
        p1080: media.p1080Url,
      },
    };
  }

  private async createDlqOutboxTransaction(data: {
    mediaId: string;
    userId: string;
    key: string;
    fileType: string;
    purpose: string;
    retryCount: number;
    originalError: string;
  }) {
    const session = await this.mediaModel.db.startSession();

    // สําหรับบอก post service ว่า failed
    const failedAt = new Date();
    const encodedFailedPayload = await registry.encode(
      this.mediaProcessFailedSchemaId,
      {
        mediaId: data.mediaId,
        userId: data.userId,
        purpose: data.purpose,
        errorMessage: data.originalError,
        failedAt: failedAt.toISOString(),
      },
    );

    try {
      await session.withTransaction(async () => {
        // บันทึก media send failed
        await this.mediaModel.findByIdAndUpdate(
          data.mediaId,
          {
            status: 'failed',
            retryCount: data.retryCount,
            errorMessage: data.originalError,
            failedAt: new Date(),
          },
          { session },
        );
        // เก็บทุก error เเละป้องกัน error ที่มีการ retry ซํ้า (network retry) เช่นหลังจาก commit เเล้ว client ไม่ได้ response
        const idempotentkey = `media-dlq-${data.mediaId}-retry-${data.retryCount}`;
        await this.outboxModel.updateOne(
          {
            eventId: idempotentkey,
          },
          {
            // บันทึกลง outbox สําหรับ dlq
            // เช็คว่าถ้ามีการ insert ให้บันทึกลง db ถ้าไม่มีคําสั่ง insert ไม่ต้องทําอะไร
            $setOnInsert: {
              eventId: idempotentkey,
              topic: 'media_events_dlq',
              key: data.mediaId,
              value: {
                mediaId: data.mediaId,
                userId: data.userId,
                key: data.key,
                fileType: data.fileType,
                purpose: data.purpose,
                retryCount: data.retryCount,
                originalError: data.originalError,
                failedAt: new Date().toISOString(),
              },
              headers: {
                event_type: 'media_process_failed_debug',
              },
              status: 'pending',
              attempts: 0,
              nextRetryAt: new Date(),
              payloadEncodingType: 'json',
            },
          },
          // ถ้ายังไม่มี doc ให้ insert ลง db ได้ ถ้ามีให้ update (เเต่กรณีนี้ไม่มีการอัปเดตเพราะใช้ร่วมกับ $setOnInsert)
          { upsert: true, session },
        );

        const sagaEventId = `media-saga-failed-${data.mediaId}-retry-${data.retryCount}`;
        await this.outboxModel.updateOne(
          { eventId: sagaEventId },
          {
            $setOnInsert: {
              eventId: sagaEventId,
              topic: 'media_events',
              key: data.mediaId,
              value: encodedFailedPayload,
              headers: {
                event_type: 'media_process_failed',
              },
              status: 'pending',
              attempts: 0,
              nextRetryAt: new Date(),
              payloadEncodingType: 'avro',
            },
          },
          { upsert: true, session },
        );
      });
    } finally {
      await session.endSession();
    }
  }
}
