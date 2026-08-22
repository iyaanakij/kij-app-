import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/emailProvider'
import { addMailTracking, htmlToText } from '@/lib/mailCampaignTracking'
import { isEmail } from '@/lib/email'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAGE_SIZE = 1000
const DIRECTORY_CHUNK_SIZE = 200
const INSERT_CHUNK_SIZE = 500
const MAX_RECIPIENTS = Number(process.env.MAIL_CAMPAIGN_MAX_RECIPIENTS || 300)

type EligibleRecipient = {
  phone: string
  email: string
  name: string | null
  last_visited_at: string
}

function cutoffIso(filterMonths: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - filterMonths)
  return d.toISOString()
}

function campaignBaseUrl(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin).replace(/\/$/, '')
}

function token() {
  return randomBytes(32).toString('hex')
}

async function fetchEligibleRecipients(filterMonths: number): Promise<EligibleRecipient[]> {
  const cutoff = cutoffIso(filterMonths)
  const recencyRows: Array<{ phone: string; last_visited_at: string }> = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('customer_visit_recency')
      .select('phone, last_visited_at')
      .gte('last_visited_at', cutoff)
      .order('last_visited_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as Array<{ phone: string; last_visited_at: string }>
    recencyRows.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  const lastVisitedByPhone = new Map(recencyRows.map(r => [r.phone, r.last_visited_at]))
  const byEmail = new Map<string, EligibleRecipient>()

  for (let i = 0; i < recencyRows.length; i += DIRECTORY_CHUNK_SIZE) {
    const phones = recencyRows.slice(i, i + DIRECTORY_CHUNK_SIZE).map(r => r.phone)
    const { data, error } = await sb
      .from('mail_customer_directory')
      .select('phone, email, name')
      .in('phone', phones)
      .not('email', 'is', null)
      .neq('email', '')
    if (error) throw error

    for (const row of (data ?? []) as Array<{ phone: string; email: string | null; name: string | null }>) {
      if (!isEmail(row.email)) continue
      const lastVisitedAt = lastVisitedByPhone.get(row.phone)
      if (!lastVisitedAt) continue
      const email = row.email.toLowerCase()
      const existing = byEmail.get(email)
      if (!existing || lastVisitedAt > existing.last_visited_at) {
        byEmail.set(email, {
          phone: row.phone,
          email,
          name: row.name,
          last_visited_at: lastVisitedAt,
        })
      }
    }
  }

  return [...byEmail.values()].sort((a, b) => b.last_visited_at.localeCompare(a.last_visited_at))
}

async function insertRecipients(campaignId: number, recipients: EligibleRecipient[]) {
  for (let i = 0; i < recipients.length; i += INSERT_CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + INSERT_CHUNK_SIZE).map(r => ({
      campaign_id: campaignId,
      phone: r.phone,
      email: r.email,
      name: r.name,
      token: token(),
    }))
    const { error } = await sb.from('mail_campaign_recipients').insert(chunk)
    if (error) throw error
  }
}

