'use client'

import { useState, useEffect } from 'react'

type Hotel = {
  name: string
  address: string
  url?: string
  weekday: string
  weekend: string
  note?: string
}

// ── 成田・富里 ────────────────────────────────────────────────
const NARITA: Hotel[] = [
  { name: 'ブーゲンビリア',      address: '富里市七栄525-157',       url: 'https://happyhotel.jp/hotels/5400035',  weekday: '2h ¥3,600〜',    weekend: '2h ¥4,100〜' },
  { name: 'バロン',             address: '富里市七栄525-314',        url: 'https://happyhotel.jp/hotels/5400033',  weekday: '3h ¥5,300〜',    weekend: '3h ¥5,900〜',  note: '延長不可' },
  { name: 'VARICIAN',          address: '富里市七栄525-262',        url: 'https://happyhotel.jp/hotels/5400032',  weekday: '最大4h ¥4,380〜', weekend: '最大4h ¥4,980〜' },
  { name: 'ファーストウッド富里', address: '富里市七栄525-240',        url: 'https://happyhotel.jp/hotels/542501',   weekday: '最大4h ¥4,100〜', weekend: '最大4h ¥4,600〜' },
  { name: 'レインボー',          address: '富里市七栄525-320',        url: 'https://happyhotel.jp/hotels/540658',   weekday: '1h ¥2,060〜',    weekend: '1h ¥2,610〜' },
  { name: 'ルサンチェ',          address: '富里市七栄525-294',        url: 'https://happyhotel.jp/hotels/540660',   weekday: '5h ¥4,180〜',    weekend: '3h ¥4,180〜' },
  { name: 'レモンツリー',        address: '富里市日吉倉1205-1',       url: 'https://happyhotel.jp/hotels/540662',   weekday: '最大4h ¥3,980〜', weekend: '最大4h ¥5,000〜' },
  { name: 'ウォーターゲート',    address: '成田市東金山182',          url: 'https://happyhotel.jp/hotels/540648',   weekday: '3h ¥4,680〜',    weekend: '3h ¥5,980〜' },
  { name: 'ファーストウッド成田', address: '成田市並木町221-42',       url: 'https://happyhotel.jp/hotels/540656',   weekday: '4h ¥3,280〜',    weekend: '4h ¥4,280〜' },
  { name: 'チャペルクリスマス',   address: '成田市吉倉239-1',         url: 'https://happyhotel.jp/hotels/540649',   weekday: '6h ¥5,490均一',  weekend: '4h ¥6,690均一' },
  { name: 'ピムズ&デュアラ',     address: '成田市山之作303-1',        url: 'https://happyhotel.jp/hotels/540654',   weekday: '6h ¥4,700〜',    weekend: '4h ¥4,700〜' },
  { name: 'フェスタ',            address: '成田市馬場80-7',          url: 'https://happyhotel.jp/hotels/540652',   weekday: '2h ¥2,990 / 4h ¥4,990均一', weekend: '4h ¥4,990均一' },
  { name: 'カメリア',            address: '成田市三里塚光ケ丘1-1188', url: 'https://happyhotel.jp/hotels/540650',   weekday: '最大5h ¥4,070〜', weekend: '最大5h ¥5,170〜' },
]

