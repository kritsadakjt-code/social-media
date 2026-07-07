import { NestFactory } from '@nestjs/core';
import { UserServiceModule } from './user-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(UserServiceModule);

  const configService = app.get(ConfigService);

  const host = configService.get<string>('USER_SERVICE_HOST', '127.0.0.1');
  const port = configService.get<number>('USER_SERVICE_PORT', 50051);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'user',
      protoPath: join(process.cwd(), 'libs/shared/src/proto/user.proto'),
      url: `${host}:${port}`,
    },
  });

  await app.startAllMicroservices();
  console.log('🚀 User Microservice is listening on GRPC port 50051');
}
bootstrap();
