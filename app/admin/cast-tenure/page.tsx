'use client'

import { useEffect, useMemo, useState } from 'react'
import roster from '@/data/cast-tenure.json'
import summary from '@/data/cast-tenure-summary.json'

interface CastTenureRecord {
  stores: string
  name: string
  entry_date: string | null
  entry_precision: 'master' | 'exact' | 'exact_first_seen' | 'staff_db_join_date' | 'unknown'
  last_shift_date: string | null
  n_sightings: number | null
  source: string
  conflict_note: string
  status: string
  tenure_days: number | null
  tenure_bucket: string
}

const RAW = roster as CastTenureRecord[]

const PRECISION_LABEL: Record<string, string> = {
  master: '名簿',
  exact: 'exact',
  exact_first_seen: 'first-seen',
  staff_db_join_date: 'DB入店日',
  unknown: '—',
}

const STORES = ['成田', '千葉', '西船橋', '錦糸町']
const TENURE_ORDER = ['すべて', '1ヶ月以内', '3ヶ月以内', '半年以内', '1年以内', '3年以内', '3年超', '不明']
const STATUS_ORDER = ['すべて', '在籍中', '退店済み', '記録のみ']

type SortKey = 'stores' | 'name' | 'entry_date' | 'last_shift_date' | 'tenure_days' | 'status' | 'n_sightings'

function statusShort(s: string) {
  if (s.startsWith('在籍中')) return '在籍中'
  if (s.startsWith('出勤実績なし')) return '記録のみ'
  return '退店済み'
}

