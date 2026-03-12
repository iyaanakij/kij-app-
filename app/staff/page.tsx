'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Staff, Store, STORES } from '@/lib/types'

interface StaffWithStores extends Staff {
  storeIds: number[]
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

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    const { data: staffData } = await supabase.from('staff').select('*').order('name')
    const { data: staffStores } = await supabase.from('staff_stores').select('*')

    if (staffData) {
      const enriched: StaffWithStores[] = staffData.map(s => ({
        ...s,
        storeIds: (staffStores ?? []).filter(ss => ss.staff_id === s.id).map(ss => ss.store_id),
      }))
      setStaffList(enriched)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  function openAdd() {
    setEditing(emptyStaff())
    setIsEdit(false)
    setModalOpen(true)
  }

  function openEdit(s: StaffWithStores) {
    setEditing({ ...s })
    setIsEdit(true)
    setModalOpen(true)
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

  async function deleteStaff(id: number, name: string) {
    if (!confirm(`${name} を削除しますか？\nこのスタッフのシフトと予約データも影響を受けます。`)) return
    await supabase.from('staff').delete().eq('id', id)
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

  return (
    <div className="p-3">
      <div className="bg-white rounded-lg shadow p-3 mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">スタッフ管理</h1>
          <button
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium text-sm transition-colors"
          >
            + 新規追加
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-4 py-3 text-left font-medium">名前</th>
                <th className="px-4 py-3 text-left font-medium">入店日</th>
                <th className="px-4 py-3 text-left font-medium">所属店舗</th>
                <th className="px-4 py-3 text-left font-medium">メモ</th>
                <th className="px-4 py-3 text-center font-medium w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {staffList.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    スタッフが登録されていません
                  </td>
                </tr>
              )}
              {staffList.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
                >
                  <td className="px-4 py-3 font-bold text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">
                    {s.join_date ? s.join_date.replace(/-/g, '/') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {s.storeIds.length === 0 ? (
                        <span className="text-gray-400 text-xs">未設定</span>
                      ) : (
                        s.storeIds.map(sid => {
                          const store = STORES.find(st => st.id === sid)
                          return store ? (
                            <span key={sid} className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">
                              {store.name}
                            </span>
                          ) : null
                        })
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{s.notes || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => openEdit(s)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-3 py-1.5 rounded transition-colors"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => deleteStaff(s.id, s.name)}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            合計: <span className="font-bold text-gray-900">{staffList.length}名</span>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4">
            <div className="bg-gray-800 text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <h2 className="font-bold text-lg">{isEdit ? 'スタッフ編集' : '新規スタッフ追加'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-300 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">名前 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editing.name ?? ''}
                  onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                  placeholder="スタッフ名"
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">入店日</label>
                <input
                  type="date"
                  value={editing.join_date ?? ''}
                  onChange={e => setEditing(p => ({ ...p, join_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">所属店舗（複数選択可）</label>
                <div className="flex gap-2 flex-wrap">
                  {STORES.map(s => {
                    const selected = (editing.storeIds ?? []).includes(s.id)
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleStore(s.id)}
                        className={`px-3 py-1.5 rounded text-sm font-medium border-2 transition-all ${
                          selected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {s.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">メモ</label>
                <textarea
                  value={editing.notes ?? ''}
                  onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  placeholder="備考・メモ"
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-4 py-3 bg-gray-50 rounded-b-lg flex gap-2 justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-medium transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={saveStaff}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors disabled:opacity-50"
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
