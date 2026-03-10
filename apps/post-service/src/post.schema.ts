import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Post extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: 0 })
  likes: number;

  // สร้างไว้เพื่อไม่ให้เเจ้ง unsafe เพราะ ts ไม่รู้จักชื่อนี้ถ้าไม่ประกาศ
  createdAt: Date;
  updatedAt: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);
