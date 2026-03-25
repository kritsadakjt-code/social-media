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
  const port = configService.get<number>('CHAT_SERVICE_PORT', 50053);

  // เปิดใช้งาน redis adapter สำหรับ WebSockets
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'chat',
      protoPath: join(process.cwd(), 'libs/shared/src/proto/chat.proto'),
      url: `${host}:${port}`,
    },
  });
  await app.startAllMicroservices();

  // web socket
  await app.listen(3005);
  console.log('🚀 Chat Service is running (gRPC: 50053, WebSockets: 3005)');
}
bootstrap();
