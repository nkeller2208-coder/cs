import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EMPTY_TAGS, qk, useCards, usePrinciples, useTags } from '../hooks/data'
import { deleteDemoCards, flagCard, linkPrincipleCard, saveCard, savePrinciple } from '../lib/api'
import { buildDemoCards, buildDemoPrinciples, DEMO_PREFIX, isDemo } from '../lib/demo'
import { useMember } from '../hooks/auth'
import { errorMessage } from '../lib/http'
import { Button, Spinner } from './ui'
import { useToast } from './toast'

/** Charge / supprime un jeu de cartes de test couvrant tous les types d'affichage. */
export function DemoPanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const tags = useTags().data ?? EMPTY_TAGS
  const me = useMember()
  const existing =
    (useCards().data ?? []).filter((c) => isDemo(c.title)).length +
    (usePrinciples().data ?? []).filter((p) => isDemo(p.title)).length
  const [busy, setBusy] = useState<null | 'load' | 'delete'>(null)

  async function load() {
    setBusy('load')
    let ok = 0
    try {
      const ids = new Map<string, number>()
      for (const { payload, review } of buildDemoCards(tags)) {
        const id = await saveCard(payload)
        ids.set(payload.title, id)
        if (review) await flagCard(id, review)
        ok++
      }
      let principles = 0
      for (const { payload, cardTitles } of buildDemoPrinciples(tags)) {
        const pid = await savePrinciple(payload)
        for (const t of cardTitles) if (ids.has(t)) await linkPrincipleCard(pid, ids.get(t)!, me.id)
        principles++
      }
      toast(`${ok} cartes et ${principles} principes de démo créés`)
    } catch (e) {
      toast(`${ok} cartes créées, puis erreur : ${errorMessage(e)}`, 'error')
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: qk.cards })
      qc.invalidateQueries({ queryKey: qk.principles })
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer les ${existing} cartes et principes dont le titre commence par « ${DEMO_PREFIX.trim()} » ?`)) return
    setBusy('delete')
    try {
      await deleteDemoCards(DEMO_PREFIX)
      toast('Données de démo supprimées')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: qk.cards })
      qc.invalidateQueries({ queryKey: qk.principles })
    }
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-sm text-slate-400">
          Treize cartes et quatre principes titrés « {DEMO_PREFIX.trim()} » pour vérifier chaque cas : vidéo YouTube avec
          début, Short vertical, image directe, image cassée, lien externe, plusieurs médias, texte seul, brouillon, carte
          « À revoir », rounds lancés (rush, déclic), post-plant, et principes généraux ou rattachés par étiquettes.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={load} disabled={!!busy || !tags.maps.length}>
          {busy === 'load' && <Spinner className="size-4" />} Charger les cartes de démo
        </Button>
        {existing > 0 && (
          <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={remove} disabled={!!busy}>
            {busy === 'delete' && <Spinner className="size-4" />} Supprimer les données de démo ({existing})
          </Button>
        )}
      </div>
    </div>
  )
}
