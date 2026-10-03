import type { Media, MediaKind } from './types'

export interface ParsedMedia extends Media {
  youtubeId?: string
  isShort?: boolean
  start?: number
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i

/** « 90 », « 90s », « 1m30s », « 1h2m3s » → secondes. */
export function parseYoutubeTime(t: string | null): number | undefined {
  if (!t) return undefined
  if (/^\d+s?$/.test(t)) return Number(t.replace('s', '')) || undefined
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
  if (!m || !t) return undefined
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return total || undefined
}

function toUrl(raw: string): URL | null {
  const s = raw.trim()
  if (!s) return null
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
}

function youtubeInfo(u: URL): { id: string; isShort: boolean; start?: number } | null {
  const host = u.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  let isShort = false
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'watch') id = u.searchParams.get('v')
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
      id = parts[1] ?? null
      isShort = parts[0] === 'shorts'
    }
  }
  if (!id || !/^[\w-]{6,20}$/.test(id)) return null
  const start = parseYoutubeTime(u.searchParams.get('t') ?? u.searchParams.get('start'))
  return { id, isShort, start }
}

export function youtubeUrl(id: string, isShort: boolean, start?: number): string {
  const base = isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`
  if (!start) return base
  return `${base}${isShort ? '?' : '&'}t=${start}s`
}

/** Clé de comparaison pour l'anti-doublon (indépendante du timestamp et des paramètres de suivi). */
function genericKey(u: URL): string {
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  const params = new URLSearchParams(u.search)
  for (const k of [...params.keys()]) if (/^(utm_|fbclid|gclid|si$|feature$)/.test(k)) params.delete(k)
  params.sort()
  const q = params.toString()
  const path = u.pathname.replace(/\/+$/, '')
  return `${host}${path}${q ? `?${q}` : ''}`
}

/** Détecte le type d'un lien et le normalise. Renvoie null si ce n'est pas une URL. */
export function parseMedia(raw: string): ParsedMedia | null {
  const u = toUrl(raw)
  if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null

  const yt = youtubeInfo(u)
  if (yt) {
    return {
      kind: 'youtube',
      url: youtubeUrl(yt.id, yt.isShort, yt.start),
      url_key: `yt:${yt.id}`,
      youtubeId: yt.id,
      isShort: yt.isShort,
      start: yt.start,
    }
  }

  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'imgur.com' || host === 'i.imgur.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length === 1) {
      const [file] = parts
      const id = file.replace(/\.[a-z0-9]+$/i, '')
      const ext = /\.gifv$/i.test(file) ? 'gif' : (/\.([a-z0-9]+)$/i.exec(file)?.[1] ?? 'jpg')
      if (/^\w{5,10}$/.test(id) && (IMAGE_EXT.test(`.${ext}`) || ext === 'gif')) {
        return { kind: 'image', url: `https://i.imgur.com/${id}.${ext.toLowerCase()}`, url_key: `imgur:${id}` }
      }
    }
  }

  // Images servies par Cloudflare Images : …/image.jpg/public (le nom du format suit l'extension).
  const cfImage = host === 'imagedelivery.net' || u.pathname.includes('/cdn-cgi/imagedelivery/')
  const kind: MediaKind = IMAGE_EXT.test(u.pathname) || cfImage ? 'image' : 'link'
  u.hash = ''
  return { kind, url: u.toString(), url_key: genericKey(u) }
}

/** Relit un média enregistré (pour retrouver l'id YouTube, le timestamp…). */
export function describeMedia(m: Media): ParsedMedia {
  return parseMedia(m.url) ?? { ...m }
}

export function withStart(m: ParsedMedia, start: number | undefined): ParsedMedia {
  if (m.kind !== 'youtube' || !m.youtubeId) return m
  return { ...m, start, url: youtubeUrl(m.youtubeId, !!m.isShort, start) }
}

export function thumbnailOf(m: Media): string | null {
  const p = describeMedia(m)
  if (p.kind === 'youtube' && p.youtubeId) return `https://i.ytimg.com/vi/${p.youtubeId}/hqdefault.jpg`
  if (p.kind === 'image') return p.url
  return null
}

export function youtubeEmbedUrl(m: ParsedMedia): string {
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' })
  if (m.start) params.set('start', String(m.start))
  return `https://www.youtube-nocookie.com/embed/${m.youtubeId}?${params}`
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Titre d'une vidéo via oEmbed (YouTube, puis noembed en secours pour le CORS). */
export async function fetchYoutubeTitle(url: string, signal?: AbortSignal): Promise<string | null> {
  const endpoints = [
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
  ]
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { signal })
      if (!res.ok) continue
      const data = (await res.json()) as { title?: string; error?: string }
      if (data.title) return data.title
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
    }
  }
  return null
}
