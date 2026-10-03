import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Card } from '../lib/types'
import { useMyRoleIds, type TagIndex } from '../hooks/data'
import { thumbnailOf } from '../lib/media'
import { markdownToText } from '../lib/markdown'
import { CardBadges, StatusBadge } from './CardBadges'
import { cx } from './ui'
import { ActionBadge, myAction } from './StrategyPieces'
import { LEVELS, LearningBadge, Stars, useRateCard } from './Learning'

export function CardTile({ card, idx, order }: { card: Card; idx: TagIndex; order?: number[] }) {
  const location = useLocation()
  const thumbMedia = card.media.find((m) => thumbnailOf(m))
  const thumb = thumbMedia ? thumbnailOf(thumbMedia) : null
  const hasVideo = card.media.some((m) => m.kind === 'youtube')
  const text = markdownToText(card.description)
  const [broken, setBroken] = useState(false)
  const myRoleIds = useMyRoleIds()
  const rate = useRateCard(card.id)
  const mine = card.kind === 'strategy' ? myAction(card, myRoleIds, idx) : null

  // La note est hors du lien : pas de bouton dans un lien (clic et lecteurs d'écran).
  return (
    <article
      className={cx(
        'group flex flex-col overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-800 transition',
        'hover:-translate-y-0.5 hover:ring-slate-600 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-amber-400',
        card.side === 'CT' && 'border-t-2 border-ct/70',
        card.side === 'T' && 'border-t-2 border-t/70',
      )}
    >
      <Link to={`/c/${card.id}`} state={{ background: location, order }} className="flex flex-1 flex-col outline-none">
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
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            <StatusBadge status={card.status} />
            <LearningBadge card={card} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <h3 className="line-clamp-2 font-semibold leading-snug text-slate-50 group-hover:text-amber-200">
            {card.title || <span className="italic text-slate-500">Sans titre</span>}
          </h3>
          <CardBadges card={card} idx={idx} />
          {mine && (
            <p className="flex min-w-0 items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-100 ring-1 ring-amber-400/30">
              <span className="shrink-0 whitespace-nowrap text-amber-300">Toi ({mine.role.name}) :</span>
              <ActionBadge action={mine.action} className="shrink-0" />
              {mine.note && <span className="truncate text-slate-300">{mine.note}</span>}
            </p>
          )}
          {text && <p className="line-clamp-2 text-sm text-slate-400">{text}</p>}
        </div>
      </Link>
      {card.status !== 'draft' && (
        <div className="mx-3 flex items-center justify-between gap-2 border-t border-slate-800/80 py-2 text-xs text-slate-500">
          <span>{card.my_rating ? LEVELS[card.my_rating] : 'Note ton niveau'}</span>
          <Stars value={card.my_rating} onChange={(n) => rate.mutate(n)} size="sm" label={`Mon niveau sur ${card.title}`} />
        </div>
      )}
    </article>
  )
}
