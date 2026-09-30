import { useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { Button, inputClass } from '../components/ui'

const discordEnabled = import.meta.env.VITE_AUTH_DISCORD !== 'false'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const redirectTo = window.location.href

  async function discord() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo, scopes: 'identify email' } })
    if (error) setError(error.message)
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
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

        {!supabaseConfigured && (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/30">
            Supabase n'est pas configuré : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.
          </p>
        )}

        {discordEnabled && (
          <>
            <button
              type="button"
              onClick={discord}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 font-semibold text-white hover:bg-[#4752c4]"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
                <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
              </svg>
              Continuer avec Discord
            </button>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-800" />
              ou
              <span className="h-px flex-1 bg-slate-800" />
            </div>
          </>
        )}

        {sent ? (
          <p className="rounded-lg bg-emerald-500/10 p-3 text-center text-sm text-emerald-200 ring-1 ring-emerald-500/30">
            Lien de connexion envoyé à <strong>{email}</strong>. Ouvre-le depuis cet appareil.
          </p>
        ) : (
          <form onSubmit={magicLink} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className={inputClass}
              aria-label="Adresse email"
              autoComplete="email"
            />
            <Button type="submit" className="w-full" disabled={busy}>
              Recevoir un lien magique
            </Button>
          </form>
        )}
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        <p className="text-center text-xs text-slate-500">Accès réservé aux membres invités par l'admin.</p>
      </div>
    </div>
  )
}

export function DeniedPage({ email, message }: { email?: string | null; message?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="text-xl font-bold">{message ? 'Erreur de connexion' : 'Accès non autorisé'}</h1>
        <p className="text-sm text-slate-400">
          {message ?? (
            <>
              Le compte <strong className="text-slate-200">{email ?? 'connecté'}</strong> n'est pas sur la liste des
              membres. Demande à l'admin de t'inviter (email ou identifiant Discord), puis reconnecte-toi.
            </>
          )}
        </p>
        <Button onClick={() => supabase.auth.signOut()}>Se déconnecter</Button>
      </div>
    </div>
  )
}