// ── 千葉市（エリア別） ─────────────────────────────────────────
const CHIBA: { label: string; hotels: Hotel[] }[] = [
  { label: '栄町', hotels: [
    { name: 'ガーネット',          address: '千葉市中央区栄町20-2',   url: 'https://happyhotel.jp/hotels/25901012', weekday: '2h ¥3,000〜',    weekend: '2h ¥3,800〜' },
    { name: 'PARMAN',             address: '千葉市中央区栄町26-3',   weekday: '—',              weekend: '—' },
    { name: 'センチュリー',         address: '千葉市中央区栄町9-8',    weekday: '—',              weekend: '—' },
    { name: 'センチュリーアネックス', address: '千葉市中央区要町14-11', url: 'https://happyhotel.jp/hotels/540590',   weekday: '1.5h ¥2,900〜',  weekend: '1.5h ¥3,700〜' },
    { name: 'Nホテル',             address: '千葉市中央区栄町30-4',   weekday: '—',              weekend: '—' },
    { name: 'ピーコック',           address: '千葉市中央区栄町29-1',   url: 'https://happyhotel.jp/hotels/540591',   weekday: '3h ¥6,000〜',    weekend: '3h ¥6,000〜' },
    { name: 'ビバリーヒルズ',        address: '千葉市中央区栄町4-15',  url: 'https://happyhotel.jp/hotels/540622',   weekday: '要確認',          weekend: '要確認' },
  ]},
  { label: '祐光町', hotels: [
    { name: 'MYTH',             address: '千葉市中央区祐光3-1-5',   url: 'https://happyhotel.jp/hotels/540585',   weekday: '2.5h ¥3,900〜',  weekend: '2.5h ¥4,800〜' },
    { name: '十色（トイロ）',    address: '千葉市中央区祐光3-5-10', url: 'https://happyhotel.jp/hotels/540588',   weekday: '2h ¥3,800〜',    weekend: '2h ¥4,800〜' },
    { name: 'ARIA',            address: '千葉市中央区祐光3-8',     url: 'https://happyhotel.jp/hotels/540587',   weekday: '2.5h ¥2,980〜',  weekend: '2.5h ¥4,080〜' },
    { name: 'ファースト・イン',  address: '千葉市中央区祐光3-7-3',  url: 'https://happyhotel.jp/hotels/540586',   weekday: '2h ¥2,700〜',    weekend: '2h ¥2,700〜' },
    { name: 'ドンキーズジャングル', address: '千葉市中央区祐光2-3-6', url: 'https://happyhotel.jp/hotels/542723', weekday: '2h ¥2,400〜',    weekend: '2h ¥3,300〜' },
  ]},
  { label: '本千葉', hotels: [
    { name: 'ORDA',           address: '千葉市中央区中央3-6-1',    weekday: '—',              weekend: '—' },
    { name: 'BaliAn RESORT',  address: '千葉市中央区本千葉町1-6',  url: 'https://happyhotel.jp/hotels/21100095', weekday: '4h ¥4,500〜',    weekend: '3h ¥5,000〜' },
    { name: 'アンジェリーク',  address: '千葉市中央区寒川町1-251', url: 'https://happyhotel.jp/hotels/540594',   weekday: '2h ¥4,200〜',    weekend: '2h ¥4,700〜' },
  ]},
  { label: '東千葉・西千葉', hotels: [
    { name: 'ターンベリー', address: '千葉市中央区春日1-21-8',   url: 'https://happyhotel.jp/hotels/542701',   weekday: '5h ¥3,900〜',    weekend: '5h ¥3,900〜' },
    { name: 'ウキウキ',     address: '千葉市中央区松波1-2-12',  url: 'https://happyhotel.jp/hotels/540621',   weekday: '2h ¥3,800〜',    weekend: '2h ¥4,800〜' },
    { name: 'm-skip',      address: '千葉市中央区都町3-23-11', url: 'https://happyhotel.jp/hotels/540592',   weekday: '1.5h ¥1,980〜',  weekend: '1.5h ¥2,480〜' },
  ]},
  { label: '幕張本郷', hotels: [
    { name: 'トレンディクラブ',    address: '千葉市花見川区幕張本郷1-36-8',  weekday: '—', weekend: '—' },
    { name: 'ILL',               address: '千葉市花見川区幕張本郷1-36-17', weekday: '—', weekend: '—' },
    { name: 'ホテル ケンブリッヂ', address: '千葉市花見川区幕張本郷1-32-15', weekday: '—', weekend: '—' },
    { name: 'W-AVANZA',          address: '千葉市花見川区幕張本郷1-33-10', weekday: '—', weekend: '—' },
    { name: 'ホテル UFO',         address: '千葉市花見川区幕張本郷1-34-21', weekday: '—', weekend: '—' },
    { name: 'HOTEL FAMY',        address: '千葉市花見川区幕張本郷1-33-22', weekday: '—', weekend: '—' },
    { name: 'ハウスプラス',        address: '千葉市花見川区幕張本郷1-34-28', weekday: '—', weekend: '—' },
  ]},
  { label: '穴川', hotels: [
    { name: 'M EAST ANNEX', address: '千葉市若葉区殿台町78-1',  url: 'https://happyhotel.jp/hotels/540607',   weekday: '2h ¥3,800〜',    weekend: '2h ¥4,400〜' },
    { name: 'DUO',          address: '千葉市若葉区殿台町75',    weekday: '—',              weekend: '—' },
    { name: 'lily',         address: '千葉市若葉区殿台町578-2', url: 'https://happyhotel.jp/hotels/542700',   weekday: '2h ¥4,000〜',    weekend: '2h ¥4,900〜' },
    { name: 'SKホテル',     address: '千葉市若葉区殿台町578-1', weekday: '—',              weekend: '—' },
    { name: 'クレスト',     address: '千葉市稲毛区園生町468-30', url: 'https://happyhotel.jp/hotels/540613',  weekday: '2.5h ¥3,280〜',  weekend: '2.5h ¥4,280〜' },
  ]},
  { label: '千葉北', hotels: [
    { name: 'La・COCO',      address: '千葉市稲毛区長沼原町219-1',  url: 'https://happyhotel.jp/hotels/25900743', weekday: '1.5h ¥2,240〜',  weekend: '1.5h ¥2,960〜' },
    { name: 'リンバ',        address: '千葉市稲毛区長沼原町21-4',   url: 'https://happyhotel.jp/hotels/540612',   weekday: '4h ¥3,980〜',    weekend: '3h ¥4,980〜' },
    { name: 'MAXIN',        address: '千葉市花見川区三角町681',     url: 'https://happyhotel.jp/hotels/540602',   weekday: '2h ¥3,760〜',    weekend: '2h ¥3,760〜' },
    { name: 'WE2',          address: '千葉市稲毛区長沼原町22-1',   url: 'https://happyhotel.jp/hotels/540619',   weekday: '1.5h ¥3,500〜',  weekend: '1.5h ¥3,980〜' },
    { name: 'ホテル関所',    address: '千葉市花見川区三角町681-1',  url: 'https://happyhotel.jp/hotels/540687',   weekday: '要確認',          weekend: '要確認' },
    { name: 'アシーナ',      address: '千葉市花見川区三角町760-4',  url: 'https://happyhotel.jp/hotels/540603',   weekday: '2h ¥3,000〜',    weekend: '2h ¥4,000〜' },
    { name: 'ラムール',      address: '千葉市花見川区横戸町948-1',  url: 'https://happyhotel.jp/hotels/541360',   weekday: '4h ¥5,000〜',    weekend: '4h ¥5,000〜' },
    { name: 'アラウダ',      address: '千葉市花見川区犢橋町51-6',   url: 'https://happyhotel.jp/hotels/540605',   weekday: '2h ¥3,500〜',    weekend: '1.5h ¥3,950〜' },
    { name: 'コスタリゾート', address: '千葉市稲毛区長沼原町401-8', url: 'https://happyhotel.jp/hotels/541294',   weekday: '3h ¥3,900〜',    weekend: '3h ¥4,900〜' },
  ]},
  { label: '宮野木', hotels: [
    { name: 'WILL カリビアン宮野木', address: '千葉市稲毛区宮野木町1896-1', url: 'https://happyhotel.jp/hotels/540618', weekday: '1.5h ¥2,800〜', weekend: '1.5h ¥3,800〜' },
  ]},
  { label: '蘇我', hotels: [
    { name: 'Hotel Mist',      address: '千葉市中央区生実町831-1', url: 'https://happyhotel.jp/hotels/25900728', weekday: '2h ¥4,900〜',  weekend: '2h ¥5,400〜' },
    { name: 'Fan',             address: '千葉市中央区今井2-16-8',  weekday: '—',            weekend: '—' },
    { name: 'ニュー十色',      address: '千葉市中央区末広4-23-1',  weekday: '—',            weekend: '—' },
    { name: 'MINNA NO HOTEL',  address: '千葉市中央区生実町886-1', url: 'https://happyhotel.jp/hotels/25900814', weekday: '2h ¥4,950〜',  weekend: '2h ¥5,450〜' },
  ]},
  { label: '浜野', hotels: [
    { name: 'MARIA',   address: '千葉市中央区浜野町714',    url: 'https://happyhotel.jp/hotels/540620', weekday: '2.5h ¥3,710〜', weekend: '2.5h ¥4,920〜' },
    { name: 'パシオン', address: '千葉市中央区村田町893-92', url: 'https://happyhotel.jp/hotels/540593', weekday: '2h ¥3,300〜',   weekend: '2h ¥3,900〜' },
  ]},
  { label: '市原', hotels: [
    { name: 'HOTEL オペラ煌',          address: '市原市八幡海岸通2385-9', weekday: '—', weekend: '—' },
    { name: 'HOTEL Mani',             address: '市原市山倉1150-2',       weekday: '—', weekend: '—' },
    { name: 'HOTEL ウォーターゲート市原', address: '市原市姉崎972',        weekday: '—', weekend: '—' },
    { name: 'ホテル クラウン',          address: '市原市君塚2-6-8',        weekday: '—', weekend: '—' },
    { name: 'ビーノ・ビーノ',           address: '市原市椎津91-1',         weekday: '—', weekend: '—' },
    { name: 'ホテル 555市原',           address: '市原市山木172',          weekday: '—', weekend: '—' },
    { name: 'ホテル カホウ 市原店',      address: '市原市中高根1339-2',     weekday: '—', weekend: '—' },
    { name: 'ホテル アテネ',            address: '市原市山小川743-5',       weekday: '—', weekend: '—' },
    { name: 'ホテル ハイランド市原',     address: '市原市久々津460',         weekday: '—', weekend: '—' },
    { name: 'ホテル ラ・フォーレ市原',   address: '市原市五井5825-1',        weekday: '—', weekend: '—' },
    { name: 'ホテル L&L',              address: '市原市山木220-1',         weekday: '—', weekend: '—' },
    { name: 'サンドベージュ',           address: '市原市柏原243-3',         weekday: '—', weekend: '—' },
  ]},
]

