'use client'

import { useState, useRef, useEffect } from 'react'

function renderMarkdown(text: string) {
  // テーブルブロックをHTMLに変換
  const tableRegex = /((?:\|.+\|\n?)+)/g
  text = text.replace(tableRegex, (block) => {
    const rows = block.trim().split('\n').filter(r => r.trim())
    if (rows.length < 2) return block
    const cells = (row: string) => row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim())
    const header = cells(rows[0])
    const isSeparator = (row: string) => /^\|[\s\-|]+\|$/.test(row.trim())
    const dataRows = rows.slice(1).filter(r => !isSeparator(r))
    const th = header.map(h => `<th>${h}</th>`).join('')
    const trs = dataRows.map(r => `<tr>${cells(r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
    return `<table class="chat-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
  })

  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/\n/g, '<br />')
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const STORAGE_KEY = 'chat_history'
const INITIAL_MESSAGE: Message = { role: 'assistant', content: 'こんにちは！サービス内容・料金・初めての方へのご案内など、お気軽にどうぞ😊\n\n※このチャットは自動応答です。空き状況の確定案内・予約確定・有人対応はできません。' }
const RULES_MESSAGE: Message = {
  role: 'assistant',
  content: '当店は「M性感」専門店です。まずご確認ください。\n\n**【当店のスタイルについて】**\n- 施術はすべてキャストからお客様へ\n- お客様からキャストへの責め・おさわりはございません\n- キス・フェラ・素股などのヘルスサービス、および本番行為は一切ございません\n\n「女性を一方的に楽しむ」のではなく、「キャストから責められ、感じる」体験を提供するお店です。\n\nご理解いただいた上でご利用ください😊'
}

const SUGGESTIONS = [
  '料金・コースを教えて',
  'スレンダーな子はいる？',
  '初めてなんですが…',
]

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // localStorageから履歴を復元。履歴がなければ初回訪問としてルール表示
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Message[]
        if (parsed.length > 0) {
          setMessages(parsed)
          return
        }
      } catch {}
    }
    // 初回訪問: ウェルカム + ルール説明を初期メッセージとして表示
    setMessages([INITIAL_MESSAGE, RULES_MESSAGE])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text?: string) => {
    const userText = text ?? input.trim()
    if (!userText || loading) return
    setInput('')

    const newMessages: Message[] = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newMessages))
    setLoading(true)

    try {
      const res = await fetch('/api/chat?store=chiba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessages(prev => {
        const updated = [...prev, { role: 'assistant' as const, content: data.reply }]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        return updated
      })
    } catch (e: unknown) {
      setMessages(prev => [...prev, { role: 'assistant', content: `エラー: ${e instanceof Error ? e.message : String(e)}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-pink-500 flex items-center justify-center text-white text-lg">💬</div>
            <div>
              <div className="font-bold text-gray-800 text-sm">自動応答ガイド</div>
              <div className="text-xs text-gray-400 font-medium">サービス案内・FAQ（予約確定・空き確認は非対応）</div>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY)
              setMessages([INITIAL_MESSAGE])
            }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            履歴を消す
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-lg mx-auto space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 text-sm mr-2 flex-shrink-0 mt-1">💬</div>
              )}
              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-pink-500 text-white rounded-br-sm whitespace-pre-wrap'
                    : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm'
                }`}
                {...(m.role === 'assistant'
                  ? { dangerouslySetInnerHTML: { __html: renderMarkdown(m.content) } }
                  : { children: m.content }
                )}
              />
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 text-sm mr-2 flex-shrink-0">💬</div>
              <div className="bg-white border border-gray-100 shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* サジェスト（初期メッセージのみ表示、ユーザー発言がない間） */}
          {messages.every(m => m.role === 'assistant') && !loading && (
            <div className="flex flex-wrap gap-2 mt-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs bg-white border border-pink-200 text-pink-500 rounded-full px-3 py-1.5 hover:bg-pink-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 sticky bottom-0">
        <div className="max-w-lg mx-auto flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="メッセージを入力... (Shift+Enterで送信)"
            rows={1}
            className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50 resize-none"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-10 h-10 bg-pink-500 hover:bg-pink-600 disabled:opacity-40 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
