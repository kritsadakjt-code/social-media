import { NestFactory } from '@nestjs/core';
import { FollowServiceModule } from './follow-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrap() {
  const host = process.env.FOLLOW_SERVICE_HOST || '127.0.0.1';
  const port = process.env.FOLLOW_SERVICE_PORT || 3003;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    FollowServiceModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'follow',
        protoPath: join(process.cwd(), 'libs/shared/src/proto/follow.proto'),
        url: `${host}:${port}`,
      },
    },
  );
  await app.listen();
  console.log('🚀 Follow Microservice is listening on gRPC (Port 3003)');
}
bootstrap();
