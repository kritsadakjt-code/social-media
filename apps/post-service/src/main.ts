import { NestFactory } from '@nestjs/core';
import { PostServiceModule } from './post-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(PostServiceModule);

  const configService = app.get(ConfigService);

  const rabbitUrl = configService.get<string>(
    'RABBITMQ_URL',
    'amqp://localhost:5672',
  );
  const postServicePort = configService.get<number>('POST_SERVICE_PORT', 3002);
  const postServiceHost = configService.get<string>(
    'POST_SERVICE_HOST',
    '127.0.0.1',
  );

  // rabbitMQ
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: 'post_queue',
      queueOptions: { durable: false },
    },
  });

  // gRpc
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'post',
      protoPath: join(process.cwd(), 'libs/shared/src/proto/post.proto'),
      url: `${postServiceHost}:${postServicePort}`, // ใช้ Port 3002 จะได้ไม่ชนกับ User Service (3001)
    },
  });

  await app.startAllMicroservices();
  console.log(`🚀 Post Microservice is listening on gRPC: ${postServicePort}`);
}
bootstrap();
