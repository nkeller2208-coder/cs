// npm run admin-link            → lien admin pour le site local
// npm run admin-link -- --remote https://cs2-playbook.<compte>.workers.dev
import { adminLink, banner } from './lib.mjs'

const i = process.argv.indexOf('--remote')
const remote = i !== -1
const base = remote ? process.argv[i + 1] : 'http://localhost:5173'
if (remote && !base?.startsWith('https://')) {
  console.error('Indique l\'adresse du site : npm run admin-link -- --remote https://ton-site.workers.dev')
  process.exit(1)
}
banner(['Lien de connexion admin (valable 7 jours) :', '', adminLink(base, { remote })])
