import { Module } from '@nestjs/common';
import { PostServiceController } from './post-service.controller';
import { PostService } from './post-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './post.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('POST_MONGO_URI'),
      }),
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
  ],
  controllers: [PostServiceController],
  providers: [PostService],
})
export class PostServiceModule {}
