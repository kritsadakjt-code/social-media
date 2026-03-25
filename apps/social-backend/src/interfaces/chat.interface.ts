import { Observable } from 'rxjs';
// interface ตาม proto

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

export interface GetChatHistoryRequest {
  userId1: string;
  userId2: string;
  limit: number;
  cursor: string;
}

export interface ChatServiceClient {
  getChatHistory(data: GetChatHistoryRequest): Observable<ChatHistoryResponse>;
}
