import { Module } from '@nestjs/common';
import { FeedServiceController } from './feed-service.controller';
import { FeedService } from './feed-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              brokers: [
                configService.get<string>('KAFKA_BROKER') || 'localhost:9092',
              ],
            },
            consumer: {
              groupId: 'feed-service-asker', // กลุ่มสำหรับรอรับคำตอบ
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],

  controllers: [FeedServiceController],
  providers: [
    FeedService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: configService.get<number>('REDIS_PORT') || 6379,
          password: configService.get<string>('REDIS_PASSWORD'),
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class FeedServiceModule {}
