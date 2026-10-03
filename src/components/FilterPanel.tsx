import { useMemo, useState, type ReactNode } from 'react'
import type { Filters, FacetCounts, Family, ViewKey } from '../lib/filters'
import type { Side, Tags } from '../lib/types'
import { normalize } from '../lib/text'
import { Chip, cx, inputClass } from './ui'

function Section({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{title}</h3>
        {extra}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  )
}

interface Props {
  filters: Filters
  tags: Tags
  counts: FacetCounts
  views: Record<ViewKey, number>
  onChange: (f: Filters) => void
}

export function FilterPanel({ filters, tags, counts, views, onChange }: Props) {
  const [zoneQuery, setZoneQuery] = useState('')
  const [allZones, setAllZones] = useState(false)

  function toggle<K extends Family>(fam: K, value: Filters[K][number]) {
    const list = filters[fam] as (number | string)[]
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    onChange({ ...filters, [fam]: next })
  }

  /** Options visibles : non archivées, ou archivées mais encore utilisées / sélectionnées. */
  function visible<T extends { id: number; archived: boolean }>(list: T[], fam: Family) {
    return list.filter((t) => !t.archived || (counts[fam].get(t.id) ?? 0) > 0 || (filters[fam] as number[]).includes(t.id))
  }

  function chips<T extends { id: number; name: string; archived: boolean }>(list: T[], fam: Family, tone?: (t: T) => 'ct' | 't') {
    return visible(list, fam).map((t) => {
      const count = counts[fam].get(t.id) ?? 0
      const selected = (filters[fam] as number[]).includes(t.id)
      return (
        <Chip key={t.id} selected={selected} count={count} tone={tone?.(t)} onClick={() => toggle(fam, t.id)} className={cx(!selected && count === 0 && 'opacity-40')}>
          {t.name}
        </Chip>
      )
    })
  }

  const roles = useMemo(
    () => (filters.side.length ? tags.roles.filter((r) => filters.side.includes(r.side)) : tags.roles),
    [tags.roles, filters.side],
  )
  const mapZones = useMemo(() => tags.zones.filter((z) => filters.map.includes(z.map_id)), [tags.zones, filters.map])
  const zones = useMemo(() => {
    const q = normalize(zoneQuery)
    // Par défaut, seules les zones utilisées (ou sélectionnées) sont listées : les maps en ont des dizaines.
    return mapZones.filter(
      (z) =>
        (!q || normalize(z.name).includes(q)) &&
        (allZones || q || (counts.zone.get(z.id) ?? 0) > 0 || filters.zone.includes(z.id)),
    )
  }, [mapZones, zoneQuery, allZones, counts.zone, filters.zone])
  const hiddenZones = mapZones.filter((z) => !z.archived).length - zones.length

  const stuffSelected = tags.categories.some((c) => c.shows_utility && filters.cat.includes(c.id))
  const showUtility = filters.cat.length === 0 || stuffSelected || filters.util.length > 0
  const roundSelected = tags.categories.some((c) => c.shows_round_type && filters.cat.includes(c.id))
  const showRound = filters.cat.length === 0 || roundSelected || filters.round.length > 0

  const viewLabels: [ViewKey, string][] = [
    ['all', 'Toutes'],
    ['review', '⚠ À revoir'],
    ['drafts', 'Mes brouillons'],
    ['mine', 'Mes cartes'],
  ]

  return (
    <div className="space-y-5">
      <Section title="Affichage">
        {viewLabels.map(([v, label]) => (
          <Chip key={v} selected={filters.view === v} count={views[v]} onClick={() => onChange({ ...filters, view: v })}>
            {label}
          </Chip>
        ))}
      </Section>

      <Section title="Map">{chips(tags.maps, 'map')}</Section>

      <Section title="Side">
        {(['CT', 'T'] as Side[]).map((s) => (
          <Chip key={s} selected={filters.side.includes(s)} tone={s === 'CT' ? 'ct' : 't'} count={counts.side.get(s) ?? 0} onClick={() => toggle('side', s)} className="min-w-16 justify-center font-bold">
            {s}
          </Chip>
        ))}
      </Section>

      {(filters.side.length === 1 ? filters.side : (['CT', 'T'] as Side[])).map((side) => (
        <Section key={side} title={`Rôles ${side}`}>
          {chips(
            roles.filter((r) => r.side === side),
            'role',
            (r) => (r.side === 'CT' ? 'ct' : 't'),
          )}
        </Section>
      ))}

      <Section title="Zones / callouts">
        {filters.map.length === 0 ? (
          <p className="text-sm text-slate-500">Choisis une map pour filtrer par zone.</p>
        ) : (
          <>
            {mapZones.length > 12 && (
              <input
                value={zoneQuery}
                onChange={(e) => setZoneQuery(e.target.value)}
                placeholder="Chercher une zone…"
                className={cx(inputClass, 'mb-1 py-1.5')}
              />
            )}
            {chips(zones, 'zone')}
            {!zoneQuery && (hiddenZones > 0 || allZones) && (
              <button type="button" onClick={() => setAllZones((v) => !v)} className="px-1 text-sm text-slate-400 hover:text-slate-200">
                {allZones ? 'Masquer les zones vides' : `+ ${hiddenZones} zone${hiddenZones > 1 ? 's' : ''} sans carte`}
              </button>
            )}
          </>
        )}
      </Section>

      <Section title="Catégorie">{chips(tags.categories, 'cat')}</Section>
      {showUtility && <Section title="Utilitaire">{chips(tags.utilities, 'util')}</Section>}
      {showRound && <Section title="Round lancé">{chips(tags.round_types, 'round')}</Section>}
      <Section title="Risque">
        {visible(tags.risks, 'risk').map((r) => {
          const selected = filters.risk.includes(r.id)
          const count = counts.risk.get(r.id) ?? 0
          return (
            <Chip key={r.id} selected={selected} count={count} onClick={() => toggle('risk', r.id)} className={cx(!selected && count === 0 && 'opacity-40')}>
              <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
              {r.name}
            </Chip>
          )
        })}
      </Section>
      <Section title="Économie">{chips(tags.economies, 'eco')}</Section>
    </div>
  )
}
