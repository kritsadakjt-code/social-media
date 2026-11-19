// k6 load test สำหรับ social-media backend
// ทดสอบ 2 endpoint ที่ resume อ้างถึง: POST /posts (create post -> RabbitMQ -> Kafka fan-out)
//                                    POST /posts/:id/like (Redis-batched like toggle)
//
// วิธีรัน:
//   1. docker-compose up -d && npm run start:all   (ที่ root ของ repo)
//   2. ติดตั้ง k6: https://k6.io/docs/get-started/installation/
//   3. k6 run loadtest/like-toggle-load.js
//
// หมายเหตุสำคัญ: auth endpoint มี rate limit (login 5/min, register 3/min) ตามที่ตั้งไว้ใน
// AuthController ดังนั้นสคริปต์นี้ register+login แค่ครั้งเดียวใน setup() แล้วแชร์ token
// ให้ทุก VU ใช้ร่วมกัน — ไม่ยิง login ซ้ำในลูปโหลดเทสต์

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';

function decodeJwtUserId(token) {
  const payloadB64 = token.split('.')[1];
  const decoded = encoding.b64decode(payloadB64, 'rawurl', 's');
  return JSON.parse(decoded).sub;
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const createPostLatency = new Trend('create_post_latency', true);
const likeToggleLatency = new Trend('like_toggle_latency', true);
const failedRequests = new Counter('failed_requests');

export const options = {
  scenarios: {
    // ปรับ target ตามที่อยากทดสอบ เริ่มจากน้อยๆ แล้วค่อยไต่ขึ้นดูว่าพังตรงไหน
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'], // ปรับตามที่ยอมรับได้จริง
  },
};

export function setup() {
  const suffix = Date.now();
  const registerPayload = JSON.stringify({
    username: `loadtest_${suffix}`,
    email: `loadtest_${suffix}@example.com`,
    password: 'password123',
  });

  const registerRes = http.post(`${BASE_URL}/auth/register`, registerPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (registerRes.status !== 201 && registerRes.status !== 200) {
    throw new Error(
      `Setup register failed (status ${registerRes.status}): ${registerRes.body}`,
    );
  }

  const loginPayload = JSON.stringify({
    usernameOrEmail: `loadtest_${suffix}@example.com`,
    password: 'password123',
  });

  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status !== 200) {
    throw new Error(
      `Setup login failed (status ${loginRes.status}): ${loginRes.body}`,
    );
  }

  const token =
    loginRes.json('data.accessToken') || loginRes.json('data.access_token');
  if (!token) {
    throw new Error(
      `Could not find token field in login response — check the actual JSON shape: ${loginRes.body}`,
    );
  }

  const userId = decodeJwtUserId(token);
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  // สร้าง post หนึ่งอันไว้ล่วงหน้าให้ VU ทุกตัวมากด like ใส่ post เดียวกัน
  // (จำลอง viral post — เคสที่กดดัน Redis batching หนักที่สุด)
  const createRes = http.post(
    `${BASE_URL}/posts`,
    JSON.stringify({ content: 'loadtest seed post' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (createRes.status !== 201 && createRes.status !== 200) {
    throw new Error(
      `Setup seed-post failed (status ${createRes.status}): ${createRes.body}`,
    );
  }

  let postId = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const listRes = http.get(`${BASE_URL}/posts/user/${userId}`, authHeaders);
    const posts = listRes.json('data.posts');
    if (posts && posts.length > 0) {
      const seedPost = posts.find((p) => p.content === 'loadtest seed post');
      if (seedPost) {
        postId = seedPost.id; // ← ดึง .id ออกมาเป็น string ไม่ใช่ทั้ง object
        break;
      }
    }
    sleep(0.3); // รอ post-service consume จาก RabbitMQ แล้วเขียนลง Mongo ให้เสร็จ
  }

  if (!postId) {
    throw new Error(
      'Timed out waiting for seed post to appear via GET /posts/user/:userId ' +
        '— check that post-service is running and consuming from RabbitMQ.',
    );
  }

  return { token, postId };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
    'x-idempotency-key': `${__VU}-${__ITER}-${Date.now()}`,
  };

  // --- like toggle: จุดที่ resume เคลมเรื่อง Redis batching ---
  const likeRes = http.post(`${BASE_URL}/posts/${data.postId}/like`, null, {
    headers,
  });
  likeToggleLatency.add(likeRes.timings.duration);
  const likeOk = check(likeRes, {
    'like status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  if (!likeOk) failedRequests.add(1);

  sleep(0.2);

  // --- create post: จุดที่วัด fan-out ผ่าน RabbitMQ -> Kafka -> feed-service ---
  const createRes = http.post(
    `${BASE_URL}/posts`,
    JSON.stringify({
      content: `load test post from VU ${__VU} iter ${__ITER}`,
    }),
    { headers },
  );
  createPostLatency.add(createRes.timings.duration);
  const createOk = check(createRes, {
    'create post status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  if (!createOk) failedRequests.add(1);

  sleep(0.5);
}

// ผลลัพธ์ที่ต้องอ่านตอนจบรัน (k6 print ให้อัตโนมัติ):
//   http_reqs (req/s) ......... ตัวเลขที่จะใส่เป็น "sustained X req/s"
//   http_req_duration p(95) ... ตัวเลขที่จะใส่เป็น "p95 latency of Y ms"
//   like_toggle_latency / create_post_latency ... แยกดูว่า endpoint ไหนเป็นคอขวด
//   failed_requests ........... ถ้ามากกว่า 0 แปลว่าระบบเริ่มพังที่โหลดระดับนั้น
//                                ให้รายงานตัวเลขที่ "ก่อนพัง" ไม่ใช่ตัวเลขที่ทำให้ error
