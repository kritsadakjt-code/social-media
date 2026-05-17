import { NestFactory } from '@nestjs/core';
import { MediaServiceModule } from './media-service.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(MediaServiceModule);
  const configService = app.get(ConfigService);

  const host = configService.get<string>('MEDIA_SERVICE_HOST', '0.0.0.0');
  const grpcPort = configService.get<number>('MEDIA_SERVICE_PORT', 3006);
  const kafkaBroker = configService.getOrThrow<string>('KAFKA_BROKER');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: { brokers: [kafkaBroker] },
      consumer: { groupId: 'media-consumer' },
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
