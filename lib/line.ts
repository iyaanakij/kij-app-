/**
 * LINE Messaging API ユーティリティ
 */

export async function sendLineMessage(lineUserId: string, message: string): Promise<boolean> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN
  if (!token) return false

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: message }],
    }),
  })
  return res.ok
}

export function getLineLoginUrl(redirectPath: 'login' | 'link'): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/line/callback`,
    state: redirectPath,
    scope: 'profile openid',
  })
  return `https://access.line.me/oauth2/v2.1/authorize?${params}`
}
