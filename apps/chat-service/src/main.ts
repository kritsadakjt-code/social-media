import { NestFactory } from '@nestjs/core';
import { ChatServiceModule } from './chat-service.module';
import { RedisIoAdapter } from './redis-io.adapter';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(ChatServiceModule);
  const configService = app.get(ConfigService);

  const host = configService.get<string>('CHAT_SERVICE_HOST', '0.0.0.0');
  const grpcPort = configService.get<number>('CHAT_SERVICE_PORT', 3005);
  const socketPort = configService.get<number>(
    'CHAT_SERVICE_SOCKET_PORT',
    50053,
  );

  // เปิดใช้งาน redis adapter สำหรับ WebSockets
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'chat',
      protoPath: join(process.cwd(), 'libs/shared/src/proto/chat.proto'),
      url: `${host}:${grpcPort}`,
    },
  });
  await app.startAllMicroservices();

  // web socket
  await app.listen(socketPort);
  console.log(
    `🚀 Chat Service is running on HTTP: ${socketPort} and gRPC: ${grpcPort}`,
  );
}
bootstrap();
