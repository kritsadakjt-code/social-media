# Verify like-counter consistency after a load test (run when no traffic is flowing).
#
# Compares three numbers for ONE post:
#   1) posts.likes          -> counter persisted in MongoDB (what batching/direct writes produce)
#   2) likes collection     -> number of (postId,userId) documents = ground truth of who likes it now
#   3) Redis likes:post:<id> -> counter served to API responses
# Expected after the queue is drained: all three equal.
#
# Usage:
#   .\loadtest\check-likes.ps1                      # checks the most recent "ab seed" post
#   .\loadtest\check-likes.ps1 -PostId <id>         # checks a specific post (SEED_POST_ID from k6 output)
#
# Defaults match .env.example (db post_service, user admin / pass changeme). Override with parameters.

param(
  [string]$PostId = '6ad87fa4fe8084c0e63e16d3',
  [string]$MongoUser = 'admin',
  [string]$MongoPass = 'mongo1234',
  [string]$RedisPass = 'redis1234',
  [string]$Db = 'social_posts_db'
)

$ErrorActionPreference = 'Stop'

function Wait-QueueEmpty {
  for ($i = 0; $i -lt 60; $i++) {
    $n = [int](docker exec social_redis redis-cli -a $RedisPass --no-auth-warning LLEN likes:batch:queue)
    if ($n -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  # queue can be empty while the last bulkWrite is still running; wait one more cron tick
  Start-Sleep -Seconds 7
}

Write-Host 'Waiting for like batch queue to drain...'
Wait-QueueEmpty

$idJs = if ($PostId) { "'$PostId'" } else { 'null' }
$js = "db = db.getSiblingDB('$Db'); const wantedId = $idJs; " +
  "const p = wantedId ? db.posts.findOne({_id: ObjectId(wantedId)}) : db.posts.find({content: /^ab seed/}).sort({createdAt: -1}).limit(1).toArray()[0]; " +
  "if (!p) { print(JSON.stringify({error: 'post not found'})); } " +
  "else { print(JSON.stringify({postId: p._id.toString(), postLikes: p.likes, likeDocs: db.likes.countDocuments({postId: p._id.toString()})})); }"

$raw = docker exec social_mongodb mongosh -u $MongoUser -p $MongoPass --authenticationDatabase admin --quiet --eval $js
$m = $raw | ConvertFrom-Json
if ($m.error) { Write-Error $m.error }

$redisRaw = docker exec social_redis redis-cli -a $RedisPass --no-auth-warning GET "likes:post:$($m.postId)"
$redisCount = $null
if (-not [string]::IsNullOrWhiteSpace($redisRaw)) { $redisCount = [int]$redisRaw }

$mongoOk = ($m.postLikes -eq $m.likeDocs)
$redisOk = ($null -ne $redisCount) -and ($redisCount -eq $m.likeDocs)

[pscustomobject]@{
  postId                = $m.postId
  likeDocs_truth        = $m.likeDocs
  mongo_posts_likes     = $m.postLikes
  redis_counter         = if ($null -eq $redisCount) { 'missing' } else { $redisCount }
  mongo_matches_truth   = $mongoOk
  redis_matches_truth   = $redisOk
} | Format-List

if ($mongoOk -and $redisOk) {
  Write-Host 'PASS: counters consistent with ground truth' -ForegroundColor Green
  exit 0
}

if ($m.postLikes -lt $m.likeDocs) { Write-Host 'FAIL: Mongo counter is LOWER than truth -> lost counter updates' -ForegroundColor Red }
elseif ($m.postLikes -gt $m.likeDocs) { Write-Host 'FAIL: Mongo counter is HIGHER than truth -> double-counted updates' -ForegroundColor Red }
if (-not $redisOk) { Write-Host 'NOTE: Redis counter differs from truth (or key missing/expired)' -ForegroundColor Yellow }
exit 1