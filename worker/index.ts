import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { allowlist, members } from './admin'
import { auth, requireMember } from './auth'
import { ensureMigrated } from './migrate'
import { cards, media } from './cards'
import type { AppEnv } from './env'
import { principles } from './principles'
import { skills } from './skills'
import { tags } from './tags'
import { teams } from './teams'

const app = new Hono<AppEnv>().basePath('/api')

// Protection CSRF : toute requête qui modifie quelque chose doit venir de l'application
// (en-tête personnalisé impossible à poser depuis un autre site sans pré-vérification CORS).
app.use(async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('x-requested-with') !== 'cs2kb') {
    return c.json({ error: 'Requête refusée' }, 403)
  }
  await next()
  c.header('cache-control', 'no-store')
  c.header('x-content-type-options', 'nosniff')
  c.header('x-robots-tag', 'noindex, nofollow')
})

/**
 * Diagnostic public (sans données personnelles) : base reliée, migrations appliquées,
 * lien admin de premier accès encore actif. À ouvrir en cas de problème de connexion.
 */
app.get('/health', async (c) => {
  if (!c.env.DB) {
    return c.json({ ok: false, error: "Aucune base D1 n'est reliée au Worker (liaison « DB » manquante)." }, 500)
  }
  try {
    await ensureMigrated(c.env.DB)
    const migrations = (await c.env.DB.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{ name: string }>()).results.map((r) => r.name)
    const admin = await c.env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM members WHERE role = 'admin') AS connected,
              (SELECT COUNT(*) FROM allowlist WHERE role = 'admin' AND invite_hash IS NOT NULL AND invite_expires_at > ?) AS active_links`,
    ).bind(new Date().toISOString()).first<{ connected: number; active_links: number }>()
    return c.json({
      ok: true,
      migrations,
      admins_connected: admin?.connected ?? 0,
      admin_links_active: admin?.active_links ?? 0,
      discord: !!(c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET),
    })
  } catch (e) {
    return c.json({ ok: false, error: String((e as Error)?.message ?? e) }, 500)
  }
})

// La base se met à jour toute seule après chaque déploiement.
app.use(async (c, next) => {
  await ensureMigrated(c.env.DB)
  await next()
})

app.route('/auth', auth)

// Tout le reste est réservé aux membres connectés.
app.use('*', requireMember)
app.route('/cards', cards)
app.route('/media', media)
app.route('/tags', tags)
app.route('/members', members)
app.route('/allowlist', allowlist)
app.route('/principles', principles)
app.route('/skills', skills)
app.route('/teams', teams)

app.notFound((c) => c.json({ error: 'Introuvable' }, 404))
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Erreur serveur' }, 500)
})

export default app
