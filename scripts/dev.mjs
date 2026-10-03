// npm run dev : prépare la base locale puis lance le site + l'API en local.
import { NODE, VITE, adminLink, banner, live, migrate, sql } from './lib.mjs'

console.log('→ Base locale : application des migrations…')
migrate()

// Premier lancement : aucun admin connecté → on fournit un lien de connexion.
const admins = sql("SELECT COUNT(*) AS n FROM members WHERE role = 'admin'")
if (!admins[0]?.n) {
  const url = adminLink('http://localhost:5173')
  banner([
    'Premier lancement : ouvre ce lien pour te connecter en admin',
    '(une fois le site démarré, ci-dessous) :',
    '',
    url,
  ])
}

await live(NODE, [VITE, ...process.argv.slice(2)])
