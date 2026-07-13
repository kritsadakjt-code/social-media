import { Module } from '@nestjs/common';
import { FollowServiceController } from './follow-service.controller';
import { FollowService } from './follow-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Follow, FollowSchema } from './follow.schema';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('FOLLOW_MONGO_URI'),
      }),
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([{ name: Follow.name, schema: FollowSchema }]),

    // add kafka
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
            producerOnlyMode: true, // เป็นคนส่งอย่างเดียว
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],

  controllers: [FollowServiceController],
  providers: [FollowService],
})
export class FollowServiceModule {}
