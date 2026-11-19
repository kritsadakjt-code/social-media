#!/usr/bin/env node
'use strict';
/*
 * Feed fan-out benchmark for the social-media project.
 *
 * Modes (node loadtest/fanout-bench.js <mode>):
 *   curve       fan-out time vs follower count (also = "post -> follower feed" lag)
 *   noisy       does one big fan-out slow down (a) a small user's post, (b) feed reads, (c) Redis?
 *   invariants  feed keeps latest 20 posts, TTL ~7 days, no duplicates
 *   all         run all three
 *
 * Followers are FAKE ids written straight into the follow-service collection
 * (follow schema only stores followerId/followingId strings), so no user
 * registration is needed per follower. Everything is cleaned up at the end
 * (only documents/keys whose id starts with bench_<runId>_).
 *
 * Needs services + docker running. The script registers a few real users
 * (author / reader), so start the gateway with THROTTLE_REGISTER_LIMIT raised
 * (same trick as the k6 scripts), otherwise register returns 429.
 *
 * Config (env vars):
 *   API_BASE        default http://localhost:3000
 *   REDIS_HOST/PORT default localhost / 6379      REDIS_PASSWORD (required if Redis has a password)
 *   MONGO_URI       default mongodb://admin:changeme@localhost:27018/?authSource=admin
 *   FOLLOW_DB       default social_follows_db     FOLLOW_COLLECTION default follows
 *   LEVELS          default 100,1000,10000,25000,50000
 *   REPEATS         default 5                     TIMEOUT_MS default 120000
 *   BIG_N           default 50000 (noisy)         SMALL_N default 10
 *   CLEANUP         default 1 (set 0 to keep data for inspection)
 */

const Redis = require('ioredis');
const { MongoClient } = require('mongodb');
const fs = require('fs');

const cfg = {
  api: process.env.API_BASE || 'http://localhost:3000',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD || 'redis1234',
  mongoUri:
    process.env.MONGO_URI ||
    'mongodb://admin:mongo1234@localhost:27018/?authSource=admin',
  followDb: process.env.FOLLOW_DB || 'social_follows_db',
  followCol: process.env.FOLLOW_COLLECTION || 'follows',
  levels: (process.env.LEVELS || '500000')
    .split(',')
    .map((x) => parseInt(x, 10)),
  repeats: parseInt(process.env.REPEATS || '5', 10),
  timeoutMs: parseInt(process.env.TIMEOUT_MS || '120000', 10),
  bigN: parseInt(process.env.BIG_N || '50000', 10),
  smallN: parseInt(process.env.SMALL_N || '10', 10),
  invFollowers: 1000,
  invPosts: 25,
  settleMs: 3000,
  cleanup: process.env.CLEANUP !== '0',
};

const RUN = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

// ---------- small helpers ----------
function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const median = (arr) => pct(arr, 50);
const fmt = (x) => (x == null ? 'n/a' : Number(x).toFixed(1));

// สุ่มเเบบกระจาย โดยช่วงเท่าๆ กัน ตามช่วงของ user ทั้งหมด
function sampleIds(prefix, n, k = 20) {
  const idx = new Set([0, n - 1]);
  for (let j = 1; j < k - 1; j++) idx.add(Math.floor((j * (n - 1)) / (k - 1)));
  return [...idx].sort((a, b) => a - b).map((i) => `${prefix}${i}`);
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${cfg.api}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

async function newUser(tag) {
  const username = `fb_${tag}_${RUN}`;
  const email = `${username}@example.com`;
  const password = 'password123';
  const reg = await api('POST', '/auth/register', {
    body: { username, email, password },
  });
  if (reg.status === 429) {
    throw new Error(
      'Register rate-limited (429). Start the gateway with THROTTLE_REGISTER_LIMIT / THROTTLE_LOGIN_LIMIT raised.',
    );
  }
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(
      `register failed ${reg.status}: ${JSON.stringify(reg.json)}`,
    );
  }
  const login = await api('POST', '/auth/login', {
    body: { usernameOrEmail: email, password },
  });
  const token = login.json?.data?.accessToken || login.json?.data?.access_token;
  if (!token)
    throw new Error(
      `login failed ${login.status}: ${JSON.stringify(login.json)}`,
    );
  const userId = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString(),
  ).sub;
  return { token, userId };
}

