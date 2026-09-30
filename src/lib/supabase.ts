import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Message d'erreur lisible (les RPC renvoient des messages en français). */
export function errorMessage(e: unknown): string {
  if (!e) return 'Erreur inconnue'
  if (typeof e === 'string') return e
  const err = e as { message?: string; code?: string }
  if (err.code === '42501') return err.message && !/policy/.test(err.message) ? err.message : 'Action non autorisée.'
  if (err.code === '23505') return 'Cette valeur existe déjà.'
  if (err.code === '23503') return 'Cette valeur est encore utilisée par des cartes : archive-la plutôt.'
  return err.message ?? 'Erreur inconnue'
}
