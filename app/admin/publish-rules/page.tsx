'use client'

import { useEffect, useState, useCallback } from 'react'

const SHOPS = [
  { id: '111701', label: '西船橋' },
  { id: '111702', label: '成田' },
  { id: '111703', label: '千葉' },
  { id: '111704', label: '錦糸町' },
]

// エリア別グループで視認性向上
const SITE_GROUPS = [
  { area: '成田',   sites: [{ id: 'mka_narita',    label: 'M性感' }, { id: 'iya_narita',    label: '癒し' }] },
  { area: '千葉',   sites: [{ id: 'mka_chiba',     label: 'M性感' }, { id: 'iya_chiba',     label: '癒し' }] },
  { area: '西船橋', sites: [{ id: 'mka_funabashi', label: 'M性感' }, { id: 'iya_funabashi', label: '癒し' }] },
  { area: '錦糸町', sites: [{ id: 'mka_kinshicho', label: 'M性感' }, { id: 'iya_kinshicho', label: '癒し' }] },
]
const SITES = SITE_GROUPS.flatMap(g => g.sites)

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
type FilterType = 'all' | 'venrey' | 'hp' | 'review' | 'unset'

function ruleKey(shopId: string, siteId: string): RuleKey {
  return `${shopId}:${siteId}`
}