async function loadCampaigns(limit: number) {
  const { data: campaigns, error } = await sb
    .from('mail_campaigns')
    .select('id, subject, filter_months, status, stats, error_message, created_at, queued_at, sent_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const rows = (campaigns ?? []) as Array<Record<string, unknown> & { id: number }>
  const ids = rows.map(c => c.id)
  if (ids.length === 0) return []

  const { data: recipients, error: recipientError } = await sb
    .from('mail_campaign_recipients')
    .select('campaign_id, phone, sent_at, opened_at, open_count, first_clicked_at, click_count')
    .in('campaign_id', ids)
  if (recipientError) throw recipientError

  const statsByCampaign = new Map<number, {
    total: number
    sent: number
    opened: number
    clicked: number
    tests: number
  }>()

  for (const r of (recipients ?? []) as Array<{
    campaign_id: number
    phone: string
    sent_at: string | null
    opened_at: string | null
    first_clicked_at: string | null
  }>) {
    const stats = statsByCampaign.get(r.campaign_id) ?? { total: 0, sent: 0, opened: 0, clicked: 0, tests: 0 }
    if (r.phone.startsWith('test:')) {
      stats.tests++
    } else {
      stats.total++
      if (r.sent_at) stats.sent++
      if (r.opened_at) stats.opened++
      if (r.first_clicked_at) stats.clicked++
    }
    statsByCampaign.set(r.campaign_id, stats)
  }

  return rows.map(c => ({
    ...c,
    recipient_stats: statsByCampaign.get(c.id) ?? { total: 0, sent: 0, opened: 0, clicked: 0, tests: 0 },
  }))
}

async function loadCampaignDetail(campaignId: number) {
  const { data: recipients, error } = await sb
    .from('mail_campaign_recipients')
    .select('id, phone, email, name, sent_at, opened_at, open_count, first_clicked_at, click_count')
    .eq('campaign_id', campaignId)
    .order('sent_at', { ascending: false, nullsFirst: false })
  if (error) throw error

  const rows = (recipients ?? []) as Array<{
    id: number; phone: string; email: string; name: string | null
    sent_at: string | null; opened_at: string | null; open_count: number
    first_clicked_at: string | null; click_count: number
  }>

  const { data: clicks, error: clickError } = await sb
    .from('mail_campaign_link_clicks')
    .select('url')
    .eq('campaign_id', campaignId)
  if (clickError) throw clickError

  const linkCounts = new Map<string, number>()
  for (const { url } of (clicks ?? []) as Array<{ url: string }>) {
    linkCounts.set(url, (linkCounts.get(url) ?? 0) + 1)
  }
  const linkClicks = [...linkCounts.entries()]
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)

  return {
    recipients: rows.map(r => ({
      id: r.id,
      is_test: r.phone.startsWith('test:'),
      email: r.email,
      name: r.name,
      sent_at: r.sent_at,
      opened_at: r.opened_at,
      open_count: r.open_count,
      first_clicked_at: r.first_clicked_at,
      click_count: r.click_count,
    })),
    link_clicks: linkClicks,
  }
}

