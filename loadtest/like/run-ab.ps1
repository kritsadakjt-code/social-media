# รัน A/B: batch vs direct สลับกัน หลายรอบ แล้วเก็บผลลง ab-results.csv
#
# ก่อนรัน:
#   1) ตั้ง $env:THROTTLE_REGISTER_LIMIT / $env:THROTTLE_LOGIN_LIMIT แล้ว start ทุก service
#      (ดูเหตุผลใน auth.controller.ts) และ docker-compose up -d ให้ container ขึ้นครบ
#   2) ติดตั้ง k6 แล้ว
# รัน:
#   .\loadtest\run-ab.ps1 -Rate 300 -Duration 60s -Rounds 3
# ถ้า password ไม่ใช่ค่า default ใน .env ให้ส่ง -MongoPass / -RedisPass

param(
  [int]$Rate = 300,
  [string]$Duration = '60s',
  [int]$PoolSize = 200,
  [int]$Rounds = 3,
  [string]$MongoUser = 'admin',
  [string]$MongoPass = 'mongo1234',
  [string]$RedisPass = 'redis1234',
  [string]$Out = 'ab-results.csv'
)

$ErrorActionPreference = 'Stop'

function Set-Mode([string]$mode) {
  docker exec social_redis redis-cli -a $RedisPass --no-auth-warning SET config:like_write_mode $mode | Out-Null
  Start-Sleep -Seconds 2   # service cache ค่าโหมดไว้ 1 วิ
}

function Wait-QueueEmpty {
  for ($i = 0; $i -lt 30; $i++) {
    $n = [int](docker exec social_redis redis-cli -a $RedisPass --no-auth-warning LLEN likes:batch:queue)
    if ($n -eq 0) { return }
    Start-Sleep -Seconds 1
  }
  Write-Warning 'likes:batch:queue ยังไม่ว่างหลังรอ 30 วิ'
}

function Get-OpCounters {
  $json = docker exec social_mongodb mongosh -u $MongoUser -p $MongoPass --authenticationDatabase admin --quiet --eval 'JSON.stringify(db.serverStatus().opcounters)'
  return ($json | ConvertFrom-Json)
}

function Get-Val($metric, [string]$key) {
  if ($null -eq $metric) { return 0 }
  $v = if ($metric.values) { $metric.values } else { $metric }
  $x = $v.$key
  if ($null -eq $x) { return 0 }
  return [double]$x
}

function Invoke-One([string]$mode, [int]$round, [bool]$record) {
  Write-Host "=== round $round mode=$mode ===" -ForegroundColor Cyan
  Set-Mode $mode
  Wait-QueueEmpty
  $before = Get-OpCounters

  $summary = "k6-summary-$mode-$round.json"
  k6 run --quiet -e RATE=$Rate -e DURATION=$Duration -e POOL_SIZE=$PoolSize `
    --summary-export=$summary loadtest/like/ab-like-load.js | Out-Host

  Start-Sleep -Seconds 12   # รอให้ aggregator flush ครบ (cron ทุก 5 วิ)
  Wait-QueueEmpty
  $after = Get-OpCounters
  if (-not $record) { return }

  $s = Get-Content $summary -Raw | ConvertFrom-Json
  $lat = $s.metrics.like_latency
  $row = [pscustomobject]@{
    round          = $round
    mode           = $mode
    rate_target    = $Rate
    http_reqs      = [double](Get-Val $s.metrics.http_reqs 'count')
  failed         = [double](Get-Val $s.metrics.failed_requests 'count')
  like_avg_ms    = [math]::Round((Get-Val $lat 'avg'), 2)
  like_p95_ms    = [math]::Round((Get-Val $lat 'p(95)'), 2)
  like_p99_ms    = [math]::Round((Get-Val $lat 'p(99)'), 2)
  like_max_ms    = [math]::Round((Get-Val $lat 'max'), 2)
  mongo_updates  = [double]$after.update.low - [double]$before.update.low
  mongo_inserts  = [double]$after.insert.low - [double]$before.insert.low
  mongo_commands = [double]$after.command.low - [double]$before.command.low
  }
  $row | Export-Csv -Path $Out -Append -NoTypeInformation -Encoding utf8
  $row | Format-List | Out-Host
}

if (Test-Path $Out) { Remove-Item $Out }

# warm-up 1 รอบ ไม่บันทึก (JIT, connection pool, cache เย็น)
Invoke-One 'batch' 0 $false
# Invoke-One 'batch' 0 $false

for ($r = 1; $r -le $Rounds; $r++) {
  # สลับลำดับทุกรอบ กัน bias จากลำดับ/เครื่องร้อน
  $order = if ($r % 2 -eq 1) { @('batch', 'direct') } else { @('direct', 'batch') }
  foreach ($m in $order) { Invoke-One $m $r $true }
}

Set-Mode 'batch'   # คืนค่า default
Write-Host "`nเสร็จแล้ว ผลอยู่ที่ $Out" -ForegroundColor Green
Import-Csv $Out | Format-Table -AutoSize