async function seedFollowers(col, authorId, prefix, from, to) {
  const BATCH = 10000;
  for (let s = from; s < to; s += BATCH) {
    const e = Math.min(to, s + BATCH);
    const t = new Date();
    const docs = [];
    for (let i = s; i < e; i++) {
      docs.push({
        followerId: `${prefix}${i}`,
        followingId: authorId,
        createdAt: t,
        updatedAt: t,
      });
    }
    await col.insertMany(docs, { ordered: false });
  }
}

// newest member of each feed (null if empty). A new post changes this value.
async function topMembers(redis, ids) {
  const p = redis.pipeline();
  for (const id of ids) p.zrevrange(`feed:${id}`, 0, 0);
  const res = await p.exec();
  return res.map(([err, v]) => (err ? 'ERR' : (v && v[0]) || null));
}

// resolves with performance.now() when EVERY sampled feed's newest member changed
async function waitArrival(redis, ids, baseline, timeoutMs) {
  const start = now();
  while (now() - start < timeoutMs) {
    const tops = await topMembers(redis, ids);
    let all = true;
    for (let i = 0; i < ids.length; i++) {
      if (tops[i] === baseline[i]) {
        all = false;
        break;
      }
    }
    if (all) return now();
    await sleep(2);
  }
  return null;
}

async function createPost(user, content) {
  const r = await api('POST', '/posts', {
    token: user.token,
    body: { content },
  });
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(
      `create post failed ${r.status}: ${JSON.stringify(r.json)}`,
    );
  }
}

async function postAndWait(redis, user, ids, content) {
  const base = await topMembers(redis, ids);
  const t0 = now();
  await createPost(user, content);
  const tHttp = now();
  const tEnd = await waitArrival(redis, ids, base, cfg.timeoutMs);
  return {
    httpMs: tHttp - t0,
    totalMs: tEnd == null ? null : tEnd - t0,
    t0,
    tEnd,
  };
}

// repeatedly runs fn() until stop(); keeps {t, ms, err}
function startProbe(fn, intervalMs) {
  const samples = [];
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      const t = now();
      try {
        await fn();
        samples.push({ t, ms: now() - t, err: false });
      } catch {
        samples.push({ t, ms: now() - t, err: true });
      }
      await sleep(intervalMs);
    }
  })();
  return {
    samples,
    stop: async () => {
      stopped = true;
      // รอ await fn(); ให้ทํางานให้เสร็จ เพราะเป็นงาน async ถ้าไม่มี await loop; จะออก loop เลยทําให้ไม่ได้ค่าปัจจุบันเพราะงานยังไม่เสร็จ
      // จะออกได้เลยก็ต่อเมื่อเป็นงาน synchronous
      await loop;
    },
  };
}

function stats(samples) {
  const ok = samples.filter((s) => !s.err).map((s) => s.ms);
  return {
    n: samples.length,
    errors: samples.length - ok.length,
    p50: pct(ok, 50),
    p95: pct(ok, 95),
    p99: pct(ok, 99),
    max: ok.length ? Math.max(...ok) : null,
  };
}

