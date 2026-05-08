'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { STORES } from '@/lib/types'

const ROW_MEMO_PREFIX = '__KIJ_WOMEN_INFO_ROW__'
const CONFIG_MEMO_PREFIX = '__KIJ_WOMEN_INFO_CONFIG__'
const WOMEN_INFO_DATE = '2000-01-02'
const DEFAULT_AREA_ID = 1
const AREA_STORAGE_KEY = 'kij_women_info_area'

const COLOR_CHOICES = [
  '#ffffff', '#f8fafc', '#fef3c7', '#fee2e2', '#dcfce7', '#dbeafe', '#f3e8ff', '#ffedd5',
  '#111827', '#1d4ed8', '#047857', '#b45309', '#be123c', '#6d28d9',
]

const DEFAULT_COLUMNS = [
  { id: 'castName', label: '女性名', width: 128, multiline: false, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'realName', label: '本名', width: 128, multiline: false, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'area', label: '所属/エリア', width: 112, multiline: false, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'phone', label: '電話番号', width: 144, multiline: false, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'lineName', label: 'LINE名/ID', width: 144, multiline: false, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'birthday', label: '生年月日', width: 112, multiline: false, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'joinDate', label: '入店日', width: 112, multiline: false, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'nearestStation', label: '最寄り', width: 128, multiline: false, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'address', label: '住所', width: 224, multiline: true, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'dorm', label: '寮/送迎', width: 144, multiline: true, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
  { id: 'ngNotes', label: 'NG・注意事項', width: 224, multiline: true, headerBg: '#111827', headerText: '#ffffff', cellBg: '#fff7ed', cellText: '#7c2d12' },
  { id: 'memo', label: 'メモ', width: 256, multiline: true, headerBg: '#111827', headerText: '#ffffff', cellBg: '#ffffff', cellText: '#1f2937' },
]

type SheetColumn = {
  id: string
  label: string
  width: number
  multiline: boolean
  headerBg: string
  headerText: string
  cellBg: string
  cellText: string
}

type WomenInfoRow = {
  id: string
  sortOrder: number
  values: Record<string, string>
}

type SheetConfig = {
  columns: SheetColumn[]
}

type BoardAnnotationRow = {
  id: string
  memo: string | null
}

type ConfigState = {
  id: string | null
  columns: SheetColumn[]
}

function normalizeColumn(raw: Partial<SheetColumn>, index: number): SheetColumn {
  const fallback = DEFAULT_COLUMNS[index] ?? DEFAULT_COLUMNS[0]
  return {
    id: raw.id || `col_${Date.now()}_${index}`,
    label: raw.label || fallback.label,
    width: Number(raw.width) || fallback.width,
    multiline: Boolean(raw.multiline),
    headerBg: raw.headerBg || fallback.headerBg,
    headerText: raw.headerText || fallback.headerText,
    cellBg: raw.cellBg || fallback.cellBg,
    cellText: raw.cellText || fallback.cellText,
  }
}

function defaultValues(columns: SheetColumn[]): Record<string, string> {
  return Object.fromEntries(columns.map(column => [column.id, '']))
}

function parseRow(row: BoardAnnotationRow, columns: SheetColumn[]): WomenInfoRow | null {
  if (!row.memo?.startsWith(ROW_MEMO_PREFIX)) return null
  try {
    const parsed = JSON.parse(row.memo.slice(ROW_MEMO_PREFIX.length)) as {
      sortOrder?: number
      values?: Record<string, string>
      [key: string]: unknown
    }
    const base = defaultValues(columns)
    const source = parsed.values && typeof parsed.values === 'object' ? parsed.values : parsed
    for (const column of columns) {
      const value = source[column.id]
      base[column.id] = typeof value === 'string' ? value : ''
    }
    return {
      id: row.id,
      sortOrder: typeof parsed.sortOrder === 'number' ? parsed.sortOrder : 0,
      values: base,
    }
  } catch {
    return null
  }
}

function parseConfig(row: BoardAnnotationRow | undefined): ConfigState {
  if (!row?.memo?.startsWith(CONFIG_MEMO_PREFIX)) {
    return { id: null, columns: DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index)) }
  }
  try {
    const parsed = JSON.parse(row.memo.slice(CONFIG_MEMO_PREFIX.length)) as Partial<SheetConfig>
    const columns = Array.isArray(parsed.columns) && parsed.columns.length
      ? parsed.columns.map(normalizeColumn)
      : DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index))
    return { id: row.id, columns }
  } catch {
    return { id: row.id, columns: DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index)) }
  }
}

