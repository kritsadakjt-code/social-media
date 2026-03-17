import { Test, TestingModule } from '@nestjs/testing';
import { FeedServiceController } from './feed-service.controller';
import { FeedServiceService } from './feed-service.service';

describe('FeedServiceController', () => {
  let feedServiceController: FeedServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [FeedServiceController],
      providers: [FeedServiceService],
    }).compile();

    feedServiceController = app.get<FeedServiceController>(FeedServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(feedServiceController.getHello()).toBe('Hello World!');
    });
  });
});
