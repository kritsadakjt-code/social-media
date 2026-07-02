import mongoose, { Model } from 'mongoose';
import type { PostService } from '../post-service.service';
import { Post } from '../post.schema';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GenericContainer,
  Network,
  StartedNetwork,
  StartedTestContainer,
  Wait,
} from 'testcontainers';
import {
  MongoDBContainer,
  StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Kafka } from 'kafkajs';
import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import {
  createSpyConsumer,
  ensureTopic,
  sleep,
  waitForCondition,
} from './kafka-test.helpers';
import { createRequire } from 'node:module';
import { randomUUID } from 'crypto';
// สําหรับ ใน it ไม่ใช้ barrel export จาก @app/shared เพราะ registry .env จะถูกโหลดเข้ามาก่อนทําให้ได้ค่า host port เดิม
import { PostCreatedSchema } from '@app/shared/kafka/schemas/posts/created-post.schema';
import { MediaProcessedSchema } from '@app/shared/kafka/schemas/media/media-processed.schema';
import { PostCommentedPayload } from '@app/shared/interfaces-events/posts/post-commented.interface';

const testRequire = createRequire(__filename);

interface PostCreatedPayload {
  postId: string;
  authorId: string;
  content: string;
  timestamp: string;
  imageUrl: string | null;
}

