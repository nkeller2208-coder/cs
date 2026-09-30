import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchYoutubeTitle, hostnameOf, parseMedia, thumbnailOf, withStart, type ParsedMedia } from '../lib/media'
import { formatTimestamp, parseTimestamp } from '../lib/text'
import { findDuplicateMedia } from '../lib/api'
import { cx, inputClass } from './ui'

export interface FormMedia extends ParsedMedia {
  uid: string
  startInput: string
  videoTitle?: string
}

let uidSeq = 0
export function toFormMedia(p: ParsedMedia): FormMedia {
  return { ...p, uid: `m${Date.now()}-${uidSeq++}`, startInput: p.start ? formatTimestamp(p.start) : '' }
}

const KIND_LABEL = { youtube: 'YouTube', image: 'Image', link: 'Lien' } as const

interface Duplicate {
  url_key: string
  card_id: number
  cards: { id: number; title: string; status: string } | null
}

export function MediaField({
  media,
  onChange,
  cardId,
  onVideoTitle,
  inputRef,
}: {
  media: FormMedia[]
  onChange: (m: FormMedia[]) => void
  cardId: number | null
  onVideoTitle: (title: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dupes, setDupes] = useState<Duplicate[]>([])
  const mediaRef = useRef(media)
  mediaRef.current = media

  // Anti-doublon : cherche les cartes qui utilisent déjà ces liens.
  const keys = media.map((m) => m.url_key).join('|')
  useEffect(() => {
    let cancelled = false
    const list = keys ? keys.split('|') : []
    if (!list.length) {
      setDupes([])
      return
    }
    const t = setTimeout(() => {
      findDuplicateMedia(list, cardId)
        .then((d) => !cancelled && setDupes(d))
        .catch(() => {})
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [keys, cardId])

  // Récupère le titre des vidéos YouTube (oEmbed).
  useEffect(() => {
    const ctrl = new AbortController()
    for (const m of media) {
      if (m.kind !== 'youtube' || m.videoTitle !== undefined) continue
      fetchYoutubeTitle(m.url, ctrl.signal)
        .then((title) => {
          onChange(mediaRef.current.map((x) => (x.uid === m.uid ? { ...x, videoTitle: title ?? '' } : x)))
          if (title) onVideoTitle(title)
        })
        .catch(() => {})
    }
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.map((m) => m.uid + (m.videoTitle === undefined ? '?' : '')).join(',')])

  function add(raw: string): boolean {
    const parts = raw.split(/\s+/).filter(Boolean)
    const parsed = parts.map(parseMedia)
    if (!parts.length) return false
    if (parsed.some((p) => !p)) {
      setError('Ce n’est pas un lien valide (il doit commencer par https://…).')
      return false
    }
    setError(null)
    onChange([...media, ...(parsed as ParsedMedia[]).map(toFormMedia)])
    setText('')
    return true
  }

  function update(uid: string, patch: Partial<FormMedia>) {
    onChange(media.map((m) => (m.uid === uid ? { ...m, ...patch } : m)))
  }

  function setStart(m: FormMedia, input: string) {
    const secs = parseTimestamp(input)
    const valid = input.trim() === '' || secs !== null
    const next = valid ? withStart(m, secs ?? undefined) : m
    update(m.uid, { ...next, startInput: input })
  }

  function move(i: number, delta: number) {
    const j = i + delta
    if (j < 0 || j >= media.length) return
    const next = [...media]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text')
            if (pasted && parseMedia(pasted.split(/\s+/)[0] ?? '')) {
              e.preventDefault()
              add(pasted)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(text)
            }
          }}
          placeholder="Colle un lien YouTube, Imgur, image…"
          className={inputClass}
          aria-label="Lien média"
        />
        <button
          type="button"
          onClick={() => add(text)}
          disabled={!text.trim()}
          className="shrink-0 rounded-lg bg-slate-800 px-3 text-sm ring-1 ring-slate-700 hover:bg-slate-700 disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {media.length > 0 && (
        <ul className="space-y-2">
          {media.map((m, i) => {
            const thumb = thumbnailOf(m)
            const sameCard = media.findIndex((x) => x.url_key === m.url_key) !== i
            const elsewhere = dupes.filter((d) => d.url_key === m.url_key)
            const startInvalid = m.startInput.trim() !== '' && parseTimestamp(m.startInput) === null
            return (
              <li key={m.uid} className="rounded-xl bg-slate-900 p-2.5 ring-1 ring-slate-800">
                <div className="flex gap-3">
                  <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-slate-800 sm:w-36">
                    {thumb ? (
                      <img src={thumb} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="grid size-full place-items-center text-2xl">🔗</div>
                    )}
                    <span className="absolute top-1 left-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white uppercase">
                      {KIND_LABEL[m.kind]}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {m.kind === 'youtube' ? (m.videoTitle ?? 'Chargement du titre…') || 'Vidéo YouTube' : hostnameOf(m.url)}
                    </p>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-slate-500 hover:text-slate-300">
                      {m.url}
                    </a>
                    {m.kind === 'youtube' && (
                      <label className="flex items-center gap-2 text-xs text-slate-400">
                        Début à
                        <input
                          value={m.startInput}
                          onChange={(e) => setStart(m, e.target.value)}
                          placeholder="mm:ss"
                          inputMode="numeric"
                          className={cx(inputClass, 'w-20! px-2 py-1 text-xs', startInvalid && 'ring-red-500')}
                        />
                        {startInvalid && <span className="text-red-400">format mm:ss</span>}
                      </label>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-800 disabled:opacity-20" aria-label="Monter">
                      ▲
                    </button>
                    <button type="button" onClick={() => onChange(media.filter((x) => x.uid !== m.uid))} className="rounded p-1 text-slate-400 hover:bg-red-500/20 hover:text-red-300" aria-label="Retirer">
                      ✕
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === media.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-800 disabled:opacity-20" aria-label="Descendre">
                      ▼
                    </button>
                  </div>
                </div>
                {sameCard && <p className="mt-2 text-xs text-amber-300">⚠ Ce lien est déjà présent sur cette carte.</p>}
                {elsewhere.map((d) => (
                  <p key={d.card_id} className="mt-2 text-xs text-amber-300">
                    ⚠ {m.kind === 'youtube' ? 'Cette vidéo est déjà utilisée' : 'Ce lien existe déjà'} sur{' '}
                    <Link to={`/c/${d.card_id}`} target="_blank" className="underline hover:text-amber-200">
                      « {d.cards?.title || 'Sans titre'} »
                    </Link>
                    {d.cards?.status === 'draft' && ' (ton brouillon)'}
                  </p>
                ))}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
