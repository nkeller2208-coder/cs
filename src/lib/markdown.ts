/**
 * Rendu d'un Markdown minimal et sûr : **gras**, *italique*, listes (- / 1.),
 * liens [texte](url) et URL nues. Tout le HTML saisi est échappé ;
 * seules les balises générées ici sont produites.
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function safeHref(url: string): string | null {
  try {
    const u = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.toString() : null
  } catch {
    return null
  }
}

function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
}

function inline(src: string): string {
  // On découpe d'abord les liens pour ne pas échapper/transformer leurs URL.
  const out: string[] = []
  const re = /\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g
  let last = 0
  for (const m of src.matchAll(re)) {
    out.push(emphasis(escapeHtml(src.slice(last, m.index))))
    const href = safeHref(m[2] ?? m[3])
    if (m[1] !== undefined) out.push(href ? link(href, emphasis(escapeHtml(m[1]))) : escapeHtml(m[0]))
    else out.push(href ? link(href, escapeHtml(m[3])) : escapeHtml(m[3]))
    last = m.index + m[0].length
  }
  out.push(emphasis(escapeHtml(src.slice(last))))
  return out.join('')
}

function emphasis(s: string): string {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>')
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []
  let para: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`)
    list = null
  }

  for (const line of lines) {
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (ul || ol) {
      flushPara()
      const type = ul ? 'ul' : 'ol'
      if (list && list.type !== type) flushList()
      list ??= { type, items: [] }
      list.items.push((ul ?? ol)![1])
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return html.join('')
}

/** Texte brut (pour les aperçus sur les cartes). */
export function markdownToText(src: string): string {
  return src
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|\*/g, '')
    .replace(/^\s*([-•]|\d+[.)])\s+/gm, '• ')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}
