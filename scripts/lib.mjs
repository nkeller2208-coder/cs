// Outils communs aux scripts (Windows, macOS, Linux).
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Les outils sont lancés directement avec Node (sans passer par npx ni par un shell) :
// les arguments, même avec des espaces ou des guillemets, arrivent intacts sur Windows aussi.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const NODE = process.execPath
export const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
export const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')

export const DB = 'cs2-playbook'

/** Lance une commande et renvoie sa sortie (stdout). Lève une erreur si elle échoue. */
export function run(cmd, args, { quiet = false, input } = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    input,
    // CI=1 : wrangler ne pose pas de question interactive.
    env: { ...process.env, CI: '1' },
    stdio: [input ? 'pipe' : 'inherit', 'pipe', quiet ? 'pipe' : 'inherit'],
  })
  if (r.status !== 0) {
    if (quiet) process.stderr.write(r.stderr ?? '')
    throw new Error(`Échec : ${cmd} ${args.join(' ')}`)
  }
  return r.stdout ?? ''
}

/** Lance une commande au premier plan (sortie affichée en direct). */
export function live(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} a échoué (${code})`))))
  })
}

export function wrangler(args, opts) {
  return run(NODE, [WRANGLER, ...args], opts)
}

/** Exécute du SQL sur la base (locale ou distante) et renvoie les lignes. */
export function sql(command, { remote = false, persistTo } = {}) {
  const where = remote ? ['--remote'] : ['--local', ...(persistTo ? ['--persist-to', persistTo] : [])]
  const out = wrangler(['d1', 'execute', DB, ...where, '--json', '--command', command], { quiet: true })
  const start = out.indexOf('[')
  const parsed = JSON.parse(out.slice(start))
  return parsed[0]?.results ?? []
}

export function migrate({ remote = false, persistTo } = {}) {
  const where = remote ? ['--remote'] : ['--local', ...(persistTo ? ['--persist-to', persistTo] : [])]
  wrangler(['d1', 'migrations', 'apply', DB, ...where], { quiet: true })
}

/**
 * Crée (ou réutilise) une entrée admin dans la liste blanche et renvoie un lien
 * de connexion personnel valable 7 jours.
 */
export function adminLink(baseUrl, { remote = false, name = 'Admin' } = {}) {
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  const expires = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const safe = name.replace(/'/g, "''")
  const existing = sql(`SELECT id FROM allowlist WHERE role = 'admin' AND note = '${safe}' LIMIT 1`, { remote })
  if (existing.length) {
    sql(`UPDATE allowlist SET invite_hash = '${hash}', invite_expires_at = '${expires}' WHERE id = ${existing[0].id}`, { remote })
  } else {
    sql(`INSERT INTO allowlist (note, role, invite_hash, invite_expires_at) VALUES ('${safe}', 'admin', '${hash}', '${expires}')`, { remote })
  }
  return `${baseUrl.replace(/\/$/, '')}/api/auth/invite/${token}`
}

export function banner(lines) {
  const width = Math.max(...lines.map((l) => l.length)) + 4
  console.log('\n' + '═'.repeat(width))
  for (const l of lines) console.log(`  ${l}`)
  console.log('═'.repeat(width) + '\n')
}