// ── 西船橋 ────────────────────────────────────────────────────
const FUNABASHI: Hotel[] = [
  { name: '新日本プラザホテル', address: '船橋市西船4-29-1',  url: 'https://happyhotel.jp/hotels/34100215', weekday: '3h ¥3,500〜',    weekend: '3h ¥4,800〜', note: '17時以降+¥300〜' },
  { name: 'Kスリット',         address: '船橋市西船4-30-14', url: 'https://happyhotel.jp/hotels/540665',   weekday: '3h ¥3,600〜',    weekend: '3h ¥5,200〜', note: 'ハイルーフP・カード可' },
  { name: 'アリュール',         address: '船橋市西船5-21-7',  url: 'https://happyhotel.jp/hotels/6300011',  weekday: '3h ¥4,000〜',    weekend: '3h ¥5,000〜', note: 'ハイルーフP' },
  { name: 'アランド',           address: '船橋市西船4-30-10', url: 'https://happyhotel.jp/hotels/540667',   weekday: '3h ¥5,800〜',    weekend: '3h ¥6,800〜', note: 'ハイルーフP・冬期不可' },
]

// ── 錦糸町 ────────────────────────────────────────────────────
type KCHotel = Hotel & { parking: boolean; trio: string }

const KINSHICHO: KCHotel[] = [
  { name: 'ピュアアジアン',         address: '江東橋4-6-14',  url: 'https://happyhotel.jp/hotels/543971',   weekday: '2h ¥2,980〜',  weekend: '2h ¥3,500〜',  parking: false, trio: '1.5倍' },
  { name: 'ルポ',                  address: '江東橋4-6-12',  url: 'https://happyhotel.jp/hotels/540174',   weekday: '3h ¥4,800均一', weekend: '3h ¥5,500〜',  parking: true,  trio: '1.5倍' },
  { name: 'GRANSKY',              address: '江東橋4-5-16',  url: 'https://happyhotel.jp/hotels/6300013',  weekday: '2h ¥4,980〜',  weekend: '2h ¥5,980〜',  parking: true,  trio: '1.3倍' },
  { name: 'ロハス',                address: '江東橋4-7-11',  url: 'https://happyhotel.jp/hotels/540176',   weekday: '2h ¥3,980〜',  weekend: '2h ¥4,980〜',  parking: true,  trio: '1.5倍' },
  { name: 'RAY FIELD',            address: '江東橋4-6-13',  url: 'https://happyhotel.jp/hotels/16300032', weekday: '2h ¥4,500〜',  weekend: '2h ¥6,500〜',  parking: true,  trio: '×' },
  { name: 'METAL WAVE',           address: '江東橋4-10-10', url: 'https://happyhotel.jp/hotels/540179',   weekday: '3h ¥6,500〜',  weekend: '3h ¥6,500〜',  parking: true,  trio: '1.5倍' },
  { name: 'ミニム',                address: '江東橋4-12-3',  url: 'https://happyhotel.jp/hotels/25900908', weekday: '3h ¥4,900〜',  weekend: '3h ¥4,900〜',  parking: true,  trio: '1.5倍' },
  { name: 'シークレットベニー',      address: '江東橋4-7-8',   url: 'https://happyhotel.jp/hotels/540175',   weekday: '2h ¥3,900〜',  weekend: '2h ¥4,980〜',  parking: true,  trio: '1.5倍' },
  { name: 'BAMBOO GARDEN',        address: '江東橋4-14-1',  url: 'https://happyhotel.jp/hotels/25901168', weekday: '3h ¥6,800〜',  weekend: '3h ¥7,800〜',  parking: false, trio: '—' },
  { name: 'Allee Love Tokyo 555', address: '江東橋4-12-9',  url: 'https://happyhotel.jp/hotels/25900560', weekday: '2h ¥3,800〜',  weekend: '2h ¥4,800〜',  parking: true,  trio: '1.5倍' },
  { name: 'SARA sweet 錦糸町',    address: '江東橋4-12-2',  url: 'https://happyhotel.jp/hotels/540180',   weekday: '3h ¥6,000〜',  weekend: '3h ¥7,500〜',  parking: true,  trio: '1.5倍' },
  { name: 'コローレ',              address: '江東橋4-8-6',   url: 'https://happyhotel.jp/hotels/540182',   weekday: '3h ¥4,500〜',  weekend: '3h ¥5,500〜',  parking: true,  trio: '×' },
  { name: 'クレスト',              address: '江東橋4-4-6-7', url: 'https://happyhotel.jp/hotels/543972',   weekday: '2h ¥3,480〜',  weekend: '2h ¥4,480〜',  parking: true,  trio: '×' },
  { name: 'DUO',                  address: '江東橋3-1-6',   url: 'https://happyhotel.jp/hotels/25901021', weekday: '1h ¥2,480〜',  weekend: '1h ¥2,980〜',  parking: false, trio: '+¥1,000' },
  { name: 'SARA 錦糸町',          address: '江東橋3-1-8',   url: 'https://happyhotel.jp/hotels/540170',   weekday: '3h ¥5,500〜',  weekend: '3h ¥6,500〜',  parking: true,  trio: '+¥3,000' },
  { name: 'バリアンリゾート錦糸町', address: '江東橋2-2-12',  url: 'https://happyhotel.jp/hotels/25900595', weekday: '3h ¥6,800〜',  weekend: '3h ¥7,800〜',  parking: true,  trio: '1.5倍' },
  { name: '弐番館',                address: '江東橋4-24-1',  url: 'https://happyhotel.jp/hotels/540181',   weekday: '2h ¥3,800〜',  weekend: '2h ¥3,800〜',  parking: true,  trio: '×' },
  { name: 'Music',                address: '江東橋4-25-12', url: 'https://happyhotel.jp/hotels/540183',   weekday: '2h ¥2,800均一', weekend: '2h ¥3,200均一', parking: false, trio: '1.5倍' },
  { name: 'アイム',                address: '江東橋4-31-8',  url: 'https://happyhotel.jp/hotels/76300052', weekday: '1.5h ¥3,900', weekend: '1.5h ¥3,900',  parking: false, trio: '×' },
  { name: 'TSUBAKI',              address: '江東橋4-31-5',  url: 'https://happyhotel.jp/hotels/25900999', weekday: '2h ¥3,980〜',  weekend: '2h ¥4,980〜',  parking: false, trio: '1.5倍' },
]

