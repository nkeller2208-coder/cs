import { useEffect, useState } from 'react'
import { devLogin, fetchAuthConfig, login, type AuthConfig } from '../lib/api'
import { errorMessage } from '../lib/http'
import { useAuthRefresh } from '../hooks/auth'
import { Button, inputClass } from '../components/ui'

/** Cadre commun aux pages publiques (connexion, inscription). */
export function AuthShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,#1e293b,transparent_60%)] px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-slate-900/80 p-7 shadow-2xl ring-1 ring-slate-800">
        <div className="space-y-2 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto size-12" />
          <h1 className="text-2xl font-bold">
            CS2 <span className="text-amber-400">Playbook</span>
          </h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export function LoginPage() {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [devEmail, setDevEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useAuthRefresh()

  useEffect(() => {
    fetchAuthConfig().then(setConfig).catch(() => setConfig({ devLogin: false }))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email.trim(), password)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  async function dev(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await devLogin(devEmail.trim())
      window.history.replaceState(null, '', '/')
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <AuthShell subtitle="Base de connaissances privée de l'équipe.">
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputClass}
          aria-label="Email"
          autoComplete="username"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className={inputClass}
          aria-label="Mot de passe"
          autoComplete="current-password"
        />
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          Se connecter
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-center text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-1 rounded-lg bg-slate-950/50 p-3 text-sm text-slate-400 ring-1 ring-slate-800">
        <p>
          <span className="font-medium text-slate-300">Pas encore de compte ?</span> Demande un <strong>lien d'inscription</strong> à
          l'admin ou à ton capitaine.
        </p>
        <p>
          <span className="font-medium text-slate-300">Mot de passe oublié ?</span> Ils peuvent aussi t'envoyer un lien pour en
          choisir un nouveau.
        </p>
      </div>

      {config?.devLogin && (
        <form onSubmit={dev} className="space-y-2 border-t border-dashed border-slate-700 pt-4">
          <p className="text-xs font-semibold tracking-wide text-amber-400 uppercase">Mode développement</p>
          <input
            type="email"
            required
            value={devEmail}
            onChange={(e) => setDevEmail(e.target.value)}
            placeholder="email d'un membre"
            className={inputClass}
            aria-label="Email (développement)"
          />
          <Button type="submit" className="w-full">
            Connexion de test
          </Button>
        </form>
      )}
    </AuthShell>
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
