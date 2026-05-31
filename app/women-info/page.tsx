'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'
import { STORES } from '@/lib/types'

const ROW_MEMO_PREFIX = '__KIJ_WOMEN_INFO_ROW__'
const CONFIG_MEMO_PREFIX = '__KIJ_WOMEN_INFO_CONFIG__'
const WOMEN_INFO_DATE = '2000-01-02'
const DEFAULT_AREA_ID = 1
const AREA_STORAGE_KEY = 'kij_women_info_area'
const WOMEN_INFO_AREA_IDS = [1, 2, 3, 4]
const COLUMN_WIDTH_MIN = 20
const COLUMN_WIDTH_MAX = 420
const RETIRED_ROW_BG = '#fff1f2'
const ROW_H_KEY = 'kij_women_info_row_h'
const ROW_HEIGHT_MIN = 28
const ROW_HEIGHT_DEFAULT = 40

function loadRowH(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(ROW_H_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

const COLOR_CHOICES = [
  '#ffffff', '#f8fafc', '#fef3c7', '#fee2e2', '#dcfce7', '#dbeafe', '#f3e8ff', '#ffedd5',
  '#111827', '#1d4ed8', '#047857', '#b45309', '#be123c', '#6d28d9',
]

const DEFAULT_COLUMN_LABELS = [
  '名前', '入店日', '退店日', '連絡方法', '交通手段', '社内ポータル', '出勤リクエスト', 'オキニトーク',
  'タトゥー', '聖水', '私物P', 'ロープ', '店舗コスプレ', '私物コスプレ',
  '3P講師', '3P',
  'NGエリア', '自宅', 'ビジホ', 'レンタルルーム', '外国人対応', 'リラックス',
  '交通費', '請求書', '送迎費',
  'その他', '私物コスプレ名称', '私物おもちゃ名称',
]

const DEFAULT_COLUMNS = DEFAULT_COLUMN_LABELS.map((label, index) => ({
  id: `field_${index + 1}`,
  label,
  width: label.length >= 8 ? 160 : 120,
  multiline: ['NGエリア', 'その他', '私物コスプレ名称', '私物おもちゃ名称'].includes(label),
  headerBg: '#111827',
  headerText: '#ffffff',
  cellBg: '#ffffff',
  cellText: '#1f2937',
}))

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
  storeId: number
  status: WomenInfoStatus
  sortOrder: number
  height?: number
  values: Record<string, string>
}

type WomenInfoStatus = 'active' | 'retired'

type SheetConfig = {
  columns: SheetColumn[]
}

type BoardAnnotationRow = {
  id: string
  store_id: number
  memo: string | null
  created_at?: string | null
}

type ConfigState = {
  id: string | null
  columns: SheetColumn[]
  needsDefaultReset: boolean
}

function normalizeColumn(raw: Partial<SheetColumn>, index: number): SheetColumn {
  const fallback = DEFAULT_COLUMNS[index] ?? DEFAULT_COLUMNS[0]
  return {
    id: raw.id || `col_${Date.now()}_${index}`,
    label: raw.label || fallback.label,
    width: clampColumnWidth(Number(raw.width) || fallback.width),
    multiline: Boolean(raw.multiline),
    headerBg: raw.headerBg || fallback.headerBg,
    headerText: raw.headerText || fallback.headerText,
    cellBg: raw.cellBg || fallback.cellBg,
    cellText: raw.cellText || fallback.cellText,
  }
}

function clampColumnWidth(width: number): number {
  return Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, Math.round(width)))
}

function clampRowHeight(height: number): number {
  return Math.max(ROW_HEIGHT_MIN, Math.round(height))
}

function defaultValues(columns: SheetColumn[]): Record<string, string> {
  return Object.fromEntries(columns.map(column => [column.id, '']))
}

function parseRow(row: BoardAnnotationRow, columns: SheetColumn[]): WomenInfoRow | null {
  if (!row.memo?.startsWith(ROW_MEMO_PREFIX)) return null
  try {
    const parsed = JSON.parse(row.memo.slice(ROW_MEMO_PREFIX.length)) as {
      sortOrder?: number
      status?: string
      height?: number
      values?: Record<string, string>
      [key: string]: unknown
    }
    const source = parsed.values && typeof parsed.values === 'object' ? parsed.values : parsed
    const base: Record<string, string> = {}
    for (const [key, value] of Object.entries(source)) {
      base[key] = typeof value === 'string' ? value : ''
    }
    for (const column of columns) {
      if (!(column.id in base)) base[column.id] = ''
    }
    return {
      id: row.id,
      storeId: row.store_id,
      status: parsed.status === 'retired' ? 'retired' : 'active',
      sortOrder: typeof parsed.sortOrder === 'number' ? parsed.sortOrder : 0,
      height: typeof parsed.height === 'number' ? clampRowHeight(parsed.height) : undefined,
      values: base,
    }
  } catch {
    return null
  }
}

