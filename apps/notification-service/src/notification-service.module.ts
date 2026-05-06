import { Module } from '@nestjs/common';
import { NotificationServiceController } from './notification-service.controller';
import { NotificationService } from './notification-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationGateway } from './notification.gateway';
import { JwtModule } from '@nestjs/jwt';
// import { EventEmitterModule } from '@nestjs/event-emitter';
import { PostLikedHandler } from './handlers/posts/post-liked.handler';
import { CqrsModule } from '@nestjs/cqrs';
import { PostCommentHandler } from './handlers/posts/post-comment.handler';
import { LikeThrottleService } from './like-throttle.service';
import Redis from 'ioredis';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),

    // EventEmitterModule.forRoot(),
    CqrsModule,
  ],
  controllers: [NotificationServiceController],
  providers: [
    NotificationService,
    NotificationGateway,
    PostLikedHandler,
    PostCommentHandler,
    LikeThrottleService, // เพิ่ม
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) =>
        new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        }),
      inject: [ConfigService],
    },
  ],
})
export class NotificationServiceModule {}
