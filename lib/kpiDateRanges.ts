// 経営KPIダッシュボード用の期間ペア計算ヘルパー。
// 「期間比較は日数を揃える」プロジェクト方針を必ず守ること
// （日数が違うと絶対値合計の伸び率が水増しされる。過去に月次レポートで実例あり）。

export interface DateRange {
  start: string // YYYY-MM-DD
  end: string   // YYYY-MM-DD（両端含む）
}

export interface PeriodPair {
  label: string
  compareLabel: string
  current: DateRange
  previous: DateRange
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const d = parseISO(dateStr)
  d.setDate(d.getDate() + days)
  return formatISO(d)
}

export function daySpan(range: DateRange): number {
  const s = parseISO(range.start)
  const e = parseISO(range.end)
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

// 月曜始まりの週の月曜日
function mondayOf(dateStr: string): string {
  const d = parseISO(dateStr)
  const dow = d.getDay() // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return formatISO(d)
}

// 全ての期間ペアは「直近の確定日」（asOf。store_daily_kpiは毎朝、前日分のみ
// 追加されるため、通常は昨日）を基準にする。文字通りの「今日」を基準にすると
// 当日分のデータが存在せず必ず0件になってしまうため、これは意図的な設計。

export function buildDailyPair(asOf: string): PeriodPair {
  const before = addDays(asOf, -1)
  return {
    label: '直近日',
    compareLabel: '前日比',
    current: { start: asOf, end: asOf },
    previous: { start: before, end: before },
  }
}

export function buildWeeklyPair(asOf: string): PeriodPair {
  const thisMonday = mondayOf(asOf)
  const elapsedDays = daySpan({ start: thisMonday, end: asOf })
  const lastMonday = addDays(thisMonday, -7)
  const lastWeekEnd = addDays(lastMonday, elapsedDays - 1)
  return {
    label: '今週（月曜〜直近日）',
    compareLabel: '先週同期間比',
    current: { start: thisMonday, end: asOf },
    previous: { start: lastMonday, end: lastWeekEnd },
  }
}

export function buildMonthlyPair(asOf: string): PeriodPair {
  const [y, m] = asOf.split('-').map(Number)
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
  const elapsedDays = daySpan({ start: monthStart, end: asOf })
  const prevMonthStart = formatISO(new Date(y, m - 2, 1))
  const prevMonthEnd = addDays(prevMonthStart, elapsedDays - 1)
  return {
    label: '今月（1日〜直近日）',
    compareLabel: '前月同期間比',
    current: { start: monthStart, end: asOf },
    previous: { start: prevMonthStart, end: prevMonthEnd },
  }
}

export function buildYearOverYearPair(asOf: string): PeriodPair {
  const [y, m] = asOf.split('-').map(Number)
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
  const elapsedDays = daySpan({ start: monthStart, end: asOf })
  const lastYearStart = formatISO(new Date(y - 1, m - 1, 1))
  const lastYearEnd = addDays(lastYearStart, elapsedDays - 1)
  return {
    label: '今月（1日〜直近日）',
    compareLabel: '前年同月同期間比',
    current: { start: monthStart, end: asOf },
    previous: { start: lastYearStart, end: lastYearEnd },
  }
}

// 2つの DateRange を包含する最小の範囲（Supabaseクエリのgte/lteに使う）
export function unionRange(a: DateRange, b: DateRange): DateRange {
  return {
    start: a.start < b.start ? a.start : b.start,
    end: a.end > b.end ? a.end : b.end,
  }
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null // 分母0は算出不能（∞%を避ける）
  return ((current - previous) / previous) * 100
}
