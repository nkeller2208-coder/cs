import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Card } from '../lib/types'
import type { TagIndex } from '../hooks/data'
import { thumbnailOf } from '../lib/media'
import { markdownToText } from '../lib/markdown'
import { CardBadges, StatusBadge } from './CardBadges'
import { cx } from './ui'

export function CardTile({ card, idx, order }: { card: Card; idx: TagIndex; order?: number[] }) {
  const location = useLocation()
  const thumbMedia = card.media.find((m) => thumbnailOf(m))
  const thumb = thumbMedia ? thumbnailOf(thumbMedia) : null
  const hasVideo = card.media.some((m) => m.kind === 'youtube')
  const text = markdownToText(card.description)
  const [broken, setBroken] = useState(false)

  return (
    <Link
      to={`/c/${card.id}`}
      state={{ background: location, order }}
      className={cx(
        'group flex flex-col overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-800 transition',
        'hover:-translate-y-0.5 hover:ring-slate-600 focus-visible:outline-2 focus-visible:outline-amber-400',
        card.side === 'CT' && 'border-t-2 border-ct/70',
        card.side === 'T' && 'border-t-2 border-t/70',
      )}
    >
      <div className="relative aspect-video bg-slate-800">
        {thumb && !broken ? (
          <img src={thumb} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="grid size-full place-items-center text-3xl text-slate-600">{hasVideo ? '▶' : card.media.length ? '🔗' : '📝'}</div>
        )}
        {hasVideo && (
          <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">▶ Vidéo</span>
        )}
        {card.media.length > 1 && (
          <span className="absolute left-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
            {card.media.length} médias
          </span>
        )}
        <div className="absolute top-2 left-2">
          <StatusBadge status={card.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 font-semibold leading-snug text-slate-50 group-hover:text-amber-200">
          {card.title || <span className="italic text-slate-500">Sans titre</span>}
        </h3>
        <CardBadges card={card} idx={idx} />
        {text && <p className="line-clamp-2 text-sm text-slate-400">{text}</p>}
      </div>
    </Link>
  )
}
