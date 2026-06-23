import { Test, TestingModule } from '@nestjs/testing';
import { LikeAggregatorService } from './like-aggregator.service';
import { getModelToken } from '@nestjs/mongoose';

describe('LikeAggregatorService', () => {
  let service: LikeAggregatorService;

  let postModelMock: { bulkWrite: jest.Mock };
  let redisMock: { rpop: jest.Mock };

  beforeEach(async () => {
    // mock mongoose
    postModelMock = { bulkWrite: jest.fn().mockReturnValue({ ok: 1 }) };

    // mock redis set defualt return null ทุกครั้งที่เรียก rpop นอกจากจะใส่ค่าเอง
    redisMock = { rpop: jest.fn().mockReturnValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LikeAggregatorService,
        {
          provide: getModelToken('Post'),
          useValue: postModelMock,
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: redisMock,
        },
      ],
    }).compile();

    service = module.get<LikeAggregatorService>(LikeAggregatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // test ผลลัพธ์
  describe('Happy Path', () => {
    it('should aggregate likes from multiple users and update MongoDB', async () => {
      // เตรียม queue ก่อน
      redisMock.rpop
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 1 }))
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 1 }))
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_002', delta: 1 }))
        .mockResolvedValue(null); // queue หมด

      // start
      await service.flushLikesToDatabase();

      expect(postModelMock.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            updateOne: {
              filter: { _id: 'post_001' },
              update: { $inc: { likes: 2 } }, // 1 + 1 = 2
            },
          },
          {
            updateOne: {
              filter: { _id: 'post_002' },
              update: { $inc: { likes: 1 } },
            },
          },
        ]),
        { ordered: false },
      );
    });

    it('should update only one post when all likes are for the same post', async () => {
      redisMock.rpop
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 1 }))
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 1 }))
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 1 }))
        .mockResolvedValue(null);

      await service.flushLikesToDatabase();

      expect(postModelMock.bulkWrite).toHaveBeenCalledTimes(1);
      expect(postModelMock.bulkWrite).toHaveBeenCalledWith(
        [
          {
            updateOne: {
              filter: { _id: 'post_001' },
              update: { $inc: { likes: 3 } },
            },
          },
        ],
        {
          ordered: false,
        },
      );
    });
  });

  describe('Edge Cases', () => {
    it('should do nothing when queue is empty', async () => {
      redisMock.rpop.mockResolvedValue(null);

      await service.flushLikesToDatabase();

      expect(postModelMock.bulkWrite).not.toHaveBeenCalled();
    });

    // like เเล้ว unlike
    it('should cancel out likes when same post is liked then unliked', async () => {
      redisMock.rpop
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 1 }))
        .mockResolvedValueOnce(
          JSON.stringify({ postId: 'post_001', delta: -1 }),
        )
        .mockResolvedValue(null);

      await service.flushLikesToDatabase();
      expect(postModelMock.bulkWrite).toHaveBeenCalledWith(
        [
          {
            updateOne: {
              filter: { _id: 'post_001' },
              update: { $inc: { likes: 0 } },
            },
          },
        ],
        {
          ordered: false,
        },
      );
    });

    // unlike
    it('should handle unlike correctly (negative delta)', async () => {
      // Arrange: unlike → delta = -1
      redisMock.rpop
        .mockResolvedValueOnce(
          JSON.stringify({ postId: 'post_001', delta: -1 }),
        )
        .mockResolvedValue(null);

      // Act
      await service.flushLikesToDatabase();

      // Assert: $inc ด้วยค่าลบ = ลด like count
      expect(postModelMock.bulkWrite).toHaveBeenCalledWith(
        [
          {
            updateOne: {
              filter: { _id: 'post_001' },
              update: { $inc: { likes: -1 } },
            },
          },
        ],
        { ordered: false },
      );
    });
  });

  describe('Corrupted Data', () => {
    it('should skip corrupted items and still process valid ones', async () => {
      redisMock.rpop
        .mockResolvedValueOnce('this is not valid json !!!') // เสีย
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 1 })) // ดี
        .mockResolvedValue(null);

      // ต้องไม่ crash
      await expect(service.flushLikesToDatabase()).resolves.not.toThrow();

      // ข้อมูล ดี ยัง update ได้
      expect(postModelMock.bulkWrite).toHaveBeenCalledWith(
        [
          {
            updateOne: {
              filter: { _id: 'post_001' },
              update: { $inc: { likes: 1 } },
            },
          },
        ],
        { ordered: false },
      );
    });

    it('should not call bulkWrite when all items are corrupted', async () => {
      // ทุก item เสียหมด
      redisMock.rpop
        .mockResolvedValueOnce('invalid json 1')
        .mockResolvedValueOnce('invalid json 2')
        .mockResolvedValue(null);

      await service.flushLikesToDatabase();

      // ไม่ควรยิง MongoDB
      expect(postModelMock.bulkWrite).not.toHaveBeenCalled();
    });
  });

  // test คําสั่งภายใน
  describe('(private) drainQueue behavior', () => {
    it('should call rpop with correct queue key', async () => {
      redisMock.rpop.mockResolvedValue(null);

      await service.flushLikesToDatabase();

      expect(redisMock.rpop).toHaveBeenCalledWith('likes:batch:queue');
    });

    it('should drain all items until queue returns null', async () => {
      redisMock.rpop
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 1 }))
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_002', delta: 1 }))
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_003', delta: 1 }))
        .mockResolvedValue(null);

      await service.flushLikesToDatabase();

      expect(redisMock.rpop).toHaveBeenCalledTimes(4);
    });
  });

  describe('(private) bulkUpdateLikes behavior', () => {
    it('should use $inc operator not $set', async () => {
      redisMock.rpop
        .mockResolvedValueOnce(JSON.stringify({ postId: 'post_001', delta: 5 }))
        .mockResolvedValue(null);

      await service.flushLikesToDatabase();

      // ป้องกัน ESLint
      // updateOne ใน bulkWrite mongo เป็น array
      type ExpectedBulkOp = {
        updateOne: {
          update: Record<string, unknown>; // unknow ในกรณีนี้ใช้ toHaveProperty ถูกเช็คตรงๆ ที่ runtime ไม่ต้องเช็คก่อนใช้
        };
      };

      const calls = postModelMock.bulkWrite.mock.calls as [
        ExpectedBulkOp[],
        unknown, // arg 2 = { ordered: false } ใช้ unknow ได้โดยไม่ต้องเช็คเพราะเราไม่ได้สนใจค่านี้
      ][];

      const bulkOps = calls[0][0];
      expect(bulkOps[0].updateOne.update).toHaveProperty('$inc');
      expect(bulkOps[0].updateOne.update).not.toHaveProperty('$set');
    });
  });
});
