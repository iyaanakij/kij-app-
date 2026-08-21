export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function addMailTracking(bodyHtml: string, token: string, baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const clickBase = `${normalizedBase}/api/mail/track/click`
  const openUrl = `${normalizedBase}/api/mail/track/open/${encodeURIComponent(token)}`

  const rewritten = bodyHtml.replace(
    /\bhref=(["'])(https?:\/\/[^"']+)\1/gi,
    (match, quote: string, url: string) => {
      if (url.startsWith(clickBase)) return match
      const tracked = `${clickBase}?token=${encodeURIComponent(token)}&url=${encodeURIComponent(url)}`
      return `href=${quote}${escapeHtmlAttribute(tracked)}${quote}`
    }
  )

  return `${rewritten}\n<img src="${escapeHtmlAttribute(openUrl)}" width="1" height="1" alt="" style="display:none;max-height:0;overflow:hidden;" />`
}
