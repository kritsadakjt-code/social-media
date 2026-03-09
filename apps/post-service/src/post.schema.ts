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
}

export const PostSchema = SchemaFactory.createForClass(Post);
