import { LikeAggregatorService } from './like-aggregator.service';
import {
  MongoDBContainer,
  StartedMongoDBContainer,
} from '@testcontainers/mongodb';

import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import { Post, PostSchema } from './post.schema';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
// ครั้งเเรกรอ pull + start docker image
jest.setTimeout(120_000);
describe('LikeAggregatorService (Integration)', () => {
  let service: LikeAggregatorService;
  let postModel: Model<Post>;
  let redisClient: Redis;
  let module: TestingModule;

  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedRedisContainer;

  beforeAll(async () => {
    mongoContainer = await new MongoDBContainer('mongo:6.0').start();
    const mongoUri = mongoContainer.getConnectionString();

    redisContainer = await new RedisContainer('redis:7.0-alpine').start();
    redisClient = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getPort(),
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri, { directConnection: true }), // directConnection สําหรับ test node เดียว ไม่มี replica set
        MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
      ],
      providers: [
        LikeAggregatorService,
        {
          provide: 'REDIS_CLIENT',
          useValue: redisClient,
        },
      ],
    }).compile();
    service = module.get<LikeAggregatorService>(LikeAggregatorService);
    postModel = module.get<Model<Post>>(getModelToken(Post.name));
  });

  afterEach(async () => {
    await postModel.deleteMany({}); // ล้าง MongoDB
    await redisClient.flushall(); // ล้าง Redis
  });

  afterAll(async () => {
    await module.close();
    await mongoose.disconnect();
    await redisClient.quit();

    // stop containers
    await Promise.all([mongoContainer.stop(), redisContainer.stop()]);
  });

  describe('Happy Path', () => {
    it('should flush likes from real Redis queue to real MongoDB', async () => {
      // สร้าง post
      const post = await postModel.create({
        userId: 'user_001',
        username: 'testuser',
        content: 'Hello World',
        likes: 0,
      });

      // มีคนมากดไลก์
      await redisClient.lpush(
        'likes:batch:queue',
        JSON.stringify({ postId: post._id.toString(), delta: 1 }),
        JSON.stringify({ postId: post._id.toString(), delta: 1 }),
        JSON.stringify({ postId: post._id.toString(), delta: 1 }),
      );

      await service.flushLikesToDatabase();

      // chk ว่าถูกบันทึกลง db จริง
      const updatedPost = await postModel.findById(post._id);
      expect(updatedPost?.likes).toBe(3);

      // redis queue ต้องว่างหลัง flush
      const queueLength = await redisClient.llen('likes:batch:queue');
      expect(queueLength).toBe(0);
    });

    it('should update multiple posts from single Redis queue', async () => {
      // สร้าง 2 post โดยมีจํานวนไลก์
      const [post1, post2] = await Promise.all([
        postModel.create({
          userId: 'u1',
          username: 'user1',
          content: 'Post 1',
          likes: 10,
        }),
        postModel.create({
          userId: 'u2',
          username: 'user2',
          content: 'Post 2',
          likes: 5,
        }),
      ]);
      // มีคนกดไลก์
      await redisClient.lpush(
        'likes:batch:queue',
        JSON.stringify({ postId: post1._id.toString(), delta: 2 }),
        JSON.stringify({ postId: post2._id.toString(), delta: 3 }),
        JSON.stringify({ postId: post1._id.toString(), delta: 1 }),
      );

      await service.flushLikesToDatabase();

      const [updated1, updated2] = await Promise.all([
        postModel.findById(post1._id),
        postModel.findById(post2._id),
      ]);

      expect(updated1?.likes).toBe(13); // 10 + 3
      expect(updated2?.likes).toBe(8); // 5 + 3
    });
  });

  describe('Edge Cases', () => {
    it('should not touch MongoDB when Redis queue is empty', async () => {
      // สร้าง post แต่ไม่มีอะไรใน Redis
      const post = await postModel.create({
        userId: 'u1',
        username: 'user1',
        content: 'Post',
        likes: 7,
      });

      // ไม่ push อะไรเข้า Redis เลย

      await service.flushLikesToDatabase();

      const unchangedPost = await postModel.findById(post._id);
      expect(unchangedPost?.likes).toBe(7);
    });

    it('should handle unlike (negative delta) correctly', async () => {
      const post = await postModel.create({
        userId: 'u1',
        username: 'user1',
        content: 'Post',
        likes: 5,
      });

      await redisClient.lpush(
        'likes:batch:queue',
        JSON.stringify({ postId: post._id.toString(), delta: -1 }),
      );

      await service.flushLikesToDatabase();

      const updatedPost = await postModel.findById(post._id);
      expect(updatedPost?.likes).toBe(4); // 5 - 1
    });

    it('should cancel out like and unlike on same post', async () => {
      const post = await postModel.create({
        userId: 'u1',
        username: 'user1',
        content: 'Post',
        likes: 10,
      });

      // like แล้ว unlike delta = 0
      await redisClient.lpush(
        'likes:batch:queue',
        JSON.stringify({ postId: post._id.toString(), delta: 1 }),
        JSON.stringify({ postId: post._id.toString(), delta: -1 }),
      );

      await service.flushLikesToDatabase();

      // likes ไม่เปลี่ยน
      const updatedPost = await postModel.findById(post._id);
      expect(updatedPost?.likes).toBe(10);
    });
  });

  describe('Corrupted Data', () => {
    it('should skip bad data and process valid items from real Redis', async () => {
      const post = await postModel.create({
        userId: 'u1',
        username: 'user1',
        content: 'Post',
        likes: 0,
      });

      // push ข้อมูลเสียปนกับข้อมูลดีใน Redis จริง
      await redisClient.lpush(
        'likes:batch:queue',
        'NOT_VALID_JSON!!!', // เสีย
        JSON.stringify({ postId: post._id.toString(), delta: 1 }), // ดี
        '{"broken":', // เสีย
        JSON.stringify({ postId: post._id.toString(), delta: 1 }), // ดี
      );

      // ต้องไม่ crash
      await expect(service.flushLikesToDatabase()).resolves.not.toThrow();

      // จํานวนไลก์ยังนับถูก
      const updatedPost = await postModel.findById(post._id);
      expect(updatedPost?.likes).toBe(2);

      // Redis queue ต้องว่าง
      const remaining = await redisClient.llen('likes:batch:queue');
      expect(remaining).toBe(0);
    });
  });

  describe('Only Integration Test Can Verify', () => {
    it('should accumulate likes across multiple flush calls', async () => {
      // Unit Test ไม่สามารถพิสูจน์ข้อนี้ได้
      // เพราะ mock ไม่มี state จริง แต่ MongoDB จริงมี

      const post = await postModel.create({
        userId: 'u1',
        username: 'user1',
        content: 'Post',
        likes: 0,
      });

      // Flush ครั้งที่ 1
      await redisClient.lpush(
        'likes:batch:queue',
        JSON.stringify({ postId: post._id.toString(), delta: 1 }),
      );
      await service.flushLikesToDatabase();

      // Flush ครั้งที่ 2
      await redisClient.lpush(
        'likes:batch:queue',
        JSON.stringify({ postId: post._id.toString(), delta: 1 }),
      );
      await service.flushLikesToDatabase();

      // Flush ครั้งที่ 3
      await redisClient.lpush(
        'likes:batch:queue',
        JSON.stringify({ postId: post._id.toString(), delta: 1 }),
      );
      await service.flushLikesToDatabase();

      // likes ต้องสะสมจากทุก flush
      const updatedPost = await postModel.findById(post._id);
      expect(updatedPost?.likes).toBe(3);
    });

    it('should verify Redis queue is actually drained after flush', async () => {
      // Unit Test ไม่รู้ว่า Redis ถูก drain จริงมั้ย
      // เพราะ rpop เป็น mock ไม่มี state

      const post = await postModel.create({
        userId: 'u1',
        username: 'user1',
        content: 'Post',
        likes: 0,
      });

      const itemCount = 5;
      // สร้าง array obj
      const items = Array.from({ length: itemCount }, () =>
        JSON.stringify({ postId: post._id.toString(), delta: 1 }),
      );
      await redisClient.lpush('likes:batch:queue', ...items);

      // ตรวจว่ามีข้อมูลใน queue จริงก่อน flush
      const beforeFlush = await redisClient.llen('likes:batch:queue');
      expect(beforeFlush).toBe(itemCount);

      await service.flushLikesToDatabase();

      // queue ต้องว่างหลัง flush
      const afterFlush = await redisClient.llen('likes:batch:queue');
      expect(afterFlush).toBe(0);

      // MongoDB ได้รับ likes ครบ
      const updatedPost = await postModel.findById(post._id);
      expect(updatedPost?.likes).toBe(itemCount);
    });
  });
});
