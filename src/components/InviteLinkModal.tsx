import { formatDay } from '../lib/text'
import { Button, Modal, cx, inputClass } from './ui'
import { useToast } from './toast'

export interface InviteLink {
  url: string
  expires_at: string
  who: string
}

/** Affiche un lien de connexion personnel à transmettre à la personne invitée. */
export function InviteLinkModal({ link, onClose }: { link: InviteLink | null; onClose: () => void }) {
  const toast = useToast()
  return (
    <Modal open={!!link} onClose={onClose} title={`Lien de connexion${link?.who ? ` · ${link.who}` : ''}`}>
      {link && (
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-300">
            Envoie ce lien à la personne (message privé Discord, SMS…). En l'ouvrant, elle est connectée directement. Valable
            jusqu'au <strong>{formatDay(link.expires_at)}</strong>, sur plusieurs appareils.
          </p>
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} className={cx(inputClass, 'font-mono text-xs')} aria-label="Lien de connexion" />
          <p className="text-xs text-amber-300">⚠ Ce lien vaut mot de passe : ne le partage pas publiquement.</p>
          <div className="flex justify-end gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url)
                  toast('Lien copié', 'info')
                } catch {
                  toast('Copie impossible : sélectionne le lien à la main', 'error')
                }
              }}
            >
              Copier le lien
            </Button>
            <Button onClick={onClose}>Fermer</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
