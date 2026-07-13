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
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import { Kafka } from 'kafkajs';

export interface Infrastructure {
  network: StartedNetwork;
  mongoContainer: StartedMongoDBContainer;
  kafkaContainer: StartedKafkaContainer;
  schemaRegistryContainer: StartedTestContainer;
  redisContainer: StartedTestContainer;
  rabbitmqContainer: StartedRabbitMQContainer;
  mongoUri: string;
  kafkaBroker: string;
  schemaRegistryUrl: string;
  redisHost: string;
  redisPort: number;
  rabbitmqUrl: string;
}

export async function startInfrastructure(): Promise<Infrastructure> {
  const network = await new Network().start();

  const [mongoContainer, kafkaContainer, redisContainer, rabbitmqContainer] =
    await Promise.all([
      new MongoDBContainer('mongo:6.0').start(),
      new KafkaContainer('confluentinc/cp-kafka:8.2.0')
        .withKraft()
        .withNetwork(network)
        .withNetworkAliases('kafka')
        .withExposedPorts(9093)
        .start(),
      new GenericContainer('redis:7.0-alpine').withExposedPorts(6379).start(),
      new RabbitMQContainer('rabbitmq:3.11-management-alpine')
        .withNetwork(network)
        .start(),
    ]);

  const mongoUri = `mongodb://127.0.0.1:${mongoContainer.getMappedPort(27017)}/e2e-test?directConnection=true`;
  const kafkaBroker = `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9093)}`;
  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);
  const rabbitmqUrl = rabbitmqContainer.getAmqpUrl();

  // สร้าง reply topic ที่ gRPC/Kafka request-reply ต้องใช้
  const kafkaAdmin = new Kafka({
    clientId: 'e2e-admin',
    brokers: [kafkaBroker],
  }).admin();
  await kafkaAdmin.connect();
  await kafkaAdmin.createTopics({
    topics: [{ topic: 'get_user_feed.reply' }],
  });
  await kafkaAdmin.disconnect();

  const schemaRegistryContainer = await new GenericContainer(
    'confluentinc/cp-schema-registry:8.2.0',
  )
    .withNetwork(network)
    .withEnvironment({
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: 'PLAINTEXT://kafka:9092',
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

  const schemaRegistryUrl = `http://${schemaRegistryContainer.getHost()}:${schemaRegistryContainer.getMappedPort(8081)}`;
  process.env.SCHEMA_REGISTRY_URL = schemaRegistryUrl;

  return {
    network,
    mongoContainer,
    kafkaContainer,
    schemaRegistryContainer,
    redisContainer,
    rabbitmqContainer,
    mongoUri,
    kafkaBroker,
    schemaRegistryUrl,
    redisHost,
    redisPort,
    rabbitmqUrl,
  };
}

export async function stopInfrastructure(infra: Infrastructure): Promise<void> {
  const results = await Promise.allSettled([
    infra.kafkaContainer?.stop(),
    infra.schemaRegistryContainer?.stop(),
    infra.mongoContainer?.stop(),
    infra.redisContainer?.stop(),
    infra.rabbitmqContainer?.stop(),
  ]);

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const name = ['kafka', 'schemaRegistry', 'mongo', 'redis', 'rabbitMQ'][
        index
      ];
      console.warn(`⚠️ ${name} stop failed:`, result.reason);
    }
  });

  // ปิด network ทีหลังสุด กัน container ยังใช้ network อยู่ตอนปิด
  await infra.network?.stop().catch((err: Error) => {
    console.warn('⚠️ network stop failed:', err.message);
  });
}
