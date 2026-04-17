#!/usr/bin/env node

const fs = require('fs/promises')
const path = require('path')

const SHEETS = [
  {
    store: 'nishifunabashi',
    name: '西船橋',
    sheetId: '1m0S6yZE5K1TAO9al11wxHfQ6Ru1NCcmGtS2LwsEhV1A',
    gid: '1824721936',
  },
  {
    store: 'kinshicho',
    name: '錦糸町',
    sheetId: '1pcs9-r6HMqNvZelE6XqdEsmAQKMjWnCpmhvv_R9CPY0',
    gid: '790560553',
  },
  {
    store: 'narita',
    name: '成田',
    sheetId: '1BR-sHm5vDvLqKf0IxSKzKvpme5SNyT9-B6XmP_pEVCs',
    gid: '883042133',
  },
  {
    store: 'chiba',
    name: '千葉',
    sheetId: '1Wr72nqbKMJdQlXO4mC70-yQ2xt3Do3ukO7y_koXl9Lk',
    gid: '87455866',
  },
]

const OUTPUT_DIR = path.join(process.cwd(), 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'cast-sheet-normalized.json')

const HEADER_ALIASES = {
  no: ['No', 'No.', 'No'],
  name: ['名前'],
  joinedAt: ['入店日'],
  leftAt: ['退店日'],
  storeName: ['在籍店舗'],
  ngArea: ['ＮＧエリア'],
  transport: ['交通', '連絡手段'],
  transportFee: ['交通費', '送迎費'],
  holyWater: ['聖水'],
  privateP: ['私物P'],
  rope: ['ロープ'],
  teacher: ['講師'],
  threeP: ['3P'],
  home: ['自宅'],
  businessHotel: ['ビジホ'],
  rentalRoom: ['レンタルルーム'],
  foreigner: ['外国人', '外人対応', '外国人対応'],
  shiftRequest: ['出勤リクエスト', '出勤ﾘｸｴｽﾄ', 'リクエスト'],
  privateCosplay: ['私物コスプレ'],
  shopCosplay: ['店舗コスプレ', 'コスプレ'],
  notes: ['備考'],
  other: ['その他'],
  activeStatus: ['在籍有無', '在籍反映'],
  internalPortal: ['社内ポータル'],
}

function cleanCell(value) {
  return String(value ?? '')
    .replace(/\u3000/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === ',' && !inQuotes) {
      row.push(value)
      value = ''
      continue
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++
      row.push(value)
      rows.push(row)
      row = []
      value = ''
      continue
    }

    value += ch
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value)
    rows.push(row)
  }

  return rows
}

function normalizeHeaderValue(value) {
  return cleanCell(value).replace(/\s+/g, '')
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderValue)
    return normalized.includes('名前') && normalized.some((cell) => cell.includes('聖水')) && normalized.some((cell) => cell.includes('ロープ'))
  })
}

function findColumnIndex(header, aliases) {
  const normalizedHeader = header.map(normalizeHeaderValue)
  for (const alias of aliases) {
    const exactIndex = normalizedHeader.findIndex((cell) => cell === alias)
    if (exactIndex !== -1) return exactIndex
  }
  return normalizedHeader.findIndex((cell) => aliases.some((alias) => alias.length >= 2 && cell.includes(alias)))
}

function getCell(row, index) {
  if (index < 0 || index >= row.length) return ''
  return cleanCell(row[index])
}

function normalizeCapability(raw) {
  const value = cleanCell(raw)
  if (!value) return 'unknown'

  if (/[〇○◎◯]|^TRUE$|^有$|^可$|^OK$|^済$/.test(value)) return 'yes'
  if (/[×✖✕]|^FALSE$|^無$|^NG$|^不可$/.test(value)) return 'no'
  if (/△|要|確認|都度|未|解除|受け〇|相談|一部|条件/.test(value)) return 'conditional'

  return 'unknown'
}

function normalizeActiveStatus(raw) {
  const value = cleanCell(raw)
  if (!value) return 'unknown'
  if (/退店/.test(value)) return 'left'
  if (/在籍/.test(value)) return 'active'
  if (/連絡無し|停止|休止/.test(value)) return 'inactive'
  return 'unknown'
}