// ---------- test 1: scalability curve + eventual-consistency lag ----------
async function runCurve(ctx) {
  const author = await newUser('curve');
  const prefix = `bench_${RUN}_c_`;
  const rows = [];
  let seeded = 0;
  for (const n of cfg.levels) {
    await seedFollowers(ctx.col, author.userId, prefix, seeded, n);
    seeded = n;
    const ids = sampleIds(prefix, n);
    console.log(`\n[curve] followers=${n}`);
    for (let r = 1; r <= cfg.repeats; r++) {
      const res = await postAndWait(
        ctx.redis,
        author,
        ids,
        `fanout curve n=${n} run=${r} ${RUN}`,
      );
      rows.push({
        followers: n,
        run: r,
        http_ms: res.httpMs,
        total_ms: res.totalMs,
      });
      console.log(
        `  run ${r}: ${res.totalMs == null ? 'TIMEOUT' : res.totalMs.toFixed(0) + ' ms'}`,
      );
      await sleep(cfg.settleMs);
    }
  }
  // const lines = ['followers,run,http_ms,total_ms'].concat(
  //   rows.map(
  //     (x) =>
  //       `${x.followers},${x.run},${fmt(x.http_ms)},${x.total_ms == null ? 'TIMEOUT' : fmt(x.total_ms)}`,
  //   ),
  // );
  // fs.writeFileSync('fanout-curve.csv', lines.join('\n') + '\n');
  console.log('\n=== CURVE: post -> last sampled follower feed (ms) ===');
  console.log('followers   median      min      max   timeouts');
  for (const n of cfg.levels) {
    const t = rows.filter((x) => x.followers === n);
    const ok = t.filter((x) => x.total_ms != null).map((x) => x.total_ms);
    console.log(
      `${String(n).padStart(9)} ${fmt(median(ok)).padStart(8)} ${fmt(ok.length ? Math.min(...ok) : null).padStart(8)} ${fmt(ok.length ? Math.max(...ok) : null).padStart(8)} ${String(t.length - ok.length).padStart(9)}`,
    );
  }
  console.log('Saved fanout-curve.csv');
}