function castCreds(rowMap: Map<RuleKey, RuleRow>) {
  let hasVenrey = false, hasHP = false
  for (const r of rowMap.values()) {
    if (r.venrey_cast_id) hasVenrey = true
    if (r.cp4_gid) hasHP = true
  }
  return { hasVenrey, hasHP }
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

  const { hasVenrey, hasHP } = castCreds(rowMap)
  const enabledCount = Object.values(edits).filter(Boolean).length

  const warningCount = (() => {
    let n = 0
    for (const [k, row] of rowMap) {
      const checked = edits[k] ?? false
      if (checked && (!row.venrey_cast_id || !row.cp4_gid)) n++
    }
    return n
  })()

  const handleChange = (shopId: string, siteId: string, checked: boolean) => {
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
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Venrey</span>
            )}
            {hasHP && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">HP</span>
            )}
            {!hasVenrey && !hasHP && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">ID未登録</span>
            )}
            {warningCount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">⚠ {warningCount}件 ID未登録</span>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-3">{enabledCount} / 32 有効</span>
      </summary>

      <div className="p-4 bg-white border-t border-gray-100">
        <p className="text-[11px] text-gray-400 mb-3">
          CS3の承認元店舗ごとに、どのサイトに反映するかを設定します
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="w-16 py-1 pr-3 text-left text-gray-400 font-normal">CS3<br />承認元</th>
                {SITE_GROUPS.map(g => (
                  <th key={g.area} colSpan={2} className="px-1 py-1 text-center text-gray-500 font-semibold border-b border-gray-200">
                    {g.area}
                  </th>
                ))}
              </tr>
              <tr>
                <th />
                {SITE_GROUPS.map(g =>
                  g.sites.map(s => (
                    <th key={s.id} className="px-2 py-1 text-center text-gray-400 font-normal whitespace-nowrap">
                      {s.label}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {SHOPS.map(shop => (
                <tr key={shop.id} className="border-t border-gray-100">
                  <td className="py-2 pr-3 text-gray-600 font-medium whitespace-nowrap">{shop.label}</td>
                  {SITE_GROUPS.map((g, gi) =>
                    g.sites.map((site, si) => {
                      const row = rowMap.get(ruleKey(shop.id, site.id))
                      const checked = edits[ruleKey(shop.id, site.id)] ?? false
                      const credType = row?.venrey_cast_id && row?.cp4_gid ? 'both'
                        : row?.venrey_cast_id ? 'venrey'
                        : row?.cp4_gid ? 'hp'
                        : 'none'
                      const accentClass = credType === 'both' ? 'accent-green-500'
                        : credType === 'venrey' ? 'accent-blue-500'
                        : credType === 'hp' ? 'accent-orange-500'
                        : 'accent-gray-400'
                      const hasWarning = checked && (!row?.cp4_gid || !row?.venrey_cast_id)

                      const tipLines: string[] = [
                        row?.venrey_cast_id ? `Venrey: ${row.venrey_cast_id}` : 'Venrey ID: 未登録',
                        row?.cp4_gid ? `HP: ${row.cp4_gid}` : 'HP ID: 未登録',
                      ]
                      if (hasWarning) {
                        if (!row?.cp4_gid && !row?.venrey_cast_id) tipLines.push('⚠ HP・Venrey とも未登録（反映不可）')
                        else if (!row?.cp4_gid) tipLines.push('⚠ HP ID未登録（Venreyは反映可能）')
                        else tipLines.push('⚠ Venrey ID未登録（HPは反映可能）')
                      }

                      // エリア区切り線
                      const isFirstInGroup = si === 0
                      const borderClass = isFirstInGroup && gi > 0 ? 'border-l border-gray-200' : ''

                      return (
                        <td
                          key={site.id}
                          className={`px-2 py-2 text-center ${hasWarning ? 'bg-amber-50' : ''} ${borderClass}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => handleChange(shop.id, site.id, e.target.checked)}
                            className={`w-4 h-4 rounded cursor-pointer ${accentClass}`}
                            title={tipLines.join(' / ')}
                          />
                        </td>
                      )
                    })
                  )}
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
  { key: 'venrey', label: 'Venrey同期中', activeClass: 'bg-blue-600 text-white' },
  { key: 'hp',     label: 'HP同期中',    activeClass: 'bg-orange-500 text-white' },
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
  const isSyncingHP = (rowMap: Map<RuleKey, RuleRow>) => {
    for (const r of rowMap.values()) if (r.cp4_gid && r.enabled) return true
    return false
  }
  // 要確認 = IDあり・全行 disabled（新規自動追加キャストが確認待ち）
  const needsReview = (rowMap: Map<RuleKey, RuleRow>) => {
    const { hasVenrey, hasHP } = castCreds(rowMap)
    if (!hasVenrey && !hasHP) return false
    for (const r of rowMap.values()) if (r.enabled) return false
    return true
  }

  const counts = {
    all:    casts.length,
    venrey: casts.filter(c => isSyncingVenrey(c.rowMap)).length,
    hp:     casts.filter(c => isSyncingHP(c.rowMap)).length,
    review: casts.filter(c => needsReview(c.rowMap)).length,
    unset:  casts.filter(c => { const { hasVenrey, hasHP } = castCreds(c.rowMap); return !hasVenrey && !hasHP }).length,
  }

  const filtered = (() => {
    let result = search ? casts.filter(c => c.castName.includes(search)) : casts
    if (filter === 'venrey') result = result.filter(c => isSyncingVenrey(c.rowMap))
    else if (filter === 'hp') result = result.filter(c => isSyncingHP(c.rowMap))
    else if (filter === 'review') result = result.filter(c => needsReview(c.rowMap))
    else if (filter === 'unset') {
      result = result.filter(c => { const { hasVenrey, hasHP } = castCreds(c.rowMap); return !hasVenrey && !hasHP })
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
        <p className="text-xs text-gray-400 mt-0.5">CS3の承認元店舗ごとに、どのサイト（HP / Venrey）に反映するかを設定します</p>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-5 px-3 py-2.5 bg-gray-50 rounded-lg text-xs text-gray-500">
        <span className="font-medium text-gray-600 shrink-0">チェックの色：</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-green-500 shrink-0" />Venrey + HP 両方登録済み</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-blue-500 shrink-0" />Venreyのみ登録済み</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-orange-400 shrink-0" />HPのみ登録済み</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-gray-300 shrink-0" />ID未登録</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 shrink-0" />チェックONだが反映不可（黄背景）</span>
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
              ? <span className="ml-1 px-1.5 py-0.5 bg-amber-600 text-white rounded-full text-[10px]">{counts.review}</span>
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
