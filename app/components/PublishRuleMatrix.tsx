'use client'

import { useState } from 'react'

const SHOPS = [
  { id: '111701', label: '西船橋' },
  { id: '111702', label: '成田' },
  { id: '111703', label: '千葉' },
  { id: '111704', label: '錦糸町' },
]

const SITE_GROUPS = [
  { area: '成田',   sites: [{ id: 'mka_narita',    label: 'M性感' }, { id: 'iya_narita',    label: '癒し' }] },
  { area: '千葉',   sites: [{ id: 'mka_chiba',     label: 'M性感' }, { id: 'iya_chiba',     label: '癒し' }] },
  { area: '西船橋', sites: [{ id: 'mka_funabashi', label: 'M性感' }, { id: 'iya_funabashi', label: '癒し' }] },
  { area: '錦糸町', sites: [{ id: 'mka_kinshicho', label: 'M性感' }, { id: 'iya_kinshicho', label: '癒し' }] },
]
const SITES = SITE_GROUPS.flatMap(g => g.sites)
const SITE_TO_VENREY_GROUP: Record<string, string> = {
  iya_narita: 'iya_narita',
  iya_chiba: 'iya_narita',
  iya_funabashi: 'iya_kinshicho',
  iya_kinshicho: 'iya_kinshicho',
  mka_narita: 'mka_narita',
  mka_chiba: 'mka_narita',
  mka_funabashi: 'mka_kinshicho',
  mka_kinshicho: 'mka_kinshicho',
}

export type RuleRow = {
  cs3_cast_id: string
  source_shop_id: string
  site_id: string
  enabled: boolean
  cp4_gid: string | null
  venrey_cast_id: string | null
}

type RuleKey = string
function ruleKey(shopId: string, siteId: string): RuleKey { return `${shopId}:${siteId}` }

type SiteCreds = {
  cp4_gid: string | null
  venrey_cast_id: string | null
}

export default function PublishRuleMatrix({
  cs3CastId,
  rules,
  onSaved,
}: {
  cs3CastId: string
  rules: RuleRow[]
  onSaved?: () => void
}) {
  const rowMap = new Map<RuleKey, RuleRow>()
  for (const r of rules) rowMap.set(ruleKey(r.source_shop_id, r.site_id), r)
  const siteCredMap = new Map<string, SiteCreds>()
  for (const site of SITES) {
    const rows = rules.filter(r => r.site_id === site.id)
    const venreyGroup = SITE_TO_VENREY_GROUP[site.id] ?? site.id
    const venreyRows = rules.filter(r => (SITE_TO_VENREY_GROUP[r.site_id] ?? r.site_id) === venreyGroup)
    siteCredMap.set(site.id, {
      cp4_gid: rows.find(r => r.cp4_gid)?.cp4_gid ?? null,
      venrey_cast_id: venreyRows.find(r => r.venrey_cast_id)?.venrey_cast_id ?? null,
    })
  }

  const [edits, setEdits] = useState<Record<RuleKey, boolean>>(() => {
    const init: Record<RuleKey, boolean> = {}
    for (const shop of SHOPS) {
      for (const site of SITES) {
        const k = ruleKey(shop.id, site.id)
        init[k] = rowMap.get(k)?.enabled ?? false
      }
    }
    return init
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const enabledCount = Object.values(edits).filter(Boolean).length
  const warningCount = Object.entries(edits).filter(([k, on]) => {
    if (!on) return false
    const siteId = k.split(':')[1]
    const creds = siteCredMap.get(siteId)
    return !creds?.cp4_gid && !creds?.venrey_cast_id
  }).length

  const hasCP4 = [...siteCredMap.values()].some(r => !!r.cp4_gid)
  const hasVenrey = [...siteCredMap.values()].some(r => !!r.venrey_cast_id)

  const handleSave = async () => {
    setSaving(true)
    const updates = SHOPS.flatMap(shop =>
      SITES.map(site => ({
        cs3_cast_id: cs3CastId,
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
    if (res.ok) { setSaved(true); onSaved?.() }
  }

  return (
    <div className="space-y-3">
      {/* ID登録状態 */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {hasVenrey
          ? <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">Venrey ID 登録済</span>
          : <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-400">Venrey ID 未登録</span>
        }
        {hasCP4
          ? <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">HP ID 登録済</span>
          : <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-400">HP ID 未登録</span>
        }
        {warningCount > 0 && (
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">⚠ {warningCount}件 ID欠落で反映不可</span>
        )}
        <span className="text-gray-400 ml-auto">{enabledCount} / 32 有効</span>
      </div>

      {/* マトリクス */}
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
                  <th key={s.id} className="px-2 py-1 text-center text-gray-400 font-normal whitespace-nowrap">{s.label}</th>
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
                    const k = ruleKey(shop.id, site.id)
                    const siteCreds = siteCredMap.get(site.id)
                    const checked = edits[k] ?? false
                    const hasWarning = checked && !siteCreds?.cp4_gid && !siteCreds?.venrey_cast_id
                    const credType = siteCreds?.venrey_cast_id && siteCreds?.cp4_gid ? 'both'
                      : siteCreds?.venrey_cast_id ? 'venrey'
                      : siteCreds?.cp4_gid ? 'hp'
                      : 'none'
                    const accentClass = credType === 'both' ? 'accent-green-500'
                      : credType === 'venrey' ? 'accent-blue-500'
                      : credType === 'hp' ? 'accent-orange-500'
                      : 'accent-gray-400'
                    const borderClass = si === 0 && gi > 0 ? 'border-l border-gray-200' : ''
                    const tipLines = [
                      siteCreds?.venrey_cast_id ? `Venrey: ${siteCreds.venrey_cast_id}` : 'Venrey ID: 未登録',
                      siteCreds?.cp4_gid ? `HP: ${siteCreds.cp4_gid}` : 'HP ID: 未登録',
                    ]
                    return (
                      <td key={site.id} className={`px-2 py-2 text-center ${hasWarning ? 'bg-amber-50' : ''} ${borderClass}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => { setSaved(false); setEdits(prev => ({ ...prev, [k]: e.target.checked })) }}
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

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? '保存中...' : '配信設定を保存'}
        </button>
        {saved && <span className="text-green-600 text-xs">保存しました</span>}
        <span className="text-xs text-gray-400 ml-auto">反映まで最大約1時間</span>
      </div>
    </div>
  )
}
