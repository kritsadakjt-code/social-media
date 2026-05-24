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
  MediaUploadedSchema,
  registry,
} from '@app/shared';
import { SchemaType } from '@kafkajs/confluent-schema-registry';
import { SnowflakeIdService } from './snowflake.service';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';

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
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectModel(Media.name)
    private readonly mediaModel: Model<MediaDocument>,
    private readonly s3Service: S3Service,
    private readonly mediaProcessorService: MediaProcessorService,
    @Inject('KAFKA_SERVICE')
    private readonly kafkaClient: ClientKafka,
    private readonly snowflakeIdService: SnowflakeIdService,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();

    const [uploaded, processed] = await Promise.all([
      registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(MediaUploadedSchema),
      }),
      registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(MediaProcessedSchema),
      }),
    ]);

    this.mediaUploadedSchemaId = uploaded.id;
    this.mediaProcessedSchemaId = processed.id;
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

    // เข้ารหัสด้วย algorithm sha256
    const shard = createHash('sha256')
      .update(mediaId)
      .digest('hex') // output hex pattern
      .slice(0, 2); // 256 chars 16*16
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

      // emit Kafka แจ้ง post-service
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

      this.kafkaClient.emit('media_events', {
        key: mediaId,
        value: encodedPayload,
        headers: { event_type: 'media_processed' },
      });

      this.logger.log(`✅ Process media สำเร็จ: ${mediaId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Process media ล้มเหลว: ${mediaId}`, err.message);

      // พยายาม process file ใหม่
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
      if (updatedMedia.retryCount > 3) {
        this.logger.warn(
          `🗑️ โยนไฟล์ ${mediaId} ทิ้งเข้า DLQ เพราะพังครบ 3 รอบแล้ว!`,
        );

        try {
          // ส่ง message ไป dlq ใน kafka เพื่อ debug
          await firstValueFrom(
            this.kafkaClient.emit('media_events_dlq', {
              key: mediaId,
              value: {
                mediaId,
                userId,
                key,
                fileType,
                purpose,
                retryCount: updatedMedia.retryCount,
                originalError: err.message,
                failedAt: new Date().toISOString(),
              },
              headers: {
                event_type: 'media_process_failed',
              },
            }),
          );
        } catch (error) {
          this.logger.error(`🚨 ส่งไฟล์ ${mediaId} เข้า DLQ ล้มเหลว!`, error);
          // ถ้าส่งเข้า dlq ไม่สําเร็จ retry process ใหม่
          throw error;
        }
        // บอก kafka ทํางานต่อไปได้ ส่งเข้า dlq เเล้ว
        return;
      }
      // ให้ kafka retry 3 ครั้ง
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
}
