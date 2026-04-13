import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'CHAT_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'chat',
            protoPath: join(process.cwd(), 'libs/shared/src/proto/chat.proto'),
            url: `${configService.get('CHAT_SERVICE_HOST')}:${configService.get('CHAT_SERVICE_PORT')}`,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
