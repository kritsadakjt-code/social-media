import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { UsersController } from './users.controller';
import { PostsController } from './posts.controller';
import { FollowsController } from './follows.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './auth/jwt.strategy';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ClientsModule.registerAsync([
      {
        name: 'USER_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'user',
            protoPath: join(process.cwd(), 'libs/shared/src/proto/user.proto'),
            url: `${configService.get<string>('USER_SERVICE_HOST') || '127.0.0.1'}:${configService.get<number>('USER_SERVICE_PORT') || 3001}`,
          },
        }),

        inject: [ConfigService],
      },
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
        name: 'FOLLOW_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'follow',
            protoPath: join(
              process.cwd(),
              'libs/shared/src/proto/follow.proto',
            ),
            url: `${configService.get<string>('FOLLOW_SERVICE_HOST')}:${configService.get<number>('FOLLOW_SERVICE_PORT')}`,
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
            consumer: {
              groupId: 'api-gateway-feed-consumer',
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [
    AuthController,
    UsersController,
    PostsController,
    FollowsController,
  ],
  providers: [AppService, JwtStrategy],
})
export class AppModule {}
