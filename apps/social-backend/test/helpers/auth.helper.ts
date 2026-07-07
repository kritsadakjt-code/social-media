import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Server } from 'http';
interface LoginResponse {
  accessToken: string;
}
// reuse ได้ทุก e2e test ที่ต้องการ JWT
export async function registerAndLogin(
  app: INestApplication,
  username: string,
  password: string,
): Promise<string> {
  const server = app.getHttpServer() as Server;
  // register
  await request(server)
    .post('/auth/register')
    .send({ username, email: `${username}@example.com`, password }) // ส่ง email ด้วยเพราะ ของจริง required อีเมล
    .expect(201);

  // login แล้วเอา token กลับมา
  const loginRes = await request(server)
    .post('/auth/login')
    .send({ usernameOrEmail: username, password })
    .expect(200);

  // console.log('👀 Login Response:', loginRes.body);
  const body = loginRes.body as LoginResponse;
  return body.accessToken; // reponse ได้ token ชื่อนี้
}
