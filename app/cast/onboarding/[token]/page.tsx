'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const BUST_OPTIONS = ['Aカップ', 'Bカップ', 'Cカップ', 'Dカップ', 'Eカップ', 'Fカップ', 'Gカップ', 'Hカップ', 'Iカップ以上']
const ZODIAC_OPTIONS = ['おひつじ座', 'おうし座', 'ふたご座', 'かに座', 'しし座', 'おとめ座', 'てんびん座', 'さそり座', 'いて座', 'やぎ座', 'みずがめ座', 'うお座']
const BLOOD_OPTIONS = ['A型', 'B型', 'O型', 'AB型']
const DRINKING_OPTIONS = ['飲まない', 'たまに飲む', 'よく飲む']
const RELATIONSHIPS_OPTIONS = ['0人', '1〜3人', '4〜6人', '7〜9人', '10人以上', '秘密']
const CONTACT_OPTIONS = ['LINE・電話可', 'LINEのみ', '電話・LINE NG']
const REQUEST_OPTIONS = ['可能', '対応不可']
const NG_OPTION_LIST = ['聖水', '私物パンティ', 'ロープ拘束', 'コスプレ', '3P', '自宅出張', 'レンタルルーム', 'ビジネスホテル', '外国人客', 'その他']
const AGE_OPTIONS = Array.from({ length: 43 }, (_, i) => String(i + 18))
const HEIGHT_OPTIONS = Array.from({ length: 66 }, (_, i) => String(i + 130))
const BUST_CM_OPTIONS = Array.from({ length: 71 }, (_, i) => String(i + 60))
const WAIST_OPTIONS = Array.from({ length: 61 }, (_, i) => String(i + 40))
const HIP_OPTIONS = Array.from({ length: 71 }, (_, i) => String(i + 60))

const AREA_NAMES: Record<number, string> = { 1: '成田', 2: '千葉', 3: '西船橋', 4: '錦糸町' }

type FormState = Record<string, string | string[]>

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({ name, value, onChange, placeholder }: { name: string; value: string; onChange: (n: string, v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(name, e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
    />
  )
}

function NumberInput({ name, value, onChange, min, max, placeholder }: { name: string; value: string; onChange: (n: string, v: string) => void; min?: number; max?: number; placeholder?: string }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(name, e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  )
}

function TextArea({ name, value, onChange, placeholder, noNewline }: { name: string; value: string; onChange: (n: string, v: string) => void; placeholder?: string; noNewline?: boolean }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(name, noNewline ? e.target.value.replace(/\n/g, '') : e.target.value)}
      onKeyDown={noNewline ? e => { if (e.key === 'Enter') e.preventDefault() } : undefined}
      placeholder={placeholder}
      rows={4}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
    />
  )
}

