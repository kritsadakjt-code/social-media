import mongoose, { Model } from 'mongoose';
import { PostService } from '../post-service.service';
import { Post } from '../post.schema';
import { Test, TestingModule } from '@nestjs/testing';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import {
  MongoDBContainer,
  StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Kafka } from 'kafkajs';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { PostServiceModule } from '../post-service.module';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import {
  createSpyConsumer,
  sleep,
  waitForCondition,
} from './kafka-test.helpers';

interface PostCreatedPayload {
  postId: string;
  authorId: string;
  content: string;
  timestamp: string;
  imageUrl: string | null;
}

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

  beforeAll(async () => {
    [kafkaContainer, mongoContainer] = await Promise.all([
      new KafkaContainer('confluentinc/cp-kafka:8.2.0')
        .withKraft()
        .withExposedPorts(9093)
        .start(),
      new MongoDBContainer('mongo:6.0').start(),
    ]);

    // ถ้ามี library ช่วย
    // schemaRegistryContainer = await new SchemaRegistryContainer()
    //   .withKafka(kafkaContainer)
    //   .start();

    // สร้าง Schema Registry เองสําหรับ test in docker เเละรอ kafka
    schemaRegistryContainer = await new GenericContainer(
      'confluentinc/cp-schema-registry:8.2.0',
    )
      .withEnvironment({
        SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9093)}`,
        SCHEMA_REGISTRY_HOST_NAME: 'schema-registry',
        SCHEMA_REGISTRY_LISTENERS: 'http://0.0.0.0:8081',
      })
      .withExposedPorts(8081)
      .withWaitStrategy(
        Wait.forHttp('/subjects', 8081)
          .forStatusCode(200)
          .withStartupTimeout(60000),
      )
      .start();

    // สร้าง kafka client สําหรับส่ง/รับ ใน test
    kafka = new Kafka({
      brokers: [
        `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9093)}`,
      ],
      clientId: 'test-client',
    });

    schemaRegistryUrl = `http://${schemaRegistryContainer.getHost()}:${schemaRegistryContainer.getMappedPort(8081)}`;
    // registry client สําหรับ encode/decode avro
    registry = new SchemaRegistry({ host: schemaRegistryUrl });

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

  // ต่อไปที่ container โดยตรงเลย
  function configMap(key: string): string | number | undefined {
    const configs: Record<string, string | number> = {
      POST_MONGO_URI: mongoContainer.getConnectionString(),

      KAFKA_BROKER: `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9093)}`,

      SCHEMA_REGISTRY_URL: schemaRegistryUrl,

      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,

      // ค่าอื่นๆ ที่ PostServiceModule ต้องการ
      RABBITMQ_URL: 'amqp://localhost:5672',
    };

    return configs[key];
  }

  afterEach(async () => {
    await postModel.deleteMany({});
  });

  afterAll(async () => {
    await module.close();
    await mongoose.disconnect();
    await Promise.all([
      kafkaContainer.stop(),
      schemaRegistryContainer.stop(),
      mongoContainer.stop(),
    ]);
  });

  describe('Producer', () => {
    it('should emit post_created event when createPost is called', async () => {
      // ดักฟัง message
      const spy = await createSpyConsumer(
        kafka,
        'post_events',
        'test-spy-created',
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
      const msg = spy.messages[0];
      expect(msg.message.headers?.['event_type']?.toString()).toBe(
        'post_created',
      );

      // เพื่อเช็คว่า key นี้ถูกส่งผ่าน kafka มั้ย, key=postId ถูกใช้เพื่อ กําหนดว่าอยู่ partition ไหน
      expect(msg.message.key?.toString()).toBe(post._id.toString());

      // chk value
      const decoded = (await registry.decode(
        msg.message.value as Buffer,
      )) as PostCreatedPayload;
      expect(decoded.postId).toBe(post._id.toString());
      expect(decoded.authorId).toBe('user_001');
      expect(decoded.content).toBe('Hello Kafka!');
      expect(decoded.timestamp).toBeDefined();

      await spy.stop();
    });
  });
});
