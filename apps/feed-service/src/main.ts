import { NestFactory } from '@nestjs/core';
import { FeedServiceModule } from './feed-service.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create(FeedServiceModule);

  const configService = app.get(ConfigService);
  const kafkaBroker =
    configService.get<string>('KAFKA_BROKER') || 'localhost:9092';

  const grpcHost = configService.get<string>('FEED_SERVICE_HOST', '127.0.0.1');
  const grpcPort = configService.get<number>('FEED_SERVICE_PORT', 50056);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [kafkaBroker],
      },
      consumer: {
        groupId: 'feed-consumer',

        sessionTimeout: 180000, // 3 นาที (จาก 30s)
        heartbeatInterval: 3000,
        rebalanceTimeout: 180000, // 3 นาที หลังพัง(rebalance) rejoin ภายใน 3 นาที ก่อนจะถูกตัดออก ป้องกัน consumer บางตัวกําลังพยายาม rejoin อยู่เเล้วถูกตัดเร็วเกินไป ทําให้เสียเวลาวนมาทําใหม่
        maxPollInterval: 600000, // 10 นาที ต้อง poll งานภายใน 10 นาที ก่อนที่จะโดนตัดออก ป้องกัน process ช้าเกินไป ทําให้งานอื่นช้าไปด้วย
      },
      // เป็น 3 เพราะอยากให้ consumer อ่าน partition เต็มที่ ป้องกัน consumer เยอะเเล้ว partition ที่ทํางานอยู่มีน้อย จะทําให้เสีย worker ไปเปล่าๆ
      run: { partitionsConsumedConcurrently: 3 },
    },
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'feed',
      protoPath: join(process.cwd(), 'libs/shared/src/proto/feed.proto'),
      url: `${grpcHost}:${grpcPort}`,
    },
  });

  await app.startAllMicroservices();

  await app.init();
  console.log(`🚀 Feed Microservice is listening on Kafka [${kafkaBroker}]...`);
}
bootstrap();
