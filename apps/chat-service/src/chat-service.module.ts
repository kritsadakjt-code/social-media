import { Module } from '@nestjs/common';
import { ChatServiceController } from './chat-service.controller';
import { ChatService } from './chat-service.service';

@Module({
  imports: [],
  controllers: [ChatServiceController],
  providers: [ChatService],
})
export class ChatServiceModule {}
