// npm run e2e : pour chaque suite, base D1 jetable + serveur de dev (API + site), puis
// tests des droits de l'API et scénario navigateur.
// Variables utiles : CHROMIUM_PATH (navigateur à utiliser), SHOTS (dossier des captures).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NODE, VITE, live, migrate, sql } from '../scripts/lib.mjs'

const BASE = 'http://localhost:5173'

async function withServer(fn) {
  const state = mkdtempSync(join(tmpdir(), 'cs2kb-e2e-'))
  migrate({ persistTo: state })
  sql("INSERT INTO allowlist (email, role, note) VALUES ('admin@team.gg', 'admin', 'Zywoo'), ('membre@team.gg', 'member', 'Apex')", { persistTo: state })
  const server = spawn(NODE, [VITE, '--port', '5173', '--strictPort'], {
    detached: process.platform !== 'win32', // pour arrêter vite et ses sous-processus d'un coup
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CS2KB_STATE_DIR: state, DEV_LOGIN: 'true', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true' },
  })
  let log = ''
  server.stdout.on('data', (d) => (log += d))
  server.stderr.on('data', (d) => (log += d))
  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`${BASE}/api/auth/config`)).ok) break
      } catch {}
      if (i === 60) throw new Error('Le serveur ne démarre pas :\n' + log)
      await new Promise((r) => setTimeout(r, 1000))
    }
    await fn()
  } finally {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'])
      else process.kill(-server.pid)
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
    rmSync(state, { recursive: true, force: true })
  }
}

try {
  console.log('→ Tests API (droits)')
  await withServer(() => live(NODE, ['e2e/api-test.mjs'], { BASE_URL: BASE }))
  console.log('→ Scénario navigateur')
  await withServer(() => live(NODE, ['e2e/scenario.mjs'], { BASE_URL: BASE }))
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