// ควรเเยกการ set up ต่างๆ กับการเทสออกจากกัน จะได้อ่านง่าย focus ไปที่ test case
jest.setTimeout(60000);
describe('PostService Kafka Integration', () => {
  let service: PostService;
  let postModel: Model<Post>;
  let module: TestingModule;

  let kafkaContainer: StartedKafkaContainer;
  let schemaRegistryContainer: StartedTestContainer;
  let mongoContainer: StartedMongoDBContainer;

  // client สําหรับ test ส่ง/รับ message
  let kafka: Kafka;
  let registry: SchemaRegistry;
  let schemaRegistryUrl: string;

  let network: StartedNetwork;
  let kafkaBroker: string;
  let mongoUri: string;

  beforeAll(async () => {
    network = await new Network().start();

    console.time('mongo');
    mongoContainer = await new MongoDBContainer('mongo:6.0').start();
    // container random host port ของ mongo เพื่อให้ host port ข้างนอกต่อเข้ามาโดย port ไม่ซํ้ากัน
    mongoUri = `mongodb://127.0.0.1:${mongoContainer.getMappedPort(
      27017,
    )}/post-service-test?directConnection=true`; // ต่อตรงเลยเพราะเป็น single node ไม่ได้ทํา replica set
    console.timeEnd('mongo');

    console.time('kafka');
    kafkaContainer = await new KafkaContainer('confluentinc/cp-kafka:8.2.0')
      .withKraft()
      .withNetwork(network)
      .withNetworkAliases('kafka')
      .withExposedPorts(9093) // สําหรับข้างนอกต่อเข้ามาใน container
      .start();
    console.timeEnd('kafka');

    // ถ้ามี library ช่วย
    // schemaRegistryContainer = await new SchemaRegistryContainer()
    //   .withKafka(kafkaContainer)
    //   .start();
    console.time('schema-registry');
    // สร้าง Schema Registry เองสําหรับ test in docker เเละรอ kafka
    schemaRegistryContainer = await new GenericContainer(
      'confluentinc/cp-schema-registry:8.2.0',
    )
      .withNetwork(network)
      .withEnvironment({
        SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: 'PLAINTEXT://kafka:9092',
        SCHEMA_REGISTRY_HOST_NAME: 'schema-registry',
        SCHEMA_REGISTRY_LISTENERS: 'http://0.0.0.0:8081',
      })
      .withExposedPorts(8081) // สําหรับ client ต่อเข้ามาจากข้างนอก
      .withWaitStrategy(
        Wait.forHttp('/subjects', 8081)
          .forStatusCode(200)
          .withStartupTimeout(60000), // เช็คความพร้อม 60 วิถ้าเกิน timeout
      )
      .start();
    console.timeEnd('schema-registry');
    kafkaBroker = `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9093)}`;
    // สร้าง kafka client สําหรับส่ง/รับ ใน test
    kafka = new Kafka({
      brokers: [kafkaBroker],
      clientId: 'test-client',
    });

    schemaRegistryUrl = `http://${schemaRegistryContainer.getHost()}:${schemaRegistryContainer.getMappedPort(8081)}`;
    // ให้ .env = url ใหม่สําหรับ test เพราะ code จริงมีการดึงค่าจาก .env มาใช้เพื่อต่อเข้า schema registry ใน container
    // *ถ้าเคยถูกโหลดตั้งเเต่ต้นเเล้วจะไม่โหลดอีก เช่น  schemaRegistryUrl ถูกโหลดจาก lib/share เเล้ว
    process.env.SCHEMA_REGISTRY_URL = schemaRegistryUrl;

    // โหลด module ตอน runtime เพราะจะได้ค่า .env ล่าสุดมา
    const { PostServiceModule } = testRequire(
      '../post-service.module',
    ) as typeof import('../post-service.module');

    const { PostService } = testRequire(
      '../post-service.service',
    ) as typeof import('../post-service.service');

    // registry client สําหรับ encode/decode avro
    registry = new SchemaRegistry({ host: schemaRegistryUrl });

    // ทุกเทสใช้ topic นี้เหมือนกัน
    await ensureTopic(kafka, 'post_events');

    module = await Test.createTestingModule({
      imports: [
        // โหลด module จริงมาทั้งหมด เพราะมี หลาย dependency ที่ต้องใช้ MongoDB, Kafka, PostService
        PostServiceModule,
      ],
    })
      // Override ConfigService
      // เพื่อให้เข้า containers เลยไม่ต้องใช้ .env
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => configMap(key),
        getOrThrow: (key: string) => {
          const value = configMap(key);
          if (!value) throw new Error(`Config key "${key}" not found`);
          return value;
        },
      })
      .compile();

    service = module.get<PostService>(PostService);
    postModel = module.get<Model<Post>>(getModelToken(Post.name));

    // เพื่อให้ onModuleInit ทำงาน
    await module.init();
    // รอ kafka connect เสร็จ
    await sleep(2000);
  });

  // ต่อไปที่ container โดยตรงเลยไม่ต้องอ่านค่าจาก .env
  function configMap(key: string): string | number | undefined {
    const configs: Record<string, string | number> = {
      POST_MONGO_URI: mongoUri,

      KAFKA_BROKER: kafkaBroker,

      SCHEMA_REGISTRY_URL: schemaRegistryUrl,

      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,

      // ค่าอื่นๆ ที่ PostServiceModule ต้องการ
      RABBITMQ_URL: 'amqp://localhost:5672',
    };

    return configs[key];
  }

  afterEach(async () => {
    if (postModel) {
      await postModel.deleteMany({});
    }
  });

  afterAll(async () => {
    if (module) {
      await module.close().catch((err) => {
        console.warn('⚠️ Warning: Failed to close NestJS Module:', err);
      });
    }
    // .catch ถ้าระหว่างขั้นตอนการปิดของ mongo เกิด err เเจ้ง err ,ถ้าไม่มี .catch เเล้วระหว่างปิดพัง จะทําให้การ test fail ทั้งๆ ที่เทสผ่านเเล้ว
    await mongoose.disconnect().catch((err) => {
      console.warn('⚠️ Warning: Failed to disconnect MongoDB:', err);
    });

    // ถ้ามีบางตัว err ก็สั่งให้ทํางานจนเสร็จไม่ว่าจะ success/err เพราะต้องการ clean up ข้อมูลครบทุกตัว
    const results = await Promise.allSettled([
      kafkaContainer?.stop(),
      schemaRegistryContainer?.stop(),
      mongoContainer?.stop(),
      // network?.stop(),
    ]);
    // ถ้ามี err
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        // ทําเเบบนี้เพราะ ดึงชื่อตรงๆ ออกมาไม่ได้เพราะ allSettled return ออกมาเป็น array
        const resourceName = [
          'kafkaContainer',
          'schemaRegistryContainer',
          'mongoContainer',
          // 'network',
        ][index];
        console.warn(
          `⚠️ Warning: Failed to stop ${resourceName} cleanly:`,
          result.reason,
        );
      }
    });

    await network?.stop().catch((error) => {
      console.warn('⚠️ Warning: Failed to stop network cleanly:', error);
    });
  });

  describe('Producer', () => {
    it('should emit post_created event when createPost is called', async () => {
      // ดักฟัง message
      const spy = await createSpyConsumer(
        kafka,
        'post_events',
        `test-group-${randomUUID()}`,
      );

      // สร้าง post
      const post = await service.createPost({
        userId: 'user_001',
        username: 'testuser',
        content: 'Hello Kafka!',
      });

      // เช็ค consumer ได้รับ message จาก kafka หรือยัง
      await waitForCondition(() => Promise.resolve(spy.messages.length > 0));

      // chk topic
      const msg = spy.messages.find(
        (m) => m.message.headers?.['event_type']?.toString() === 'post_created',
      );
      expect(msg).toBeDefined();

      // เพื่อเช็คว่า key นี้ถูกส่งผ่าน kafka มั้ย, key=postId ถูกใช้เพื่อ กําหนดว่าอยู่ partition ไหน
      expect(msg!.message.key?.toString()).toBe(post._id.toString());

      // chk value
      const decoded = (await registry.decode(
        msg!.message.value as Buffer,
      )) as PostCreatedPayload;
      expect(decoded.postId).toBe(post._id.toString());
      expect(decoded.authorId).toBe('user_001');
      expect(decoded.content).toBe('Hello Kafka!');
      expect(decoded.timestamp).toBeDefined();

      await spy.stop();
    });

    it('should throw when encoding payload with wrong field type', async () => {
      const schemaId = (
        await registry.register({
          type: SchemaType.AVRO,
          schema: JSON.stringify(PostCreatedSchema),
        })
      ).id;

      const invalidPayload: Record<string, unknown> = {
        postId: '123',
        // ขาด authorId ผิด Schema
        content: 12345, // ต้องเป็น string แต่ส่ง number
        timestamp: new Date().toISOString(),
      };

      await expect(async () => {
        // encode ข้อมูลที่ผิด
        await registry.encode(schemaId, invalidPayload);
      }).rejects.toThrow();
    });

    it('should emit post_commented event when addComment is called', async () => {
      const spy = await createSpyConsumer(
        kafka,
        'post_events',
        `test-group-${randomUUID()}`,
      );

      const post = await service.createPost({
        userId: 'u1',
        username: 'user1',
        content: 'hello',
      });

      await service.addComment({
        postId: post._id.toString(),
        userId: 'u2',
        username: 'user2',
        content: 'Nice post!',
      });

      await waitForCondition(() => Promise.resolve(spy.messages.length > 1)); // > 1 เพราะมี post_created มาก่อน

      const commentMsg = spy.messages.find(
        (m) =>
          m.message.headers?.['event_type']?.toString() === 'post_commented',
      );
      expect(commentMsg).toBeDefined();

      const decoded = (await registry.decode(
        commentMsg!.message.value as Buffer,
      )) as PostCommentedPayload;
      expect(decoded.postId).toBe(post._id.toString());
      expect(decoded.commenterId).toBe('u2');
      expect(decoded.content).toBe('Nice post!');

      await spy.stop();
    });
  });

  describe('Consumer', () => {
    it('should update post mediaStatus to completed when handleMediaProcessed is called', async () => {
      // มาจาก media-service
      const schemaId = (
        await registry.register({
          type: SchemaType.AVRO,
          schema: JSON.stringify(MediaProcessedSchema),
        })
      ).id;

      const mockMediaId = 'media-12345';
      const post = await service.createPost({
        userId: 'u1',
        username: 'user1',
        content: 'Pic',
        mediaId: mockMediaId,
      });

      // จำลอง Payload ที่ส่งมาจาก Media Service
      const mockPayload = {
        mediaId: mockMediaId,
        userId: 'u1',
        purpose: 'post',
        originalUrl: '...',
        mediumUrl: 'https://aws.s3.com/medium.jpg',
        p720Url: 'https://aws.s3.com/720p.mp4',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      // media-service encode -> post-service
      const encodedBuffer = await registry.encode(schemaId, mockPayload);

      // post handler -> post service
      await service.handleMediaProcessed(encodedBuffer);

      const updatedPost = await postModel.findById(post._id);
      expect(updatedPost?.mediaStatus).toBe('completed');
      expect(updatedPost?.imageUrl).toBe('https://aws.s3.com/medium.jpg');
    });
  });
});
