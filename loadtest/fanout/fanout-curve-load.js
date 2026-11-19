// k6 load test: วัด "end-to-end propagation time" ของ fan-out
//
// Flow ที่วัด:
//   1. สร้างโพสต์ (POST /posts)
//   2. Poll feed ของ "sentinel follower" จนกว่าจะเห็นโพสต์
//   3. propagation_ms = เวลาจากสร้างโพสต์จนเห็นในฟีด
//
// สิ่งที่ต้องส่งผ่าน -e:
//   WHALE_TOKEN    = token ของ whale author
//   WHALE_USER_ID  = user id ของ whale author
//   FOLLOWER_TOKEN = token ของ follower คนหนึ่ง (ที่ follow whale)
//   ROUNDS         = จำนวนโพสต์ที่จะสร้างในแต่ละรอบ

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WHALE_TOKEN = __ENV.WHALE_TOKEN;
const FOLLOWER_TOKEN = __ENV.FOLLOWER_TOKEN;
const ROUNDS = parseInt(__ENV.ROUNDS || '3', 10);

// วัดเวลาการแพร่กระจายจากโพสต์ → เห็นในฟีด
const propagationTime = new Trend('fanout_propagation_ms', true);
// วัดเวลาสร้างโพสต์อย่างเดียว (เพื่อแยกดูว่าเร็ว/ช้าจากขั้นไหน)
const createPostTime = new Trend('create_post_ms', true);
const failedRequests = new Counter('failed_requests');
const fanoutFailures = new Counter('fanout_failures');

export const options = {
  vus: 1, // รันทีละโพสต์ เพื่อวัดแต่ละครั้งชัดเจน
  iterations: ROUNDS,
  thresholds: {
    fanout_propagation_ms: ['p(95)<10000'], // ไม่ให้เกิน 10 วิ
  },
};

function pollFeedForPost(token, postId, timeoutMs = 15000) {
  const start = Date.now();
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  while (Date.now() - start < timeoutMs) {
    const res = http.get(`${BASE_URL}/posts/feed`, headers);

    if (res.status === 200) {
      const posts = res.json('data.posts') || res.json('data') || [];
      // รองรับทั้งโครงสร้าง { data: { posts: [] } } และ { data: [] }
      const list = Array.isArray(posts) ? posts : posts.posts || [];
      const found = list.some((p) => p.id === postId || p._id === postId);
      if (found) {
        return Date.now() - start; // ✅ เห็นโพสต์แล้ว
      }
    }

    sleep(0.1); // poll ทุก 100ms
  }

  return -1; // ❌ ไม่เห็นโพสต์ในเวลาที่กำหนด
}

export default function () {
  const content = `fanout test ${Date.now()}-${__ITER}`;

  // 1. สร้างโพสต์ (จับเวลา)
  const t0 = Date.now();
  const createRes = http.post(
    `${BASE_URL}/posts`,
    JSON.stringify({ content }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHALE_TOKEN}`,
      },
    },
  );
  const createMs = Date.now() - t0;
  createPostTime.add(createMs);

  const createOk = check(createRes, {
    'create post 200/201': (r) => r.status === 200 || r.status === 201,
  });
  if (!createOk) {
    failedRequests.add(1);
    return;
  }

  const postId = createRes.json('data.id') || createRes.json('data._id');
  if (!postId) {
    console.warn(`no postId in response: ${createRes.body}`);
    failedRequests.add(1);
    return;
  }

  // 2. Poll feed ของ follower จนกว่าจะเห็น
  const seenAfterMs = pollFeedForPost(FOLLOWER_TOKEN, postId);

  if (seenAfterMs === -1) {
    fanoutFailures.add(1);
    console.warn(`post ${postId} ไม่ปรากฏในฟีดภายใน 15 วิ`);
    return;
  }

  propagationTime.add(seenAfterMs);
  console.log(
    `iter ${__ITER}: create=${createMs}ms, propagation=${seenAfterMs}ms`,
  );
}
