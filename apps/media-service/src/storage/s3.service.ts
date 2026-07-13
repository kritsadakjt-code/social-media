// apps/media-service/src/storage/s3.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

@Injectable()
export class S3Service {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3Client({
      region: configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
    this.bucket = configService.getOrThrow<string>('S3_BUCKET_NAME');
  }

  // สร้าง presigned URL สำหรับ upload
  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    maxSize: number,
    expiresIn: number = 300, // 5 นาที
  ) {
    return createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Fields: {
        'Content-Type': contentType,
      },
      Conditions: [
        ['content-length-range', 1, maxSize], // 1 btye - maxSize
        ['eq', '$Content-Type', contentType],
      ],
      Expires: expiresIn,
    });
  }

  // เช็คไฟล์ตอน confirm upload
  async headObject(key: string) {
    // อ่านไฟล์จาก s3 ไม่ได้โหลด
    const response = await this.s3.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    return {
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType,
      eTag: response.ETag, // ETag มาจากการ hash algorithm ของไฟล์เพื่อเช็คไฟล์ว่าง ไฟล์ซํ้า
    };
  }

  // ดาวน์โหลดไฟล์จาก S3 เพื่อ process
  async downloadFile(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.s3.send(command);
    const chunks: Uint8Array[] = [];

    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  // upload ไฟล์ที่ process แล้วกลับ S3
  async uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.s3.send(command);
    this.logger.log(`✅ Upload สำเร็จ: ${key}`);
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.s3.send(command);
  }
}
