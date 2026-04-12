import { Module } from '@nestjs/common';
import { ChatServiceController } from './chat-service.controller';
import { ChatService } from './chat-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from './message.schema';
import { ChatGateway } from './chat.gateway';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('CHAT_MONGO_URI'),
      }),
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ChatServiceController],
  providers: [ChatService, ChatGateway],
})
export class ChatServiceModule {}
