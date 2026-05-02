import { NextResponse } from 'next/server'

const GH_PAT  = process.env.GH_PAT   // GitHub Personal Access Token (repo scope)
const GH_REPO = process.env.GH_REPO  // e.g. "iyaanakij/kij-app-"

export async function POST() {
  if (!GH_PAT || !GH_REPO) {
    return NextResponse.json(
      { error: 'GH_PAT / GH_REPO が未設定です（Vercel環境変数を確認）' },
      { status: 500 }
    )
  }

  const res = await fetch(`https://api.github.com/repos/${GH_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'shift-sync' }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json(
      { error: `GitHub API error (${res.status}): ${text}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