function encodeRow(row: WomenInfoRow): string {
  return `${ROW_MEMO_PREFIX}${JSON.stringify({ sortOrder: row.sortOrder, values: row.values })}`
}

function encodeConfig(columns: SheetColumn[]): string {
  return `${CONFIG_MEMO_PREFIX}${JSON.stringify({ columns })}`
}

function hasContent(row: WomenInfoRow, columns: SheetColumn[]): boolean {
  return columns.some(column => (row.values[column.id] ?? '').trim())
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-10 text-[10px] opacity-75">{label}</span>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-5 w-6 cursor-pointer rounded border border-white/40 bg-transparent p-0"
        title={label}
      />
    </div>
  )
}

export default function WomenInfoPage() {
  const [selectedAreaId, setSelectedAreaId] = useState(DEFAULT_AREA_ID)
  const [configId, setConfigId] = useState<string | null>(null)
  const [columns, setColumns] = useState<SheetColumn[]>(() => DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index)))
  const [rows, setRows] = useState<WomenInfoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [savingConfig, setSavingConfig] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('board_annotations')
      .select('id, memo')
      .eq('store_id', selectedAreaId)
      .eq('date', WOMEN_INFO_DATE)
      .or(`memo.like.${ROW_MEMO_PREFIX}%,memo.like.${CONFIG_MEMO_PREFIX}%`)

    const rawRows = (data ?? []) as BoardAnnotationRow[]
    const config = parseConfig(rawRows.find(row => row.memo?.startsWith(CONFIG_MEMO_PREFIX)))
    const parsedRows = rawRows
      .map(row => parseRow(row, config.columns))
      .filter((row): row is WomenInfoRow => Boolean(row))
      .sort((a, b) => a.sortOrder - b.sortOrder)

    setConfigId(config.id)
    setColumns(config.columns)
    setRows(parsedRows)
    setLoading(false)
  }, [selectedAreaId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchRows() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchRows])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(AREA_STORAGE_KEY)
      if (saved && STORES.some(store => store.id === Number(saved))) {
        setSelectedAreaId(Number(saved))
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  function selectArea(areaId: number) {
    setSelectedAreaId(areaId)
    window.localStorage.setItem(AREA_STORAGE_KEY, String(areaId))
    setConfigId(null)
    setColumns(DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index)))
    setRows([])
  }

  const filteredRows = useMemo(() => {
    const q = query.trim()
    if (!q) return rows
    return rows.filter(row => columns.some(column => (row.values[column.id] ?? '').includes(q)))
  }, [columns, query, rows])

  const sheetMinWidth = useMemo(() => {
    const columnWidth = columns.reduce((sum, column) => sum + column.width, 0)
    return Math.max(720, columnWidth + 160)
  }, [columns])

  const selectedColumn = useMemo(() => {
    return columns.find(column => column.id === selectedColumnId) ?? columns[0] ?? null
  }, [columns, selectedColumnId])

  const setSaving = (rowId: string, saving: boolean) => {
    setSavingIds(current => {
      const next = new Set(current)
      if (saving) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }

  async function persistConfig(nextColumns: SheetColumn[]) {
    setSavingConfig(true)
    const payload = {
      staff_id: null,
      date: WOMEN_INFO_DATE,
      start_time: 0,
      end_time: 0,
      color: 'gray',
      memo: encodeConfig(nextColumns),
      store_id: selectedAreaId,
    }

    if (configId) {
      const { error } = await supabase.from('board_annotations').update(payload).eq('id', configId)
      setSavingConfig(false)
      if (error) fetchRows()
      return
    }

    const { data, error } = await supabase.from('board_annotations').insert(payload).select('id').single()
    setSavingConfig(false)
    if (error || !data) {
      fetchRows()
      return
    }
    setConfigId(data.id)
  }

  async function persistRow(row: WomenInfoRow) {
    setSaving(row.id, true)
    const payload = {
      staff_id: null,
      date: WOMEN_INFO_DATE,
      start_time: 0,
      end_time: 0,
      color: 'gray',
      memo: encodeRow(row),
      store_id: selectedAreaId,
    }

    if (row.id.startsWith('pending-')) {
      if (!hasContent(row, columns)) {
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

    if (!hasContent(row, columns)) {
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

  function updateCell(rowId: string, columnId: string, value: string) {
    setRows(current => current.map(row => row.id === rowId
      ? { ...row, values: { ...row.values, [columnId]: value } }
      : row
    ))
  }

  async function saveCell(rowId: string) {
    const row = rows.find(item => item.id === rowId)
    if (row) await persistRow(row)
  }

  function addRow() {
    const sortOrder = rows.length ? Math.max(...rows.map(row => row.sortOrder)) + 1 : 1
    setRows(current => [...current, { id: `pending-${Date.now()}`, sortOrder, values: defaultValues(columns) }])
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

  function editColumn(columnId: string, patch: Partial<SheetColumn>) {
    setColumns(current => current.map(column => column.id === columnId ? { ...column, ...patch } : column))
  }

  async function saveColumns(nextColumns = columns) {
    await persistConfig(nextColumns)
  }

  async function updateColumn(columnId: string, patch: Partial<SheetColumn>) {
    const next = columns.map(column => column.id === columnId ? { ...column, ...patch } : column)
    setColumns(next)
    await persistConfig(next)
  }

  async function addColumn() {
    const newColumn: SheetColumn = {
      id: `col_${Date.now()}`,
      label: '新しい項目',
      width: 160,
      multiline: false,
      headerBg: '#111827',
      headerText: '#ffffff',
      cellBg: '#ffffff',
      cellText: '#1f2937',
    }
    const nextColumns = [...columns, newColumn]
    setColumns(nextColumns)
    setSelectedColumnId(newColumn.id)
    setRows(current => current.map(row => ({ ...row, values: { ...row.values, [newColumn.id]: '' } })))
    await persistConfig(nextColumns)
  }

  async function deleteColumn(columnId: string) {
    if (columns.length <= 1) return
    const nextColumns = columns.filter(column => column.id !== columnId)
    const nextRows = rows.map(row => {
      const nextValues = { ...row.values }
      delete nextValues[columnId]
      return { ...row, values: nextValues }
    })
    setColumns(nextColumns)
    setSelectedColumnId(current => current === columnId ? nextColumns[0]?.id ?? null : current)
    setRows(nextRows)
    await persistConfig(nextColumns)
    await Promise.all(nextRows.filter(row => !row.id.startsWith('pending-')).map(persistRow))
  }

  async function moveColumn(columnId: string, direction: -1 | 1) {
    const index = columns.findIndex(column => column.id === columnId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= columns.length) return
    const next = [...columns]
    const currentColumn = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = currentColumn
    setColumns(next)
    await persistConfig(next)
  }

  return (
    <div className="p-3">
      <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">女性情報</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              エリアごとに入力できます。列名は表の見出しを直接編集、列の色や幅は見出しを選んで上のバーから変更します。
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STORES.map(store => (
              <button
                key={store.id}
                type="button"
                onClick={() => selectArea(store.id)}
                className={`h-9 rounded-full px-3 text-xs font-bold transition-colors ${
                  selectedAreaId === store.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {store.name}
              </button>
            ))}
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
              onClick={addColumn}
              className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
            >
              列を追加
            </button>
            <button
              type="button"
              onClick={addRow}
              className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700"
            >
              行を追加
            </button>
            <span className="w-12 text-xs text-gray-400">{savingConfig ? '保存中' : '保存済'}</span>
          </div>
        </div>
        {selectedColumn && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
            <span className="font-bold text-gray-800">列設定:</span>
            <span className="max-w-32 truncate rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              {selectedColumn.label || '無題'}
            </span>
            <button
              type="button"
              onClick={() => moveColumn(selectedColumn.id, -1)}
              disabled={columns[0]?.id === selectedColumn.id}
              className="h-8 rounded-lg border border-gray-300 bg-white px-2 font-bold hover:bg-gray-50 disabled:opacity-30"
              title="左へ"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => moveColumn(selectedColumn.id, 1)}
              disabled={columns[columns.length - 1]?.id === selectedColumn.id}
              className="h-8 rounded-lg border border-gray-300 bg-white px-2 font-bold hover:bg-gray-50 disabled:opacity-30"
              title="右へ"
            >
              →
            </button>
            <label className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2">
              <input
                type="checkbox"
                checked={selectedColumn.multiline}
                onChange={e => updateColumn(selectedColumn.id, { multiline: e.target.checked })}
              />
              複数行
            </label>
            <label className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2">
              幅
              <input
                type="number"
                min={80}
                max={420}
                value={selectedColumn.width}
                onChange={e => editColumn(selectedColumn.id, { width: Number(e.target.value) || 120 })}
                onBlur={() => saveColumns()}
                className="w-16 border-0 bg-transparent text-xs font-bold outline-none"
              />
            </label>
            <ColorPicker label="見出し" value={selectedColumn.headerBg} onChange={value => updateColumn(selectedColumn.id, { headerBg: value })} />
            <ColorPicker label="文字" value={selectedColumn.headerText} onChange={value => updateColumn(selectedColumn.id, { headerText: value })} />
            <ColorPicker label="セル" value={selectedColumn.cellBg} onChange={value => updateColumn(selectedColumn.id, { cellBg: value })} />
            <ColorPicker label="セル字" value={selectedColumn.cellText} onChange={value => updateColumn(selectedColumn.id, { cellText: value })} />
            <div className="flex items-center gap-1">
              {COLOR_CHOICES.slice(0, 8).map(color => (
                <button
                  key={`${selectedColumn.id}-${color}`}
                  type="button"
                  onClick={() => updateColumn(selectedColumn.id, { cellBg: color })}
                  className="h-5 w-5 rounded border border-gray-300"
                  style={{ backgroundColor: color }}
                  title="セル色"
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => deleteColumn(selectedColumn.id)}
              disabled={columns.length <= 1}
              className="ml-auto h-8 rounded-lg border border-red-200 bg-red-50 px-3 font-bold text-red-600 hover:bg-red-100 disabled:opacity-30"
            >
              列削除
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-gray-500">読み込み中...</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-md">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 165px)' }}>
            <table className="border-collapse table-fixed text-xs" style={{ minWidth: sheetMinWidth }}>
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 w-14 border-r border-gray-700 bg-gray-900 px-2 py-2 text-center text-white">操作</th>
                  <th className="sticky left-14 z-30 w-12 border-r border-gray-700 bg-gray-900 px-2 py-2 text-center text-white">No</th>
                  {columns.map(column => (
                    <th
                      key={column.id}
                      onClick={() => setSelectedColumnId(column.id)}
                      className={`border-r border-gray-300 p-0 align-middle ${selectedColumnId === column.id ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                      style={{ width: column.width, backgroundColor: column.headerBg, color: column.headerText }}
                    >
                      <input
                        type="text"
                        value={column.label}
                        onFocus={() => setSelectedColumnId(column.id)}
                        onChange={e => editColumn(column.id, { label: e.target.value })}
                        onBlur={() => saveColumns()}
                        className="block h-10 w-full border-0 bg-transparent px-2 text-left text-xs font-bold outline-none placeholder:text-current focus:bg-white/15"
                        style={{ color: column.headerText }}
                        placeholder="列名"
                      />
                    </th>
                  ))}
                  <th className="w-16 bg-gray-900 px-2 py-2 text-center text-white">状態</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 3} className="px-4 py-12 text-center text-sm text-gray-400">
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
                      {columns.map(column => (
                        <td key={column.id} className="border-r border-gray-200 p-0 align-top" style={{ backgroundColor: column.cellBg }}>
                          {column.multiline ? (
                            <textarea
                              value={row.values[column.id] ?? ''}
                              onChange={e => updateCell(row.id, column.id, e.target.value)}
                              onBlur={() => saveCell(row.id)}
                              rows={2}
                              className="block min-h-14 w-full resize-y border-0 bg-transparent px-2 py-2 text-xs leading-relaxed outline-none focus:bg-blue-50 focus:ring-2 focus:ring-blue-300"
                              style={{ color: column.cellText }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={row.values[column.id] ?? ''}
                              onChange={e => updateCell(row.id, column.id, e.target.value)}
                              onBlur={() => saveCell(row.id)}
                              className="block h-10 w-full border-0 bg-transparent px-2 text-xs outline-none focus:bg-blue-50 focus:ring-2 focus:ring-blue-300"
                              style={{ color: column.cellText }}
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
