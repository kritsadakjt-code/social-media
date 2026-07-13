import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { join } from 'path';
import { GatewayMediaController } from './media.controller';
import { GatewayMediaService } from './media.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'MEDIA_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'media',
            protoPath: join(process.cwd(), 'libs/shared/src/proto/media.proto'),
            url: `${configService.get('MEDIA_SERVICE_HOST')}:${configService.get('MEDIA_SERVICE_PORT')}`,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [GatewayMediaController],
  providers: [GatewayMediaService],
})
export class MediaModule {}
