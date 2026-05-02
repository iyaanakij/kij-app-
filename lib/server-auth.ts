import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type ServerRole = 'staff' | 'cast'

export interface ServerUser {
  id: string
  role: ServerRole
  staff_id: number | null
}

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
}

export async function getServerUser(
  req: Request,
  adminSupabase: SupabaseClient = createAdminClient(),
): Promise<ServerUser | null> {
  const token = bearerToken(req)
  if (!token) return null

  const { data: { user } } = await adminSupabase.auth.getUser(token)
  if (!user) return null

  const { data: role } = await adminSupabase
    .from('user_roles')
    .select('role, staff_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!role || (role.role !== 'staff' && role.role !== 'cast')) return null

  return {
    id: user.id,
    role: role.role,
    staff_id: role.staff_id,
  }
}

export async function requireStaffUser(
  req: Request,
  adminSupabase: SupabaseClient = createAdminClient(),
): Promise<ServerUser | null> {
  const user = await getServerUser(req, adminSupabase)
  return user?.role === 'staff' ? user : null
}

export function hasCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}