// ---------- test 2: noisy neighbor ----------
async function runNoisy(ctx) {
  const big = await newUser('big');
  const small = await newUser('small');
  const reader = await newUser('reader');
  const bigPrefix = `bench_${RUN}_b_`;
  const smallPrefix = `bench_${RUN}_s_`;
  const t = new Date();

  // reader = a REAL user who follows the big author, so GET /posts/feed is meaningful
  await ctx.col.insertOne({
    followerId: reader.userId,
    followingId: big.userId,
    createdAt: t,
    updatedAt: t,
  });
  await seedFollowers(ctx.col, big.userId, bigPrefix, 0, cfg.bigN - 1);
  await seedFollowers(ctx.col, small.userId, smallPrefix, 0, cfg.smallN);

  const bigIds = [reader.userId, ...sampleIds(bigPrefix, cfg.bigN - 1)];
  const smallIds = Array.from(
    { length: cfg.smallN },
    (_, i) => `${smallPrefix}${i}`,
  );

  console.log(
    `\n[noisy] warm-up: one post from the big author (${cfg.bigN} followers)`,
  );
  const warm = await postAndWait(ctx.redis, big, bigIds, `warmup ${RUN}`);
  console.log(
    `  warm-up fan-out: ${warm.totalMs == null ? 'TIMEOUT' : warm.totalMs.toFixed(0) + ' ms'}`,
  );
  await sleep(cfg.settleMs);

  const readFn = async () => {
    try {
      const r = await api('GET', '/posts/feed', { token: reader.token });
      if (r.status !== 200) {
        console.error(`GET /feed failed: ${r.status}`, JSON.stringify(r.json));
        throw new Error(`feed ${r.status}`);
      }
    } catch (error) {
      console.error('❌ readFn error:', error.message);
      throw error;
    }
  };
  const probe = new Redis({
    host: cfg.redisHost,
    port: cfg.redisPort,
    password: cfg.redisPassword,
  });
  const pingFn = () => probe.ping();

  // A) small post alone
  console.log('[noisy] A: small post alone');
  const alone = [];
  for (let r = 1; r <= cfg.repeats; r++) {
    const res = await postAndWait(
      ctx.redis,
      small,
      smallIds,
      `small alone ${r} ${RUN}`,
    );
    if (res.totalMs != null) alone.push(res.totalMs);
    await sleep(1000);
  }

  // B) idle probes
  console.log('[noisy] B: idle read / ping probes (10 s)');
  const idleRead = startProbe(readFn, 100);
  const idlePing = startProbe(pingFn, 5);
  await sleep(10000);
  await idleRead.stop();
  await idlePing.stop();

  // C) big fan-out in flight + small post + probes running
  console.log(
    '[noisy] C: big post, then small post 100 ms later, probes running',
  );
  const readProbe = startProbe(readFn, 100);
  const pingProbe = startProbe(pingFn, 5);
  const during = [];
  const smallDuring = [];
  const bigTotals = [];
  for (let r = 1; r <= cfg.repeats; r++) {
    const baseBig = await topMembers(ctx.redis, bigIds);
    const baseSmall = await topMembers(ctx.redis, smallIds);
    const tBig0 = now();
    await createPost(big, `big noisy ${r} ${RUN}`);
    await sleep(100);
    const tSmall0 = now();
    await createPost(small, `small noisy ${r} ${RUN}`);
    const [tSmallEnd, tBigEnd] = await Promise.all([
      waitArrival(ctx.redis, smallIds, baseSmall, cfg.timeoutMs),
      waitArrival(ctx.redis, bigIds, baseBig, cfg.timeoutMs),
    ]);
    if (tSmallEnd != null) smallDuring.push(tSmallEnd - tSmall0);
    if (tBigEnd != null) bigTotals.push(tBigEnd - tBig0);
    during.push({
      start: tBig0,
      end: tBigEnd == null ? tBig0 + cfg.timeoutMs : tBigEnd,
    });
    console.log(
      `  rep ${r}: big=${tBigEnd == null ? 'TIMEOUT' : (tBigEnd - tBig0).toFixed(0) + ' ms'}  small=${tSmallEnd == null ? 'TIMEOUT' : (tSmallEnd - tSmall0).toFixed(0) + ' ms'}`,
    );
    await sleep(cfg.settleMs);
  }
  await readProbe.stop();
  await pingProbe.stop();
  await probe.quit();

  const inWindow = (s) => during.some((w) => s.t >= w.start && s.t <= w.end);
  const readDuring = stats(readProbe.samples.filter(inWindow));
  const pingDuring = stats(pingProbe.samples.filter(inWindow));
  const readIdle = stats(idleRead.samples);
  const pingIdle = stats(idlePing.samples);

  console.log('\n=== NOISY NEIGHBOR ===');
  console.log(
    `big fan-out (${cfg.bigN} followers) median: ${fmt(median(bigTotals))} ms`,
  );
  console.log(
    `small post (${cfg.smallN} followers) alone  median: ${fmt(median(alone))} ms`,
  );
  console.log(
    `small post during big fan-out median: ${fmt(median(smallDuring))} ms  (x${fmt(median(alone) ? median(smallDuring) / median(alone) : null)})`,
  );
  console.log(
    'GET /posts/feed (ms)       p50      p95      max   errors/samples',
  );
  console.log(
    `  idle                 ${fmt(readIdle.p50).padStart(8)} ${fmt(readIdle.p95).padStart(8)} ${fmt(readIdle.max).padStart(8)}   ${readIdle.errors}/${readIdle.n}`,
  );
  console.log(
    `  during big fan-out   ${fmt(readDuring.p50).padStart(8)} ${fmt(readDuring.p95).padStart(8)} ${fmt(readDuring.max).padStart(8)}   ${readDuring.errors}/${readDuring.n}`,
  );
  console.log('Redis PING (ms)            p50      p99      max   samples');
  console.log(
    `  idle                 ${fmt(pingIdle.p50).padStart(8)} ${fmt(pingIdle.p99).padStart(8)} ${fmt(pingIdle.max).padStart(8)}   ${pingIdle.n}`,
  );
  console.log(
    `  during big fan-out   ${fmt(pingDuring.p50).padStart(8)} ${fmt(pingDuring.p99).padStart(8)} ${fmt(pingDuring.max).padStart(8)}   ${pingDuring.n}`,
  );
  fs.writeFileSync(
    'fanout-noisy.json',
    JSON.stringify(
      {
        bigTotals,
        alone,
        smallDuring,
        readIdle,
        readDuring,
        pingIdle,
        pingDuring,
      },
      null,
      2,
    ),
  );
  console.log('Saved fanout-noisy.json');
}

