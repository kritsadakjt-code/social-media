// k6 load test: จำลอง "โพสต์ไวรัล" ที่โดนคนละ user กันหลายสิบ/หลายร้อยคนกดไลก์พร้อมกัน
// ต่างจาก like-toggle-load.js ตรงที่สคริปต์นั้นใช้ user เดียวคนเดียว toggle รัวๆ
// (ไม่สมจริง เทียบเท่าคนคนเดียว double-tap ไม่หยุด) ส่วนตัวนี้คือหลายคนกดคนละครั้ง
// ซึ่งเป็น use case จริงที่ Redis like-batching (like-aggregator.service.ts) ถูกออกแบบมารองรับ
//
// ก่อนรัน ต้องตั้ง env var ยกเลิก rate limit ชั่วคราว (ดูเหตุผลใน auth.controller.ts):
//   $env:THROTTLE_REGISTER_LIMIT="1000"
//   $env:THROTTLE_LOGIN_LIMIT="1000"
//   npm run start:all
//
// รัน: k6 run loadtest/viral-post-load.js
// ปรับจำนวน user pool ได้ผ่าน env: k6 run -e POOL_SIZE=200 loadtest/viral-post-load.js

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
const POOL_SIZE = parseInt(__ENV.POOL_SIZE || '100', 10); // ควร >= max VUs ด้านล่าง

const likeToggleLatency = new Trend('like_toggle_latency', true);
const failedRequests = new Counter('failed_requests');

export const options = {
  scenarios: {
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
    http_req_duration: ['p(95)<1000'],
  },
  // register+login 100 user ใน setup() ใช้เวลานานกว่า default timeout (60s) แน่นอน
  setupTimeout: '5m',
};

function registerAndLogin(suffix) {
  const registerPayload = JSON.stringify({
    username: `viral_${suffix}`,
    email: `viral_${suffix}@example.com`,
    password: 'password123',
  });
  const registerRes = http.post(`${BASE_URL}/auth/register`, registerPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (registerRes.status !== 201 && registerRes.status !== 200) {
    throw new Error(
      `Register failed for user ${suffix} (status ${registerRes.status}): ${registerRes.body}`,
    );
  }

  const loginPayload = JSON.stringify({
    usernameOrEmail: `viral_${suffix}@example.com`,
    password: 'password123',
  });
  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (loginRes.status !== 200) {
    throw new Error(
      `Login failed for user ${suffix} (status ${loginRes.status}): ${loginRes.body}`,
    );
  }

  const token =
    loginRes.json('data.accessToken') || loginRes.json('data.access_token');
  if (!token) {
    throw new Error(
      `No token in login response for user ${suffix}: ${loginRes.body}`,
    );
  }

  return { token, userId: decodeJwtUserId(token) };
}

export function setup() {
  const runId = Date.now();
  const users = [];

  console.log(
    `Registering ${POOL_SIZE} distinct users for the viral-post test...`,
  );
  for (let i = 0; i < POOL_SIZE; i++) {
    users.push(registerAndLogin(`${runId}_${i}`));
  }
  console.log(`Registered ${users.length} users.`);

  // user[0] เป็นคนสร้างโพสต์ไวรัล ที่เหลือจะมากดไลก์
  const author = users[0];
  const createRes = http.post(
    `${BASE_URL}/posts`,
    JSON.stringify({ content: 'viral loadtest post' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${author.token}`,
      },
    },
  );
  if (createRes.status !== 201 && createRes.status !== 200) {
    throw new Error(
      `Seed post creation failed (status ${createRes.status}): ${createRes.body}`,
    );
  }

  let postId = null;
  const authHeaders = { headers: { Authorization: `Bearer ${author.token}` } };
  for (let attempt = 0; attempt < 20; attempt++) {
    const listRes = http.get(
      `${BASE_URL}/posts/user/${author.userId}`,
      authHeaders,
    );
    const posts = listRes.json('data.posts');
    if (posts && posts.length > 0) {
      const seedPost = posts.find((p) => p.content === 'viral loadtest post');
      if (seedPost) {
        postId = seedPost.id;
        break;
      }
    }
    sleep(0.3);
  }
  if (!postId) {
    throw new Error('Timed out waiting for seed post to appear.');
  }

  console.log(`Seed post ready: ${postId}`);
  return { users, postId };
}

export default function (data) {
  // แต่ละ VU ใช้ user คนละคนจาก pool คงที่ตลอดการรัน (VU 1 = users[0] เสมอ) — จำลอง
  // "คนจริงแต่ละคน" ไม่ใช่สุ่มสลับ user ทุก iteration ซึ่งจะไม่สมจริง
  const user = data.users[(__VU - 1) % data.users.length];

  const headers = {
    Authorization: `Bearer ${user.token}`,
    'x-idempotency-key': `${user.userId}-${__ITER}-${Date.now()}`,
  };

  // toggle like/unlike ของ "user คนนี้คนเดียว" กับโพสต์เดียวกัน — ตอนนี้ไม่ race กับ
  // ตัวเองเพราะเป็น sequential ภายใน VU เดียวกัน (k6 รัน iteration ของ VU เดียวทีละอัน)
  // แต่ race กับ VU อื่นๆ (user อื่นๆ) ที่ toggle โพสต์เดียวกันพร้อมกันแทน — ตรงนี้คือ
  // concurrency จริงที่ต้องการวัด (คนละคนกดพร้อมกัน ไม่ใช่คนเดียวกดซ้ำ)
  const likeRes = http.post(`${BASE_URL}/posts/${data.postId}/like`, null, {
    headers,
  });
  likeToggleLatency.add(likeRes.timings.duration);
  const ok = check(likeRes, {
    'like status 200/201': (r) => r.status === 200 || r.status === 201,
  });
  if (!ok) failedRequests.add(1);

  sleep(0.5 + Math.random() * 1.5); // random delay จำลองพฤติกรรมคนจริง ไม่กดรัวเท่ากันทุกคน
}

// ตัวเลขที่ควรเอาไปรายงาน:
//   http_reqs / 2nd (req/s)     -> throughput ของ like endpoint ภายใต้ user จริงหลายคน
//   like_toggle_latency p95/p99 -> latency ที่ user จริงแต่ละคนเจอ (ไม่ใช่คนเดียว spam)
//   checks_succeeded            -> ควรใกล้ 100% เพราะตอนนี้ไม่มี race ระหว่าง "คนเดียวกัน"
//                                   แล้ว (fix E11000 + findOneAndDelete) ถ้ายังพลาดบางส่วน
//                                   ให้ดู error message จริงว่าเป็นอะไรต่อ
