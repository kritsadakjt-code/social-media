import { of } from 'rxjs';
import { FeedService, PostCreatedEventPayload } from './feed-service.service';
import { Test, TestingModule } from '@nestjs/testing';
import { registry } from '@app/shared';

// จำลอง Schema Registry
jest.mock('@app/shared', () => ({
  registry: {
    decode: jest.fn(),
  },
}));

describe('FeedService (Unit Test)', () => {
  let service: FeedService;

  const mockRedisPipeline = {
    zadd: jest.fn().mockReturnThis(),
    zremrangebyrank: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    zrem: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue('OK'),
  };

  const mockRedisClient = {
    pipeline: jest.fn().mockReturnValue(mockRedisPipeline),
    zrevrange: jest.fn().mockResolvedValue(['post-1', 'post-2']),
  };

  const mockKafkaClient = {
    subscribeToResponseOf: jest.fn(),
    connect: jest.fn().mockResolvedValue(true),
    // ใช้ RxJS 'of' เพื่อจำลอง Observable ที่ this.kafkaClient.send คืนค่ากลับมา
    send: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedisClient,
        },
        {
          provide: 'KAFKA_SERVICE',
          useValue: mockKafkaClient,
        },
      ],
    }).compile();

    service = module.get<FeedService>(FeedService);

    jest.clearAllMocks();
  });

  describe('Lifecycle (onModuleInit)', () => {
    it('ควร subscribe topic ที่ต้องรอคำตอบและ connect Kafka', async () => {
      await service.onModuleInit();

      expect(mockKafkaClient.subscribeToResponseOf).toHaveBeenCalledWith(
        'get_followers',
      );
      expect(mockKafkaClient.subscribeToResponseOf).toHaveBeenCalledWith(
        'get_post_ids_for_feed_cleanup',
      );
      expect(mockKafkaClient.connect).toHaveBeenCalled();
    });
  });

  describe('handlePostCreated', () => {
    const mockPostPayload: PostCreatedEventPayload = {
      postId: 'post-123',
      authorId: 'lisa',
      content: 'Hello World',
      timestamp: new Date().toISOString(),
    };
    const mockBuffer = Buffer.from('fake-buffer-data');

    it('ควรเพิ่มโพสต์ลง Feed ของ Followers ทุกคนผ่าน Redis Pipeline', async () => {
      // จําลองการ decode
      (registry.decode as jest.Mock).mockResolvedValue(mockPostPayload);

      // จำลองรายชื่อผู้ติดตามที่จะตอบกลับมาจาก Kafka RPC
      mockKafkaClient.send.mockReturnValue(of(['user_A', 'user_B']));

      // buffer ปลอมจาก controller
      await service.handlePostCreated(mockBuffer);

      // chk call get_followers
      expect(mockKafkaClient.send).toHaveBeenCalledWith('get_followers', {
        userId: 'lisa',
      });

      // chk redis pipeline
      expect(mockRedisClient.pipeline).toHaveBeenCalled();

      // มีคนตาม 2 คน ต้องเรียก zadd 2 ครั้ง
      expect(mockRedisPipeline.zadd).toHaveBeenCalledTimes(2);
      expect(mockRedisPipeline.zadd).toHaveBeenCalledWith(
        'feed:user_A',
        expect.any(Number), // Timestamp score
        'post-123',
      );

      // chk การคุม 20 โพสต์ และตั้งวันหมดอายุ
      expect(mockRedisPipeline.zremrangebyrank).toHaveBeenCalledWith(
        'feed:user_B',
        0,
        -21,
      );
      expect(mockRedisPipeline.expire).toHaveBeenCalledWith(
        'feed:user_B',
        604800,
      );

      // ต้องจบด้วย exec เสมอ
      expect(mockRedisPipeline.exec).toHaveBeenCalled();
    });

    it('ควรหยุดทำงานทันที (Return early) ถ้าไม่มีใครติดตามเลย', async () => {
      (registry.decode as jest.Mock).mockResolvedValue(mockPostPayload);

      // คนนี้ไม่มี Follower
      mockKafkaClient.send.mockReturnValue(of([]));

      await service.handlePostCreated(mockBuffer);

      // ไม่ควรเรียก Redis เลย
      expect(mockRedisClient.pipeline).not.toHaveBeenCalled();
    });
  });

  describe('handleUnfollowed (ลบโพสต์ออกจาก Feed)', () => {
    it('ควรลบโพสต์เก่าๆ ทั้งหมดของคนที่เลิกติดตามออกจาก Redis', async () => {
      const mockUnfollowPayload = {
        followerId: 'user-A',
        followingId: 'user-B',
      };
      (registry.decode as jest.Mock).mockResolvedValue(mockUnfollowPayload);

      // จำลองว่า User B เคยโพสต์อะไรไว้บ้าง มาจาก post-service
      mockKafkaClient.send.mockReturnValue(of({ ids: ['post-b1', 'post-b2'] }));

      await service.handleUnfollowed(Buffer.from('fake'));

      expect(mockRedisClient.pipeline).toHaveBeenCalled();

      expect(mockKafkaClient.send).toHaveBeenCalledWith(
        'get_post_ids_for_feed_cleanup',
        { userId: 'user-B' },
      );

      expect(mockRedisPipeline.zrem).toHaveBeenCalledWith(
        'feed:user-A',
        'post-b1',
        'post-b2',
      );
      expect(mockRedisPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('getUserFeed', () => {
    it('ควรดึง Post IDs จำนวนสูงสุด 20 อันดับจาก Redis', async () => {
      const result = await service.getUserFeed('user-A');

      expect(mockRedisClient.zrevrange).toHaveBeenCalledWith(
        'feed:user-A',
        0,
        19,
      );
      // ถ้าเรียก zrevrange จะ return 'post-1', 'post-2'
      expect(result).toEqual(['post-1', 'post-2']);
    });
  });
});
