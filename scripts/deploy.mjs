// npm run deploy : met le site en ligne depuis ton PC (alternative au déploiement automatique GitHub).
// La base D1 est créée au premier déploiement et mise à jour par le site lui-même.
import { NODE, VITE, WRANGLER, banner, live, wrangler } from './lib.mjs'

console.log('→ Connexion à Cloudflare…')
try {
  const who = wrangler(['whoami'], { quiet: true })
  if (/not authenticated/i.test(who)) throw new Error()
} catch {
  console.log("  Une page va s'ouvrir dans le navigateur : autorise Wrangler, puis reviens ici.")
  await live(NODE, [WRANGLER, 'login'])
}

console.log('→ Construction du site…')
await live(NODE, [VITE, 'build'])
console.log('→ Déploiement…')
let out
try {
  out = wrangler(['deploy'], { quiet: true })
} catch (e) {
  console.error(`
Le déploiement a échoué. Cause la plus fréquente au premier déploiement : ton compte n'a pas encore
d'adresse workers.dev. Ouvre https://dash.cloudflare.com → « Workers & Pages » (menu de gauche),
choisis un sous-domaine quand il est proposé, puis relance : npm run deploy
`)
  throw e
}
process.stdout.write(out)
const url = out.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0]
if (url) banner([`Site en ligne : ${url}`, 'La base se met à jour toute seule à la première visite.'])
