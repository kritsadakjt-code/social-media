import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LikeDocument = HydratedDocument<Like>;

@Schema({ timestamps: true })
export class Like {
  @Prop({ required: true, index: true })
  postId: string;

  @Prop({ required: true, index: true })
  userId: string; // คนที่กดไลก์

  createdAt?: Date;
}

export const LikeSchema = SchemaFactory.createForClass(Like);

// ป้องกันไลก์ซํ้า, query เร็วขึ้น
LikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
