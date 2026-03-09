import { NestFactory } from '@nestjs/core';
import { PostServiceModule } from './post-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PostServiceModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
        queue: 'post_queue',
        queueOptions: { durable: false },
      },
    },
  );
  await app.listen();
  console.log('🚀 Post Microservice is listening on RabbitMQ');
}
bootstrap();
