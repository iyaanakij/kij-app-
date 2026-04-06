/**
 * Email delivery provider abstraction.
 * 現在: Gmail SMTP (nodemailer)
 * 将来: Resend + 独自ドメイン認証に切り替え予定
 */

export interface SendEmailOptions {
  to: string
  subject: string
  text: string
  imageUrls?: string[]
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  accepted?: string[]
  rejected?: string[]
  response?: string
  error?: string
}

// ── Gmail SMTP provider ──────────────────────────────────────────────────────

import nodemailer from 'nodemailer'
import path from 'path'

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
  })

  // 画像を添付ファイルとしてfetch
  const attachments: nodemailer.Attachment[] = []
  for (const url of opts.imageUrls ?? []) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[emailProvider] 画像fetch失敗 url=${url} status=${res.status}`)
        continue
      }
      const buffer = Buffer.from(await res.arrayBuffer())
      const filename = path.basename(url.split('?')[0]) || 'image'
      const contentType = res.headers.get('content-type') ?? 'image/jpeg'
      attachments.push({ filename, content: buffer, contentType })
    } catch (err) {
      console.warn(`[emailProvider] 画像fetch例外 url=${url}:`, err)
    }
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM ?? process.env.GMAIL_USER!,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      attachments,
    })

    const rejected = info.rejected as string[]
    if (rejected.length > 0) {
      return {
        success: false,
        messageId: info.messageId,
        accepted: info.accepted as string[],
        rejected,
        response: info.response,
        error: `rejected: ${rejected.join(', ')}`,
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted as string[],
      rejected: [],
      response: info.response,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
