import { supabase } from './supabase'

export type UserRole = 'staff' | 'cast'

export interface UserInfo {
  id: string
  email: string
  role: UserRole
  staff_id: number | null
}

export async function getCurrentUser(): Promise<UserInfo | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_roles')
    .select('role, staff_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null

  return {
    id: user.id,
    email: user.email ?? '',
    role: data.role as UserRole,
    staff_id: data.staff_id,
  }
}
