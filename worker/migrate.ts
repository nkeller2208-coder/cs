/**
 * Migrations automatiques : au premier appel de l'API, le Worker applique lui-même les
 * fichiers de migrations/ qui manquent. Plus besoin de commande pour mettre la base à jour :
 * un déploiement suffit.
 *
 * Compatible avec `wrangler d1 migrations apply` : même table de suivi (d1_migrations).
 * Chaque instruction est rendue rejouable (IF NOT EXISTS, INSERT OR IGNORE) : une mise à jour
 * interrompue reprend là où elle s’est arrêtée.
 */

import { idempotent } from './idempotent'
import { splitSql } from './sql-split'

// Le contenu des fichiers SQL est intégré au Worker au moment de la construction.
const FILES = import.meta.glob('../migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const MIGRATIONS = Object.entries(FILES)
  .map(([path, sql]) => ({ name: path.split('/').pop()!, sql }))
  .sort((a, b) => a.name.localeCompare(b.name))

let ready: Promise<void> | null = null

export function ensureMigrated(db: D1Database): Promise<void> {
  ready ??= migrate(db).catch((e) => {
    ready = null // nouvel essai à la requête suivante
    throw e
  })
  return ready
}

async function migrate(db: D1Database) {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)',
  ).run()
  const done = new Set((await db.prepare('SELECT name FROM d1_migrations').all<{ name: string }>()).results.map((r) => r.name))
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue
    // Instruction par instruction, chacune rejouable : si un autre serveur applique la même
    // migration en même temps, ou si une tentative précédente a été interrompue, rien ne casse.
    for (const stmt of splitSql(m.sql)) {
      try {
        await db.prepare(idempotent(stmt)).run()
      } catch (e) {
        const msg = String((e as Error)?.message ?? e)
        if (/^ALTER TABLE/i.test(stmt) && /duplicate column/i.test(msg)) continue // colonne déjà ajoutée
        throw new Error(`Migration ${m.name} : ${msg} — instruction : ${stmt.slice(0, 120)}`)
      }
    }
    await db.prepare('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)').bind(m.name).run()
  }
}
