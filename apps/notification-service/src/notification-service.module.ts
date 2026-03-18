import { Module } from '@nestjs/common';
import { NotificationServiceController } from './notification-service.controller';
import { NotificationService } from './notification-service.service';
import { ConfigModule } from '@nestjs/config';
import { NotificationGateway } from './notification.gateway';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [NotificationServiceController],
  providers: [NotificationService, NotificationGateway],
})
export class NotificationServiceModule {}
