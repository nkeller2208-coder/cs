import { useEffect, useState } from 'react'
import { fetchInviteInfo, register, type InviteInfo } from '../lib/api'
import { errorMessage } from '../lib/http'
import { formatDay } from '../lib/text'
import { Button, FullPageSpinner, inputClass } from '../components/ui'
import { AuthShell } from './LoginPage'

const PASSWORD_MIN = 8

/**
 * Page ouverte par un lien d'inscription (/inscription/:token).
 * Ouvrir le lien ne consomme rien : il n'est utilisé qu'à l'envoi du formulaire (usage unique).
 */
export function RegisterPage({ token }: { token: string }) {
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchInviteInfo(token)
      .then((i) => {
        setInfo(i)
        setName(i.name)
        setEmail(i.email)
      })
      .catch((e) => setLoadError(errorMessage(e)))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < PASSWORD_MIN) return setError(`Mot de passe trop court (${PASSWORD_MIN} caractères minimum)`)
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas')
    setBusy(true)
    try {
      await register({ token, display_name: name.trim(), email: email.trim(), password })
      // Rechargement complet sur l'accueil : la session (cookie) est prise en compte partout.
      window.location.replace('/')
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (!info && !loadError) return <FullPageSpinner />

  if (loadError) {
    return (
      <AuthShell subtitle="Lien d'inscription">
        <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200 ring-1 ring-red-500/30">
          {loadError}
        </p>
        <Button className="w-full" onClick={() => window.location.replace('/')}>
          Aller à la page de connexion
        </Button>
      </AuthShell>
    )
  }

  const reset = info!.mode === 'reset'
  return (
    <AuthShell subtitle={reset ? `Nouveau mot de passe pour ${info!.name}` : 'Crée ton compte'}>
      <form onSubmit={submit} className="space-y-3">
        {!reset && (
          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Pseudo</span>
            <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="nickname" />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="text-slate-300">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="username" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-300">Mot de passe</span>
          <input
            type="password"
            required
            minLength={PASSWORD_MIN}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-300">Confirme le mot de passe</span>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </label>
        <p className="text-xs text-slate-500">
          {PASSWORD_MIN} caractères minimum. Tu te connecteras ensuite avec cet email et ce mot de passe. Ce lien ne sert qu'une fois
          (valable jusqu'au {formatDay(info!.expires_at)}).
        </p>
        {error && (
          <p role="alert" className="text-center text-sm text-red-400">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {reset ? 'Enregistrer le mot de passe' : 'Créer mon compte'}
        </Button>
      </form>
    </AuthShell>
  )
}
