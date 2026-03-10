import { Test, TestingModule } from '@nestjs/testing';
import { FollowServiceController } from './follow-service.controller';
import { FollowServiceService } from './follow-service.service';

describe('FollowServiceController', () => {
  let followServiceController: FollowServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [FollowServiceController],
      providers: [FollowServiceService],
    }).compile();

    followServiceController = app.get<FollowServiceController>(FollowServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(followServiceController.getHello()).toBe('Hello World!');
    });
  });
});