// ---------- test 3: invariants (cap 20, TTL ~7d, no duplicates) ----------
async function runInvariants(ctx) {
  const author = await newUser('inv');
  const prefix = `bench_${RUN}_i_`;
  const n = cfg.invFollowers;
  await seedFollowers(ctx.col, author.userId, prefix, 0, n);
  const ids = sampleIds(prefix, n, 3);
  console.log(`\n[invariants] ${cfg.invPosts} posts to ${n} followers`);
  for (let k = 1; k <= cfg.invPosts; k++) {
    const res = await postAndWait(
      ctx.redis,
      author,
      ids,
      `invariant post ${k} ${RUN}`,
    );
    if (res.totalMs == null) throw new Error(`post ${k} never arrived`);
    await sleep(200);
  }
  const list = await api('GET', `/posts/user/${author.userId}`, {
    token: author.token,
  });
  const posts = list.json?.data?.posts || [];
  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const expected = posts.slice(0, 20).map((p) => p.id);
  if (posts.length < cfg.invPosts) {
    console.log(
      `  WARN: only ${posts.length} posts found for author (expected ${cfg.invPosts})`,
    );
  }

  const all = Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const counts = { cap: 0, ttl: 0, content: 0, dup: 0 };
  for (let s = 0; s < all.length; s += 500) {
    const chunk = all.slice(s, s + 500);
    const p = ctx.redis.pipeline();
    for (const id of chunk) {
      p.zcard(`feed:${id}`);
      p.ttl(`feed:${id}`);
      p.zrevrange(`feed:${id}`, 0, -1);
    }
    const res = await p.exec();
    for (let i = 0; i < chunk.length; i++) {
      const card = res[i * 3][1];
      const ttl = res[i * 3 + 1][1];
      const members = res[i * 3 + 2][1];
      if (card === 20) counts.cap++;
      if (ttl > 0 && ttl <= 604800 && ttl >= 604800 - 3600) counts.ttl++;
      if (JSON.stringify(members) === JSON.stringify(expected))
        counts.content++;
      if (new Set(members).size === members.length) counts.dup++;
    }
  }
  const row = (name, c) =>
    console.log(`  ${c === n ? 'PASS' : 'FAIL'}  ${name}: ${c}/${n}`);
  console.log('=== INVARIANTS ===');
  row('feed capped at exactly 20 entries', counts.cap);
  row('TTL within (7 days - 1 h, 7 days]', counts.ttl);
  row('holds the latest 20 posts, newest first', counts.content);
  row('no duplicate members', counts.dup);
}

// ---------- cleanup ----------
async function cleanup(ctx) {
  console.log('\n[cleanup] removing benchmark data...');
  const re = new RegExp(`^bench_${RUN}_`);
  const del = await ctx.col.deleteMany({ followerId: { $regex: re } });
  let keys = 0;
  let cursor = '0';
  do {
    // scan bucket ที่เก็บที่อยู่ของ key เร็วกว่า scan เเบบ key เพราะไม่ block, เเบบ key block
    const [next, batch] = await ctx.redis.scan(
      cursor,
      'MATCH',
      `feed:bench_${RUN}_*`,
      'COUNT',
      10000,
    );
    cursor = next;
    if (batch.length) {
      // ลบ โดยไม่ block เร็วกว่า del ปกติ
      await ctx.redis.unlink(...batch);
      keys += batch.length;
    }
  } while (cursor !== '0');
  console.log(
    `  deleted ${del.deletedCount} follow docs, ${keys} feed keys (the real author/reader users and their posts remain)`,
  );
}

async function main() {
  const mode = process.argv[2] || 'all';
  if (!['curve', 'noisy', 'invariants', 'all'].includes(mode)) {
    console.error(
      'usage: node loadtest/fanout-bench.js curve|noisy|invariants|all',
    );
    process.exit(2);
  }
  const redis = new Redis({
    host: cfg.redisHost,
    port: cfg.redisPort,
    password: cfg.redisPassword,
  });
  const mongo = new MongoClient(cfg.mongoUri);
  await mongo.connect();
  const ctx = { redis, col: mongo.db(cfg.followDb).collection(cfg.followCol) };
  console.log(
    `run id ${RUN} | mode ${mode} | follow db ${cfg.followDb}.${cfg.followCol}`,
  );
  try {
    if (mode === 'curve' || mode === 'all') await runCurve(ctx);
    if (mode === 'invariants' || mode === 'all') await runInvariants(ctx);
    if (mode === 'noisy' || mode === 'all') await runNoisy(ctx);
  } finally {
    if (cfg.cleanup)
      await cleanup(ctx).catch((e) =>
        console.error('cleanup failed:', e.message),
      );
    await redis.quit();
    await mongo.close();
  }
}

module.exports = { pct, sampleIds, topMembers, waitArrival, stats };

if (require.main === module) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });
}
