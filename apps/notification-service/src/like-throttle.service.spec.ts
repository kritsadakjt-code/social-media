import { Test, TestingModule } from '@nestjs/testing';
import { LikeThrottleService } from './like-throttle.service';
import Redis from 'ioredis';

describe('LikeThrottleService', () => {
  let service: LikeThrottleService;

  // mock redis
  // บอก ts ให้รู้ว่า redis return ค่าอะไร เพื่อไม่ให้เเจ้งเตือน type
  let redisMock: jest.Mocked<
    Pick<Redis, 'set' | 'sadd' | 'expire' | 'scard' | 'del'>
  >;

  beforeEach(async () => {
    // jest.fn() = function เปล่าที่จำได้ว่าถูกเรียกกี่ครั้ง ด้วย argument อะไร
    redisMock = {
      set: jest.fn(),
      sadd: jest.fn(),
      expire: jest.fn(),
      scard: jest.fn(),
      del: jest.fn(),
    };

    // สร้าง NestJS module จำลอง
    // แทน Redis จริงด้วย redisMock
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LikeThrottleService,
        {
          provide: 'REDIS_CLIENT',
          useValue: redisMock,
        },
      ],
    }).compile();

    // ดึง service LikeThrottleService ออกมาจาก module เพื่อดึง method ออกมา test ได้
    service = module.get<LikeThrottleService>(LikeThrottleService);
  });

  describe('shouldNotify (Service Method)', () => {
    // กรณียังไม่มี key
    it('should return true when Redis returns OK (first notification)', async () => {
      // จําลอง redis ตอบ OK กรณี key ใหม่ยังไม่มีใน cache
      redisMock.set.mockResolvedValue('OK');

      const result = await service.shouldNotify('post_001', 'owner_001');
      expect(result).toBe(true);
    });

    // กรณีมี key เเล้ว
    it('should return false when Redis returns null (already throttled)', async () => {
      redisMock.set.mockResolvedValue(null);

      const result = await service.shouldNotify('post_001', 'owner_001');

      expect(result).toBe(false);
    });

    // กรณีใส่ set ค่าใน redis ให้ครบ
    it('should call Redis SET with correct options', async () => {
      redisMock.set.mockResolvedValue('OK');

      await service.shouldNotify('post_001', 'owner_001');

      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('post_001'), // ต้องมีคําว่า post_001 ใน key
        '1',
        'EX',
        30,
        'NX',
      );
    });

    it('should NOT notify twice for the same post within 30 seconds', async () => {
      redisMock.set
        .mockResolvedValueOnce('OK') // กดไลก์ครั้งแรก
        .mockResolvedValueOnce(null); // กดไลก์ครั้งที่สองภายใน 30 วิ

      const first = await service.shouldNotify('post_001', 'owner_001');
      const second = await service.shouldNotify('post_001', 'owner_001');

      expect(first).toBe(true);
      expect(second).toBe(false);
    });

    it('should handle Redis connection failure gracefully', async () => {
      redisMock.set.mockRejectedValue(new Error('Redis connection lost'));
      await expect(
        service.shouldNotify('post_001', 'owner_001'),
      ).rejects.toThrow('Redis connection lost');
    });

    // Private Method อยู่ใน shouldNotify

    // ตรวจการสร้าง key
    it('(private) should build throttle key with correct format', async () => {
      redisMock.set.mockResolvedValue('OK');

      await service.shouldNotify('post_001', 'owner_001');

      // mock.calls[0] = ['noti:throttle:like:owner_001:post_001', '1', 'EX', 30, 'NX'] (ครั้งที่ 1)
      // mock.calls[0][0] = 'noti:throttle:like:owner_001:post_001' (argument แรก = key)
      const actualKey = redisMock.set.mock.calls[0][0]; // argument แรกที่ส่งให้ set()
      expect(actualKey).toBe('noti:throttle:like:owner_001:post_001');
    });

    // เช็คคนเดียวโพสต์ต่างกัน
    it('(private) throttle key for different posts should be different', async () => {
      redisMock.set.mockResolvedValue('OK');

      await service.shouldNotify('post_001', 'owner_001');
      await service.shouldNotify('post_002', 'owner_001');

      const key1 = redisMock.set.mock.calls[0][0];
      const key2 = redisMock.set.mock.calls[1][0];
      expect(key1).not.toBe(key2);
    });
  });

  describe('trackPendingLike (Service Method)', () => {
    it('should add userId to Redis Set', async () => {
      // add success
      redisMock.sadd.mockResolvedValue(1);
      // set time success
      redisMock.expire.mockResolvedValue(1);

      await service.trackPendingLike('post_001', 'owner_001', 'user_999');

      // เช็คว่าคนกดไลก์กับ post ถูกมั้ย
      expect(redisMock.sadd).toHaveBeenCalledWith(
        expect.stringContaining('post_001'),
        'user_999',
      );
    });

    it('should set expiry after adding userId', async () => {
      redisMock.sadd.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      await service.trackPendingLike('post_001', 'owner_001', 'user_999');

      // expire ต้องถูกเรียกเสมอ ไม่งั้น key จะไม่มีวันหมดอายุ
      expect(redisMock.expire).toHaveBeenCalledWith(
        expect.stringContaining('post_001'),
        30, // PENDING_TTL
      );
    });

    // Private Method ของ trackPendingLike
    it('(private) should build pending key with correct format', async () => {
      redisMock.sadd.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      await service.trackPendingLike('post_001', 'owner_001', 'user_999');
      // check key format
      const actualKey = redisMock.sadd.mock.calls[0][0];
      expect(actualKey).toBe('noti:pending:like:owner_001:post_001');
    });

    it('(private) throttle key and pending key should be different', async () => {
      redisMock.set.mockResolvedValue('OK');
      redisMock.sadd.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      await service.shouldNotify('post_001', 'owner_001');
      await service.trackPendingLike('post_001', 'owner_001', 'user_999');

      const throttleKey = redisMock.set.mock.calls[0][0];
      const pendingKey = redisMock.sadd.mock.calls[0][0];

      expect(throttleKey).not.toBe(pendingKey);
      expect(throttleKey).toContain('throttle');
      expect(pendingKey).toContain('pending');
    });
  });

  describe('getPendingCount', () => {
    it('should return 0 when no likes are pending', async () => {
      redisMock.scard.mockResolvedValue(0);

      const count = await service.getPendingCount('post_001', 'owner_001');

      expect(count).toBe(0);
      expect(redisMock.scard).toHaveBeenCalledWith(
        'noti:pending:like:owner_001:post_001',
      );
    });

    it('should return correct count when likes exist', async () => {
      redisMock.scard.mockResolvedValue(5);

      const count = await service.getPendingCount('post_001', 'owner_001');

      expect(count).toBe(5);
    });
  });

  // Service Method clearPending
  describe('clearPending Service Method)', () => {
    // ลบได้ปกติ
    it('should call Redis DEL with pending key', async () => {
      redisMock.del.mockResolvedValue(1);

      await service.clearPending('post_001', 'owner_001');

      expect(redisMock.del).toHaveBeenCalledWith(
        'noti:pending:like:owner_001:post_001',
      );
    });

    it('should only call DEL once per clear', async () => {
      redisMock.del.mockResolvedValue(1);

      await service.clearPending('post_001', 'owner_001');

      // ไม่ควรเรียก del หลายครั้งต่อการ clear ครั้งเดียว
      expect(redisMock.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('full flow ', () => {
    it('should track → notify → count → clear on first like', async () => {
      redisMock.sadd.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);
      redisMock.set.mockResolvedValue('OK'); // ยังไม่ throttle
      redisMock.scard.mockResolvedValue(1); // มี 1 คนกดไลก์
      redisMock.del.mockResolvedValue(1);

      await service.trackPendingLike('post_001', 'owner_001', 'user_A');
      const notify = await service.shouldNotify('post_001', 'owner_001');
      const count = await service.getPendingCount('post_001', 'owner_001');
      await service.clearPending('post_001', 'owner_001');

      expect(notify).toBe(true); // ควร notify
      expect(count).toBe(1); // มี 1 คน
      expect(redisMock.del).toHaveBeenCalledTimes(1); // clear แล้ว
    });

    it('should track but NOT notify on second like within throttle window', async () => {
      redisMock.sadd.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);
      redisMock.set
        .mockResolvedValueOnce('OK') // like แรก → notify
        .mockResolvedValueOnce(null); // like สอง → throttled

      // like ครั้งแรก
      await service.trackPendingLike('post_001', 'owner_001', 'user_A');
      const firstNotify = await service.shouldNotify('post_001', 'owner_001');

      // ครั้งสองภายใน 30 วิ
      await service.trackPendingLike('post_001', 'owner_001', 'user_B');
      const secondNotify = await service.shouldNotify('post_001', 'owner_001');

      expect(firstNotify).toBe(true); // ครั้งแรกส่ง notification
      expect(secondNotify).toBe(false); // ครั้งที่สอง throttle ไม่ส่ง
    });
  });
});
