import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);

  const configService = app.get(ConfigService);
  const kafkaBroker =
    configService.get<string>('KAFKA_BROKER') || 'localhost:9092';
  const kafkaGroupId =
    configService.get<string>('KAFKA_CONSUMER_GROUP') ||
    'notification-consumer';

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [kafkaBroker],
      },
      consumer: {
        groupId: kafkaGroupId, // ชื่อกลุ่มคนฟัง
      },
    },
  });
  await app.startAllMicroservices();

  await app.listen(3004);
  console.log('🔔 Notification Microservice is listening on Kafka...');
  console.log(
    '🚀 Notification Service is listening on HTTP Port 3004 (For WebSockets)',
  );
}
bootstrap();