function Select({ name, value, onChange, options }: { name: string; value: string; onChange: (n: string, v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(name, e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
    >
      <option value="">選択してください</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function CheckboxGroup({ name, values, onChange, options }: { name: string; values: string[]; onChange: (n: string, v: string[]) => void; options: string[] }) {
  const toggle = (opt: string) => {
    onChange(name, values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt])
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={values.includes(opt)}
            onChange={() => toggle(opt)}
            className="rounded accent-pink-500"
          />
          {opt}
        </label>
      ))}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-pink-600 border-b border-pink-200 pb-1 mb-4 mt-6">{children}</h2>
}

export default function CastOnboardingPage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState<'M' | 'E' | null>(null)
  const [areaId, setAreaId] = useState<number>(0)
  const [status, setStatus] = useState<string>('')
  const [form, setForm] = useState<FormState>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/cast/onboarding/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setBrand(d.brand)
        setAreaId(d.area_id)
        setStatus(d.status)
        if (d.raw_answers) setForm(d.raw_answers as FormState)
        setLoading(false)
      })
      .catch(() => { setError('読み込みに失敗しました'); setLoading(false) })
  }, [token])

  const set = (name: string, value: string | string[]) => setForm(prev => ({ ...prev, [name]: value }))
  const str = (k: string) => (form[k] as string) ?? ''
  const arr = (k: string) => (form[k] as string[]) ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!str('stage_name').trim()) { alert('源氏名は必須です'); return }
    if (!str('stage_name_kana').trim()) { alert('ふりがなは必須です（ひらがなで入力）'); return }
    if (!/^[ぁ-んー\s　]+$/.test(str('stage_name_kana').trim())) { alert('ふりがなはひらがなで入力してください'); return }
    if (!str('age')) { alert('年齢を選択してください'); return }
    if (!str('height')) { alert('身長を選択してください'); return }
    setSubmitting(true)
    const res = await fetch(`/api/cast/onboarding/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    setSubmitting(false)
    if (d.error) { alert(`送信に失敗しました: ${d.error}`); return }
    setDone(true)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">読み込み中...</p></div>
  if (error) return <div className="min-h-screen flex items-center justify-center"><p className="text-red-500">{error}</p></div>
  if (done || status === 'submitted' || status === 'approved') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-pink-50 px-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">✨</div>
          <h1 className="text-xl font-bold text-pink-600 mb-2">送信完了しました</h1>
          <p className="text-sm text-gray-600">ご回答ありがとうございます。<br />内容を確認の上、ご連絡いたします。</p>
        </div>
      </div>
    )
  }

  const shopName = `${AREA_NAMES[areaId] ?? ''}${brand === 'M' ? ' 快楽M性感倶楽部' : ' 癒したくて'}`

  return (
    <div className="min-h-screen bg-pink-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-pink-700">プロフィールアンケート</h1>
          <p className="text-sm text-gray-500 mt-1">{shopName}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6">

          <SectionTitle>基本情報</SectionTitle>
          <Field label="源氏名（フルネーム）" required>
            <TextInput name="stage_name" value={str('stage_name')} onChange={set} placeholder="例: さくら りこ" />
          </Field>
          <Field label="ふりがな（ひらがなで入力）" required>
            <TextInput name="stage_name_kana" value={str('stage_name_kana')} onChange={set} placeholder="例: さくら りこ" />
          </Field>
          <Field label="お名前（本名または苗字のみ）">
            <TextInput name="real_name" value={str('real_name')} onChange={set} />
          </Field>
          <Field label="年齢" required>
            <Select name="age" value={str('age')} onChange={set} options={AGE_OPTIONS} />
          </Field>
          <Field label="身長（cm）" required>
            <Select name="height" value={str('height')} onChange={set} options={HEIGHT_OPTIONS} />
          </Field>
          <Field label="バストサイズ" required>
            <Select name="bust" value={str('bust')} onChange={set} options={BUST_OPTIONS} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="バスト（cm）">
              <Select name="bust_cm" value={str('bust_cm')} onChange={set} options={BUST_CM_OPTIONS} />
            </Field>
            <Field label="ウエスト（cm）">
              <Select name="waist" value={str('waist')} onChange={set} options={WAIST_OPTIONS} />
            </Field>
            <Field label="ヒップ（cm）">
              <Select name="hip" value={str('hip')} onChange={set} options={HIP_OPTIONS} />
            </Field>
          </div>

          <SectionTitle>業務条件</SectionTitle>
          <Field label="出張NGエリア">
            <TextInput name="ng_area" value={str('ng_area')} onChange={set} placeholder="例: 千葉市内全域" />
          </Field>
          <Field label="有料オプション・派遣先の対応不可項目">
            <CheckboxGroup name="ng_options" values={arr('ng_options')} onChange={set} options={NG_OPTION_LIST} />
          </Field>
          <Field label="出勤時以外の連絡方法" required>
            <Select name="contact_method" value={str('contact_method')} onChange={set} options={CONTACT_OPTIONS} />
          </Field>
          <Field label="出勤リクエスト対応可否" required>
            <Select name="request_ok" value={str('request_ok')} onChange={set} options={REQUEST_OPTIONS} />
          </Field>

          <SectionTitle>プロフィール</SectionTitle>
          <Field label="星座" required>
            <Select name="zodiac" value={str('zodiac')} onChange={set} options={ZODIAC_OPTIONS} />
          </Field>
          <Field label="血液型">
            <Select name="blood_type" value={str('blood_type')} onChange={set} options={BLOOD_OPTIONS} />
          </Field>
          <Field label="TATTOO（有無・部位）">
            <TextInput name="tattoo" value={str('tattoo')} onChange={set} placeholder="例: なし / 右腕に小さなもの" />
          </Field>

          {brand === 'M' ? (
            <>
              <Field label="性格">
                <TextArea name="m_personality" value={str('m_personality')} onChange={set} noNewline />
              </Field>
              <Field label="チャームポイント">
                <TextArea name="m_charm" value={str('m_charm')} onChange={set} noNewline />
              </Field>
              <Field label="好みのM男性のタイプ">
                <TextArea name="m_preferred_type" value={str('m_preferred_type')} onChange={set} noNewline />
              </Field>
              <Field label="喫煙">
                <TextInput name="m_smoking" value={str('m_smoking')} onChange={set} placeholder="例: なし / あり" />
              </Field>
              <Field label="ストレス解消法">
                <TextInput name="m_stress_relief" value={str('m_stress_relief')} onChange={set} />
              </Field>
              <Field label="好きな言葉">
                <TextInput name="m_favorite_word" value={str('m_favorite_word')} onChange={set} />
              </Field>

              <SectionTitle>プレイ情報</SectionTitle>
              <Field label="痴女になったきっかけ">
                <TextArea name="m_trigger" value={str('m_trigger')} onChange={set} noNewline />
              </Field>
              <Field label="痴女だと思う瞬間は？">
                <TextArea name="m_chijo_moment" value={str('m_chijo_moment')} onChange={set} noNewline />
              </Field>
              <Field label="S度レベル（自己評価・10段階）">
                <TextInput name="m_sadist_level" value={str('m_sadist_level')} onChange={set} placeholder="例: 7" />
              </Field>
              <Field label="好きなシチュエーション">
                <TextArea name="m_favorite_scenario" value={str('m_favorite_scenario')} onChange={set} noNewline />
              </Field>
              <Field label="好きなおもちゃ">
                <TextInput name="m_favorite_toy" value={str('m_favorite_toy')} onChange={set} />
              </Field>
              <Field label="得意プレイ">
                <TextArea name="m_specialty_play" value={str('m_specialty_play')} onChange={set} noNewline />
              </Field>
              <Field label="挑戦したいプレイ">
                <TextArea name="m_challenge_play" value={str('m_challenge_play')} onChange={set} noNewline />
              </Field>
              <Field label="あなたにとってM性感とは">
                <TextArea name="m_meaning" value={str('m_meaning')} onChange={set} noNewline />
              </Field>
              <Field label="お客様へのメッセージ">
                <TextArea name="m_message" value={str('m_message')} onChange={set} placeholder="5行以上推奨" />
              </Field>
            </>
          ) : (
            <>
              <Field label="趣味・特技">
                <TextArea name="e_hobby" value={str('e_hobby')} onChange={set} noNewline />
              </Field>
              <Field label="性格">
                <TextArea name="e_personality" value={str('e_personality')} onChange={set} noNewline />
              </Field>
              <Field label="チャームポイント">
                <TextArea name="e_charm" value={str('e_charm')} onChange={set} noNewline />
              </Field>
              <Field label="喫煙">
                <TextInput name="e_smoking" value={str('e_smoking')} onChange={set} placeholder="例: なし / あり" />
              </Field>
              <Field label="飲酒習慣">
                <Select name="e_drinking" value={str('e_drinking')} onChange={set} options={DRINKING_OPTIONS} />
              </Field>
              <Field label="好きな映画・本">
                <TextInput name="e_favorite_media" value={str('e_favorite_media')} onChange={set} />
              </Field>
              <Field label="交際経験人数">
                <Select name="e_relationships" value={str('e_relationships')} onChange={set} options={RELATIONSHIPS_OPTIONS} />
              </Field>

              <SectionTitle>プレイ情報</SectionTitle>
              <Field label="ドキッとする瞬間">
                <TextArea name="e_exciting_moment" value={str('e_exciting_moment')} onChange={set} noNewline />
              </Field>
              <Field label="マッサージ店勤務経験">
                <TextInput name="e_massage_experience" value={str('e_massage_experience')} onChange={set} placeholder="例: なし / ○○で3ヶ月" />
              </Field>
              <Field label="得意な性感プレイ">
                <TextArea name="e_specialty_play" value={str('e_specialty_play')} onChange={set} noNewline />
              </Field>
              <Field label="接客で心掛けていること">
                <TextArea name="e_care" value={str('e_care')} onChange={set} noNewline />
              </Field>
              <Field label="お客様へのメッセージ">
                <TextArea name="e_message" value={str('e_message')} onChange={set} />
              </Field>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {submitting ? '送信中...' : '送信する'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          入力内容は店舗内部での管理用途にのみ使用します
        </p>
      </div>
    </div>
  )
}
