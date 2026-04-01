import { NextResponse } from 'next/server'

export async function GET() {
  const url = 'https://www.cityheaven.net/chiba/A1202/A120201/anappu_nishi/attend/'
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible)', 'Cookie': 'nenrei=y' },
  })
  const html = await res.text()
  const shukkin = (html.match(/shukkin_list/g) ?? []).length
  const topbox = (html.match(/topbox/g) ?? []).length
  const week = (html.match(/class="week"/g) ?? []).length
  return NextResponse.json({
    status: res.status,
    length: html.length,
    shukkin_list: shukkin,
    topbox,
    week,
    sample: html.slice(0, 300),
  })
}
