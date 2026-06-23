#!/usr/bin/env node
// One-time script to get OAuth2 refresh token for GA4/Search Console API
// Run: node scripts/get-oauth-token.js

const { createServer } = require('http')
const { readFileSync } = require('fs')
const { execSync } = require('child_process')
const path = require('path')

const CREDENTIALS_PATH = path.join(process.env.HOME, 'Desktop', 'KIJ', 'secrets', 'client_secret_294178867207-7imh3o41bdl5uoan5j36m6vddcf653m7.apps.googleusercontent.com.json')

const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'))
const { client_id, client_secret } = creds.installed

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
].join(' ')

const REDIRECT_URI = 'http://localhost:3333'

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(client_id)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`

console.log('\n=== Google OAuth2 認証 ===')
console.log('ブラウザで以下のURLを開いてください:\n')
console.log(authUrl)
console.log('\n（自動でブラウザが開きます）\n')

try { execSync(`open "${authUrl}"`) } catch (e) {}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  const code = url.searchParams.get('code')

  if (!code) {
    res.end('No code received')
    return
  }

  res.end('<html><body><h2>認証成功！ターミナルを確認してください。</h2></body></html>')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (tokens.error) {
    console.error('エラー:', tokens)
    process.exit(1)
  }

  console.log('\n=== トークン取得成功 ===')
  console.log('以下の値をVPSの設定ファイルに保存してください:\n')
  console.log(`GOOGLE_CLIENT_ID=${client_id}`)
  console.log(`GOOGLE_CLIENT_SECRET=${client_secret}`)
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
  console.log('\n')

  server.close()
  process.exit(0)
})

server.listen(3333, () => {
  console.log('ローカルサーバー起動中 (port 3333)... ブラウザで認証してください')
})
