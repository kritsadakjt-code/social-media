import { Controller } from '@nestjs/common';
import { ChatService } from './chat-service.service';

@Controller()
export class ChatServiceController {
  constructor(private readonly chatService: ChatService) {}
}
