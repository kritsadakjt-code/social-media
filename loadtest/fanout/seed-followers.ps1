# สร้าง followers จำนวนมากให้ "whale author" โดยตรงผ่าน MongoDB
# ไม่ผ่าน API เพราะช้าเกินไป (10,000 คน × ~100ms = 17 นาที!)
#
# วิธีใช้:
#   .\loadtest\fanout\seed-followers.ps1 -FollowerCount 1000 -AuthorId <whaleUserId>
#
# หมายเหตุ:
#   ใช้ "upsert" แทน "ลบแล้วเพิ่ม" เพื่อไม่ให้ไปลบตัวจริง
#   (เช่น sentinel follower ที่สร้างใน prepare-fanout-actors.ps1)

param(
  [int]$FollowerCount = 1000,
  [string]$AuthorId = '6adc288269fdd08eeefb9f60',   # ← แก้ตรงนี้ หรือส่งผ่าน -AuthorId
  [string]$MongoUser = 'admin',
  [string]$MongoPass = 'mongo1234',
  [string]$FollowDb = 'social_follows_db',          # ← ตรวจชื่อจริงในโปรเจกต์
  [string]$FollowColl = 'follows'                   # ← ตรวจชื่อจริงในโปรเจกต์
)

$ErrorActionPreference = 'Stop'

# ✅ เช็คค่าที่ "ไม่มีทางเป็น ID จริง" แทนที่จะเช็คค่าเริ่มต้น
if ($AuthorId -eq 'PUT_WHALE_AUTHOR_ID_HERE') {
  Write-Error 'ต้องส่ง -AuthorId (whale author user id)'
}

Write-Host "กำลังสร้าง $FollowerCount followers ให้ $AuthorId ..." -ForegroundColor Cyan

# ❌ ไม่ใช้ deleteMany แล้ว เพราะ:
#   1. ไปลบตัวจริง (เช่น sentinel) ด้วย
#   2. ใช้ upsert แล้ว ไม่ต้องลบ — มีอยู่แล้วไม่สร้างซ้ำ

# ✅ สร้าง/อัพเดท followers แบบ bulk ด้วย upsert (มีอยู่แล้วไม่สร้างซ้ำ)
$batch = 100
for ($start = 0; $start -lt $FollowerCount; $start += $batch) {
  $end = [Math]::Min($start + $batch, $FollowerCount) - 1

  $ops = @()
  for ($i = $start; $i -le $end; $i++) {
    $ops += @"
    {
      updateOne: {
        filter: { followerId: 'seed_follower_$i', followingId: '$AuthorId' },
        update: { `$setOnInsert: { createdAt: new Date() } },
        upsert: true
      }
    }
"@
  }
  $opsStr = $ops -join ','

  $upJs = @"
db = db.getSiblingDB('$FollowDb');
const r = db.$FollowColl.bulkWrite([ $opsStr ], { ordered: false });
print('upserted: ' + r.upsertedCount + ', matched: ' + r.matchedCount);
"@

  docker exec social_mongodb mongosh -u $MongoUser -p $MongoPass `
    --authenticationDatabase admin --quiet --eval $upJs | Out-Host
}

# ✅ ตรวจสอบจำนวนสุดท้าย (นับรวมตัวจริงด้วย)
$chkJs = @"
db = db.getSiblingDB('$FollowDb');
const total = db.$FollowColl.countDocuments({ followingId: '$AuthorId' });
const seed = db.$FollowColl.countDocuments({ followingId: '$AuthorId', followerId: /^seed_follower_/ });
print('total followers: ' + total);
print('seed followers: ' + seed);
print('real followers: ' + (total - seed));
"@
docker exec social_mongodb mongosh -u $MongoUser -p $MongoPass `
  --authenticationDatabase admin --quiet --eval $chkJs | Out-Host

Write-Host "เสร็จแล้ว" -ForegroundColor Green