import { useEffect, useState } from 'react'
import { devLogin, fetchAuthConfig, type AuthConfig } from '../lib/api'
import { errorMessage } from '../lib/http'
import { useAuthRefresh } from '../hooks/auth'
import { Button, inputClass } from '../components/ui'

/** Messages renvoyés par l'API après une tentative de connexion (paramètre ?auth=…). */
function authNotice(params: URLSearchParams) {
  switch (params.get('auth')) {
    case 'denied':
      return {
        tone: 'error' as const,
        text: (
          <>
            Le compte Discord <strong>{params.get('name')}</strong> n'est pas sur la liste des membres. Envoie cet identifiant à
            l'admin pour qu'il t'ajoute :
            <code className="mt-2 block rounded bg-black/40 px-2 py-1 text-center text-base text-slate-100 select-all">{params.get('discord')}</code>
          </>
        ),
      }
    case 'expired':
      return { tone: 'error' as const, text: <>Ce lien de connexion a expiré ou a été remplacé. Demande un nouveau lien à l'admin.</> }
    case 'error':
      return { tone: 'error' as const, text: <>La connexion avec Discord a échoué. Réessaie.</> }
    default:
      return null
  }
}

export function LoginPage() {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const refresh = useAuthRefresh()
  const notice = authNotice(new URLSearchParams(window.location.search))

  useEffect(() => {
    fetchAuthConfig().then(setConfig).catch((e) => setConfigError(errorMessage(e)))
  }, [])

  async function dev(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await devLogin(email.trim())
      window.history.replaceState(null, '', '/')
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,#1e293b,transparent_60%)] px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-slate-900/80 p-7 shadow-2xl ring-1 ring-slate-800">
        <div className="space-y-2 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto size-12" />
          <h1 className="text-2xl font-bold">
            CS2 <span className="text-amber-400">Playbook</span>
          </h1>
          <p className="text-sm text-slate-400">Base de connaissances privée de l'équipe.</p>
        </div>

        {notice && (
          <div role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200 ring-1 ring-red-500/30">
            {notice.text}
          </div>
        )}
        {configError && (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/30">
            Impossible de joindre le serveur : {configError}
          </p>
        )}

        {config?.discord && (
          <a
            href="/api/auth/discord"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 font-semibold text-white hover:bg-[#4752c4]"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
              <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
            </svg>
            Se connecter avec Discord
          </a>
        )}

        <div className="rounded-lg bg-slate-950/50 p-3 text-sm text-slate-400 ring-1 ring-slate-800">
          <p className="font-medium text-slate-300">Pas de Discord ?</p>
          <p>Demande à l'admin ton <strong>lien de connexion personnel</strong> : il suffit de l'ouvrir pour entrer.</p>
        </div>

        {config?.devLogin && (
          <form onSubmit={dev} className="space-y-2 border-t border-dashed border-slate-700 pt-4">
            <p className="text-xs font-semibold tracking-wide text-amber-400 uppercase">Mode développement</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email d'un membre"
              className={inputClass}
              aria-label="Email (développement)"
            />
            <Button type="submit" className="w-full">
              Connexion de test
            </Button>
          </form>
        )}
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        <p className="text-center text-xs text-slate-500">Accès réservé aux membres invités par l'admin.</p>
      </div>
    </div>
  )
}

export function DeniedPage({ message }: { message: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="text-xl font-bold">Erreur de connexion</h1>
        <p className="text-sm text-slate-400">{message}</p>
        <Button onClick={() => window.location.reload()}>Réessayer</Button>
      </div>
    </div>
  )
}