function parseConfig(row: BoardAnnotationRow | undefined): ConfigState {
  if (!row?.memo?.startsWith(CONFIG_MEMO_PREFIX)) {
    return { id: null, columns: DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index)), needsDefaultReset: false }
  }
  try {
    const parsed = JSON.parse(row.memo.slice(CONFIG_MEMO_PREFIX.length)) as Partial<SheetConfig>
    const parsedColumns = Array.isArray(parsed.columns) ? parsed.columns : []
    const columns = parsedColumns.length
      ? parsedColumns.map(normalizeColumn)
      : DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index))
    return {
      id: row.id,
      columns,
      needsDefaultReset: false,
    }
  } catch {
    return { id: row.id, columns: DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index)), needsDefaultReset: true }
  }
}

function configScore(row: BoardAnnotationRow): number {
  if (!row.memo?.startsWith(CONFIG_MEMO_PREFIX)) return -1
  try {
    const parsed = JSON.parse(row.memo.slice(CONFIG_MEMO_PREFIX.length)) as Partial<SheetConfig>
    const parsedColumns = Array.isArray(parsed.columns) ? parsed.columns : []
    return parsedColumns.reduce((score, rawColumn, index) => {
      const fallback = DEFAULT_COLUMNS[index]
      const column = normalizeColumn(rawColumn, index)
      if (!fallback) return score + 20
      if (column.id !== fallback.id) score += 4
      if (column.label !== fallback.label) score += 4
      if (column.width !== fallback.width) score += 10
      if (column.multiline !== fallback.multiline) score += 3
      if (column.headerBg !== fallback.headerBg) score += 2
      if (column.headerText !== fallback.headerText) score += 2
      if (column.cellBg !== fallback.cellBg) score += 2
      if (column.cellText !== fallback.cellText) score += 2
      return score
    }, parsedColumns.length !== DEFAULT_COLUMNS.length ? 20 : 0)
  } catch {
    return -1
  }
}

function selectConfigRow(rows: BoardAnnotationRow[]): BoardAnnotationRow | undefined {
  return rows
    .filter(row => row.memo?.startsWith(CONFIG_MEMO_PREFIX))
    .sort((a, b) => {
      const scoreDiff = configScore(b) - configScore(a)
      if (scoreDiff !== 0) return scoreDiff
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    })[0]
}

function encodeRow(row: WomenInfoRow): string {
  return `${ROW_MEMO_PREFIX}${JSON.stringify({ sortOrder: row.sortOrder, status: row.status, height: row.height, values: row.values })}`
}

function encodeConfig(columns: SheetColumn[]): string {
  return `${CONFIG_MEMO_PREFIX}${JSON.stringify({ columns })}`
}

function hasContent(row: WomenInfoRow): boolean {
  return Object.values(row.values).some(value => value.trim())
}