function statusBadgeClass(s: string) {
  const short = statusShort(s)
  if (short === '在籍中') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
  if (short === '記録のみ') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
  return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

function fmtDaysHuman(d: number | null | undefined) {
  if (d === null || d === undefined) return '—'
  if (d < 30) return `${d}日`
  const y = Math.floor(d / 365)
  const m = Math.floor((d % 365) / 30)
  if (y > 0) return m > 0 ? `${y}年${m}ヶ月` : `${y}年`
  return `${m}ヶ月`
}

function Tile({ label, num, sub }: { label: string; num: number; sub: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{num.toLocaleString('en-US')}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">名</span>
      </div>
      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{sub}</div>
    </div>
  )
}

function VBarChart({ data, peakLabel }: { data: { label: string; value: number }[]; peakLabel?: string }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1">
      {data.map(d => {
        const h = Math.max(4, Math.round((d.value / max) * 100))
        const isPeak = peakLabel && d.label === peakLabel
        return (
          <div key={d.label} className="flex min-w-[40px] flex-1 flex-col items-center gap-1">
            <div className="flex h-28 w-full items-end">
              <div
                className={`w-full rounded-t ${isPeak ? 'bg-amber-500' : 'bg-indigo-400 dark:bg-indigo-500'}`}
                style={{ height: `${h}%` }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
            <div className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{d.value}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function StoreHBarChart({ stores }: { stores: { store: string; total: number; active: number }[] }) {
  const max = Math.max(...stores.map(s => s.total), 1)
  return (
    <div className="space-y-2.5">
      {stores.map(s => (
        <div key={s.store} className="flex items-center gap-2 text-xs">
          <div className="w-12 shrink-0 font-medium text-gray-700 dark:text-gray-300">{s.store}</div>
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
            <div className="absolute inset-y-0 left-0 bg-indigo-200 dark:bg-indigo-900" style={{ width: `${(s.total / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 bg-emerald-400 dark:bg-emerald-600" style={{ width: `${(s.active / max) * 100}%` }} />
          </div>
          <div className="w-24 shrink-0 text-right text-gray-600 dark:text-gray-400">{s.total}名　在籍{s.active}</div>
        </div>
      ))}
      <div className="flex gap-3 pt-1 text-[10px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-indigo-200 dark:bg-indigo-900" />実人数</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-400 dark:bg-emerald-600" />うち在籍中</span>
      </div>
    </div>
  )
}

function YearLineChart({ years }: { years: { year: string; value: number }[] }) {
  const W = 900, H = 200, padL = 30, padR = 16, padT = 20, padB = 24
  const max = Math.max(...years.map(d => d.value))
  const n = years.length
  const xStep = (W - padL - padR) / (n - 1)
  const yScale = (v: number) => H - padB - (v / max) * (H - padT - padB)
  const points = years.map((d, i) => [padL + i * xStep, yScale(d.value)] as const)
  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  const areaPath = linePath + ` L${points[n - 1][0].toFixed(1)},${H - padB} L${points[0][0].toFixed(1)},${H - padB} Z`
  const maxIdx = years.reduce((mi, d, i, arr) => (d.value > arr[mi].value ? i : mi), 0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full">
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = H - padB - f * (H - padT - padB)
        return <line key={f} x1={padL} x2={W - padR} y1={y} y2={y} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
      })}
      <path d={areaPath} className="fill-indigo-200/60 dark:fill-indigo-900/40" />
      <path d={linePath} fill="none" className="stroke-indigo-500 dark:stroke-indigo-400" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => {
        const isPeak = i === maxIdx
        return (
          <g key={years[i].year}>
            <circle cx={p[0]} cy={p[1]} r={9} fill="transparent" className="cursor-pointer">
              <title>{`${years[i].year}年: ${years[i].value}名`}</title>
            </circle>
            <circle cx={p[0]} cy={p[1]} r={isPeak ? 4.5 : 2.2} className={`pointer-events-none ${isPeak ? 'fill-amber-500' : 'fill-indigo-500 dark:fill-indigo-400'}`} />
            {isPeak && (
              <text x={p[0]} y={p[1] - 11} fontSize={11.5} fontWeight={700} textAnchor="middle" className="fill-amber-500">
                {years[i].value}
              </text>
            )}
          </g>
        )
      })}
      {years.map((d, i) => {
        const show = i % 2 === 0 || i === n - 1
        if (!show) return null
        return (
          <text key={d.year} x={points[i][0]} y={H - 6} fontSize={10.5} textAnchor="middle" fontFamily="ui-monospace, monospace" className="fill-gray-500 dark:fill-gray-400">
            {d.year}
          </text>
        )
      })}
    </svg>
  )
}

function CompareBlock({ compare }: { compare: typeof summary.compare }) {
  const items = [
    { label: '在籍中', dot: 'bg-emerald-400 dark:bg-emerald-600', data: compare.active },
    { label: '退店済み', dot: 'bg-gray-300 dark:bg-gray-600', data: compare.retired },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(it => (
        <div key={it.label} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
            <span className={`inline-block h-2 w-2 rounded-full ${it.dot}`} />
            {it.label}
          </div>
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>平均</span><span className="font-medium text-gray-900 dark:text-white">{fmtDaysHuman(it.data.avg)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>中央値</span><span className="font-medium text-gray-900 dark:text-white">{fmtDaysHuman(it.data.median)}</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">n={it.data.n}</div>
        </div>
      ))}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'border-indigo-500 bg-indigo-500 text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  )
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'stores', label: '店舗' },
  { key: 'name', label: '源氏名' },
  { key: 'entry_date', label: '入店日' },
  { key: 'last_shift_date', label: '最終出勤日' },
  { key: 'tenure_days', label: '在籍期間' },
  { key: 'status', label: 'ステータス' },
  { key: 'n_sightings', label: '出現数' },
]

export default function CastTenurePage() {
  useEffect(() => { document.title = '在籍期間データ | KIJ管理' }, [])
  const [activeTab, setActiveTab] = useState<'summary' | 'ledger'>('summary')
  const [query, setQuery] = useState('')
  const [storeFilter, setStoreFilter] = useState('全店舗')
  const [statusFilter, setStatusFilter] = useState('すべて')
  const [tenureFilter, setTenureFilter] = useState('すべて')
  const [sortKey, setSortKey] = useState<SortKey>('stores')
  const [sortDir, setSortDir] = useState<1 | -1>(1)

  const storeTiles = useMemo(() => {
    const byStore: Record<string, { total: number; active: number }> = {}
    STORES.forEach(s => { byStore[s] = { total: 0, active: 0 } })
    RAW.forEach(r => {
      r.stores.split('／').forEach(s => {
        const b = byStore[s]
        if (!b) return
        b.total++
        if (r.status.startsWith('在籍中')) b.active++
      })
    })
    return STORES.map(s => ({ store: s, ...byStore[s] }))
  }, [])

  const rows = useMemo(() => {
    const q = query.trim()
    let result = RAW.filter(r => {
      if (storeFilter !== '全店舗' && !r.stores.split('／').includes(storeFilter)) return false
      if (statusFilter !== 'すべて' && statusShort(r.status) !== statusFilter) return false
      if (tenureFilter !== 'すべて' && r.tenure_bucket !== tenureFilter) return false
      if (q && !r.name.includes(q)) return false
      return true
    })
    result = [...result].sort((a, b) => {
      const av: string | number = a[sortKey] ?? ''
      const bv: string | number = b[sortKey] ?? ''
      if (av < bv) return -1 * sortDir
      if (av > bv) return 1 * sortDir
      return 0
    })
    return result
  }, [query, storeFilter, statusFilter, tenureFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(key); setSortDir(1) }
  }

  const monthData = summary.months.map(m => ({ label: `${m.month}月`, value: m.value }))

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Cast Shift Ledger &amp; Summary — 4 Stores</div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">在籍シフト記録</h1>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          成田・千葉・西船橋・錦糸町の女性シフト表を2014年〜2026年まで遡り、源氏名ごとに入店日〜最終出勤日をまとめたものです。サマリーで全体傾向を、台帳で個別の全件検索ができます。
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span>対象ファイル 70件</span>
          <span>実人数 <b className="text-gray-700 dark:text-gray-300">{summary.total.toLocaleString('en-US')}</b>名</span>
          <span>集計基準日 2026-08-26</span>
        </div>
      </header>

      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(['summary', 'ledger'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === tab
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab === 'summary' ? 'サマリー' : '台帳'}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-5">
          <p className="text-xs text-gray-500 dark:text-gray-400">台帳{summary.total.toLocaleString('en-US')}件を集計した全体傾向。実人数・在籍期間の分布・入店年トレンド・退店の季節性・在籍中と退店済みの比較。</p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="実人数" num={summary.total} sub="4店舗統合・1人1行" />
            <Tile label="在籍中" num={summary.status.find(s => s.label === '在籍中')?.value ?? 0} sub={`全体の${Math.round((summary.status.find(s => s.label === '在籍中')!.value / summary.total) * 100)}%`} />
            <Tile label="退店済み" num={summary.status.find(s => s.label === '退店済み')?.value ?? 0} sub={`全体の${Math.round((summary.status.find(s => s.label === '退店済み')!.value / summary.total) * 100)}%`} />
            <Tile label="記録のみ" num={summary.status.find(s => s.label === '記録のみ')?.value ?? 0} sub="出勤実績なし" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">在籍期間区分別分布</h3>
              <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">在籍中は入店日→集計基準日、退店済みは入店日→最終出勤日の日数で分類。「不明」は出勤実績なし（{summary.status.find(s => s.label === '記録のみ')?.value}名）</p>
              <VBarChart data={summary.tenure} />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">店舗別実人数</h3>
              <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">複数店舗に関わった人は関与した全店舗でカウント（延べ人数）</p>
              <StoreHBarChart stores={summary.stores} />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">入店年別トレンド</h3>
            <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">2015年から急増、2018年が178名でピーク。2026年は年途中のため他年と単純比較不可。2011〜2013年(計5名)は省略</p>
            <YearLineChart years={summary.years} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">退店の月別季節性</h3>
              <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">退店済み{summary.status.find(s => s.label === '退店済み')?.value}名、最終出勤日の月で集計（年をまたいで合算）。11月・3月が突出</p>
              <VBarChart data={monthData} peakLabel="11月" />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">在籍中 / 退店済み比較</h3>
              <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">在籍期間（日数）の平均・中央値</p>
              <CompareBlock compare={summary.compare} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">全{summary.total.toLocaleString('en-US')}件の個別検索・絞り込み一覧。店舗・ステータス・在籍期間で絞り込み、列ヘッダーで並び替えできます。</p>

          <details className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
            <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">精度について（クリックで詳細）</summary>
            <div className="mt-2 space-y-1.5">
              <p>2026-07-19時点、各店舗の「女性情報」名簿シートと2014〜2026年の全シフト表を突合済み。入店日は名簿記載を最優先（<b>名簿</b>）、記載が無い場合のみシフト表上の初出勤日で代用（<b>first-seen</b>）しています。</p>
              <p>集計は1人＝1行です。掛け持ち・転籍・他店への応援シフトなどで複数店舗に出勤記録がある人は、店舗をまたいだ全期間を通して入店日〜最終出勤日を1行にまとめています。</p>
              <p>「在籍中」は全店舗を通じた最新シフトデータから60日以内に、その人自身の出勤実績がある場合の目安です。</p>
              <p>⚠️マーク = 入店日と出勤記録の整合性に要確認点がある{RAW.filter(r => r.conflict_note).length}件。機械的に決め打ちせず、両方の値と出典を併記しています。</p>
              <p>2016年6月〜2018年1月の西船橋/錦糸町合同シートは店舗判定不可のため除外しています。</p>
            </div>
          </details>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {storeTiles.map(s => (
              <Tile key={s.store} label={`${s.store}店`} num={s.total} sub={`在籍中 ${s.active} ／ 退店等 ${s.total - s.active}`} />
            ))}
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="源氏名で検索…"
              className="w-full max-w-xs rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
            <div className="flex flex-wrap gap-1.5">
              {['全店舗', ...STORES].map(s => (
                <Chip key={s} label={s} active={storeFilter === s} onClick={() => setStoreFilter(s)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map(s => (
                <Chip key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TENURE_ORDER.map(s => (
                <Chip key={s} label={s} active={tenureFilter === s} onClick={() => setTenureFilter(s)} />
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">{rows.length.toLocaleString('en-US')} 件表示</div>

          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="cursor-pointer whitespace-nowrap px-2 py-1.5 font-medium select-none hover:text-gray-800 dark:hover:text-gray-200"
                    >
                      {col.label}
                      <span className="ml-0.5 text-[9px]">{sortKey === col.key ? (sortDir === 1 ? '▲' : '▼') : ''}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b last:border-b-0 dark:border-gray-800">
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700 dark:text-gray-300">{r.stores}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-medium text-gray-900 dark:text-white">
                      {r.conflict_note && <span title={r.conflict_note} className="mr-1 cursor-help">⚠️</span>}
                      {r.name}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700 dark:text-gray-300">
                      {r.entry_date ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                      {r.entry_date && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{PRECISION_LABEL[r.entry_precision]}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700 dark:text-gray-300">
                      {r.last_shift_date ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700 dark:text-gray-300">
                      {fmtDaysHuman(r.tenure_days)}
                      <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{r.tenure_bucket}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] ${statusBadgeClass(r.status)}`}>{statusShort(r.status)}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700 dark:text-gray-300">
                      {r.n_sightings ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="p-6 text-center text-xs text-gray-400 dark:text-gray-500">該当する記録がありません</div>}
          </div>

          <footer className="text-[11px] text-gray-400 dark:text-gray-500">
            ソース: Google Drive「(1)女性シフト」フォルダ配下の店舗別シフト表＋KIJアプリ本体Supabase（shifts/staff）。自動集計のため、旧フォーマット由来のデータには誤検出・見落としが含まれる可能性があります。重要な判断の前には元シートで裏取りしてください。
          </footer>
        </div>
      )}
    </div>
  )
}
