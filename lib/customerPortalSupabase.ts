// マイページアプリ用の別Supabaseプロジェクトへの管理画面用クライアント。
// kij-app自身のSupabase（NEXT_PUBLIC_SUPABASE_URL等）とは別プロジェクト。
// kij-app（内部・Cookieゲート済み）は信頼される側として、このservice_role keyを保持してよい。
import { createClient } from '@supabase/supabase-js'

export function getCustomerPortalSupabase() {
  const url = process.env.CUSTOMER_PORTAL_SUPABASE_URL
  const key = process.env.CUSTOMER_PORTAL_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}
