// npm run deploy : met le site en ligne sur Cloudflare (gratuit).
// 1. connexion à Cloudflare (une fois) ; 2. création de la base D1 (une fois) ;
// 3. construction ; 4. migrations ; 5. déploiement ; 6. lien admin au premier déploiement.
import { readFileSync, writeFileSync } from 'node:fs'
import { DB, NODE, VITE, WRANGLER, adminLink, banner, live, migrate, sql, wrangler } from './lib.mjs'

const CONFIG = 'wrangler.jsonc'
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

console.log('→ Connexion à Cloudflare…')
try {
  const who = wrangler(['whoami'], { quiet: true })
  if (/not authenticated/i.test(who)) throw new Error()
} catch {
  console.log('  Une page va s\'ouvrir dans le navigateur : autorise Wrangler, puis reviens ici.')
  await live(NODE, [WRANGLER, 'login'])
}

let config = readFileSync(CONFIG, 'utf8')
if (config.includes(PLACEHOLDER)) {
  console.log('→ Création de la base de données D1…')
  let id
  try {
    const out = wrangler(['d1', 'create', DB], { quiet: true })
    id = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0]
  } catch {
    // Elle existe peut-être déjà (déploiement précédent interrompu).
    const list = JSON.parse(wrangler(['d1', 'list', '--json'], { quiet: true }))
    id = list.find((d) => d.name === DB)?.uuid
  }
  if (!id) throw new Error('Identifiant de la base introuvable')
  config = config.replace(PLACEHOLDER, id)
  writeFileSync(CONFIG, config)
  console.log(`  Base créée (${id}) et enregistrée dans ${CONFIG}.`)
}

console.log('→ Construction du site…')
await live(NODE, [VITE, 'build'])
console.log('→ Migrations de la base en ligne…')
migrate({ remote: true })
console.log('→ Déploiement…')
const out = wrangler(['deploy'], { quiet: true })
process.stdout.write(out)
const url = out.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0]

const admins = sql("SELECT COUNT(*) AS n FROM members WHERE role = 'admin'", { remote: true })
if (url && !admins[0]?.n) {
  banner(['Site en ligne : ' + url, '', 'Ouvre ce lien pour te connecter en admin (valable 7 jours) :', adminLink(url, { remote: true })])
} else if (url) {
  banner(['Site en ligne : ' + url])
}
