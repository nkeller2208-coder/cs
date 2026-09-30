import { useState } from 'react'
import type { Media } from '../lib/types'
import { describeMedia, hostnameOf, youtubeEmbedUrl } from '../lib/media'
import { formatTimestamp } from '../lib/text'
import { cx } from './ui'

/** Affichage intégré d'un média : lecteur YouTube, image, ou bouton « Ouvrir ». */
export function MediaView({ media, compact = false }: { media: Media; compact?: boolean }) {
  const m = describeMedia(media)
  const [broken, setBroken] = useState(false)

  if (m.kind === 'youtube' && m.youtubeId) {
    return (
      <div className="space-y-1">
        <div className={cx('overflow-hidden rounded-lg bg-black', m.isShort ? 'mx-auto aspect-[9/16] max-h-[70vh]' : 'aspect-video')}>
          <iframe
            src={youtubeEmbedUrl(m)}
            title="Vidéo YouTube"
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
        {!compact && (
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-300">
            Ouvrir sur YouTube{m.start ? ` à ${formatTimestamp(m.start)}` : ''} ↗
          </a>
        )}
      </div>
    )
  }

  if (m.kind === 'image' && !broken) {
    return (
      <a href={m.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg bg-slate-800">
        <img
          src={m.url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className={cx('mx-auto w-full object-contain', compact ? 'max-h-48' : 'max-h-[75vh]')}
        />
      </a>
    )
  }

  return (
    <a
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-4 py-3 ring-1 ring-slate-700 hover:bg-slate-700"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-100">{hostnameOf(m.url)}</span>
        <span className="block truncate text-xs text-slate-400">{m.url}</span>
      </span>
      <span className="shrink-0 rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-slate-950">Ouvrir ↗</span>
    </a>
  )
}
