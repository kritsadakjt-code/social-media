import { NestFactory } from '@nestjs/core';
import { UserServiceModule } from './user-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UserServiceModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'user',
        protoPath: join(process.cwd(), 'libs/shared/src/proto/user.proto'),
        url: `${process.env.USER_SERVICE_HOST || '127.0.0.1'}:${process.env.USER_SERVICE_PORT || 3001}`,
      },
    },
  );
  await app.listen();
  console.log('🚀 User Microservice is listening on GRPC port 3001');
}
bootstrap();
