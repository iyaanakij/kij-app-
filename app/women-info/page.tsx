'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const WOMEN_INFO_MEMO_PREFIX = '__KIJ_WOMEN_INFO_ROW__'
const WOMEN_INFO_DATE = '2000-01-02'
const WOMEN_INFO_STORE_ID = 1

const COLUMNS = [
  { key: 'castName', label: '女性名', width: 'w-32', multiline: false },
  { key: 'realName', label: '本名', width: 'w-32', multiline: false },
  { key: 'area', label: '所属/エリア', width: 'w-28', multiline: false },
  { key: 'phone', label: '電話番号', width: 'w-36', multiline: false },
  { key: 'lineName', label: 'LINE名/ID', width: 'w-36', multiline: false },
  { key: 'birthday', label: '生年月日', width: 'w-28', multiline: false },
  { key: 'joinDate', label: '入店日', width: 'w-28', multiline: false },
  { key: 'nearestStation', label: '最寄り', width: 'w-32', multiline: false },
  { key: 'address', label: '住所', width: 'w-56', multiline: true },
  { key: 'dorm', label: '寮/送迎', width: 'w-36', multiline: true },
  { key: 'ngNotes', label: 'NG・注意事項', width: 'w-56', multiline: true },
  { key: 'memo', label: 'メモ', width: 'w-64', multiline: true },
] as const

type ColumnKey = typeof COLUMNS[number]['key']

type WomenInfoData = Record<ColumnKey, string> & {
  sortOrder: number
}

type WomenInfoRow = WomenInfoData & {
  id: string
}

type BoardAnnotationRow = {
  id: string
  memo: string | null
}

const emptyRow = (sortOrder: number): WomenInfoData => ({
  castName: '',
  realName: '',
  area: '',
  phone: '',
  lineName: '',
  birthday: '',
  joinDate: '',
  nearestStation: '',
  address: '',
  dorm: '',
  ngNotes: '',
  memo: '',
  sortOrder,
})

function parseRow(row: BoardAnnotationRow): WomenInfoRow | null {
  if (!row.memo?.startsWith(WOMEN_INFO_MEMO_PREFIX)) return null
  try {
    const parsed = JSON.parse(row.memo.slice(WOMEN_INFO_MEMO_PREFIX.length)) as Partial<WomenInfoData>
    return {
      id: row.id,
      ...emptyRow(typeof parsed.sortOrder === 'number' ? parsed.sortOrder : 0),
      ...parsed,
    }
  } catch {
    return null
  }
}

function encodeRow(row: WomenInfoData): string {
  return `${WOMEN_INFO_MEMO_PREFIX}${JSON.stringify(row)}`
}

function hasContent(row: WomenInfoData): boolean {
  return COLUMNS.some(column => row[column.key].trim())
}

function toPersistData(row: WomenInfoRow): WomenInfoData {
  const data = emptyRow(row.sortOrder)
  for (const column of COLUMNS) data[column.key] = row[column.key]
  return data
}

