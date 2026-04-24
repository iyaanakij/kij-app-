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
type FilterType = 'all' | 'venrey' | 'cp4' | 'review' | 'unset'

function ruleKey(shopId: string, siteId: string): RuleKey {
  return `${shopId}:${siteId}`
}

function castCreds(rowMap: Map<RuleKey, RuleRow>) {
  let hasVenrey = false, hasCP4 = false
  for (const r of rowMap.values()) {
    if (r.venrey_cast_id) hasVenrey = true
    if (r.cp4_gid) hasCP4 = true
  }
  return { hasVenrey, hasCP4 }
}

function isSiteEnabled(edits: Record<RuleKey, boolean>, siteId: string): boolean {
  return SHOPS.some(shop => edits[ruleKey(shop.id, siteId)] ?? false)
}

function getSiteCreds(rowMap: Map<RuleKey, RuleRow>, siteId: string): { hasV: boolean; hasC: boolean } {
  for (const shop of SHOPS) {
    const row = rowMap.get(ruleKey(shop.id, siteId))
    if (row) return { hasV: !!row.venrey_cast_id, hasC: !!row.cp4_gid }
  }
  return { hasV: false, hasC: false }
}

function SiteToggle({
  siteId,
  label,
  isOn,
  hasV,
  hasC,
  onChange,
}: {
  siteId: string
  label: string
  isOn: boolean
  hasV: boolean
  hasC: boolean
  onChange: (siteId: string, value: boolean) => void
}) {
  const noId = !hasV && !hasC
  const bgColor = !isOn
    ? 'bg-gray-200'
    : noId
      ? 'bg-amber-400'
      : hasV && hasC
        ? 'bg-green-500'
        : hasV
          ? 'bg-blue-500'
          : 'bg-orange-500'

  const statusLabel = !isOn
    ? 'OFF'
    : noId
      ? '⚠ ID未登録'
      : hasV && hasC
        ? 'V + C'
        : hasV
          ? 'Venrey'
          : 'CP4'

  const statusColor = !isOn
    ? 'text-gray-300'
    : noId
      ? 'text-amber-500 font-medium'
      : 'text-gray-500'

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">{label}</span>
      <button
        onClick={() => onChange(siteId, !isOn)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${bgColor}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isOn ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className={`text-[10px] ${statusColor}`}>{statusLabel}</span>
    </div>
  )
}

function CastCard({
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
  const enabledSites = SITES.filter(s => isSiteEnabled(edits, s.id)).length
  const warningSites = SITES.filter(s => {
    if (!isSiteEnabled(edits, s.id)) return false
    const { hasV, hasC } = getSiteCreds(rowMap, s.id)
    return !hasV && !hasC
  }).length

  const toggleSite = (siteId: string, value: boolean) => {
    setSaved(false)
    const next: Record<string, boolean> = {}
    for (const shop of SHOPS) next[ruleKey(shop.id, siteId)] = value
    setEdits(prev => ({ ...prev, ...next }))
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
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Venrey</span>
            )}
            {hasCP4 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">CP4</span>
            )}
            {!hasVenrey && !hasCP4 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">ID未登録</span>
            )}
            {warningSites > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                ⚠ {warningSites}サイト ID未登録
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-3">
          {enabledSites > 0 ? `${enabledSites} / 8 サイト有効` : '未設定'}
        </span>
      </summary>

      <div className="p-5 bg-white border-t border-gray-100">
        <p className="text-[11px] text-gray-400 mb-4">ONにしたサイトに出勤スケジュールが自動反映されます</p>
        <div className="grid grid-cols-4 gap-x-6 gap-y-5">
          {SITES.map(site => {
            const isOn = isSiteEnabled(edits, site.id)
            const { hasV, hasC } = getSiteCreds(rowMap, site.id)
            return (
              <SiteToggle
                key={site.id}
                siteId={site.id}
                label={site.label}
                isOn={isOn}
                hasV={hasV}
                hasC={hasC}
                onChange={toggleSite}
              />
            )
          })}
        </div>
        <div className="mt-5 flex items-center gap-3">
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
  { key: 'venrey', label: 'Venrey同期中', activeClass: 'bg-blue-600 text-white' },
  { key: 'cp4',    label: 'CP4同期中',   activeClass: 'bg-orange-500 text-white' },
  { key: 'review', label: '要確認',      activeClass: 'bg-amber-500 text-white' },
  { key: 'unset',  label: 'ID未登録',    activeClass: 'bg-gray-400 text-white' },
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

  const isSyncingVenrey = (rowMap: Map<RuleKey, RuleRow>) => {
    for (const r of rowMap.values()) if (r.venrey_cast_id && r.enabled) return true
    return false
  }
  const isSyncingCP4 = (rowMap: Map<RuleKey, RuleRow>) => {
    for (const r of rowMap.values()) if (r.cp4_gid && r.enabled) return true
    return false
  }
  // 要確認 = IDあり・全サイト未設定（新規自動追加キャストが確認待ち）
  const needsReview = (rowMap: Map<RuleKey, RuleRow>) => {
    const { hasVenrey, hasCP4 } = castCreds(rowMap)
    if (!hasVenrey && !hasCP4) return false
    for (const r of rowMap.values()) if (r.enabled) return false
    return true
  }

  const counts = {
    all:    casts.length,
    venrey: casts.filter(c => isSyncingVenrey(c.rowMap)).length,
    cp4:    casts.filter(c => isSyncingCP4(c.rowMap)).length,
    review: casts.filter(c => needsReview(c.rowMap)).length,
    unset:  casts.filter(c => { const { hasVenrey, hasCP4 } = castCreds(c.rowMap); return !hasVenrey && !hasCP4 }).length,
  }

  const filtered = (() => {
    let result = search ? casts.filter(c => c.castName.includes(search)) : casts
    if (filter === 'venrey') result = result.filter(c => isSyncingVenrey(c.rowMap))
    else if (filter === 'cp4') result = result.filter(c => isSyncingCP4(c.rowMap))
    else if (filter === 'review') result = result.filter(c => needsReview(c.rowMap))
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">配信ルール管理</h1>
        <p className="text-xs text-gray-400 mt-0.5">各女性の出勤スケジュールをどのサイトに反映するかを設定します</p>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-5 px-3 py-2.5 bg-gray-50 rounded-lg text-xs text-gray-500">
        <span className="font-medium text-gray-600 shrink-0">トグルの色：</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />ON（Venrey + CP4 両方）</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-blue-500 shrink-0" />ON（Venreyのみ）</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-orange-500 shrink-0" />ON（CP4のみ）</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-amber-400 shrink-0" />ON（⚠ ID未登録・反映されない）</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-gray-200 shrink-0" />OFF</span>
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
            {f.label}
            {f.key === 'review' && counts.review > 0
              ? <span className="ml-1 px-1 py-0.5 bg-amber-600 text-white rounded-full text-[10px]">{counts.review}</span>
              : <span className="opacity-60 ml-1">({counts[f.key]})</span>
            }
          </button>
        ))}
      </div>

      {/* 検索 */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="女性名で検索..."
          className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span className="text-xs text-gray-400">{filtered.length} 件</span>
      </div>

      {/* キャスト一覧 */}
      <div className="space-y-2">
        {paginated.map(c => (
          <CastCard
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
