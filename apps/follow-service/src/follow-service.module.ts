import { Module } from '@nestjs/common';
import { FollowServiceController } from './follow-service.controller';
import { FollowService } from './follow-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Follow, FollowSchema } from './follow.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('FOLLOW_MONGO_URI'),
      }),
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([{ name: Follow.name, schema: FollowSchema }]),
  ],

  controllers: [FollowServiceController],
  providers: [FollowService],
})
export class FollowServiceModule {}
