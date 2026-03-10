import { NestFactory } from '@nestjs/core';
import { PostServiceModule } from './post-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(PostServiceModule);
  const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  const postServicePort = process.env.POST_SERVICE_PORT || 3002;
  const postServiceHost = process.env.POST_SERVICE_HOST || '127.0.0.1';

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
