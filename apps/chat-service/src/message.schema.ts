import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  // รหัสห้องเเชท สร้างจากการนำ User ID 2 คนมาต่อกัน
  @Prop({ required: true, index: true })
  conversationId: string;

  @Prop({ required: true, type: String })
  senderId: string;

  @Prop({ required: true, type: String })
  receiverId: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: false })
  isRead: boolean;

  createdAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, _id: -1 });
