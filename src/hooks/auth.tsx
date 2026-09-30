import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { claimMembership } from '../lib/api'
import type { Member } from '../lib/types'

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'denied'; session: Session }
  | { status: 'error'; session: Session; message: string }
  | { status: 'member'; session: Session; member: Member }

const AuthContext = createContext<AuthState>({ status: 'loading' })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    let currentUser: string | null = null

    async function resolve(session: Session | null) {
      if (!session) {
        currentUser = null
        queryClient.clear() // rien ne doit rester en cache après déconnexion
        setState({ status: 'anonymous' })
        return
      }
      // Évite de relancer la vérification à chaque rafraîchissement du jeton.
      if (currentUser === session.user.id) {
        setState((s) => ('session' in s ? { ...s, session } : s))
        return
      }
      currentUser = session.user.id
      try {
        const member = await claimMembership()
        if (cancelled) return
        setState(member ? { status: 'member', session, member } : { status: 'denied', session })
      } catch (e) {
        if (!cancelled) setState({ status: 'error', session, message: (e as Error).message })
      }
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Ne pas appeler Supabase de façon synchrone dans ce callback (verrou interne).
      setTimeout(() => resolve(session), 0)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [queryClient])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuthState() {
  return useContext(AuthContext)
}

/** À n'utiliser que sous l'application protégée : le membre est garanti. */
export function useMember(): Member {
  const s = useContext(AuthContext)
  if (s.status !== 'member') throw new Error('useMember hors session membre')
  return s.member
}

export function signOut() {
  return supabase.auth.signOut()
}
