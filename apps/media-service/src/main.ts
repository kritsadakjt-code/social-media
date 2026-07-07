import { NestFactory } from '@nestjs/core';
import { MediaServiceModule } from './media-service.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(MediaServiceModule);
  const configService = app.get(ConfigService);

  const host = configService.get<string>('MEDIA_SERVICE_HOST', '0.0.0.0');
  const grpcPort = configService.get<number>('MEDIA_SERVICE_PORT', 50055);
  const kafkaBroker = configService.getOrThrow<string>('KAFKA_BROKER');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: { brokers: [kafkaBroker] },
      consumer: {
        groupId: 'media-consumer',

        sessionTimeout: 60000, // ตั้งค่าเพดานเวลา kafka รอ heartbeat ไม่เกิน 1 นาที
        heartbeatInterval: 20000, // defualt = 3s หน่วงเวลาเป็น 20 วิเพื่อให้ cpu ได้มีเวลาส่ง heartbeat กรณีที่ cpu ทํางานหนักมากๆ
        // kafka ควรทําหน้าที่ส่งอย่างเดียว ไม่ควรรองานนาน ควรเเยกการเเปลงไฟล์ ท่อไฟล์เล็ก ไฟล์ใหญ่ เพื่อความเร็ว
        // เวลาคํานวณจาก งานที่ service ใช้เวลาทํางานที่สุด เช่น เเปลง vdo ขนาดสูงสุดใช้เวลาเท่าไร
        // ตั้งค่าเพดานเวลา worker ต้อง commit ภายใน 15 นาที ป้องกันกรณีที่ worker ค้าง ติดลูป หรือต้องทํางานที่นานเช่น เเปลง vdo นานเกินเวลาที่คํานวณไว้
        maxPollIntervalMs: 900000, // defualt = 5 m
      },
    },
  });
  // gRPC
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'media',
      protoPath: join(process.cwd(), 'libs/shared/src/proto/media.proto'),
      url: `${host}:${grpcPort}`,
    },
  });

  await app.startAllMicroservices();
  await app.init();

  console.log(`🚀 Media Service running (gRPC: ${grpcPort})`);
}
bootstrap();
