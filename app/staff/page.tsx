'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Staff, STORES, IYASHI_STORES, AREAS, getStaffBrand, StaffBrand } from '@/lib/types'
import PublishRuleMatrix, { RuleRow } from '@/app/components/PublishRuleMatrix'

interface StaffWithStores extends Staff {
  storeIds: number[]
}

type PublishSummary = {
  cs3_cast_id: string
  enabled_count: number
  has_cp4: boolean
  has_venrey: boolean
  warning_count: number
  all_disabled_with_ids: boolean
  e_enabled_count: number
  m_enabled_count: number
}

type OnboardingInfo = {
  id: number
  brand: string
  area_id: number
}

type OnboardingJob = { job_type: string; status: string }
type SubmissionInfo = { id: number; brand: string; area_id: number; jobs: OnboardingJob[] }

type Cs3CastCandidate = {
  cs3_cast_id: string
  cast_name: string
  shopIds: string[]
}

const CS3_SHOP_ID_TO_AREA: Record<string, string> = {
  '111701': '西船橋',
  '111702': '成田',
  '111703': '千葉',
  '111704': '錦糸町',
}

type MergeCandidate = {
  id: number
  name: string
  store_ids: number[]
}

interface DeliveryTarget {
  id: string
  staff_id: number
  media_name: string
  delivery_type: string
  destination: string
  enabled: boolean
}

const emptyStaff = (): Partial<StaffWithStores> => ({
  name: '',
  join_date: '',
  notes: '',
  storeIds: [],
})

