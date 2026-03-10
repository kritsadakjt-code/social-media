import { Controller, Get } from '@nestjs/common';
import { FollowServiceService } from './follow-service.service';

@Controller()
export class FollowServiceController {
  constructor(private readonly followServiceService: FollowServiceService) {}

  @Get()
  getHello(): string {
    return this.followServiceService.getHello();
  }
}
