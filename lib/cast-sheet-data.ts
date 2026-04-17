/**
 * cast-sheet-data.ts
 * 4店舗の正規化済みキャストマスタデータをロードし、名前引きするヘルパー。
 * data/cast-sheet-normalized.json から読み込む（サーバーサイド専用）。
 *
 * 優先順位: シートデータ > HP option_table > Q&A fallback
 */

import sheetData from '../data/cast-sheet-normalized.json'

type Capability = 'yes' | 'no' | 'conditional' | 'unknown'

type SheetRecord = {
  store: string
  name: string
  activeStatus: string
  public: {
    holyWater: Capability
    rope: Capability
    privateCosplay: Capability
    threeP: Capability
    teacher: Capability
    home: Capability
    businessHotel: Capability
    rentalRoom: Capability
    foreigners: Capability
    [key: string]: Capability
  }
}

type SheetOptions = {
  holyWater: boolean | null
  rope: boolean | null
  privateCosplay: boolean | null
}

function capToBoolean(cap: Capability): boolean | null {
  if (cap === 'yes') return true
  if (cap === 'no') return false
  return null  // conditional / unknown は判定保留
}

// name → record の高速引き用マップ（store別）
const storeIndex = new Map<string, Map<string, SheetRecord>>()

for (const record of (sheetData as { records: SheetRecord[] }).records) {
  if (!storeIndex.has(record.store)) {
    storeIndex.set(record.store, new Map())
  }
  storeIndex.get(record.store)!.set(record.name, record)
}

/**
 * 指定店舗・キャスト名のシートオプションを返す。
 * 名前が一致しない場合は全項目 null を返す。
 */
export function lookupSheetOptions(store: string, name: string): SheetOptions {
  const record = storeIndex.get(store)?.get(name)
  if (!record) {
    return { holyWater: null, rope: null, privateCosplay: null }
  }
  return {
    holyWater:      capToBoolean(record.public.holyWater),
    rope:           capToBoolean(record.public.rope),
    privateCosplay: capToBoolean(record.public.privateCosplay),
  }
}

/**
 * 指定店舗の在籍キャスト名一覧を返す（名前正規化の検証用）。
 */
export function getActiveNames(store: string): string[] {
  const map = storeIndex.get(store)
  if (!map) return []
  return [...map.values()]
    .filter(r => r.activeStatus === 'active')
    .map(r => r.name)
}
