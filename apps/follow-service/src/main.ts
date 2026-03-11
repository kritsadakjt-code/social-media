import { NestFactory } from '@nestjs/core';
import { FollowServiceModule } from './follow-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(FollowServiceModule);

  const configService = app.get(ConfigService);

  const host = configService.get<string>('FOLLOW_SERVICE_HOST', '127.0.0.1');
  const port = configService.get<number>('FOLLOW_SERVICE_PORT', 3003);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'follow',
      protoPath: join(process.cwd(), 'libs/shared/src/proto/follow.proto'),
      url: `${host}:${port}`,
    },
  });

  await app.startAllMicroservices();
  console.log('🚀 Follow Microservice is listening on gRPC (Port 3003)');
}
bootstrap();
