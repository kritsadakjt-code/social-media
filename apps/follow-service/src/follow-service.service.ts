import { Injectable } from '@nestjs/common';

@Injectable()
export class FollowServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