// ── コンポーネント ────────────────────────────────────────────

const TABS = [
  { id: 'narita',    label: '成田' },
  { id: 'chiba',     label: '千葉' },
  { id: 'funabashi', label: '西船橋' },
  { id: 'kinshicho', label: '錦糸町' },
]

function HotelName({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
        {name}
      </a>
    )
  }
  return <span className="font-medium text-gray-900 dark:text-white whitespace-nowrap">{name}</span>
}

function PriceCell({ val }: { val: string }) {
  if (val === '—') return <span className="text-gray-300 dark:text-gray-600">—</span>
  if (val === '要確認') return <span className="text-amber-500 text-xs">要確認</span>
  return <span className="font-medium text-gray-900 dark:text-gray-100">{val}</span>
}

function HotelTable({ hotels }: { hotels: Hotel[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
            <th className="text-left px-4 py-2 font-medium w-36">ホテル名</th>
            <th className="text-left px-3 py-2 font-medium">住所</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap">平日</th>
            <th className="text-right px-4 py-2 font-medium whitespace-nowrap">土日祝</th>
          </tr>
        </thead>
        <tbody>
          {hotels.map((h, i) => (
            <tr key={h.name}
              className={`border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${i % 2 !== 0 ? 'bg-gray-50/40 dark:bg-gray-800/20' : ''}`}>
              <td className="px-4 py-2.5">
                <HotelName name={h.name} url={h.url} />
                {h.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{h.note}</p>}
              </td>
              <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">{h.address}</td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><PriceCell val={h.weekday} /></td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap"><PriceCell val={h.weekend} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function HotelsPage() {
  useEffect(() => { document.title = 'ホテル一覧 | KIJ管理' }, [])
  const [activeArea, setActiveArea] = useState('narita')
  const [openChiba, setOpenChiba] = useState<string>('栄町')

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">ホテルリスト</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">出典: happyhotel.jp ／ 料金は参考値（税込）</p>

      {/* エリアタブ */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {TABS.map(a => (
          <button key={a.id} onClick={() => setActiveArea(a.id)}
            className={`px-5 py-2 text-sm font-medium rounded-t transition-colors ${
              activeArea === a.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── 成田 ── */}
      {activeArea === 'narita' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <HotelTable hotels={NARITA} />
        </div>
      )}

      {/* ── 千葉 ── */}
      {activeArea === 'chiba' && (
        <div className="space-y-2">
          {CHIBA.map(area => (
            <div key={area.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setOpenChiba(openChiba === area.label ? '' : area.label)}>
                <span className="font-medium text-gray-900 dark:text-white">
                  {area.label}エリア
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">{area.hotels.length}件</span>
                </span>
                <span className="text-gray-400 text-xs">{openChiba === area.label ? '▲' : '▼'}</span>
              </button>
              {openChiba === area.label && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  <HotelTable hotels={area.hotels} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 西船橋 ── */}
      {activeArea === 'funabashi' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <HotelTable hotels={FUNABASHI} />
        </div>
      )}

      {/* ── 錦糸町 ── */}
      {activeArea === 'kinshicho' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-2 font-medium w-40">ホテル名</th>
                  <th className="text-left px-3 py-2 font-medium">住所</th>
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">平日</th>
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">土日祝</th>
                  <th className="text-center px-2 py-2 font-medium">P</th>
                  <th className="text-center px-4 py-2 font-medium">3P</th>
                </tr>
              </thead>
              <tbody>
                {KINSHICHO.map((h, i) => (
                  <tr key={h.name}
                    className={`border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${i % 2 !== 0 ? 'bg-gray-50/40 dark:bg-gray-800/20' : ''}`}>
                    <td className="px-4 py-2.5"><HotelName name={h.name} url={h.url} /></td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{h.address}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{h.weekday}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{h.weekend}</td>
                    <td className="px-2 py-2.5 text-center">
                      {h.parking
                        ? <span className="text-green-600 dark:text-green-400 font-medium">○</span>
                        : <span className="text-gray-300 dark:text-gray-600">×</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{h.trio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
