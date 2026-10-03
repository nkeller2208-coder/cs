/** Minuscules, sans accents, espaces normalisés : pour la recherche et la comparaison. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function byOrder<T extends { sort_order: number; name: string }>(a: T, b: T): number {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'fr')
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const dayFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}
export function formatDay(iso: string): string {
  return dayFmt.format(new Date(iso))
}

/** « 1:05 » ou « 65 » → 65 secondes. Renvoie null si invalide. */
export function parseTimestamp(input: string): number | null {
  const s = input.trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return Number(s)
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  const [, h, mm, ss] = m
  if (Number(ss) >= 60) return null
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss)
}

export function formatTimestamp(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
