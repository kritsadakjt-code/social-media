import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MediaDocument = HydratedDocument<Media>;

export type MediaStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type MediaPurpose = 'post' | 'avatar' | 'chat';

@Schema({ timestamps: true })
export class Media {
  // บังคับให้ _id รับค่าเป็น String (Snowflake)
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  key!: string; // S3 key

  @Prop({ required: true })
  fileType!: string; // image/jpeg, video/mp4

  @Prop({
    type: String,
    enum: ['post', 'avatar', 'chat'],
    required: true,
  })
  purpose!: MediaPurpose;

  @Prop({
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  })
  status!: MediaStatus;

  // URLs หลัง process เสร็จ
  @Prop({ type: String, default: null })
  originalUrl!: string | null;

  @Prop({ type: String, default: null })
  thumbnailUrl!: string | null;

  @Prop({ type: String, default: null })
  mediumUrl!: string | null;

  @Prop({ type: String, default: null })
  p360Url!: string | null;

  @Prop({ type: String, default: null })
  p720Url!: string | null;

  @Prop({ type: String, default: null })
  p1080Url!: string | null;

  @Prop({ default: 0 })
  retryCount!: number;

  @Prop({ type: String, default: null })
  errorMessage!: string | null;

  @Prop({ type: Date, default: null })
  failedAt!: Date | null;

  // chk upload file
  @Prop({ type: Number, required: true }) // chk size ตอน presigned คร่าวๆ ก่อนสร้าง URL
  fileSize!: number;

  @Prop({ type: Number, default: null })
  uploadedSize!: number | null; // size จริงจาก s3 เพื่อ chk ขนาดเท่ากับ client เเจ้งมา

  @Prop({ type: String, default: null })
  uploadedContentType!: string | null; // type จริงจาก s3 เพื่อ chk type ตรงกับ client เเจ้งมา

  @Prop({ type: Date, default: null })
  verifiedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const MediaSchema = SchemaFactory.createForClass(Media);
MediaSchema.index({ userId: 1, status: 1 });