function buildRecord(store, columnMap, row) {
  const name = getCell(row, columnMap.name)
  if (!name || name === '-' || name === '名前') return null

  const activeStatusCell = getCell(row, columnMap.activeStatus)
  const leftAt = getCell(row, columnMap.leftAt) || null
  const storeName = getCell(row, columnMap.storeName) || null
  const normalizedActiveStatus = normalizeActiveStatus(activeStatusCell)
  const activeStatus = leftAt
    ? 'left'
    : normalizedActiveStatus !== 'unknown'
      ? normalizedActiveStatus
      : storeName
        ? 'active'
        : 'unknown'

  return {
    store: store.store,
    storeLabel: store.name,
    no: getCell(row, columnMap.no) || null,
    name,
    joinedAt: getCell(row, columnMap.joinedAt) || null,
    leftAt,
    activeStatus,
    sourceActiveStatus: activeStatusCell || null,
    sourceStoreName: storeName,

    ngArea: getCell(row, columnMap.ngArea) || null,
    transport: getCell(row, columnMap.transport) || null,
    transportFee: getCell(row, columnMap.transportFee) || null,

    holyWater: normalizeCapability(getCell(row, columnMap.holyWater)),
    privateP: normalizeCapability(getCell(row, columnMap.privateP)),
    rope: normalizeCapability(getCell(row, columnMap.rope)),
    teacher: normalizeCapability(getCell(row, columnMap.teacher)),
    threeP: normalizeCapability(getCell(row, columnMap.threeP)),
    home: normalizeCapability(getCell(row, columnMap.home)),
    businessHotel: normalizeCapability(getCell(row, columnMap.businessHotel)),
    rentalRoom: normalizeCapability(getCell(row, columnMap.rentalRoom)),
    privateCosplay: normalizeCapability(getCell(row, columnMap.privateCosplay)),
    shopCosplay: normalizeCapability(getCell(row, columnMap.shopCosplay)),
    foreigners: normalizeCapability(getCell(row, columnMap.foreigner)),
    shiftRequest: normalizeCapability(getCell(row, columnMap.shiftRequest)),

    notes: getCell(row, columnMap.notes) || null,
    other: getCell(row, columnMap.other) || null,
    internalPortal: getCell(row, columnMap.internalPortal) || null,

    public: {
      holyWater: normalizeCapability(getCell(row, columnMap.holyWater)),
      privateP: normalizeCapability(getCell(row, columnMap.privateP)),
      rope: normalizeCapability(getCell(row, columnMap.rope)),
      teacher: normalizeCapability(getCell(row, columnMap.teacher)),
      threeP: normalizeCapability(getCell(row, columnMap.threeP)),
      home: normalizeCapability(getCell(row, columnMap.home)),
      businessHotel: normalizeCapability(getCell(row, columnMap.businessHotel)),
      rentalRoom: normalizeCapability(getCell(row, columnMap.rentalRoom)),
      privateCosplay: normalizeCapability(getCell(row, columnMap.privateCosplay)),
      shopCosplay: normalizeCapability(getCell(row, columnMap.shopCosplay)),
      foreigners: normalizeCapability(getCell(row, columnMap.foreigner)),
    },
    internal: {
      ngArea: getCell(row, columnMap.ngArea) || null,
      transport: getCell(row, columnMap.transport) || null,
      transportFee: getCell(row, columnMap.transportFee) || null,
      shiftRequest: normalizeCapability(getCell(row, columnMap.shiftRequest)),
      notes: getCell(row, columnMap.notes) || null,
      other: getCell(row, columnMap.other) || null,
      internalPortal: getCell(row, columnMap.internalPortal) || null,
    },
  }
}

function summarizeRecords(records) {
  const summary = {}
  for (const sheet of SHEETS) {
    const storeRecords = records.filter((record) => record.store === sheet.store)
    summary[sheet.store] = {
      total: storeRecords.length,
      active: storeRecords.filter((record) => record.activeStatus === 'active').length,
      left: storeRecords.filter((record) => record.activeStatus === 'left').length,
      ropeYes: storeRecords.filter((record) => record.rope === 'yes' && record.activeStatus === 'active').length,
      holyWaterYes: storeRecords.filter((record) => record.holyWater === 'yes' && record.activeStatus === 'active').length,
      threePYes: storeRecords.filter((record) => record.threeP === 'yes' && record.activeStatus === 'active').length,
    }
  }
  return summary
}

async function fetchSheetCsv(sheet) {
  const url = `https://docs.google.com/spreadsheets/d/${sheet.sheetId}/export?format=csv&gid=${sheet.gid}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${sheet.store}: ${response.status}`)
  return response.text()
}

async function main() {
  const allRecords = []
  const sources = []

  for (const sheet of SHEETS) {
    const csvText = await fetchSheetCsv(sheet)
    const rows = parseCsv(csvText)
    const headerRowIndex = findHeaderRow(rows)
    if (headerRowIndex === -1) throw new Error(`Header row not found for ${sheet.store}`)

    const header = rows[headerRowIndex]
    const columnMap = Object.fromEntries(
      Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findColumnIndex(header, aliases)])
    )

    for (const requiredKey of ['name', 'holyWater', 'rope', 'activeStatus']) {
      if (columnMap[requiredKey] === -1) {
        throw new Error(`Missing required column "${requiredKey}" for ${sheet.store}`)
      }
    }

    const dataRows = rows.slice(headerRowIndex + 1)
    for (const row of dataRows) {
      const record = buildRecord(sheet, columnMap, row)
      if (!record) continue
      allRecords.push(record)
    }

    sources.push({
      store: sheet.store,
      name: sheet.name,
      sheetId: sheet.sheetId,
      gid: sheet.gid,
      headerRowIndex,
      columnMap,
    })
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    summary: summarizeRecords(allRecords),
    records: allRecords,
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(`Wrote ${OUTPUT_FILE}`)
  console.log(JSON.stringify(payload.summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
