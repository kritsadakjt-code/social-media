import { NestFactory } from '@nestjs/core';
import { FeedServiceModule } from './feed-service.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(FeedServiceModule);

  const configService = app.get(ConfigService);
  const kafkaBroker =
    configService.get<string>('KAFKA_BROKER') || 'localhost:9092';

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [kafkaBroker],
      },
      consumer: {
        groupId: 'feed-consumer',
      },
    },
  });

  await app.startAllMicroservices();

  await app.init();
  console.log(`🚀 Feed Microservice is listening on Kafka [${kafkaBroker}]...`);
}
bootstrap();
