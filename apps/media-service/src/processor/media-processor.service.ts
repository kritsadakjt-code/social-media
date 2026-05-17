// apps/media-service/src/processor/media-processor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { S3Service } from '../storage/s3.service';
import { CloudFrontService } from '../storage/cloudfront.service';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

export interface ProcessedUrls {
  originalUrl: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  p360Url?: string;
  p720Url?: string;
  p1080Url?: string;
}

@Injectable()
export class MediaProcessorService {
  private readonly logger = new Logger(MediaProcessorService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly cloudFrontService: CloudFrontService,
  ) {}

  async processImage(key: string, mediaId: string): Promise<ProcessedUrls> {
    this.logger.log(`🖼️ กำลัง process รูปภาพ: ${key}`);

    // ดาวน์โหลดจาก S3
    const buffer = await this.s3Service.downloadFile(key);

    const basePath = `processed/${mediaId}`;

    // สร้าง 3 ขนาด พร้อมกัน
    const [thumbnail, medium, original] = await Promise.all([
      // Thumbnail 150x150
      sharp(buffer)
        .resize(150, 150, { fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer(),

      // Medium 600x600
      sharp(buffer)
        .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),

      // Original — แค่ compress
      sharp(buffer).webp({ quality: 85 }).toBuffer(),
    ]);

    const thumbnailKey = `${basePath}/thumbnail.webp`;
    const mediumKey = `${basePath}/medium.webp`;
    const originalKey = `${basePath}/original.webp`;

    // upload ทั้ง 3 ขนาดพร้อมกัน
    await Promise.all([
      this.s3Service.uploadFile(thumbnailKey, thumbnail, 'image/webp'),
      this.s3Service.uploadFile(mediumKey, medium, 'image/webp'),
      this.s3Service.uploadFile(originalKey, original, 'image/webp'),
    ]);

    return {
      thumbnailUrl: this.cloudFrontService.getPublicUrl(thumbnailKey),
      mediumUrl: this.cloudFrontService.getPublicUrl(mediumKey),
      originalUrl: this.cloudFrontService.getPublicUrl(originalKey),
    };
  }

  async processVideo(key: string, mediaId: string): Promise<ProcessedUrls> {
    this.logger.log(`🎥 กำลัง process วิดีโอ: ${key}`);

    // ดาวน์โหลดมาเก็บไว้ใน temp ก่อน เพราะ FFmpeg ต้องการไฟล์จริง
    const buffer = await this.s3Service.downloadFile(key);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-'));
    const inputPath = path.join(tmpDir, 'input.mp4');

    await fs.writeFile(inputPath, buffer);

    const basePath = `processed/${mediaId}`;
    const qualities = [
      { name: 'p360', height: 360 },
      { name: 'p720', height: 720 },
      { name: 'p1080', height: 1080 },
    ];

    const urls: Record<string, string> = {};

    // transcode ทีละ quality
    for (const quality of qualities) {
      const outputPath = path.join(tmpDir, `${quality.name}.mp4`);
      const outputKey = `${basePath}/${quality.name}.mp4`;

      await this.transcodeVideo(inputPath, outputPath, quality.height);

      const outputBuffer = await fs.readFile(outputPath);
      await this.s3Service.uploadFile(outputKey, outputBuffer, 'video/mp4');

      urls[`${quality.name}Url`] =
        this.cloudFrontService.getPublicUrl(outputKey);
    }

    // ลบ temp files
    await fs.rm(tmpDir, { recursive: true });

    return {
      originalUrl: urls['p1080Url'] ?? '',
      p360Url: urls['p360Url'],
      p720Url: urls['p720Url'],
      p1080Url: urls['p1080Url'],
    };
  }

  private transcodeVideo(
    inputPath: string,
    outputPath: string,
    height: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-crf 23',
          '-preset fast',
          `-vf scale=-2:${height}`, // -2 รักษา aspect ratio
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart', // เล่นได้ทันทีไม่ต้อง download จบก่อน
        ])
        .output(outputPath)
        // ใช้ () => ไม่รับค่าใดๆ เนื่องจาก ffmpeg ส่ง (stdout, stderr) resolve รับเเค่ค่าเดียวหรือ optional
        .on('end', () => resolve)
        .on('error', reject)
        .run();
    });
  }
}