export async function GET(request: NextRequest) {
  const campaignDetailId = Number(request.nextUrl.searchParams.get('campaign_detail') ?? '0')
  if (campaignDetailId > 0) {
    try {
      const detail = await loadCampaignDetail(campaignDetailId)
      return NextResponse.json(detail)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
  }

  const previewMonths = Number(request.nextUrl.searchParams.get('preview_months') ?? '0')
  if (previewMonths > 0) {
    try {
      const recipients = await fetchEligibleRecipients(previewMonths)
      return NextResponse.json({
        preview: {
          filter_months: previewMonths,
          count: recipients.length,
          capped_by_default: recipients.length > MAX_RECIPIENTS,
          max_recipients: MAX_RECIPIENTS,
          sample: recipients.slice(0, 10),
        },
      })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
  }

  try {
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? '20')
    const campaigns = await loadCampaigns(limit)
    return NextResponse.json({ campaigns, max_recipients: MAX_RECIPIENTS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    action?: 'create_draft' | 'test_send' | 'queue_campaign'
    campaign_id?: number
    subject?: string
    body_html?: string
    filter_months?: number
    test_email?: string
    confirm_live_send?: boolean
  }

  try {
    if (body.action === 'create_draft') {
      const subject = body.subject?.trim()
      const bodyHtml = body.body_html?.trim()
      const filterMonths = Number(body.filter_months)
      if (!subject || !bodyHtml) return NextResponse.json({ error: '件名と本文は必須です' }, { status: 400 })
      if (!Number.isInteger(filterMonths) || filterMonths < 1 || filterMonths > 36) {
        return NextResponse.json({ error: '対象期間は1〜36ヶ月で指定してください' }, { status: 400 })
      }

      const recipients = await fetchEligibleRecipients(filterMonths)
      if (recipients.length === 0) return NextResponse.json({ error: '対象者が0件です' }, { status: 400 })
      if (recipients.length > MAX_RECIPIENTS) {
        return NextResponse.json({
          error: `対象者が${recipients.length}件あります。安全上限 ${MAX_RECIPIENTS} 件を超えるため作成しません。`,
        }, { status: 400 })
      }

      const now = new Date().toISOString()
      const { data: campaign, error } = await sb
        .from('mail_campaigns')
        .insert({
          subject,
          body_html: bodyHtml,
          filter_months: filterMonths,
          status: 'draft',
          requested_by: 'admin',
          stats: { snapshotted_recipients: recipients.length },
          updated_at: now,
        })
        .select('id')
        .single()
      if (error || !campaign) throw error ?? new Error('campaign insert failed')

      await insertRecipients(campaign.id, recipients)
      return NextResponse.json({ ok: true, campaign_id: campaign.id, recipient_count: recipients.length })
    }

    if (body.action === 'test_send') {
      const campaignId = Number(body.campaign_id)
      if (!campaignId) return NextResponse.json({ error: 'campaign_id が必要です' }, { status: 400 })
      if (!isEmail(body.test_email)) return NextResponse.json({ error: 'テスト送信先メールが不正です' }, { status: 400 })

      const { data: campaign, error } = await sb
        .from('mail_campaigns')
        .select('id, subject, body_html')
        .eq('id', campaignId)
        .single()
      if (error || !campaign) return NextResponse.json({ error: 'キャンペーンが見つかりません' }, { status: 404 })

      const phone = `test:${body.test_email.toLowerCase()}`
      const { data: existing } = await sb
        .from('mail_campaign_recipients')
        .select('id, token')
        .eq('campaign_id', campaignId)
        .eq('phone', phone)
        .maybeSingle()

      let recipient = existing as { id: number; token: string } | null
      if (!recipient) {
        const { data: inserted, error: insertError } = await sb
          .from('mail_campaign_recipients')
          .insert({
            campaign_id: campaignId,
            phone,
            email: body.test_email.toLowerCase(),
            name: 'テスト送信',
            token: token(),
          })
          .select('id, token')
          .single()
        if (insertError || !inserted) throw insertError ?? new Error('test recipient insert failed')
        recipient = inserted
      }

      const html = addMailTracking(campaign.body_html, recipient.token, campaignBaseUrl(request))
      const result = await sendEmail({
        to: body.test_email,
        subject: `[TEST] ${campaign.subject}`,
        text: htmlToText(campaign.body_html),
        html,
      })

      const now = new Date().toISOString()
      await sb
        .from('mail_campaign_recipients')
        .update({
          sent_at: result.success ? now : null,
          message_id: result.messageId ?? null,
          last_error: result.success ? null : result.error ?? 'send failed',
          updated_at: now,
        })
        .eq('id', recipient.id)

      if (!result.success) return NextResponse.json({ error: result.error ?? '送信に失敗しました' }, { status: 500 })
      return NextResponse.json({ ok: true, message_id: result.messageId })
    }

    if (body.action === 'queue_campaign') {
      if (process.env.MAIL_CAMPAIGN_QUEUE_ENABLED !== 'true') {
        return NextResponse.json({ error: '実配信キュー投入は現在無効です' }, { status: 403 })
      }
      if (body.confirm_live_send !== true) {
        return NextResponse.json({ error: '実配信には confirm_live_send=true が必要です' }, { status: 400 })
      }

      const campaignId = Number(body.campaign_id)
      if (!campaignId) return NextResponse.json({ error: 'campaign_id が必要です' }, { status: 400 })
      const now = new Date().toISOString()
      const { error } = await sb
        .from('mail_campaigns')
        .update({ status: 'queued', queued_at: now, updated_at: now })
        .eq('id', campaignId)
        .eq('status', 'draft')
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
