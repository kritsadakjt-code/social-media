import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Follow extends Document {
  // id ตัวเรา
  @Prop({ required: true, index: true })
  followerId: string;
  // id คนที่อยากติดตาม
  @Prop({ required: true, index: true })
  followingId: string;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);

// ป้องกันไม่ให้กดติดตามคนเดิมซ้ำได้ .index คือสร้างคําสั่งพิเศษที่ซ่อนไว้ใน db ที่คอยเช็คข้อมูล
FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
