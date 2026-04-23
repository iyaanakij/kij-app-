'use client'

import { useEffect, useState, useCallback } from 'react'

const SHOPS = [
  { id: '111701', label: '西船橋' },
  { id: '111702', label: '成田' },
  { id: '111703', label: '千葉' },
  { id: '111704', label: '錦糸町' },
]

const SITES = [
  { id: 'mka_narita',    label: '成田M' },
  { id: 'iya_narita',    label: '成田癒' },
  { id: 'mka_chiba',     label: '千葉M' },
  { id: 'iya_chiba',     label: '千葉癒' },
  { id: 'mka_funabashi', label: '西船橋M' },
  { id: 'iya_funabashi', label: '西船橋癒' },
  { id: 'mka_kinshicho', label: '錦糸町M' },
  { id: 'iya_kinshicho', label: '錦糸町癒' },
]

const PAGE_SIZE = 20

type RuleRow = {
  cs3_cast_id: string
  source_shop_id: string
  site_id: string
  enabled: boolean
  cp4_gid: string | null
  venrey_cast_id: string | null
  cast_name: string | null
}

type RuleKey = string
type FilterType = 'all' | 'venrey' | 'cp4' | 'unset'

function ruleKey(shopId: string, siteId: string): RuleKey {
  return `${shopId}:${siteId}`
}

function hasCredentials(row: RuleRow): boolean {
  return !!(row.cp4_gid || row.venrey_cast_id)
}

function castCreds(rowMap: Map<RuleKey, RuleRow>) {
  let hasVenrey = false, hasCP4 = false
  for (const r of rowMap.values()) {
    if (r.venrey_cast_id) hasVenrey = true
    if (r.cp4_gid) hasCP4 = true
  }
  return { hasVenrey, hasCP4 }
}

