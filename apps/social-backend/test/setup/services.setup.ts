import {
  INestApplication,
  INestMicroservice,
  ValidationPipe,
} from '@nestjs/common';
import { createRequire } from 'module';
import { Infrastructure } from './infrastructure.setup';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

const testRequire = createRequire(__filename);

export interface Services {
  userApp: INestMicroservice;
  postApp: INestApplication;
}
// สําหรับต่อ container เเต่ละอันไม่ต้องอ่านค่าจาก .env
export function createConfigMap(infra: Infrastructure) {
  return (key: string): string | number | undefined => {
    const configs: Record<string, string | number> = {
      POST_MONGO_URI: infra.mongoUri,
      USER_MONGO_URI: infra.mongoUri,
      USER_SERVICE_HOST: 'localhost',
      USER_SERVICE_PORT: 3001,
      POST_SERVICE_HOST: 'localhost',
      POST_SERVICE_PORT: 3002,
      RABBITMQ_URL: infra.rabbitmqUrl,
      KAFKA_BROKER: infra.kafkaBroker,
      REDIS_HOST: infra.redisHost,
      REDIS_PORT: infra.redisPort,
      SCHEMA_REGISTRY_URL: infra.schemaRegistryUrl,
      JWT_SECRET: 'e2e-test-secret',
    };
    return configs[key];
  };
}

export async function startServices(infra: Infrastructure): Promise<Services> {
  const configMap = createConfigMap(infra);
  const configOverride = { get: configMap, getOrThrow: configMap };

  // start user-service
  const { UserServiceModule } = testRequire(
    '../../../user-service/src/user-service.module',
  ) as typeof import('../../../user-service/src/user-service.module');

  const userModule = await Test.createTestingModule({
    imports: [UserServiceModule],
  })
    .overrideProvider(ConfigService)
    .useValue(configOverride)
    .compile();

  const userApp = userModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'user',
      protoPath: join(
        __dirname,
        '../../../../libs/shared/src/proto/user.proto',
      ),
      url: '0.0.0.0:3001',
    },
  });

  userApp.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await userApp.listen();

  // start post-service
  const { PostServiceModule } = testRequire(
    '../../../post-service/src/post-service.module',
  ) as typeof import('../../../post-service/src/post-service.module');

  const postModule = await Test.createTestingModule({
    imports: [PostServiceModule],
  })
    .overrideProvider(ConfigService)
    .useValue({ get: configMap, getOrThrow: configMap })
    .compile();

  const postApp = postModule.createNestApplication();
  postApp.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'post',
      protoPath: join(
        __dirname,
        '../../../../libs/shared/src/proto/post.proto',
      ),
      url: '0.0.0.0:3002',
    },
  });
  postApp.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [infra.rabbitmqUrl],
      queue: 'post_queue',
      queueOptions: {
        durable: false,
      },
    },
  });
  postApp.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await postApp.startAllMicroservices();
  await postApp.init();

  return { userApp, postApp };
}

export async function stopServices(services: Services): Promise<void> {
  await services.userApp?.close().catch((err: Error) => {
    console.warn('⚠️ User Service close failed:', err.message);
  });
  await services.postApp?.close().catch((err: Error) => {
    console.warn('⚠️ Post Service close failed:', err.message);
  });
}
