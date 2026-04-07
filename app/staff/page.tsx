'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Staff, STORES, IYASHI_STORES, M_STORE_IDS, Y_STORE_IDS, getStaffBrand, StaffBrand } from '@/lib/types'

interface StaffWithStores extends Staff {
  storeIds: number[]
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
  const [staffList, setStaffList] = useState<StaffWithStores[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<StaffWithStores>>(emptyStaff())
  const [isEdit, setIsEdit] = useState(false)
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
  const [registeredStaffIds, setRegisteredStaffIds] = useState<Set<number>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<Record<number, { added: number; linked: number; skipped: number; total: number }> | null>(null)
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<number | null>(null)
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<StaffBrand | null>(null)
  const [deliveryTargets, setDeliveryTargets] = useState<DeliveryTarget[]>([])
  const [newTargetMediaName, setNewTargetMediaName] = useState('')
  const [newTargetDestination, setNewTargetDestination] = useState('')
  const [deliverySaving, setDeliverySaving] = useState(false)

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

  function openAdd() {
    setEditing(emptyStaff())
    setIsEdit(false)
    setDeliveryTargets([])
    setNewTargetMediaName('')
    setNewTargetDestination('')
    setModalOpen(true)
  }

  async function openEdit(s: StaffWithStores) {
    setEditing({ ...s })
    setIsEdit(true)
    setNewTargetMediaName('')
    setNewTargetDestination('')
    const { data } = await supabase
      .from('staff_diary_delivery_targets')
      .select('*')
      .eq('staff_id', s.id)
      .order('created_at')
    setDeliveryTargets(data ?? [])
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

    let staffId: number
    if (isEdit && editing.id) {
      await supabase.from('staff').update(payload).eq('id', editing.id)
      staffId = editing.id
    } else {
      const { data } = await supabase.from('staff').insert(payload).select().single()
      staffId = data?.id
    }

    if (staffId) {
      // Sync store assignments
      await supabase.from('staff_stores').delete().eq('staff_id', staffId)
      const storeIds = editing.storeIds ?? []
      if (storeIds.length > 0) {
        await supabase.from('staff_stores').insert(storeIds.map(sid => ({ staff_id: staffId, store_id: sid })))
      }
    }

    setSaving(false)
    setModalOpen(false)
    fetchStaff()
  }

  async function openAccountModal(s: StaffWithStores) {
    setAccountStaff(s)
    setAccountEmail('')
    setAccountPassword('')
    setAccountLineId('')
    setAccountMessage(null)
    setAccountExists(false)
    setAccountLoading(true)
    setAccountModalOpen(true)

    const { data } = await supabase
      .from('user_roles')
      .select('line_user_id')
      .eq('staff_id', s.id)
      .eq('role', 'cast')
      .maybeSingle()

    if (data) {
      setAccountExists(true)
      setAccountLineId(data.line_user_id ?? '')
    }
    setAccountLoading(false)
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

  async function syncFromHP() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/cast-sync', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        alert('同期エラー: ' + data.error)
        setSyncing(false)
        return
      }
      setSyncResult(data.perStore)
      // 同期後に自動で重複解消
      await fetch('/api/staff-dedup', { method: 'POST' })
      fetchStaff()
    } catch {
      alert('同期に失敗しました')
    }
    setSyncing(false)
  }

  async function deleteStaff(id: number, name: string) {
    if (!confirm(`${name} を削除しますか？\nこのスタッフのシフトと予約データも影響を受けます。`)) return
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

  const filteredStaff = staffList.filter(s => {
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-800">スタッフ管理</h1>
            <p className="text-xs text-gray-500 mt-0.5">全{staffList.length}名 / 表示{filteredStaff.length}名</p>
            {syncResult && (
              <div className="text-xs text-green-600 mt-1 space-y-0.5">
                {[...STORES, ...IYASHI_STORES].map(store => {
                  const r = syncResult[store.id]
                  if (!r) return null
                  const brand = M_STORE_IDS.includes(store.id) ? 'M性感' : '癒したくて'
                  return (
                    <p key={store.id}>
                      {brand}/{store.name}: 取得{r.total}名 / 新規{r.added}名 / 紐付け{r.linked}名
                    </p>
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={syncFromHP}
              disabled={syncing}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-full font-medium text-sm transition-colors shadow-sm"
            >
              {syncing ? '同期中...' : 'HP同期'}
            </button>
            <button
              onClick={openAdd}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-medium text-sm transition-colors shadow-sm"
            >
              + 追加
            </button>
          </div>
        </div>
        {/* フィルター（1行） */}
        <div className="flex gap-1.5 mt-3 flex-wrap items-center">
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
                <th className="px-4 py-3 text-left font-semibold">メモ</th>
                <th className="px-4 py-3 text-center font-semibold w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-gray-400">
                    スタッフが登録されていません
                  </td>
                </tr>
              )}
              {filteredStaff.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-blue-50 transition-colors`}
                >
                  <td className="px-4 py-3 font-bold text-gray-800">
                    <div className="flex items-center gap-2">
                      {s.name}
                      {registeredStaffIds.has(s.id) && (
                        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">登録済</span>
                      )}
                      {(() => {
                        const brand = getStaffBrand(s.storeIds)
                        if (brand === 'both') return <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">共通在籍</span>
                        if (brand === 'M') return <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">M性感</span>
                        if (brand === 'Y') return <span className="bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full font-medium">癒したくて</span>
                        return null
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-sm">
                    {s.join_date ? s.join_date.replace(/-/g, '/') : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {s.storeIds.length === 0 ? (
                        <span className="text-gray-400 text-xs">未設定</span>
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
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate text-sm">
                    {s.notes || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex gap-1 justify-center items-center">
                      <button
                        onClick={() => openEdit(s)}
                        title="編集"
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                      </button>
                      <button
                        onClick={() => openAccountModal(s)}
                        title="アカウント"
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/></svg>
                      </button>
                      <button
                        onClick={() => deleteStaff(s.id, s.name)}
                        title="削除"
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-red-100 hover:bg-red-200 text-red-600 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
              <div>
                {accountExists && accountLineId && !accountLoading && (
                  <button
                    onClick={resetLineId}
                    disabled={accountSaving}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                  >
                    LINE連携リセット
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="bg-gray-900 text-white px-5 py-4 rounded-t-xl flex items-center justify-between flex-shrink-0">
              <h2 className="font-bold text-base">{isEdit ? 'スタッフ編集' : '新規スタッフ追加'}</h2>
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
                  placeholder="スタッフ名"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">入店日</label>
                <input
                  type="date"
                  value={editing.join_date ?? ''}
                  onChange={e => setEditing(p => ({ ...p, join_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">所属店舗（複数選択可）</label>
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
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">メモ</label>
                <textarea
                  value={editing.notes ?? ''}
                  onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  placeholder="備考・メモ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>

              {isEdit && editing.id && (
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
                {saving ? '保存中...' : isEdit ? '更新' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