function getInitialAreaId(): number {
  if (typeof window === 'undefined') return DEFAULT_AREA_ID
  const saved = Number(window.localStorage.getItem(AREA_STORAGE_KEY))
  return WOMEN_INFO_AREA_IDS.includes(saved) ? saved : DEFAULT_AREA_ID
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

const DARK_CELL_BG    = '#1a2e48'
const DARK_CELL_TEXT  = '#eef2f7'
const DARK_RETIRED_BG = 'rgba(153,27,27,.28)'

function hexLuminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 0.5
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const [R, G, B] = [r, g, b].map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function resolveColor(value: string, darkDefault: string, isDark: boolean) {
  if (!isDark) return value
  return hexLuminance(value) > 0.15 ? darkDefault : value
}

// For text: dark text (low luminance) → replace with light text in dark mode
function resolveTextColor(value: string, darkDefault: string, isDark: boolean) {
  if (!isDark) return value
  return hexLuminance(value) <= 0.15 ? darkDefault : value
}

export default function WomenInfoPage() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [selectedAreaId, setSelectedAreaId] = useState(getInitialAreaId)
  const [configId, setConfigId] = useState<string | null>(null)
  const [columns, setColumns] = useState<SheetColumn[]>(() => DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index)))
  const [rows, setRows] = useState<WomenInfoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [savingConfig, setSavingConfig] = useState(false)
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [rowH, setRowH] = useState<Record<string, number>>({})
  const selectedAreaRef = useRef(selectedAreaId)
  const rowResizeRef = useRef<{ id: string; startY: number; startH: number; lastH: number } | null>(null)
  const womenInfoStores = useMemo(() => STORES.filter(store => WOMEN_INFO_AREA_IDS.includes(store.id)), [])

  useEffect(() => {
    const timer = window.setTimeout(() => setRowH(loadRowH()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const fetchRows = useCallback(async (areaId = selectedAreaId) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('board_annotations')
      .select('id, store_id, memo, created_at')
      .eq('store_id', areaId)
      .eq('date', WOMEN_INFO_DATE)
      .or(`memo.like.${ROW_MEMO_PREFIX}%,memo.like.${CONFIG_MEMO_PREFIX}%`)
      .order('created_at', { ascending: false })

    if (error) {
      if (areaId === selectedAreaRef.current) setLoading(false)
      return
    }

    if (areaId !== selectedAreaRef.current) return

    const rawRows = (data ?? []) as BoardAnnotationRow[]
    const config = parseConfig(selectConfigRow(rawRows))
    const parsedRows = rawRows
      .map(row => parseRow(row, config.columns))
      .filter((row): row is WomenInfoRow => Boolean(row))
      .sort((a, b) => a.sortOrder - b.sortOrder)

    setConfigId(config.id)
    setColumns(config.columns)
    setRows(parsedRows)
    setDirtyIds(new Set())
    setSelectedRowId(null)
    setLoading(false)
  }, [selectedAreaId])

  useEffect(() => {
    selectedAreaRef.current = selectedAreaId
  }, [selectedAreaId])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      if (active) void fetchRows(selectedAreaId)
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [fetchRows, selectedAreaId])

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(AREA_STORAGE_KEY))
    if (!WOMEN_INFO_AREA_IDS.includes(saved)) {
      window.localStorage.setItem(AREA_STORAGE_KEY, String(selectedAreaId))
    }
  }, [selectedAreaId])

  function selectArea(areaId: number) {
    setSelectedAreaId(areaId)
    window.localStorage.setItem(AREA_STORAGE_KEY, String(areaId))
    setConfigId(null)
    setColumns(DEFAULT_COLUMNS.map((column, index) => normalizeColumn(column, index)))
    setRows([])
    setDirtyIds(new Set())
    setSelectedRowId(null)
  }

  useEffect(() => {
    if (dirtyIds.size === 0) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirtyIds])

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

  const selectedRow = useMemo(() => {
    return rows.find(row => row.id === selectedRowId) ?? null
  }, [rows, selectedRowId])

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
      store_id: row.storeId,
    }

    if (row.id.startsWith('pending-')) {
      if (!hasContent(row)) {
        setSaving(row.id, false)
        setDirtyIds(current => {
          const next = new Set(current)
          next.delete(row.id)
          return next
        })
        return
      }
      const { data, error } = await supabase.from('board_annotations').insert(payload).select('id').single()
      setSaving(row.id, false)
      if (error || !data) {
        fetchRows()
        return
      }
      setRows(current => current.map(item => item.id === row.id ? { ...row, id: data.id } : item))
      setSelectedRowId(current => current === row.id ? data.id : current)
      setDirtyIds(current => {
        const next = new Set(current)
        next.delete(row.id)
        return next
      })
      return
    }

    if (!hasContent(row)) {
      const { error } = await supabase.from('board_annotations').update(payload).eq('id', row.id)
      setSaving(row.id, false)
      if (error) fetchRows()
      else setDirtyIds(current => {
        const next = new Set(current)
        next.delete(row.id)
        return next
      })
      return
    }

    const { error } = await supabase.from('board_annotations').update(payload).eq('id', row.id)
    setSaving(row.id, false)
    if (error) fetchRows()
    else setDirtyIds(current => {
      const next = new Set(current)
      next.delete(row.id)
      return next
    })
  }

  function updateCell(rowId: string, columnId: string, value: string) {
    setSelectedRowId(rowId)
    setRows(current => current.map(row => row.id === rowId
      ? { ...row, values: { ...row.values, [columnId]: value } }
      : row
    ))
    setDirtyIds(current => new Set(current).add(rowId))
  }

  async function saveCell(rowId: string) {
    const row = rows.find(item => item.id === rowId)
    if (row) await persistRow(row)
  }

  function addRow() {
    const sortOrder = rows.length ? Math.max(...rows.map(row => row.sortOrder)) + 1 : 1
    const id = `pending-${Date.now()}`
    setRows(current => [...current, { id, storeId: selectedAreaId, status: 'active', sortOrder, values: defaultValues(columns) }])
    setSelectedRowId(id)
  }

  async function deleteRow(rowId: string) {
    const row = rows.find(item => item.id === rowId)
    if (!row) return
    const rowName = row.values.field_1?.trim()
    if (!window.confirm(`${rowName || '選択中の行'}を削除します。よろしいですか？`)) return
    setRows(current => current.filter(item => item.id !== rowId))
    setSelectedRowId(current => current === rowId ? null : current)
    if (row.id.startsWith('pending-')) return
    const { error } = await supabase.from('board_annotations').delete().eq('id', row.id)
    if (error) fetchRows()
  }

  async function deleteSelectedRow() {
    if (!selectedRow) return
    await deleteRow(selectedRow.id)
  }

  async function updateRowStatus(rowId: string, status: WomenInfoStatus) {
    setSelectedRowId(rowId)
    const row = rows.find(item => item.id === rowId)
    if (!row) return
    const nextRow = { ...row, status }
    setRows(current => current.map(item => item.id === rowId ? nextRow : item))
    setDirtyIds(current => new Set(current).add(rowId))
    await persistRow(nextRow)
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

  async function saveColumnWidth(columnId: string, width: number) {
    await updateColumn(columnId, { width: clampColumnWidth(width) })
  }

  function startRowResize(e: React.MouseEvent, rowId: string) {
    e.preventDefault()
    e.stopPropagation()
    const initH = rowH[rowId] ?? rows.find(row => row.id === rowId)?.height ?? ROW_HEIGHT_DEFAULT
    rowResizeRef.current = { id: rowId, startY: e.clientY, startH: initH, lastH: initH }

    function onMove(ev: MouseEvent) {
      const ref = rowResizeRef.current
      if (!ref) return
      const h = clampRowHeight(ref.startH + ev.clientY - ref.startY)
      ref.lastH = h
      setRowH(prev => ({ ...prev, [ref.id]: h }))
    }

    function onUp() {
      const ref = rowResizeRef.current
      rowResizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!ref) return
      const { id, lastH } = ref
      setRowH(prev => ({ ...prev, [id]: lastH }))
      try {
        const saved = JSON.parse(window.localStorage.getItem(ROW_H_KEY) ?? '{}') as Record<string, number>
        window.localStorage.setItem(ROW_H_KEY, JSON.stringify({ ...saved, [id]: lastH }))
      } catch {}
      const row = rows.find(item => item.id === id)
      if (!row) return
      const nextRow = { ...row, height: lastH }
      setRows(current => current.map(item => item.id === id ? nextRow : item))
      if (!id.startsWith('pending-')) void persistRow(nextRow)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
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
            {womenInfoStores.map(store => (
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
              onClick={() => fetchRows(selectedAreaId)}
              disabled={savingConfig}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              再読込
            </button>
            <button
              type="button"
              onClick={addColumn}
              disabled={savingConfig}
              className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
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
                min={COLUMN_WIDTH_MIN}
                max={COLUMN_WIDTH_MAX}
                value={selectedColumn.width}
                onChange={e => editColumn(selectedColumn.id, { width: clampColumnWidth(Number(e.target.value) || selectedColumn.width) })}
                onBlur={e => saveColumnWidth(selectedColumn.id, Number(e.currentTarget.value) || selectedColumn.width)}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
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
            <button
              type="button"
              onClick={deleteSelectedRow}
              disabled={!selectedRow}
              className="h-8 rounded-lg border border-red-200 bg-white px-3 font-bold text-red-600 hover:bg-red-50 disabled:opacity-30"
              title={selectedRow ? '選択中の行を削除' : '削除する行を選択してください'}
            >
              行削除
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
                  {columns.map((column, colIndex) => (
                    <th
                      key={column.id}
                      onClick={() => setSelectedColumnId(column.id)}
                      className={`border-r border-gray-300 p-0 align-middle ${colIndex === 0 ? 'sticky left-[104px] z-30' : ''} ${selectedColumnId === column.id ? 'ring-2 ring-inset ring-blue-400' : ''}`}
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
                  <th className="sticky right-0 z-30 w-28 border-l border-gray-700 bg-gray-900 px-2 py-2 text-center text-white">状態</th>
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
                  filteredRows.map((row, index) => {
                    const isRetired = row.status === 'retired'
                    const rowBg = isRetired ? (isDark ? DARK_RETIRED_BG : RETIRED_ROW_BG) : undefined
                    const rowHeight = rowH[row.id] ?? row.height ?? ROW_HEIGHT_DEFAULT
                    const rowClass = selectedRowId === row.id
                      ? 'border-t border-blue-300 bg-blue-50/40'
                      : 'border-t border-gray-200 odd:bg-white even:bg-gray-50/60'
                    return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRowId(row.id)}
                      className={rowClass}
                      style={
                        rowBg
                          ? { backgroundColor: rowBg }
                          : isDark
                            ? { backgroundColor: index % 2 === 0 ? '#1a2e48' : '#132338' }
                            : undefined
                      }
                    >
                      <td className="sticky left-0 z-10 border-r border-gray-200 bg-inherit relative" style={{ height: rowHeight }}>
                        <div className="flex h-full items-center justify-center gap-1">
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
                        </div>
                        <div
                          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize bg-transparent hover:bg-blue-300/60"
                          onMouseDown={e => startRowResize(e, row.id)}
                          title="ドラッグで行の高さを変更"
                        />
                      </td>
                      <td className="sticky left-14 z-10 border-r border-gray-200 bg-inherit px-2 py-2 text-center font-semibold text-gray-500 align-middle" style={{ height: rowHeight }}>
                        {index + 1}
                      </td>
                      {columns.map((column, colIndex) => (
                        <td
                          key={column.id}
                          className={`relative border-r border-gray-200 p-0 align-top ${colIndex === 0 ? 'sticky left-[104px] z-10' : ''}`}
                          style={{ backgroundColor: rowBg ?? resolveColor(column.cellBg, DARK_CELL_BG, isDark), height: rowHeight }}
                        >
                          {column.multiline ? (
                            <textarea
                              value={row.values[column.id] ?? ''}
                              onFocus={() => setSelectedRowId(row.id)}
                              onChange={e => updateCell(row.id, column.id, e.target.value)}
                              onBlur={() => saveCell(row.id)}
                              rows={2}
                              className="block w-full resize-none border-0 bg-transparent px-2 py-2 text-xs leading-relaxed outline-none focus:bg-blue-50 focus:ring-2 focus:ring-blue-300"
                              style={{ color: resolveTextColor(column.cellText, DARK_CELL_TEXT, isDark), height: rowHeight }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={row.values[column.id] ?? ''}
                              onFocus={() => setSelectedRowId(row.id)}
                              onChange={e => updateCell(row.id, column.id, e.target.value)}
                              onBlur={() => saveCell(row.id)}
                              className="block w-full border-0 bg-transparent px-2 text-xs outline-none focus:bg-blue-50 focus:ring-2 focus:ring-blue-300"
                              style={{ color: resolveTextColor(column.cellText, DARK_CELL_TEXT, isDark), height: rowHeight }}
                            />
                          )}
                          <div
                            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize bg-transparent hover:bg-blue-300/60"
                            onMouseDown={e => startRowResize(e, row.id)}
                            title="ドラッグで行の高さを変更"
                          />
                        </td>
                      ))}
                      <td className="sticky right-0 z-10 border-l border-gray-200 bg-inherit px-2 py-1 text-center align-middle" style={{ height: rowHeight }}>
                        <div className="flex items-center justify-center gap-2">
                          <span className="min-w-10 text-[11px] text-gray-400">
                            {savingIds.has(row.id) ? '保存中' : dirtyIds.has(row.id) ? '未保存' : '保存済'}
                          </span>
                          <select
                            value={row.status}
                            onChange={e => updateRowStatus(row.id, e.target.value as WomenInfoStatus)}
                            className="h-7 rounded border border-gray-300 bg-white px-1 text-xs font-bold text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            title="在籍状態"
                          >
                            <option value="active">在籍</option>
                            <option value="retired">退店</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
