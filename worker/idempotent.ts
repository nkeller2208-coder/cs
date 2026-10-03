/**
 * Rend une instruction rejouable sans erreur : la mise à jour peut ainsi reprendre après une
 * interruption (une base à moitié créée se complète au lieu de bloquer).
 */
export function idempotent(stmt: string): string {
  return stmt
    .replace(/^CREATE TABLE (?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i, (_m, u) => `CREATE ${u ?? ''}INDEX IF NOT EXISTS `)
    .replace(/^INSERT INTO /i, 'INSERT OR IGNORE INTO ')
}
