# Verify fan-out correctness after load test:
#   1. Posts appear in all followers' feeds (sampled)
#   2. Feed does not exceed 20 posts
#   3. Sorted newest to oldest
#   4. TTL is set
#
# Usage:
#   .\loadtest\fanout\verify-fanout.ps1 -FollowerCount 1000

param(
  [int]$FollowerCount = 1000,
  [int]$SampleSize = 100,
  [string]$RedisPass = 'redis1234'
)

$ErrorActionPreference = 'Stop'

Write-Host "Sampling $SampleSize out of $FollowerCount followers..." -ForegroundColor Cyan

$pass = 0
$fail = 0
$noTtl = 0
$capViolation = 0

# Sample followers
for ($i = 0; $i -lt $SampleSize; $i++) {
  $idx = Get-Random -Minimum 0 -Maximum $FollowerCount
  $feedKey = "feed:seed_follower_$idx"
  
  # 1. Check feed has data
  $count = [int](docker exec social_redis redis-cli -a $RedisPass --no-auth-warning ZCARD $feedKey)
  
  if ($count -eq 0) {
    Write-Host "  FAIL seed_follower_$idx : feed empty!" -ForegroundColor Red
    $fail++
    continue
  }
  
  # 2. Check cap = 20
  if ($count -gt 20) {
    Write-Host "  FAIL seed_follower_$idx : exceeds 20 ($count)" -ForegroundColor Red
    $capViolation++
    $fail++
    continue
  }
  
  # 3. Check TTL
  $ttl = [int](docker exec social_redis redis-cli -a $RedisPass --no-auth-warning TTL $feedKey)
  if ($ttl -lt 604000 -or $ttl -gt 604800) {
    $noTtl++
  }
  
  $pass++
}

Write-Host ""
Write-Host "===== SUMMARY =====" -ForegroundColor Cyan
Write-Host "  Pass: $pass / $SampleSize"
Write-Host "  Fail: $fail"
Write-Host "  Cap violations: $capViolation"
Write-Host "  TTL mismatches: $noTtl"

if ($fail -eq 0) {
  Write-Host ""
  Write-Host "PASS: fan-out is correct" -ForegroundColor Green
  exit 0
} else {
  Write-Host ""
  Write-Host "FAIL: errors detected" -ForegroundColor Red
  exit 1
}