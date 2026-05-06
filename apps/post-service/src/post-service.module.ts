import { Redis } from 'ioredis';
import { Module } from '@nestjs/common';
import { PostServiceController } from './post-service.controller';
import { PostService } from './post-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './post.schema';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Comment, CommentSchema } from './comment.schema';
import { ScheduleModule } from '@nestjs/schedule';
import { Like, LikeSchema } from './like.schema';
import { LikeService } from './like.service';
import { LikeAggregatorService } from './like-aggregator.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('POST_MONGO_URI'),
      }),
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Like.name, schema: LikeSchema },
    ]),

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
            producerOnlyMode: true,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [PostServiceController],
  providers: [
    PostService,
    LikeService,
    LikeAggregatorService,
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
export class PostServiceModule {}
