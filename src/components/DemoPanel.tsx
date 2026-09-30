import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EMPTY_TAGS, qk, useCards, useTags } from '../hooks/data'
import { deleteDemoCards, flagCard, saveCard } from '../lib/api'
import { buildDemoCards, DEMO_PREFIX, isDemo } from '../lib/demo'
import { errorMessage } from '../lib/supabase'
import { Button, Spinner } from './ui'
import { useToast } from './toast'

/** Charge / supprime un jeu de cartes de test couvrant tous les types d'affichage. */
export function DemoPanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const tags = useTags().data ?? EMPTY_TAGS
  const existing = (useCards().data ?? []).filter((c) => isDemo(c.title)).length
  const [busy, setBusy] = useState<null | 'load' | 'delete'>(null)

  async function load() {
    setBusy('load')
    let ok = 0
    try {
      for (const { payload, review } of buildDemoCards(tags)) {
        const id = await saveCard(payload)
        if (review) await flagCard(id, review)
        ok++
      }
      toast(`${ok} cartes de démo créées`)
    } catch (e) {
      toast(`${ok} cartes créées, puis erreur : ${errorMessage(e)}`, 'error')
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: qk.cards })
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer les ${existing} cartes dont le titre commence par « ${DEMO_PREFIX.trim()} » ?`)) return
    setBusy('delete')
    try {
      await deleteDemoCards(DEMO_PREFIX)
      toast('Cartes de démo supprimées')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: qk.cards })
    }
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-sm text-slate-400">
          Dix cartes titrées « {DEMO_PREFIX.trim()} » pour vérifier chaque cas d'affichage : vidéo YouTube avec début, Short
          vertical, image directe, image cassée, lien externe, plusieurs médias, texte seul mis en forme, brouillon et carte
          « À revoir », réparties sur plusieurs maps, sides et rôles.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={load} disabled={!!busy || !tags.maps.length}>
          {busy === 'load' && <Spinner className="size-4" />} Charger les cartes de démo
        </Button>
        {existing > 0 && (
          <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={remove} disabled={!!busy}>
            {busy === 'delete' && <Spinner className="size-4" />} Supprimer les {existing} cartes de démo
          </Button>
        )}
      </div>
    </div>
  )
}