export default function WomenInfoPage() {
  const [rows, setRows] = useState<WomenInfoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('board_annotations')
      .select('id, memo')
      .eq('store_id', WOMEN_INFO_STORE_ID)
      .eq('date', WOMEN_INFO_DATE)
      .like('memo', `${WOMEN_INFO_MEMO_PREFIX}%`)

    const parsed = ((data ?? []) as BoardAnnotationRow[])
      .map(parseRow)
      .filter((row): row is WomenInfoRow => Boolean(row))
      .sort((a, b) => a.sortOrder - b.sortOrder)

    setRows(parsed)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchRows() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchRows])

  const filteredRows = useMemo(() => {
    const q = query.trim()
    if (!q) return rows
    return rows.filter(row => COLUMNS.some(column => row[column.key].includes(q)))
  }, [query, rows])

  const setSaving = (rowId: string, saving: boolean) => {
    setSavingIds(current => {
      const next = new Set(current)
      if (saving) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }

  async function persistRow(row: WomenInfoRow) {
    setSaving(row.id, true)
    const payloadData = toPersistData(row)
    const payload = {
      staff_id: null,
      date: WOMEN_INFO_DATE,
      start_time: 0,
      end_time: 0,
      color: 'gray',
      memo: encodeRow(payloadData),
      store_id: WOMEN_INFO_STORE_ID,
    }

    if (row.id.startsWith('pending-')) {
      if (!hasContent(payloadData)) {
        setSaving(row.id, false)
        return
      }
      const { data, error } = await supabase.from('board_annotations').insert(payload).select('id').single()
      setSaving(row.id, false)
      if (error || !data) {
        fetchRows()
        return
      }
      setRows(current => current.map(item => item.id === row.id ? { ...row, id: data.id } : item))
      return
    }

    if (!hasContent(payloadData)) {
      const { error } = await supabase.from('board_annotations').delete().eq('id', row.id)
      setSaving(row.id, false)
      if (error) {
        fetchRows()
        return
      }
      setRows(current => current.filter(item => item.id !== row.id))
      return
    }

    const { error } = await supabase.from('board_annotations').update(payload).eq('id', row.id)
    setSaving(row.id, false)
    if (error) fetchRows()
  }

  function updateCell(rowId: string, key: ColumnKey, value: string) {
    setRows(current => current.map(row => row.id === rowId ? { ...row, [key]: value } : row))
  }

  async function saveCell(rowId: string) {
    const row = rows.find(item => item.id === rowId)
    if (row) await persistRow(row)
  }

  function addRow() {
    const sortOrder = rows.length ? Math.max(...rows.map(row => row.sortOrder)) + 1 : 1
    setRows(current => [...current, { id: `pending-${Date.now()}`, ...emptyRow(sortOrder) }])
  }

  async function deleteRow(rowId: string) {
    const row = rows.find(item => item.id === rowId)
    setRows(current => current.filter(item => item.id !== rowId))
    if (!row || row.id.startsWith('pending-')) return
    const { error } = await supabase.from('board_annotations').delete().eq('id', row.id)
    if (error) fetchRows()
  }

  async function moveRow(rowId: string, direction: -1 | 1) {
    const index = rows.findIndex(row => row.id === rowId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= rows.length) return

    const next = [...rows]
    const currentRow = next[index]
    const targetRow = next[targetIndex]
    next[index] = { ...targetRow, sortOrder: currentRow.sortOrder }
    next[targetIndex] = { ...currentRow, sortOrder: targetRow.sortOrder }
    setRows(next)
    await Promise.all([persistRow(next[index]), persistRow(next[targetIndex])])
  }

  return (
    <div className="p-3">
      <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">女性情報</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              セルを直接入力して、枠外をクリックすると保存されます。空行は削除されます。
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="検索..."
              className="h-9 w-48 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={fetchRows}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              再読込
            </button>
            <button
              type="button"
              onClick={addRow}
              className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700"
            >
              行を追加
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-gray-500">読み込み中...</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-md">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 165px)' }}>
            <table className="min-w-[1840px] border-collapse table-fixed text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-900 text-white">
                  <th className="sticky left-0 z-30 w-14 border-r border-gray-700 bg-gray-900 px-2 py-2 text-center">操作</th>
                  <th className="sticky left-14 z-30 w-12 border-r border-gray-700 bg-gray-900 px-2 py-2 text-center">No</th>
                  {COLUMNS.map(column => (
                    <th key={column.key} className={`${column.width} border-r border-gray-700 px-2 py-2 text-left font-bold`}>
                      {column.label}
                    </th>
                  ))}
                  <th className="w-16 bg-gray-900 px-2 py-2 text-center">状態</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 3} className="px-4 py-12 text-center text-sm text-gray-400">
                      行を追加して入力してください
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => (
                    <tr key={row.id} className="border-t border-gray-200 odd:bg-white even:bg-gray-50/60">
                      <td className="sticky left-0 z-10 border-r border-gray-200 bg-inherit px-1 py-1">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveRow(row.id, -1)}
                            disabled={index === 0 || Boolean(query)}
                            className="h-6 w-6 rounded border border-gray-200 bg-white text-[10px] text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                            title="上へ"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(row.id, 1)}
                            disabled={index === filteredRows.length - 1 || Boolean(query)}
                            className="h-6 w-6 rounded border border-gray-200 bg-white text-[10px] text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                            title="下へ"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id)}
                            className="h-6 w-6 rounded border border-red-100 bg-red-50 text-[10px] font-bold text-red-600 hover:bg-red-100"
                            title="削除"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                      <td className="sticky left-14 z-10 border-r border-gray-200 bg-inherit px-2 py-2 text-center font-semibold text-gray-500">
                        {index + 1}
                      </td>
                      {COLUMNS.map(column => (
                        <td key={column.key} className="border-r border-gray-200 p-0 align-top">
                          {column.multiline ? (
                            <textarea
                              value={row[column.key]}
                              onChange={e => updateCell(row.id, column.key, e.target.value)}
                              onBlur={() => saveCell(row.id)}
                              rows={2}
                              className="block min-h-14 w-full resize-y border-0 bg-transparent px-2 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:bg-blue-50 focus:ring-2 focus:ring-blue-300"
                            />
                          ) : (
                            <input
                              type="text"
                              value={row[column.key]}
                              onChange={e => updateCell(row.id, column.key, e.target.value)}
                              onBlur={() => saveCell(row.id)}
                              className="block h-10 w-full border-0 bg-transparent px-2 text-xs text-gray-800 outline-none focus:bg-blue-50 focus:ring-2 focus:ring-blue-300"
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center text-[11px] text-gray-400">
                        {savingIds.has(row.id) ? '保存中' : '保存済'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
