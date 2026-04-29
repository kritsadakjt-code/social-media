import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { join } from 'path';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'FOLLOW_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'follow',
            protoPath: join(
              process.cwd(),
              'libs/shared/src/proto/follow.proto',
            ),
            url: `${configService.get<string>('FOLLOW_SERVICE_HOST')}:${configService.get<number>('FOLLOW_SERVICE_PORT')}`,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
