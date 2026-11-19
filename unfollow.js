const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadUsers() {
  // ลองโหลดจากไฟล์ seeded-users.json ก่อน
  //   if (fs.existsSync('seeded-users.json')) {
  //     console.log('📂 Loading users from seeded-users.json...\n');
  //     const users = JSON.parse(fs.readFileSync('seeded-users.json', 'utf8'));

  //     // เช็คว่ายังมี token ไหม (token อาจหมดอายุ)
  //     const usersWithToken = users.filter((u) => u.token);
  //     console.log(`📊 Loaded ${usersWithToken.length} users with tokens\n`);

  //     return usersWithToken;
  //   }

  // ถ้าไม่มีไฟล์ ให้ login ใหม่
  console.log('📂 No seeded-users.json found, logging in...\n');
  const users = [];

  for (let i = 0; i < 100; i++) {
    try {
      const login = await axios.post(`${BASE_URL}/auth/login`, {
        usernameOrEmail: `testuser${i}@test.com`,
        password: 'TestPass123!',
      });

      users.push({
        id: login.data.data.user.sub,
        email: `testuser${i}@test.com`,
        token: login.data.data.accessToken,
      });
    } catch (err) {
      if (err.response?.status !== 401) {
        console.log(`❌ Login failed user ${i}: ${err.response?.status}`);
      }
    }
  }

  return users.filter((u) => u.token);
}

async function unfollowAll() {
  console.log('🔓 Starting unfollow process...\n');

  const users = await loadUsers();

  if (users.length === 0) {
    console.log('❌ No users with valid tokens found');
    return;
  }

  console.log(`👥 Processing ${users.length} users\n`);
  console.log('='.repeat(50) + '\n');

  let unfollowCount = 0;
  let errorCount = 0;

  for (let i = 0; i < users.length; i++) {
    const currentUser = users[i];

    // Unfollow 10 คนถัดไป (เหมือนกับตอน follow)
    const unfollowTargets = users.slice(i + 1, i + 11);

    for (const target of unfollowTargets) {
      try {
        await axios.delete(`${BASE_URL}/follows/${target.id}`, {
          headers: {
            Authorization: `Bearer ${currentUser.token}`,
          },
        });

        unfollowCount++;
      } catch (err) {
        const status = err.response?.status;

        if (status === 401) {
          // Token expired - skip this user
          console.log(
            `⚠️  User ${i}: token expired, skipping remaining targets`,
          );
          break; // หยุด unfollow user นี้
        } else if (status === 404) {
          // ไม่เคย follow หรือ unfollow ไปแล้ว
          // skip เงียบๆ
        } else {
          console.log(
            `❌ Unfollow failed: ${currentUser.email} → ${target.email} (${status})`,
          );
          errorCount++;
        }
      }
    }

    // แสดง progress ทุกๆ 10 users
    if ((i + 1) % 10 === 0) {
      console.log(`📊 Progress: ${i + 1}/${users.length} users processed`);
    }

    // รอ 500ms ระหว่าง users เพื่อไม่ยิงรัวเกินไป
    await delay(500);
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Total unfollows: ${unfollowCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log('🎉 Unfollow completed!\n');
}

unfollowAll().catch(console.error);
