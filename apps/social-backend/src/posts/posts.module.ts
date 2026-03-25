import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'POST_SERVICE_RABBITMQ',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>('RABBITMQ_URL') ||
                'amqp://localhost:5672',
            ],
            queue: 'post_queue',
            queueOptions: { durable: false },
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'POST_SERVICE_GRPC',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'post',
            protoPath: join(process.cwd(), 'libs/shared/src/proto/post.proto'),
            url: `${configService.get<string>('POST_SERVICE_HOST')}:${configService.get<number>('POST_SERVICE_PORT')}`,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'FEED_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              brokers: [
                configService.get<string>('KAFKA_BROKER') || 'localhost:9092',
              ],
            },
            consumer: { groupId: 'api-gateway-feed-consumer' },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
