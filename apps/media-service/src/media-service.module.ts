import { Module } from '@nestjs/common';
import { MediaController } from './media-service.controller';
import { MediaService } from './media-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { Media, MediaSchema } from './media.schema';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MediaProcessorController } from './processor/media-processor.controller';
import { S3Service } from './storage/s3.service';
import { CloudFrontService } from './storage/cloudfront.service';
import { MediaProcessorService } from './processor/media-processor.service';
import { SnowflakeIdService } from './snowflake.service';
import { OutboxEvent, OutboxSchema } from './outbox/outbox.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MEDIA_MONGO_URI'),
      }),
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([
      { name: Media.name, schema: MediaSchema },
      { name: OutboxEvent.name, schema: OutboxSchema },
    ]),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),

    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              brokers: [configService.getOrThrow<string>('KAFKA_BROKER')],
              retry: {
                initialRetryTime: 1000, // เว้นระยะ 1 วินาที
                retries: 3,
                multiplier: 2, // *2
              },
            },
            producerOnlyMode: true,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [MediaController, MediaProcessorController],
  providers: [
    MediaService,
    S3Service,
    CloudFrontService,
    MediaProcessorService,
    SnowflakeIdService,
  ],
})
export class MediaServiceModule {}
