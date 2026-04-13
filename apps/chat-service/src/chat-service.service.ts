import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './message.schema';
import { generateConversationId } from './utils/chat.util';

export interface ChatMessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
}

export interface ChatHistoryResponse {
  messages: ChatMessageResponse[];
  nextCursor: string;
  hasMore: boolean;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  async saveMessage(
    senderId: string,
    receiverId: string,
    content: string,
  ): Promise<MessageDocument> {
    const conversationId = generateConversationId(senderId, receiverId);

    const newMessage = new this.messageModel({
      conversationId,
      senderId,
      receiverId,
      content,
    });

    return newMessage.save();
  }

  async getChatHistory(
    userId1: string,
    userId2: string,
    limit: number = 20,
    cursor?: string,
  ): Promise<ChatHistoryResponse> {
    const conversationId = generateConversationId(userId1, userId2);

    const query = {
      conversationId,
      ...(cursor && Types.ObjectId.isValid(cursor)
        ? { _id: { $lt: new Types.ObjectId(cursor) } }
        : {}),
    };

    const messages = await this.messageModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1) // ดึงเกินมา 1 เพื่อ check hasMore
      .exec();

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // เอาตัวที่เกินออก
    }

    const nextCursor =
      messages.length > 0 ? String(messages[messages.length - 1]._id) : '';

    return {
      messages: messages.map((msg) => ({
        id: String(msg._id),
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
        isRead: msg.isRead,
      })),
      nextCursor,
      hasMore,
    };
  }
}
