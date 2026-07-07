import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import { createRequire } from 'module';
import { registerAndLogin } from './helpers/auth.helper';
import { randomUUID } from 'crypto'; // esm เเละ cjs รู้จัก js = esm, node = cjs
import request from 'supertest';
import {
  Infrastructure,
  startInfrastructure,
  stopInfrastructure,
} from './setup/infrastructure.setup';
import {
  createConfigMap,
  Services,
  startServices,
  stopServices,
} from './setup/services.setup';

const testRequire = createRequire(__filename);

interface PostItem {
  id: string;
  userId: string;
  username: string;
  content: string;
  likes: number;
  createdAt: string;
}

interface GetPostsResponse {
  posts: PostItem[];
}

jest.setTimeout(120000);
describe('Posts E2E', () => {
  let app: INestApplication;
  let module: TestingModule;
  let server: Server;

  let infra: Infrastructure;
  let services: Services;

  let token: string;
  let postId: string; // postId สำหรับ like/comment test

  beforeAll(async () => {
    infra = await startInfrastructure();
    services = await startServices(infra);
    const configMap = createConfigMap(infra);

    // โหลด module หลัง set .env จะได้ค่าล่าสุดมา
    const { AppModule } = testRequire(
      '../src/app.module',
    ) as typeof import('../src/app.module');

    module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => configMap(key),
        getOrThrow: (key: string) => {
          const value = configMap(key);
          if (value === undefined) {
            throw new Error(`Config key "${key}" not found`);
          }
          return value;
        },
      })
      .compile();

    app = module.createNestApplication();
    // ถ้าไม่ใส่ DTO validation จะไม่ทำงาน เช่น required field ไม่ถูก validate
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    // start server
    await app.init();

    // cast ครั้งเดียว ใช้ซ้ำทุก test กัน eslint unsafe
    server = app.getHttpServer() as Server;

    // register + login ครั้งเดียว ใช้ token ซ้ำได้ทุก test
    token = await registerAndLogin(
      app,
      `e2e_user_${randomUUID()}`, // unique username กัน duplicate
      'password123',
    );

    // สร้าง post ส่งผ่าน rabbitMQ
    await request(server)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'E2E test post' })
      .expect(201);

    // รอ RabbitMQ → post-service → MongoDB บันทึก post
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));

    const postsRes = await request(server)
      .get('/posts/all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // console.log('Post Respone', postsRes.body);
    const postsBody = postsRes.body as GetPostsResponse;
    postId = postsBody.posts[0].id;
  });

  afterAll(async () => {
    // ปิด app หยุดรับ request + หยุดต่อ db
    await app?.close().catch((err: Error) => {
      console.warn('⚠️ app close failed:', err.message);
    });

    await stopServices(services);
    await stopInfrastructure(infra);
  });

  // GET /posts/all
  describe('GET /posts/all', () => {
    it('should return 401 when no token provided', async () => {
      await request(server).get('/posts/all').expect(401);
    });

    it('should return 200 and a list of posts', async () => {
      const res = await request(server)
        .get('/posts/all')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const postsBody = res.body as GetPostsResponse;
      expect(postsBody.posts.length).toBeGreaterThan(0);
      expect(postsBody.posts[0].id).toBe(postId);
      expect(postsBody.posts[0].content).toBe('E2E test post');
    });
  });

  describe('POST /posts/:id/like', () => {
    it('should allow user to like the post', async () => {
      await request(server)
        .post(`/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
    });
  });

  describe('POST /posts/:id/comments', () => {
    it('should allow user to comment on the post', async () => {
      await request(server)
        .post(`/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'This is a test comment from E2E!' })
        .expect(201);
    });
  });
});
