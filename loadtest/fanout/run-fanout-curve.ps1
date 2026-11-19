# รัน fan-out scalability curve: ทดสอบที่ 100 / 500 / 1000 / 5000 / 10000 followers
#
# ก่อนรัน:
#   1. สร้าง "whale author" และ "sentinel follower" ผ่าน API (หรือ k6 setup)
#   2. ให้ sentinel กดติดตาม whale
#   3. แก้ $WHALE_USER_ID ด้านล่าง
#
# วิธีรัน:
#   .\loadtest\fanout\run-fanout-curve.ps1 -WHALE_TOKEN "..." -FOLLOWER_TOKEN "..."

param(
  [string]$ActorsFile = 'fanout-actors.json',
  [int]$Rounds = 2,
#   [int]$FollowDb = 'social_follows_db',
  [string]$Out = 'fanout-curve.csv'
)

$ErrorActionPreference = 'Stop'

$actors = Get-Content $ActorsFile -Raw | ConvertFrom-Json

$WHALE_TOKEN    = $actors.whaleToken
$WHALE_USER_ID  = $actors.whaleUserId
$FOLLOWER_TOKEN = $actors.followerToken

Write-Host "ใช้ตัวละครจาก $ActorsFile :" -ForegroundColor Cyan
Write-Host "  Whale author : $WHALE_USER_ID"
Write-Host "  Sentinel     : $($actors.followerUserId)"
Write-Host ""

# จำนวน followers ที่ต้องการทดสอบ (ปรับได้ตามต้องการ)
$followerCounts = @(100, 500, 1000, 5000, 10000)

if (Test-Path $Out) { Remove-Item $Out }

foreach ($count in $followerCounts) {
  Write-Host ""
  Write-Host "=========================================" -ForegroundColor Cyan
  Write-Host "Testing at $count followers" -ForegroundColor Cyan
  Write-Host "=========================================" -ForegroundColor Cyan
  
  # 1. Seed followers
  Write-Host "Step 1: Seeding $count followers..." -ForegroundColor Yellow
  .\loadtest\fanout\seed-followers.ps1 -FollowerCount $count -AuthorId $WHALE_USER_ID
  
  # 2. รอให้ระบบพร้อม (เผื่อมี indexing หรือ cache)
  Start-Sleep -Seconds 3
  
  # 3. รัน k6
  Write-Host "Step 2: Running k6 test..." -ForegroundColor Yellow
  $summary = "k6-fanout-$count.json"
  
  k6 run --quiet `
    -e WHALE_TOKEN=$WHALE_TOKEN `
    -e FOLLOWER_TOKEN=$FOLLOWER_TOKEN `
    -e ROUNDS=$Rounds `
    --summary-export=$summary `
    loadtest/fanout/fanout-curve-load.js | Out-Host
  
  # 4. ดึงผลลัพธ์
  $s = Get-Content $summary -Raw | ConvertFrom-Json
  
  $prop = $s.metrics.fanout_propagation_ms
  $row = [pscustomobject]@{
    followers           = $count
    rounds              = $Rounds
    propagation_avg_ms  = [math]::Round([double]$prop.values.avg, 2)
    propagation_p95_ms  = [math]::Round([double]$prop.values.'p(95)', 2)
    propagation_p99_ms  = [math]::Round([double]$prop.values.'p(99)', 2)
    propagation_max_ms  = [math]::Round([double]$prop.values.max, 2)
    fanout_failures     = [int]$s.metrics.fanout_failures.values.count
  }
  
  $row | Export-Csv -Path $Out -Append -NoTypeInformation -Encoding utf8
  $row | Format-List | Out-Host
  
  # 5. พักเครื่อง (กันความร้อนสะสม)
  Write-Host "Cooldown 15 seconds before next round..." -ForegroundColor DarkGray
  Start-Sleep -Seconds 15
}

Write-Host ""
Write-Host "Done. Results at $Out" -ForegroundColor Green
Import-Csv $Out | Format-Table -AutoSize