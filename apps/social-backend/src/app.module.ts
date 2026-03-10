import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './auth/jwt.strategy';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ClientsModule.registerAsync([
      {
        name: 'USER_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'user',
            protoPath: join(process.cwd(), 'libs/shared/src/proto/user.proto'),
            url: `${configService.get<string>('USER_SERVICE_HOST') || '127.0.0.1'}:${configService.get<number>('USER_SERVICE_PORT') || 3001}`,
          },
        }),

        inject: [ConfigService],
      },
      {
        name: 'POST_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>('RABBITMQ_URL') ||
                'amqp://localhost:5672',
            ],
            queue: 'post_queue',
            queueOptions: { durable: false },
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'POST_SERVICE_GRPC',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'post',
            protoPath: join(process.cwd(), 'libs/shared/src/proto/post.proto'),
            // ดึงค่าจาก .env เพียวๆ
            url: `${configService.get<string>('POST_SERVICE_HOST')}:${configService.get<number>('POST_SERVICE_PORT')}`,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule {}
