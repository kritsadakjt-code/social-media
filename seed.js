// seed.js - สร้าง user และ post สำหรับทดสอบ
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const NUM_USERS = 100;
const NUM_POSTS = 500;

async function seed() {
  console.log('🌱 Starting seed...');

  // สร้าง users
  const users = [];
  for (let i = 0; i < NUM_USERS; i++) {
    const username = `Test User ${i}`;
    const email = `testuser${i}@test.com`;

    try {
      const res = await axios.post(`${BASE_URL}/auth/register`, {
        username,
        email,
        password: 'TestPass123!',
      });

      const userId = res.data.data.id;

      users.push({
        id: userId,
        email: email,
        token: null, // จะใส่ตอน login
      });

      console.log(`✅ Registered user ${i + 1}/${NUM_USERS} (${email})`);
      console.log(`   ID: ${userId}\n`);
    } catch (err) {
      console.log(`⚠️ User ${i} already exists, skipping...`);
    }
  }

  // login
  for (let i = 0; i < users.length; i++) {
    try {
      const login = await axios.post(`${BASE_URL}/auth/login`, {
        usernameOrEmail: users[i].email,
        password: 'TestPass123!',
      });

      users[i].token = login.data.data.accessToken;

      console.log(`✅ Login success: user ${i} (${users[i].email})`);
      console.log(`   Token: ${users[i].token.substring(0, 30)}...\n`);
    } catch (err) {
      const status = err.response?.status;
      console.log(`❌ Login failed user ${i}: ${status}\n`);
    }
  }

  // เช็คว่ามี user ที่ login สำเร็จกี่คน
  const loggedInUsers = users.filter((u) => u.token);
  console.log(`📊 Logged in: ${loggedInUsers.length}/${users.length} users\n`);
  console.log('='.repeat(50) + '\n');

  // ติดตาม
  let followCount = 0;
  for (let i = 0; i < loggedInUsers.length; i++) {
    const currentUser = loggedInUsers[i];
    const followTargets = loggedInUsers.slice(i + 1, i + 11); // follow 10 คนถัดไป

    for (const target of followTargets) {
      try {
        await axios.post(
          `${BASE_URL}/follows/${target.id}`,
          {},
          {
            headers: { Authorization: `Bearer ${currentUser.token}` },
          },
        );

        followCount++;
        // console.log(`✅ ${currentUser.email} → ${target.email}`);
      } catch (err) {
        // อาจ follow แล้ว - skip เงียบๆ
      }
    }

    // แสดง progress ทุกๆ 10 users
    if ((i + 1) % 10 === 0) {
      console.log(
        `📊 Progress: ${i + 1}/${loggedInUsers.length} users processed`,
      );
    }
  }

  // ลบ
  // for (let i = 0; i < 100; i++) {
  //   try {
  //     const login = await axios.post(`${BASE_URL}/auth/login`, {
  //       usernameOrEmail: `testuser${i}@test.com`,
  //       password: 'TestPass123!',
  //     });
  //     // console.log(`accessToken ${login.data.data.accessToken} : ${i}`);

  //     await axios.delete(`${BASE_URL}/users/me`, {
  //       headers: { Authorization: `Bearer ${login.data.data.accessToken}` },
  //     });
  //     console.log(`✅ Deleted user ${i}`);
  //   } catch (err) {
  //     console.log(`⚠️ Skip user ${i}: ${err.response?.status}`);
  //   }
  // }

  //   // 3. สร้าง posts
  let postSuccessCount = 0;
  let postErrorCount = 0;

  for (let i = 0; i < NUM_POSTS; i++) {
    // ✅ ใช้ loggedInUsers แทน users
    const user =
      loggedInUsers[Math.floor(Math.random() * loggedInUsers.length)];

    // ✅ เช็ค token ก่อนใช้
    if (!user.token) {
      console.log(`⚠️ Skipping post ${i}: user has no token`);
      postErrorCount++;
      continue;
    }

    try {
      const res = await axios.post(
        `${BASE_URL}/posts`,
        {
          content: `Test post #${i} - ${Date.now()}`,
        },
        {
          headers: { Authorization: `Bearer ${user.token}` },
        },
      );

      postSuccessCount++;

      // ✅ แสดง progress ทุกๆ 50 posts
      if ((i + 1) % 50 === 0) {
        console.log(
          `📊 Post progress: ${i + 1}/${NUM_POSTS} (${postSuccessCount} success)`,
        );
      }

      // ✅ รอ 100ms เพื่อไม่ยิงรัวเกินไป
      // await delay(100);
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data?.data || err.response?.data;
      const msg = body?.message || err.message;

      if (status === 429) {
        // Rate limited → รอ 60 วิแล้วลองใหม่
        console.log(`🚫 Post ${i}: rate limited, waiting 60s...`);
        await delay(60000);
        i--; // ลองใหม่
      } else if (status === 401) {
        // Token expired → skip
        console.log(`⚠️ Post ${i}: token expired for ${user.email}`);
        postErrorCount++;
      } else {
        console.log(`❌ Post ${i}: ${status} - ${msg}`);
        postErrorCount++;
      }
    }
  }

  // ============== SUMMARY ==============
  console.log('\n' + '='.repeat(50));
  console.log('📊 SEED SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Users created:    ${users.length}`);
  console.log(`✅ Users logged in:  ${loggedInUsers.length}`);
  console.log(`✅ Follows created:  ${followCount}`);
  console.log(`✅ Posts created:    ${postSuccessCount}/${NUM_POSTS}`);
  console.log(`❌ Posts failed:     ${postErrorCount}`);
  console.log('='.repeat(50));
  console.log('🎉 Seed completed!\n');
}

seed().catch(console.error);
