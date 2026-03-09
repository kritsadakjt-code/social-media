import { Module } from '@nestjs/common';
import { FollowServiceController } from './follow-service.controller';
import { FollowServiceService } from './follow-service.service';

@Module({
  imports: [],
  controllers: [FollowServiceController],
  providers: [FollowServiceService],
})
export class FollowServiceModule {}
