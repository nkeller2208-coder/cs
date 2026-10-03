/**
 * Migrations automatiques : au premier appel de l'API, le Worker applique lui-même les
 * fichiers de migrations/ qui manquent. Plus besoin de commande pour mettre la base à jour :
 * un déploiement suffit.
 *
 * Compatible avec `wrangler d1 migrations apply` : même table de suivi (d1_migrations).
 */

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
    // Une migration = une transaction. L'insertion du nom en premier sert de verrou : si un autre
    // serveur l'applique en même temps, le nom existe déjà et tout ce lot est annulé.
    try {
      await db.batch([
        db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(m.name),
        ...splitSql(m.sql).map((s) => db.prepare(s)),
      ])
    } catch (e) {
      const applied = await db.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').bind(m.name).first()
      if (!applied) throw e
    }
  }
}
