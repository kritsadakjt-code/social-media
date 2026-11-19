// A/B load test: batch vs direct $inc บนโพสต์ไวรัลโพสต์เดียว
// ใช้ open model (constant-arrival-rate) = กำหนด "อัตราที่ request เข้ามา" เอง
// ไม่ให้ VU ช้าลงตามระบบ (หลีกเลี่ยง coordinated omission) และไม่มี sleep() คุมจังหวะ
//
// รัน (ต้องตั้ง THROTTLE_* env ก่อน start service เหมือน viral-post-load.js):
//   k6 run -e RATE=300 -e DURATION=60s -e POOL_SIZE=200 loadtest/ab-like-load.js
// ปรับ RATE ขึ้นเรื่อยๆ จนเห็น p95 เริ่มโค้ง จะเห็นความต่างของสองโหมดชัดขึ้น

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const POOL_SIZE = parseInt(__ENV.POOL_SIZE || '200', 10);
const RATE = parseInt(__ENV.RATE || '300', 10);
const DURATION = __ENV.DURATION || '60s';

const likeLatency = new Trend('like_latency', true);
const failed = new Counter('failed_requests');

export const options = {
  scenarios: {
    like_arrivals: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(500, Math.ceil(RATE / 2)),
      maxVUs: Math.max(1000, RATE * 10),
    },
  },
  setupTimeout: '5m',
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  // ไม่ตั้ง threshold ผ่าน/ไม่ผ่าน เพราะเป้าคือ "วัดเปรียบเทียบ" ไม่ใช่ pass/fail
};

function decodeUserId(token) {
  const payload = token.split('.')[1];
  return JSON.parse(encoding.b64decode(payload, 'rawurl', 's')).sub;
}

function registerAndLogin(tag) {
  const json = { headers: { 'Content-Type': 'application/json' } };
  const reg = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({
      username: `ab_${tag}`,
      email: `ab_${tag}@example.com`,
      password: 'password123',
    }),
    json,
  );
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`register failed ${reg.status}: ${reg.body}`);
  }
  const login = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      usernameOrEmail: `ab_${tag}@example.com`,
      password: 'password123',
    }),
    json,
  );
  if (login.status !== 200)
    throw new Error(`login failed ${login.status}: ${login.body}`);
  const token =
    login.json('data.accessToken') || login.json('data.access_token');
  return { token, userId: decodeUserId(token) };
}

export function setup() {
  const run = Date.now();
  const users = [];
  for (let i = 0; i < POOL_SIZE; i++)
    users.push(registerAndLogin(`${run}_${i}`));

  // โพสต์ใหม่ทุกรอบ เพื่อให้ทุกรอบเริ่มจาก likes = 0 เหมือนกัน
  const author = users[0];
  const create = http.post(
    `${BASE_URL}/posts`,
    JSON.stringify({ content: `ab seed ${run}` }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${author.token}`,
      },
    },
  );
  if (create.status !== 200 && create.status !== 201) {
    throw new Error(`seed post failed ${create.status}: ${create.body}`);
  }

  let postId = null;
  for (let i = 0; i < 20 && !postId; i++) {
    const res = http.get(`${BASE_URL}/posts/user/${author.userId}`, {
      headers: { Authorization: `Bearer ${author.token}` },
    });
    const posts = res.json('data.posts') || [];
    const seed = posts.find((p) => p.content === `ab seed ${run}`);
    if (seed) postId = seed.id;
    else sleep(0.3);
  }
  if (!postId) throw new Error('seed post never appeared');

  console.log(`SEED_POST_ID=${postId}`);
  return { users, postId };
}

export default function (data) {
  // เลือก user แบบวนตามลำดับ iteration ทั้งการทดสอบ (ไม่ผูกกับ VU) ด้วยอัตรา 300 req/s
  // และ pool 200 คน user เดิมจะถูกใช้ซ้ำห่างกัน ~0.67 วิ นานกว่า latency มาก
  // จึงไม่ชนกันเอง (ไม่ไปกระตุ้น race "คนเดียวกันกดซ้ำพร้อมกัน" ที่แก้ไปแล้ว)
  const user = data.users[exec.scenario.iterationInTest % data.users.length];

  const res = http.post(`${BASE_URL}/posts/${data.postId}/like`, null, {
    headers: {
      Authorization: `Bearer ${user.token}`,
      'x-idempotency-key': `${user.userId}-${exec.scenario.iterationInTest}-${Date.now()}`,
    },
  });
  likeLatency.add(res.timings.duration);
  const ok = check(res, {
    'like 200/201': (r) => r.status === 200 || r.status === 201,
  });
  if (!ok) failed.add(1);
}
