import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(private app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const configService = this.app.get(ConfigService);
    const redisUrl =
      configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    // เป็นการสร้างท่อเชื่อม redis เเละเตรียมส่งข้อมูลให้ redis
    const pubClient = new Redis(redisUrl);
    // ผูกกับ client เเละรอรับข้อมูลที่มาจาก redis
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err: Error) =>
      this.logger.error(`Redis PubClient Error: ${err.message}`),
    );
    subClient.on('error', (err: Error) =>
      this.logger.error(`Redis SubClient Error: ${err.message}`),
    );

    await new Promise<void>((resolve) => pubClient.once('ready', resolve));
    await new Promise<void>((resolve) => subClient.once('ready', resolve));

    this.logger.log(`✅ Connected to Redis Adapter at ${redisUrl}`);

    this.adapterConstructor = createAdapter(pubClient, subClient, {
      key: 'chat_socket_adapter',
    });
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