function CastMatrix({
  castId,
  castName,
  rowMap,
  onSaved,
}: {
  castId: string
  castName: string
  rowMap: Map<RuleKey, RuleRow>
  onSaved: (castId: string, updates: Pick<RuleRow, 'source_shop_id' | 'site_id' | 'enabled'>[]) => void
}) {
  const [edits, setEdits] = useState<Record<RuleKey, boolean>>(() => {
    const init: Record<RuleKey, boolean> = {}
    for (const [k, row] of rowMap) init[k] = row.enabled
    return init
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { hasVenrey, hasCP4 } = castCreds(rowMap)
  const enabledCount = Object.values(edits).filter(Boolean).length

  const handleChange = (shopId: string, siteId: string, checked: boolean) => {
    const row = rowMap.get(ruleKey(shopId, siteId))
    if (!row || !hasCredentials(row)) return
    setSaved(false)
    setEdits(prev => ({ ...prev, [ruleKey(shopId, siteId)]: checked }))
  }

  const handleSave = async () => {
    setSaving(true)
    const updates = SHOPS.flatMap(shop =>
      SITES.map(site => ({
        cs3_cast_id: castId,
        source_shop_id: shop.id,
        site_id: site.id,
        enabled: edits[ruleKey(shop.id, site.id)] ?? false,
      }))
    )
    const res = await fetch('/api/admin/publish-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); onSaved(castId, updates) }
  }

  return (
    <details className="border border-gray-200 rounded-lg overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-gray-50 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-gray-800 text-sm truncate">{castName}</span>
          <div className="flex gap-1 shrink-0">
            {hasVenrey && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">V</span>
            )}
            {hasCP4 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">C</span>
            )}
            {!hasVenrey && !hasCP4 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">未登録</span>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-3">{enabledCount} / 32 有効</span>
      </summary>
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="w-16 py-1 pr-2 text-left text-gray-400 font-normal">送信元</th>
                {SITES.map(s => (
                  <th key={s.id} className="px-1.5 py-1 text-center text-gray-600 font-semibold whitespace-nowrap">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHOPS.map(shop => (
                <tr key={shop.id} className="border-t border-gray-100">
                  <td className="py-2 pr-2 text-gray-500 whitespace-nowrap">{shop.label}</td>
                  {SITES.map(site => {
                    const row = rowMap.get(ruleKey(shop.id, site.id))
                    const hasCreds = row ? hasCredentials(row) : false
                    const checked = edits[ruleKey(shop.id, site.id)] ?? false
                    const credType = row?.venrey_cast_id && row?.cp4_gid ? 'both'
                      : row?.venrey_cast_id ? 'venrey'
                      : row?.cp4_gid ? 'cp4'
                      : 'none'
                    const accentClass = credType === 'both' ? 'accent-green-500'
                      : credType === 'venrey' ? 'accent-blue-500'
                      : credType === 'cp4' ? 'accent-orange-500'
                      : ''
                    const tooltipParts = []
                    if (row?.cp4_gid) tooltipParts.push(`CP4: ${row.cp4_gid}`)
                    if (row?.venrey_cast_id) tooltipParts.push(`Venrey: ${row.venrey_cast_id}`)
                    return (
                      <td key={site.id} className="px-1.5 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!hasCreds}
                          onChange={e => handleChange(shop.id, site.id, e.target.checked)}
                          className={`w-4 h-4 rounded ${hasCreds ? `cursor-pointer ${accentClass}` : 'opacity-20 cursor-not-allowed'}`}
                          title={tooltipParts.length ? tooltipParts.join(' / ') : '未登録'}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {saved && <span className="text-green-600 text-xs">保存しました</span>}
        </div>
      </div>
    </details>
  )
}

const FILTERS: { key: FilterType; label: string; activeClass: string }[] = [
  { key: 'all',    label: '全員',        activeClass: 'bg-gray-700 text-white' },
  { key: 'venrey', label: 'Venrey同期ON', activeClass: 'bg-blue-600 text-white' },
  { key: 'cp4',    label: 'CP4同期ON',   activeClass: 'bg-orange-500 text-white' },
  { key: 'unset',  label: '未登録',      activeClass: 'bg-gray-400 text-white' },
]

export default function PublishRulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [page, setPage] = useState(0)

  useEffect(() => {
    fetch('/api/admin/publish-rules')
      .then(r => r.json())
      .then(json => { setRules(json.rules ?? []); setLoading(false) })
  }, [])

  const handleSaved = useCallback((
    castId: string,
    updates: Pick<RuleRow, 'source_shop_id' | 'site_id' | 'enabled'>[],
  ) => {
    setRules(prev => prev.map(r => {
      if (r.cs3_cast_id !== castId) return r
      const u = updates.find(u => u.source_shop_id === r.source_shop_id && u.site_id === r.site_id)
      return u ? { ...r, enabled: u.enabled } : r
    }))
  }, [])

  const casts = (() => {
    const map = new Map<string, { castId: string; castName: string; rowMap: Map<RuleKey, RuleRow> }>()
    for (const row of rules) {
      if (!map.has(row.cs3_cast_id)) {
        map.set(row.cs3_cast_id, { castId: row.cs3_cast_id, castName: row.cast_name ?? row.cs3_cast_id, rowMap: new Map() })
      }
      map.get(row.cs3_cast_id)!.rowMap.set(ruleKey(row.source_shop_id, row.site_id), row)
    }
    return Array.from(map.values()).sort((a, b) => a.castName.localeCompare(b.castName, 'ja'))
  })()

  // enabled=true かつ credential あり = 実際に同期されている
  const isSyncingVenrey = (rowMap: Map<RuleKey, RuleRow>) => {
    for (const r of rowMap.values()) if (r.venrey_cast_id && r.enabled) return true
    return false
  }
  const isSyncingCP4 = (rowMap: Map<RuleKey, RuleRow>) => {
    for (const r of rowMap.values()) if (r.cp4_gid && r.enabled) return true
    return false
  }

  // フィルタカウント
  const counts = {
    all:    casts.length,
    venrey: casts.filter(c => isSyncingVenrey(c.rowMap)).length,
    cp4:    casts.filter(c => isSyncingCP4(c.rowMap)).length,
    unset:  casts.filter(c => { const { hasVenrey, hasCP4 } = castCreds(c.rowMap); return !hasVenrey && !hasCP4 }).length,
  }

  const filtered = (() => {
    let result = search ? casts.filter(c => c.castName.includes(search)) : casts
    if (filter === 'venrey') result = result.filter(c => isSyncingVenrey(c.rowMap))
    else if (filter === 'cp4')  result = result.filter(c => isSyncingCP4(c.rowMap))
    else if (filter === 'unset') {
      result = result.filter(c => { const { hasVenrey, hasCP4 } = castCreds(c.rowMap); return !hasVenrey && !hasCP4 })
    }
    return result
  })()

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        読み込み中...
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">配信ルール管理</h1>
        <p className="text-xs text-gray-400 mt-0.5">どのCS3店舗からのシフトをどの掲載先に反映するかを設定します</p>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-5 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded font-bold bg-blue-100 text-blue-700">V</span> VenreyのID登録あり</span>
        <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded font-bold bg-orange-100 text-orange-700">C</span> CP4のID登録あり</span>
        <span className="text-gray-300">|</span>
        <span>チェックON = 実際に同期する設定</span>
        <span className="flex items-center gap-1">チェック色：<span className="text-blue-500 font-medium">青=Vのみ</span> / <span className="text-orange-500 font-medium">橙=Cのみ</span> / <span className="text-green-500 font-medium">緑=両方</span></span>
      </div>

      {/* フィルタ */}
      <div className="flex gap-2 flex-wrap mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(0) }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f.key ? f.activeClass : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label} <span className="opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {/* 検索 */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="女性名で検索..."
          className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span className="ml-3 text-xs text-gray-400">{filtered.length} 件</span>
      </div>

      {/* キャスト一覧 */}
      <div className="space-y-2">
        {paginated.map(c => (
          <CastMatrix
            key={c.castId}
            castId={c.castId}
            castName={c.castName}
            rowMap={c.rowMap}
            onSaved={handleSaved}
          />
        ))}
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center gap-3 justify-center">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            ← 前
          </button>
          <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            次 →
          </button>
        </div>
      )}
    </div>
  )
}
