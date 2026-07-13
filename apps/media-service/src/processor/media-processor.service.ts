import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { S3Service } from '../storage/s3.service';
import { CloudFrontService } from '../storage/cloudfront.service';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { createHash } from 'crypto';

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

    // ดาวน์โหลดจาก S3 ควรใช้วิธี Stream ส่งข้อมูลเป็นท่อไหลเข้ามาให้ Sharp ทีละนิด
    const buffer = await this.s3Service.downloadFile(key);

    const shard = createHash('sha256')
      .update(mediaId)
      .digest('hex')
      .slice(0, 2);

    const basePath = `processed/${shard}/${mediaId}`;

    // สร้าง 3 ขนาด พร้อมกัน
    const [thumbnail, medium, original] = await Promise.all([
      // Thumbnail 150x150 สําหรับ chat
      sharp(buffer)
        .resize(150, 150, { fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer(),

      // Medium 600x600 สําหรับ feed
      sharp(buffer)
        .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),

      // Original บีบอัด 85% ช่วยลดขนาดไฟล์ได้ 30-50%
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

    // ดาวน์โหลดมาเก็บไว้ใน temp ของ server ก่อน เพราะ FFmpeg ต้องการไฟล์จริง
    const buffer = await this.s3Service.downloadFile(key);
    // สร้าง folder เเละสุ่มตัวอักษร 6 ตัวต่อท้ายเพื่อไม่ให้ folder ซํ้า
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-'));
    // full path
    const inputPath = path.join(tmpDir, 'input.mp4');
    // เขียน buffer ที่โหลดมา ทับลงใน input.mp4
    await fs.writeFile(inputPath, buffer);

    this.logger.log(`🎥 กำลัง process วิดีโอ: ${key}`);
    const shard = createHash('sha256')
      .update(mediaId)
      .digest('hex')
      .slice(0, 2);

    const basePath = `processed/${shard}/${mediaId}`;

    const qualities = [
      { name: 'p360', height: 360 },
      { name: 'p720', height: 720 },
      { name: 'p1080', height: 1080 },
    ];

    const urls: Record<string, string> = {};

    // transcode ทีละ quality เพราะใช้ cpu สูง ไม่เหมือนกับ image
    for (const quality of qualities) {
      // สร้างไฟล์ใหม่หลังจากเเปลงเเล้ว
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
        // เพิ่ม แสดง % ความคืบหน้าให้รู้ว่าไม่ค้าง
        .on('progress', (progress) => {
          if (progress.percent) {
            this.logger.debug(
              `⏳ กำลังแปลงวิดีโอขนาด ${height}p... ทำเสร็จไปแล้ว ${Math.round(progress.percent)}%`,
            );
          }
        })
        // ใช้ () => ไม่รับค่าใดๆ เนื่องจาก ffmpeg ส่ง (stdout, stderr) resolve รับเเค่ค่าเดียวหรือ optional
        .on('end', () => {
          this.logger.log(`✅ แปลงวิดีโอขนาด ${height}p เสร็จสมบูรณ์!`);
          resolve();
        })
        // ต้องใส่ stdout ถึงเเม้จะไม่ได้ใช้เพราะ ffmpeg ต้องการให้ครับ stdout ใช้ร่วมกับ pipe
        .on('error', (err, stdout, stderr) => {
          this.logger.error(
            `❌ FFmpeg พังตอนแปลงขนาด ${height}p: ${err.message}`,
          );
          this.logger.error(`สาเหตุเบื้องลึก: ${stderr}`);
          reject(err);
        })
        .run();
    });
  }
}