export default function StaffPage() {
  useEffect(() => { document.title = 'スタッフ一覧 | KIJ管理' }, [])
  const [pendingOnboardingCount, setPendingOnboardingCount] = useState(0)
  const [staffList, setStaffList] = useState<StaffWithStores[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<StaffWithStores>>(emptyStaff())
  const [saving, setSaving] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [accountStaff, setAccountStaff] = useState<StaffWithStores | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountLineId, setAccountLineId] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMessage, setAccountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [accountExists, setAccountExists] = useState(false)
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountUserId, setAccountUserId] = useState<string | null>(null)
  const [registeredStaffIds, setRegisteredStaffIds] = useState<Set<number>>(new Set())
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<number | null>(null)
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<StaffBrand | null>(null)
  const [cs3SearchQuery, setCs3SearchQuery] = useState('')
  const [cs3SearchResults, setCs3SearchResults] = useState<Cs3CastCandidate[]>([])
  const [cs3Searching, setCs3Searching] = useState(false)
  const [cs3Linking, setCs3Linking] = useState(false)
  const [cs3LinkError, setCs3LinkError] = useState<string | null>(null)
  const [mergeSearchQuery, setMergeSearchQuery] = useState('')
  const [mergeSearchResults, setMergeSearchResults] = useState<MergeCandidate[]>([])
  const [mergeSearching, setMergeSearching] = useState(false)
  const [mergeSaving, setMergeSaving] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [deliveryTargets, setDeliveryTargets] = useState<DeliveryTarget[]>([])
  const [newTargetMediaName, setNewTargetMediaName] = useState('')
  const [newTargetDestination, setNewTargetDestination] = useState('')
  const [deliverySaving, setDeliverySaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [publishSummary, setPublishSummary] = useState<Map<string, PublishSummary>>(new Map())
  const [publishRules, setPublishRules] = useState<RuleRow[] | null>(null)
  const [publishLoading, setPublishLoading] = useState(false)
  const [onboardingMap, setOnboardingMap] = useState<Map<number, OnboardingInfo>>(new Map())
  const [surveyModalOpen, setSurveyModalOpen] = useState(false)
  const [surveyModalStaff, setSurveyModalStaff] = useState<StaffWithStores | null>(null)
  const [surveySubmissions, setSurveySubmissions] = useState<SubmissionInfo[]>([])
  const [surveyModalLoading, setSurveyModalLoading] = useState(false)
  const [surveyRegistering, setSurveyRegistering] = useState<string | null>(null)

  const fetchPublishSummary = useCallback(async () => {
    const res = await fetch('/api/admin/publish-rules/summary')
    if (!res.ok) return
    const json = await res.json()
    const map = new Map<string, PublishSummary>()
    for (const s of json.summary ?? []) map.set(s.cs3_cast_id, s)
    setPublishSummary(map)
  }, [])

  const fetchPublishRules = useCallback(async (cs3CastId: string) => {
    setPublishLoading(true)
    setPublishRules(null)
    const res = await fetch(`/api/admin/publish-rules/detail?cs3_cast_id=${encodeURIComponent(cs3CastId)}`)
    if (res.ok) {
      const json = await res.json()
      setPublishRules(json.rules ?? [])
    }
    setPublishLoading(false)
  }, [])

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    const [{ data: staffData }, { data: staffStores }, { data: roles }] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase.from('staff_stores').select('*'),
      supabase.from('user_roles').select('staff_id').eq('role', 'cast'),
    ])

    if (staffData) {
      const enriched: StaffWithStores[] = staffData.map(s => ({
        ...s,
        storeIds: (staffStores ?? []).filter(ss => ss.staff_id === s.id).map(ss => ss.store_id),
      }))
      setStaffList(enriched)
    }
    setRegisteredStaffIds(new Set((roles ?? []).map((r: { staff_id: number }) => r.staff_id)))
    setLoading(false)
  }, [])

  useEffect(() => { fetchStaff() }, [fetchStaff])
  useEffect(() => { fetchPublishSummary() }, [fetchPublishSummary])
  useEffect(() => {
    fetch('/api/admin/onboarding/pending-count')
      .then(r => r.json())
      .then(d => setPendingOnboardingCount(d.count ?? 0))
      .catch(() => {})
  }, [])
  useEffect(() => {
    fetch('/api/admin/onboarding/staff-map')
      .then(r => r.json())
      .then((raw: Record<string, OnboardingInfo>) => {
        const map = new Map<number, OnboardingInfo>()
        for (const [k, v] of Object.entries(raw)) map.set(Number(k), v)
        setOnboardingMap(map)
      })
      .catch(() => {})
  }, [])

  async function openSurveyModal(s: StaffWithStores) {
    setSurveyModalStaff(s)
    setSurveySubmissions([])
    setSurveyModalLoading(true)
    setSurveyModalOpen(true)
    const res = await fetch(`/api/admin/staff/${s.id}/onboarding`)
    if (res.ok) {
      const json = await res.json()
      setSurveySubmissions(json.submissions ?? [])
    }
    setSurveyModalLoading(false)
  }

  async function registerArea(staffId: number, sourceSubmissionId: number, targetAreaId: number) {
    const key = `${sourceSubmissionId}-${targetAreaId}`
    setSurveyRegistering(key)
    const res = await fetch(`/api/admin/staff/${staffId}/register-area`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_submission_id: sourceSubmissionId, target_area_id: targetAreaId }),
    })
    const json = await res.json()
    if (!res.ok) {
      alert(json.error ?? '登録に失敗しました')
    } else {
      // 最新データを再取得
      const r2 = await fetch(`/api/admin/staff/${staffId}/onboarding`)
      if (r2.ok) setSurveySubmissions((await r2.json()).submissions ?? [])
      fetchStaff()
    }
    setSurveyRegistering(null)
  }

  async function openEdit(s: StaffWithStores) {
    setEditing({ ...s })
    setNewTargetMediaName('')
    setNewTargetDestination('')
    const { data } = await supabase
      .from('staff_diary_delivery_targets')
      .select('*')
      .eq('staff_id', s.id)
      .order('created_at')
    setDeliveryTargets(data ?? [])
    if (s.cs3_cast_id) fetchPublishRules(s.cs3_cast_id)
    else setPublishRules(null)
    setCs3SearchQuery('')
    setCs3SearchResults([])
    setCs3LinkError(null)
    setMergeSearchQuery('')
    setMergeSearchResults([])
    setMergeError(null)
    setModalOpen(true)
  }

  async function addDeliveryTarget(staffId: number) {
    if (!newTargetMediaName.trim() || !newTargetDestination.trim()) return
    setDeliverySaving(true)
    const { data } = await supabase
      .from('staff_diary_delivery_targets')
      .insert({ staff_id: staffId, media_name: newTargetMediaName.trim(), destination: newTargetDestination.trim(), delivery_type: 'email', enabled: true })
      .select()
      .single()
    if (data) setDeliveryTargets(prev => [...prev, data])
    setNewTargetMediaName('')
    setNewTargetDestination('')
    setDeliverySaving(false)
  }

  async function toggleDeliveryTarget(target: DeliveryTarget) {
    await supabase.from('staff_diary_delivery_targets').update({ enabled: !target.enabled }).eq('id', target.id)
    setDeliveryTargets(prev => prev.map(t => t.id === target.id ? { ...t, enabled: !t.enabled } : t))
  }

  async function deleteDeliveryTarget(id: string) {
    const { error } = await supabase.from('staff_diary_delivery_targets').delete().eq('id', id)
    if (error) { alert(`削除失敗: ${error.message}`); return }
    setDeliveryTargets(prev => prev.filter(t => t.id !== id))
  }

  async function saveStaff() {
    if (!editing.name?.trim()) { alert('名前を入力してください'); return }
    setSaving(true)

    const payload = {
      name: editing.name,
      join_date: editing.join_date || null,
      notes: editing.notes || null,
    }

    if (editing.id) {
      await supabase.from('staff').update(payload).eq('id', editing.id)
      await supabase.from('staff_stores').delete().eq('staff_id', editing.id)
      const storeIds = editing.storeIds ?? []
      if (storeIds.length > 0) {
        await supabase.from('staff_stores').insert(storeIds.map(sid => ({ staff_id: editing.id!, store_id: sid })))
      }
    }

    setSaving(false)
    setModalOpen(false)
    fetchStaff()
  }

  // CS3キャストID 手動紐付け: publish_rules（cast-list-latest.jsonから1時間毎に補完される全CS3在籍キャストのミラー）を名前検索
  async function searchCs3Casts() {
    const q = cs3SearchQuery.trim()
    if (!q) { setCs3SearchResults([]); return }
    setCs3Searching(true)
    setCs3LinkError(null)
    const { data, error } = await supabase
      .from('publish_rules')
      .select('cs3_cast_id, cast_name, source_shop_id')
      .ilike('cast_name', `%${q}%`)
      .limit(300)
    setCs3Searching(false)
    if (error) { setCs3LinkError(`検索失敗: ${error.message}`); return }
    const byId = new Map<string, Cs3CastCandidate>()
    for (const row of data ?? []) {
      const existing = byId.get(row.cs3_cast_id)
      if (existing) {
        if (!existing.shopIds.includes(row.source_shop_id)) existing.shopIds.push(row.source_shop_id)
      } else {
        byId.set(row.cs3_cast_id, { cs3_cast_id: row.cs3_cast_id, cast_name: row.cast_name, shopIds: [row.source_shop_id] })
      }
    }
    setCs3SearchResults(Array.from(byId.values()))
  }

  async function linkCs3Cast(castId: string, castName: string) {
    if (!editing.id) return
    setCs3Linking(true)
    setCs3LinkError(null)
    const { error } = await supabase.from('staff').update({ cs3_cast_id: castId }).eq('id', editing.id)
    setCs3Linking(false)
    if (error) {
      if (error.code === '23505') {
        setCs3LinkError(`このCS3 ID(${castId} / ${castName})は既に別のキャストに紐付いています`)
      } else {
        setCs3LinkError(`紐付け失敗: ${error.message}`)
      }
      return
    }
    setEditing(p => ({ ...p, cs3_cast_id: castId }))
    setCs3SearchQuery('')
    setCs3SearchResults([])
    fetchPublishRules(castId)
    fetchStaff()
  }

  async function unlinkCs3Cast() {
    if (!editing.id) return
    if (!confirm('CS3 IDの紐付けを解除しますか？')) return
    setCs3Linking(true)
    setCs3LinkError(null)
    const { error } = await supabase.from('staff').update({ cs3_cast_id: null }).eq('id', editing.id)
    setCs3Linking(false)
    if (error) { setCs3LinkError(`解除失敗: ${error.message}`); return }
    setEditing(p => ({ ...p, cs3_cast_id: undefined }))
    setPublishRules(null)
    fetchStaff()
  }

  // 重複staff統合: 同一人物が別々にオンボーディング等で2件のstaffとして作成されてしまった場合に1件へまとめる
  async function searchMergeCandidates() {
    const q = mergeSearchQuery.trim()
    if (!q) { setMergeSearchResults([]); return }
    setMergeSearching(true)
    setMergeError(null)
    const res = await fetch(`/api/admin/staff/search?q=${encodeURIComponent(q)}`)
    const data = await res.json().catch(() => [])
    setMergeSearching(false)
    setMergeSearchResults((data as MergeCandidate[]).filter(c => c.id !== editing.id))
  }

  async function mergeStaff(sourceId: number, sourceName: string) {
    if (!editing.id) return
    if (!confirm(`「${sourceName}」(id=${sourceId}) を現在編集中の「${editing.name}」に統合します。\n統合元のシフト・予約・写メ日記等はすべて統合先へ移り、統合元staffは削除されます。元に戻せません。よろしいですか？`)) return
    setMergeSaving(true)
    setMergeError(null)
    const res = await fetch('/api/admin/staff/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId, target_id: editing.id }),
    })
    const data = await res.json().catch(() => ({}))
    setMergeSaving(false)
    if (!res.ok) { setMergeError(data.error ?? '統合に失敗しました'); return }
    setMergeSearchQuery('')
    setMergeSearchResults([])
    alert('統合が完了しました')
    const [{ data: fresh }, { data: freshStores }] = await Promise.all([
      supabase.from('staff').select('*').eq('id', editing.id).single(),
      supabase.from('staff_stores').select('store_id').eq('staff_id', editing.id),
    ])
    if (fresh) {
      await openEdit({ ...(fresh as StaffWithStores), storeIds: (freshStores ?? []).map(s => s.store_id) })
    }
    fetchStaff()
  }

  async function openAccountModal(s: StaffWithStores) {
    setAccountStaff(s)
    setAccountEmail('')
    setAccountPassword('')
    setAccountLineId('')
    setAccountMessage(null)
    setAccountExists(false)
    setAccountUserId(null)
    setAccountLoading(true)
    setAccountModalOpen(true)

    const { data } = await supabase
      .from('user_roles')
      .select('id, line_user_id')
      .eq('staff_id', s.id)
      .eq('role', 'cast')
      .maybeSingle()

    if (data) {
      setAccountExists(true)
      setAccountUserId(data.id)
      setAccountLineId(data.line_user_id ?? '')
    }
    setAccountLoading(false)
  }

  async function deleteAccount() {
    if (!accountStaff || !confirm(`${accountStaff.name} のアカウントを削除しますか？\nログインできなくなります。`)) return
    setAccountSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/staff/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ staff_id: accountStaff.id }),
    })
    const body = await res.json()
    if (!res.ok) {
      setAccountMessage({ type: 'error', text: `削除失敗: ${body.error}` })
    } else {
      setAccountExists(false)
      setAccountUserId(null)
      setAccountLineId('')
      setRegisteredStaffIds(prev => { const s = new Set(prev); s.delete(accountStaff.id); return s })
      setAccountMessage({ type: 'success', text: 'アカウントを削除しました' })
    }
    setAccountSaving(false)
  }

  async function resetLineId() {
    if (!accountStaff || !confirm(`${accountStaff.name} のLINE連携をリセットしますか？`)) return
    setAccountSaving(true)
    await supabase
      .from('user_roles')
      .update({ line_user_id: null })
      .eq('staff_id', accountStaff.id)
      .eq('role', 'cast')
    setAccountLineId('')
    setAccountMessage({ type: 'success', text: 'LINE連携をリセットしました' })
    setAccountSaving(false)
  }

  async function saveAccountInfo() {
    if (!accountStaff) return
    setAccountSaving(true)
    setAccountMessage(null)

    if (accountExists) {
      // 既存アカウント: LINE IDのみ更新
      const { error } = await supabase
        .from('user_roles')
        .update({ line_user_id: accountLineId.trim() || null })
        .eq('staff_id', accountStaff.id)
        .eq('role', 'cast')
      if (error) {
        setAccountMessage({ type: 'error', text: '更新に失敗しました' })
      } else {
        setAccountMessage({ type: 'success', text: 'LINE IDを更新しました' })
      }
    } else {
      // 新規アカウント作成
      if (!accountEmail || !accountPassword) {
        setAccountMessage({ type: 'error', text: 'メールとパスワードを入力してください' })
        setAccountSaving(false)
        return
      }
      const tempClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data, error } = await tempClient.auth.signUp({ email: accountEmail, password: accountPassword })
      if (error || !data.user) {
        setAccountMessage({ type: 'error', text: error?.message ?? 'アカウント作成に失敗しました' })
        setAccountSaving(false)
        return
      }
      await supabase.from('user_roles').upsert({
        id: data.user.id,
        role: 'cast',
        staff_id: accountStaff.id,
        ...(accountLineId.trim() ? { line_user_id: accountLineId.trim() } : {}),
      })
      setAccountExists(true)
      setRegisteredStaffIds(prev => new Set([...prev, accountStaff.id]))
      setAccountMessage({ type: 'success', text: 'アカウントを作成しました' })
    }
    setAccountSaving(false)
  }

  async function deleteStaff(id: number, name: string) {
    if (!confirm(`${name} を削除しますか？\nこのキャストのシフトと予約データも影響を受けます。`)) return
    const { error } = await supabase.from('staff').delete().eq('id', id)
    if (error) { alert(`削除失敗: ${error.message}`); return }
    fetchStaff()
  }

  function toggleStore(sid: number) {
    setEditing(prev => {
      const current = prev.storeIds ?? []
      if (current.includes(sid)) {
        return { ...prev, storeIds: current.filter(id => id !== sid) }
      } else {
        return { ...prev, storeIds: [...current, sid] }
      }
    })
  }

  const unassignedCount = staffList.filter(s => s.storeIds.length === 0).length

  const filteredStaff = staffList.filter(s => {
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    const brand = getStaffBrand(s.storeIds)
    if (selectedBrandFilter && brand !== selectedBrandFilter) return false
    if (selectedStoreFilter !== null) {
      // 地域フィルター: M性感・癒したくて両方の同地域をまとめて表示
      const mStore = STORES.find(st => st.id === selectedStoreFilter)
      const yStore = IYASHI_STORES.find(st => st.id === selectedStoreFilter - 4)
      const matchIds = [mStore?.id, yStore?.id].filter(Boolean) as number[]
      if (!matchIds.some(id => s.storeIds.includes(id))) return false
    }
    return true
  })

  return (
    <div className="p-3">
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-800">キャスト管理</h1>
            <Link
              href="/admin/onboarding"
              className="relative text-xs px-3 py-1 rounded-full bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-100 transition-colors font-medium inline-flex items-center gap-1.5"
            >
              入店アンケート管理
              {pendingOnboardingCount > 0 && (
                <span className="min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold leading-none">
                  {pendingOnboardingCount}
                </span>
              )}
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">全{staffList.length}名 / 表示{filteredStaff.length}名</p>
          {unassignedCount > 0 && (
            <p className="text-xs text-orange-600 font-medium mt-0.5">⚠ 店舗未設定 {unassignedCount}名（シフトが反映されません）</p>
          )}
        </div>
        {/* フィルター（1行） */}
        <div className="flex gap-1.5 mt-3 flex-wrap items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="名前で検索..."
            className="border border-gray-200 rounded-full px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white w-28"
          />
          <span className="text-gray-200 mx-0.5">|</span>
          {([null, 'both', 'M', 'Y'] as (StaffBrand | null)[]).map(brand => {
            const label = brand === null ? '全て' : brand === 'both' ? '共通' : brand === 'M' ? 'M性感' : '癒し'
            const count = brand === null ? staffList.length : staffList.filter(s => getStaffBrand(s.storeIds) === brand).length
            const active = selectedBrandFilter === brand
            const colorClass = brand === 'both'
              ? (active ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200')
              : brand === 'M'
              ? (active ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200')
              : brand === 'Y'
              ? (active ? 'bg-teal-600 text-white' : 'bg-teal-100 text-teal-700 hover:bg-teal-200')
              : (active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
            return (
              <button key={String(brand)} onClick={() => setSelectedBrandFilter(brand)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${colorClass}`}>
                {label}
                <span className={`px-1 rounded-full font-bold ${active ? 'bg-white/30' : 'bg-black/10'}`}>{count}</span>
              </button>
            )
          })}
          <span className="text-gray-200 mx-0.5">|</span>
          <button
            onClick={() => setSelectedStoreFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedStoreFilter === null && selectedBrandFilter !== null ? '' : selectedStoreFilter === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            全地域
          </button>
          {STORES.map(store => {
            const yId = store.id + 4
            const count = staffList.filter(s => s.storeIds.includes(store.id) || s.storeIds.includes(yId)).length
            const active = selectedStoreFilter === store.id
            return (
              <button key={store.id} onClick={() => setSelectedStoreFilter(active ? null : store.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {store.name}
                <span className={`px-1 rounded-full font-bold ${active ? 'bg-white/30' : 'bg-black/10'}`}>{count}</span>
              </button>
            )
          })}
        </div>
        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 font-medium select-none">操作ガイドを表示 ▾</summary>
          <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1.5 border border-gray-100">
            <p><span className="font-semibold text-orange-600">所属店舗の設定</span> — シフト表への自動反映に必須。未設定のままだとCS3で承認されてもシフト表に表示されません</p>
            <p><span className="font-semibold text-green-700">HP同期</span> — City Heavenからキャスト名を自動取得して登録・更新します（重複解消も自動実行）</p>
            <p><span className="font-semibold text-purple-700">アカウント</span> — キャストがシフト・写メ日記を確認するためのログインアカウントを発行します（LINE連携も管理）</p>
            <p><span className="font-semibold text-amber-700">編集</span> — 名前・入店日・所属店舗・写メ日記転送先を変更します</p>
            <p><span className="font-semibold text-red-600">削除</span> — キャストを完全削除します。シフト・予約データに影響するため慎重に使用してください</p>
          </div>
        </details>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500 animate-pulse">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="px-4 py-3 text-left font-semibold">名前</th>
                <th className="px-4 py-3 text-left font-semibold">入店日</th>
                <th className="px-4 py-3 text-left font-semibold">所属店舗</th>
                <th className="px-4 py-3 text-left font-semibold hidden sm:table-cell">登録状況</th>
                <th className="px-4 py-3 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-gray-400">
                    キャストが登録されていません
                  </td>
                </tr>
              )}
              {filteredStaff.map((s, i) => {
                const ps = s.cs3_cast_id ? publishSummary.get(s.cs3_cast_id) : undefined
                const ob = onboardingMap.get(s.id)
                return (
                <tr
                  key={s.id}
                  className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-blue-50 transition-colors`}
                >
                  <td className="px-4 py-3 font-bold text-gray-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.name}
                      {registeredStaffIds.has(s.id) && (
                        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">登録済</span>
                      )}
                      {!s.cs3_cast_id && (
                        <span className="bg-gray-100 text-gray-400 text-xs px-2 py-0.5 rounded-full">CS3未設定</span>
                      )}
                      {ps && ps.warning_count > 0 && ps.warning_count === ps.enabled_count && (
                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">⚠ 反映不可{ps.warning_count}件</span>
                      )}
                    </div>
                    {s.notes && <p className="text-xs text-gray-400 font-normal mt-0.5 truncate max-w-xs">{s.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">
                    {s.join_date ? s.join_date.replace(/-/g, '/') : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {s.storeIds.length === 0 ? (
                        <span className="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-medium border border-orange-200">⚠ 店舗未設定</span>
                      ) : (
                        s.storeIds.map(sid => {
                          const mStore = STORES.find(st => st.id === sid)
                          const yStore = IYASHI_STORES.find(st => st.id === sid)
                          if (mStore) return (
                            <span key={sid} className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-medium">{mStore.name}M</span>
                          )
                          if (yStore) return (
                            <span key={sid} className="bg-teal-100 text-teal-800 text-xs px-2.5 py-0.5 rounded-full font-medium">{yStore.name}E</span>
                          )
                          return null
                        })
                      )}
                    </div>
                  </td>
                  {/* 登録状況列: E/M別 */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {!s.cs3_cast_id ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : !ps ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <div className="flex gap-1.5 flex-wrap">
                        {!ps.has_cp4 && !ps.has_venrey ? (
                          <span className="bg-gray-100 text-gray-400 text-xs px-2 py-0.5 rounded-full">ID未登録</span>
                        ) : ps.all_disabled_with_ids ? (
                          <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">未反映</span>
                        ) : (
                          <>
                            {(ps.e_enabled_count > 0 || ps.m_enabled_count > 0) ? (
                              <>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ps.e_enabled_count > 0 ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'}`}>
                                  癒し {ps.e_enabled_count > 0 ? `${ps.e_enabled_count}件` : '—'}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ps.m_enabled_count > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                                  M性感 {ps.m_enabled_count > 0 ? `${ps.m_enabled_count}件` : '—'}
                                </span>
                              </>
                            ) : (
                              <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">未反映</span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex gap-1.5 justify-end items-center flex-wrap">
                      {ob && (
                        <button
                          onClick={() => openSurveyModal(s)}
                          title="アンケートデータをもとに他店舗へ反映"
                          className="px-3 py-1.5 rounded-lg bg-pink-100 hover:bg-pink-200 text-pink-700 text-xs font-medium transition-colors"
                        >
                          アンケート
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(s)}
                        title="名前・入店日・所属店舗・写メ日記転送先を編集"
                        className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-medium transition-colors"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => openAccountModal(s)}
                        title="キャスト用ログインアカウントの発行・LINE連携管理"
                        className="px-3 py-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-medium transition-colors"
                      >
                        アカウント
                      </button>
                      <button
                        onClick={() => deleteStaff(s.id, s.name)}
                        title="キャストを削除（シフト・予約データに影響します）"
                        className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 text-xs font-medium transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          {filteredStaff.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
              表示: <span className="font-bold text-gray-800">{filteredStaff.length}名</span>
              {selectedStoreFilter !== null && <span className="ml-2 text-gray-400">（全{staffList.length}名中）</span>}
            </div>
          )}
        </div>
      )}

      {/* アンケート他店舗反映モーダル */}
      {surveyModalOpen && surveyModalStaff && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="bg-gray-900 text-white px-5 py-4 rounded-t-xl flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-bold text-base">他店舗反映</h2>
                <p className="text-xs text-gray-400 mt-0.5">{surveyModalStaff.name} — アンケートデータをもとに登録</p>
              </div>
              <button onClick={() => setSurveyModalOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none transition-colors">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              {surveyModalLoading ? (
                <p className="text-sm text-gray-400 animate-pulse text-center py-6">読み込み中...</p>
              ) : surveySubmissions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">承認済みアンケートがありません</p>
              ) : (
                (['M', 'E'] as const).map(brand => {
                  const brandSubs = surveySubmissions.filter(s => s.brand === brand)
                  if (brandSubs.length === 0) return null
                  // ソースsubmission: CP4 or Venrey が succeeded のものを優先、なければ最初
                  const sourceSub = brandSubs.find(s => s.jobs.some(j => j.status === 'succeeded')) ?? brandSubs[0]
                  // 登録済みエリアのset
                  const registeredAreaIds = new Set(brandSubs.map(s => s.area_id))
                  const brandLabel = brand === 'M' ? 'M性感' : '癒したくて'
                  const brandColor = brand === 'M' ? 'text-red-700 bg-red-50 border-red-200' : 'text-teal-700 bg-teal-50 border-teal-200'
                  const btnColor = brand === 'M' ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'

                  return (
                    <div key={brand}>
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${brandColor} mb-3`}>
                        {brandLabel}データ
                      </div>
                      <div className="space-y-2">
                        {AREAS.map(area => {
                          const isRegistered = registeredAreaIds.has(area.id)
                          const key = `${sourceSub.id}-${area.id}`
                          const isRegistering = surveyRegistering === key
                          // 対象店舗のサブミッションがある場合、jobステータスを表示
                          const areaSub = brandSubs.find(s => s.area_id === area.id)
                          const cp4Job = areaSub?.jobs.find(j => j.job_type === 'create_cp4_profile')
                          const venreyJob = areaSub?.jobs.find(j => j.job_type === 'create_venrey_cast')

                          return (
                            <div key={area.id} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${isRegistered ? 'bg-gray-50 border-gray-200' : 'bg-white border-dashed border-gray-300'}`}>
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${isRegistered ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                  {isRegistered ? '✓' : '—'}
                                </span>
                                <span className="text-sm font-medium text-gray-800">{area.name}</span>
                                {isRegistered && (
                                  <div className="flex gap-1">
                                    {cp4Job && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                        cp4Job.status === 'succeeded' ? 'bg-green-100 text-green-700' :
                                        cp4Job.status === 'pending' || cp4Job.status === 'running' ? 'bg-yellow-100 text-yellow-700' :
                                        cp4Job.status === 'failed' ? 'bg-red-100 text-red-600' :
                                        'bg-gray-100 text-gray-500'
                                      }`}>CP4:{cp4Job.status === 'succeeded' ? '済' : cp4Job.status === 'pending' ? '待' : cp4Job.status === 'running' ? '中' : '失'}</span>
                                    )}
                                    {venreyJob && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                        venreyJob.status === 'succeeded' ? 'bg-green-100 text-green-700' :
                                        venreyJob.status === 'pending' || venreyJob.status === 'running' ? 'bg-yellow-100 text-yellow-700' :
                                        venreyJob.status === 'failed' ? 'bg-red-100 text-red-600' :
                                        'bg-gray-100 text-gray-500'
                                      }`}>Venrey:{venreyJob.status === 'succeeded' ? '済' : venreyJob.status === 'pending' ? '待' : venreyJob.status === 'running' ? '中' : '失'}</span>
                                    )}
                                    {areaSub && (
                                      <Link href={`/admin/onboarding/${areaSub.id}`} className="text-xs text-blue-500 hover:underline ml-1">詳細</Link>
                                    )}
                                  </div>
                                )}
                              </div>
                              {!isRegistered && (
                                <button
                                  onClick={() => registerArea(surveyModalStaff.id, sourceSub.id, area.id)}
                                  disabled={!!surveyRegistering}
                                  className={`px-3 py-1 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50 ${btnColor}`}
                                >
                                  {isRegistering ? '処理中...' : '反映する'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="px-5 py-3 bg-gray-50 rounded-b-xl border-t border-gray-200 flex justify-end flex-shrink-0">
              <button onClick={() => setSurveyModalOpen(false)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors text-sm">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* アカウント作成モーダル */}
      {accountModalOpen && accountStaff && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="bg-gray-900 text-white px-5 py-4 rounded-t-xl flex items-center justify-between">
              <div>
                <h2 className="font-bold text-base">{accountExists ? 'アカウント編集' : 'キャストアカウント作成'}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-gray-400">{accountStaff.name}</p>
                  {accountExists && <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">登録済</span>}
                </div>
              </div>
              <button onClick={() => setAccountModalOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none transition-colors">✕</button>
            </div>
            {accountLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm animate-pulse">読み込み中...</div>
            ) : (
            <div className="p-5 space-y-4 text-sm">
              {!accountExists && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">メールアドレス</label>
                    <input
                      type="email"
                      value={accountEmail}
                      onChange={e => setAccountEmail(e.target.value)}
                      placeholder="cast@example.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">パスワード</label>
                    <input
                      type="text"
                      value={accountPassword}
                      onChange={e => setAccountPassword(e.target.value)}
                      placeholder="8文字以上"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">LINEユーザーID <span className="font-normal text-gray-400">（任意）</span></label>
                <input
                  type="text"
                  value={accountLineId}
                  onChange={e => setAccountLineId(e.target.value)}
                  placeholder="Uxxxxxxxxxxxxxxxxxxxx"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-gray-50"
                />
              </div>
              {accountMessage && (
                <div className={`px-4 py-2.5 rounded-lg text-sm ${accountMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {accountMessage.text}
                </div>
              )}
              {!accountExists && (
                <p className="text-xs text-gray-400">作成したメールアドレス・パスワードをキャストに共有してください。ログインURL: <span className="font-mono">/cast/login</span></p>
              )}
            </div>
            )}
            <div className="px-5 py-4 bg-gray-50 rounded-b-xl flex gap-2 justify-between border-t border-gray-200">
              <div className="flex gap-2">
                {accountExists && accountLineId && !accountLoading && (
                  <button
                    onClick={resetLineId}
                    disabled={accountSaving}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                  >
                    LINE連携リセット
                  </button>
                )}
                {accountExists && !accountLoading && (
                  <button
                    onClick={deleteAccount}
                    disabled={accountSaving}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                  >
                    アカウント削除
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAccountModalOpen(false)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors">閉じる</button>
                {!accountLoading && (
                  <button
                    onClick={saveAccountInfo}
                    disabled={accountSaving}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {accountSaving ? '保存中...' : accountExists ? '更新' : '作成'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
            <div className="bg-gray-900 text-white px-5 py-4 rounded-t-xl flex items-center justify-between flex-shrink-0">
              <h2 className="font-bold text-base">キャスト編集</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none transition-colors">✕</button>
            </div>
            <div className="p-5 space-y-4 text-sm overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  名前 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editing.name ?? ''}
                  onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                  placeholder="キャスト名"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">所属店舗（複数選択可）</label>
                <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 mb-2">シフト表への自動反映には設定が必須です</p>
                <div className="flex gap-2 flex-wrap">
                  {STORES.map(s => {
                    const selected = (editing.storeIds ?? []).includes(s.id)
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleStore(s.id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                          selected
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600'
                        }`}
                      >
                        {s.name}M
                      </button>
                    )
                  })}
                  {IYASHI_STORES.map(s => {
                    const selected = (editing.storeIds ?? []).includes(s.id)
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleStore(s.id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                          selected
                            ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-600'
                        }`}
                      >
                        {s.name}E
                      </button>
                    )
                  })}
                </div>
              </div>
              {editing.id && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">CS3キャストID紐付け</label>
                  {editing.cs3_cast_id ? (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs">
                      <span className="text-green-700 font-medium">紐付け済み: {editing.cs3_cast_id}</span>
                      <button
                        onClick={unlinkCs3Cast}
                        disabled={cs3Linking}
                        className="ml-auto text-red-500 hover:text-red-700 font-medium disabled:opacity-40"
                      >
                        解除
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                        自動マッチングで解決できなかった場合、CS3名で検索して手動で紐付けられます（同名重複・未一致などのケース向け）
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={cs3SearchQuery}
                          onChange={e => setCs3SearchQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') searchCs3Casts() }}
                          placeholder="CS3上の源氏名で検索"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={searchCs3Casts}
                          disabled={cs3Searching || !cs3SearchQuery.trim()}
                          className="px-3 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-xs font-medium disabled:opacity-40 transition-colors"
                        >
                          {cs3Searching ? '検索中...' : '検索'}
                        </button>
                      </div>
                      {cs3LinkError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">{cs3LinkError}</p>
                      )}
                      {cs3SearchResults.length > 0 && (
                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                          {cs3SearchResults.map(c => (
                            <div key={c.cs3_cast_id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-blue-50">
                              <span className="font-medium text-gray-700">{c.cast_name}</span>
                              <span className="text-gray-400">ID:{c.cs3_cast_id}</span>
                              <span className="text-gray-400">
                                {c.shopIds.map(sid => CS3_SHOP_ID_TO_AREA[sid] ?? sid).join('/')}
                              </span>
                              <button
                                onClick={() => linkCs3Cast(c.cs3_cast_id, c.cast_name)}
                                disabled={cs3Linking}
                                className="ml-auto px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-40 transition-colors"
                              >
                                紐付ける
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {!cs3Searching && cs3SearchQuery.trim() && cs3SearchResults.length === 0 && (
                        <p className="text-xs text-gray-400">
                          該当なし（CS3に未登録、または表記ゆれの可能性。1時間ごとのCS3同期後に反映されます）
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {editing.id && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">重複キャストの統合</label>
                  <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mb-2">
                    同一人物が別々に登録されてしまった場合、検索して選んだキャストを現在編集中の「{editing.name}」へ統合します（シフト・予約・写メ日記等をすべて移した上で統合元を削除）
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mergeSearchQuery}
                      onChange={e => setMergeSearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') searchMergeCandidates() }}
                      placeholder="統合元にするキャスト名で検索"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={searchMergeCandidates}
                      disabled={mergeSearching || !mergeSearchQuery.trim()}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-xs font-medium disabled:opacity-40 transition-colors"
                    >
                      {mergeSearching ? '検索中...' : '検索'}
                    </button>
                  </div>
                  {mergeError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mt-2 whitespace-pre-wrap">{mergeError}</p>
                  )}
                  {mergeSearchResults.length > 0 && (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto mt-2">
                      {mergeSearchResults.map(c => (
                        <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-blue-50">
                          <span className="font-medium text-gray-700">{c.name}</span>
                          <span className="text-gray-400">id:{c.id}</span>
                          <span className="text-gray-400">{c.store_ids.length}店舗</span>
                          <button
                            onClick={() => mergeStaff(c.id, c.name)}
                            disabled={mergeSaving}
                            className="ml-auto px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium disabled:opacity-40 transition-colors"
                          >
                            この人をこちらへ統合
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {editing.id && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">📧 写メ日記転送先</label>
                  <div className="space-y-2">
                    {deliveryTargets.map(t => (
                      <div key={t.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
                        <button
                          onClick={() => toggleDeliveryTarget(t)}
                          className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${t.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                          title={t.enabled ? 'ON' : 'OFF'}
                        />
                        <span className="font-medium text-gray-700 w-20 flex-shrink-0">{t.media_name}</span>
                        <span className="text-gray-500 truncate flex-1">{t.destination}</span>
                        <button onClick={() => deleteDeliveryTarget(t.id)} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTargetMediaName}
                        onChange={e => setNewTargetMediaName(e.target.value)}
                        placeholder="媒体名"
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="email"
                        value={newTargetDestination}
                        onChange={e => setNewTargetDestination(e.target.value)}
                        placeholder="メールアドレス"
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => editing.id && addDeliveryTarget(editing.id)}
                        disabled={deliverySaving || !newTargetMediaName.trim() || !newTargetDestination.trim()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-40 transition-colors"
                      >
                        追加
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 各店舗への登録反映 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">各店舗への登録反映</label>
                  <span className="text-xs text-gray-400">癒したくて（E）/ M性感（M）別にON/OFF</span>
                </div>
                {!editing.cs3_cast_id ? (
                  <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">CS3 ID未設定のため設定不可</p>
                ) : publishLoading ? (
                  <p className="text-xs text-gray-400 animate-pulse px-1">読み込み中...</p>
                ) : publishRules ? (
                  <PublishRuleMatrix
                    cs3CastId={editing.cs3_cast_id}
                    rules={publishRules}
                    onSaved={fetchPublishSummary}
                  />
                ) : null}
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 rounded-b-xl flex gap-2 justify-end border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={saveStaff}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? '保存中...' : '更新'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
