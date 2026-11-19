# Prepare actors for fan-out testing:
#   1. Create "whale author"     (user with many followers)
#   2. Create "sentinel follower" (user to read feed for timing)
#   3. Have follower follow whale
#   4. Save all tokens to fanout-actors.json
#
# Before running:
#   1. Set $env:THROTTLE_REGISTER_LIMIT / $env:THROTTLE_LOGIN_LIMIT
#      then start all services (same as your previous script)
#   2. Edit Get-FollowUrl() to match actual endpoint in project

param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$Out = 'fanout-actors.json'
)

$ErrorActionPreference = 'Stop'

# ================================================================
# MUST EDIT THIS!
# Check the project code for "follow" endpoint
# Possible examples:
#   - "$BaseUrl/users/$followingId/follow"
#   - "$BaseUrl/follow/$followingId"
#   - "$BaseUrl/follows" (POST body: { followingId: ... })
#
# How to find: In project, run
#   grep -r "follow" apps --include="*.controller.ts"
# ================================================================
function Get-FollowUrl([string]$followingId) {
  return "$BaseUrl/follows/$followingId"
}

function Register-And-Login([string]$suffix) {
  Write-Host "Creating actor: $suffix ..." -ForegroundColor Cyan

  # ---------- Register ----------
  $regBody = @{
    username = "fanout_$suffix"
    email    = "fanout_$suffix@example.com"
    password = 'password123'
  } | ConvertTo-Json

  try {
    $reg = Invoke-RestMethod -Uri "$BaseUrl/auth/register" -Method Post -Body $regBody -ContentType 'application/json'
    Write-Host "  Register successful" -ForegroundColor DarkGray
  } catch {
    $errMsg = "Register failed for $suffix : $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
      $errMsg = $errMsg + " | " + $_.ErrorDetails.Message
    }
    throw $errMsg
  }

  # ---------- Login ----------
  $loginBody = @{
    usernameOrEmail = "fanout_$suffix@example.com"
    password        = 'password123'
  } | ConvertTo-Json

  try {
    $login = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method Post -Body $loginBody -ContentType 'application/json'
  } catch {
    $errMsg = "Login failed for $suffix : $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
      $errMsg = $errMsg + " | " + $_.ErrorDetails.Message
    }
    throw $errMsg
  }

  # ---------- Extract token ----------
  $token = $login.data.accessToken
  if (-not $token) { $token = $login.data.access_token }
  if (-not $token) {
    throw "Token not found in login response"
  }

  # ---------- Decode userId from JWT ----------
  $payloadB64 = $token.Split('.')[1]
  $payloadB64 = $payloadB64.Replace('-', '+').Replace('_', '/')
  $pad = $payloadB64.Length % 4
  if ($pad -gt 0) { $payloadB64 += ('=' * (4 - $pad)) }

  $payloadJson = [Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String($payloadB64)
  )
  $userId = ($payloadJson | ConvertFrom-Json).sub

  return @{ token = $token; userId = $userId }
}

# ================================================================
# Step 1: Create actors
# ================================================================
$runId    = Get-Date -Format 'yyyyMMddHHmmss'
$whale    = Register-And-Login "whale_$runId"
$follower = Register-And-Login "follower_$runId"

Write-Host ""
Write-Host "Whale author : $($whale.userId)"    -ForegroundColor Yellow
Write-Host "Sentinel     : $($follower.userId)" -ForegroundColor Yellow

# ================================================================
# Step 2: Have follower follow whale
# ================================================================
$followUrl = Get-FollowUrl $whale.userId
Write-Host ""
Write-Host "Follower following at: $followUrl" -ForegroundColor Cyan

try {
  $followRes = Invoke-RestMethod -Uri $followUrl -Method Post -Headers @{ Authorization = "Bearer $($follower.token)" }
  Write-Host "Follow successful" -ForegroundColor Green
} catch {
  $errMsg = "Follow failed: $($_.Exception.Message)"
  if ($_.ErrorDetails.Message) {
    $errMsg = $errMsg + " | " + $_.ErrorDetails.Message
  }
  $errMsg = $errMsg + " | Verify Get-FollowUrl() returns correct URL for your project"
  throw $errMsg
}

# ================================================================
# Step 3: Save results to file
# ================================================================
$actors = [ordered]@{
  whaleUserId    = $whale.userId
  whaleToken     = $whale.token
  followerUserId = $follower.userId
  followerToken  = $follower.token
  createdAt      = (Get-Date).ToString('o')
}
$actors | ConvertTo-Json | Set-Content -Path $Out -Encoding utf8

Write-Host ""
Write-Host "Done! Actors saved to $Out" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. .\loadtest\fanout\seed-followers.ps1 -FollowerCount 100 -AuthorId $($whale.userId)"
Write-Host "  2. .\loadtest\fanout\run-fanout-curve.ps1"