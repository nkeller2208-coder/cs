import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout } from '../lib/api'
import { ApiError } from '../lib/http'
import type { Me } from '../lib/types'

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error'; message: string }
  | { status: 'member'; member: Me }

const AuthContext = createContext<{ state: AuthState; refresh: () => Promise<void> }>({
  state: { status: 'loading' },
  refresh: async () => {},
})

/** Session gérée par l'API (cookie httpOnly) : on demande simplement « qui suis-je ? ». */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const queryClient = useQueryClient()

  const refresh = useCallback(async () => {
    try {
      setState({ status: 'member', member: await fetchMe() })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        queryClient.clear() // rien ne doit rester en cache après déconnexion
        setState({ status: 'anonymous' })
      } else {
        setState({ status: 'error', message: (e as Error).message })
      }
    }
  }, [queryClient])

  useEffect(() => {
    refresh()
  }, [refresh])

  return <AuthContext.Provider value={{ state, refresh }}>{children}</AuthContext.Provider>
}

export function useAuthState() {
  return useContext(AuthContext).state
}

export function useAuthRefresh() {
  return useContext(AuthContext).refresh
}

/** À n'utiliser que sous l'application protégée : le membre est garanti. */
export function useMember(): Me {
  const s = useContext(AuthContext).state
  if (s.status !== 'member') throw new Error('useMember hors session membre')
  return s.member
}

export async function signOut() {
  await logout().catch(() => {})
  window.location.assign('/')
}
