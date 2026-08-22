export const ALLOWED_ORIGINS = [
  'https://www.m-kairaku.com',
  'https://m-kairaku.com',
  'https://www.iyashitakute.com',
  'https://iyashitakute.com',
]

export function corsHeaders(origin: string | null, methods = 'GET, OPTIONS'): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
