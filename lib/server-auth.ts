import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function requireAuth(request: Request): Promise<{ error: NextResponse } | null> {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  // VPSからのサーバー間通信はSYNC_SECRETで認証
  if (token === process.env.SYNC_SECRET) return null

  // ブラウザからの呼び出しはSupabaseセッショントークンで認証
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: roleData } = await adminSupabase
    .from('user_roles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (roleData?.role !== 'staff') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return null
}

// cast または staff どちらでも通す（写メ日記配信など）
export async function requireAuthAny(request: Request): Promise<{ error: NextResponse } | null> {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  if (token === process.env.SYNC_SECRET) return null

  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return null
}
