import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { splitSql } from '../../worker/sql-split'

describe('découpage des migrations', () => {
  it('ignore commentaires, PRAGMA et « ; » entre guillemets', () => {
    const sql = "PRAGMA foreign_keys = ON;\n-- note ; ici\nCREATE TABLE a (x TEXT DEFAULT 'a;b'); -- fin\nINSERT INTO a VALUES ('l''x');"
    expect(splitSql(sql)).toEqual(["CREATE TABLE a (x TEXT DEFAULT 'a;b')", "INSERT INTO a VALUES ('l''x')"])
  })
  it('découpe toutes les migrations du projet', () => {
    for (const f of readdirSync('migrations')) {
      const parts = splitSql(readFileSync(`migrations/${f}`, 'utf8'))
      expect(parts.length).toBeGreaterThan(0)
      for (const p of parts) expect(p).toMatch(/^(CREATE|INSERT|ALTER|UPDATE|DELETE)\b/i)
    }
  })
})

describe('instructions rejouables', async () => {
  const { idempotent } = await import('../../worker/idempotent')
  it('ajoute IF NOT EXISTS et OR IGNORE', () => {
    expect(idempotent('CREATE TABLE a (x)')).toBe('CREATE TABLE IF NOT EXISTS a (x)')
    expect(idempotent('CREATE TABLE IF NOT EXISTS a (x)')).toBe('CREATE TABLE IF NOT EXISTS a (x)')
    expect(idempotent('CREATE INDEX i ON a (x)')).toBe('CREATE INDEX IF NOT EXISTS i ON a (x)')
    expect(idempotent('INSERT INTO a VALUES (1)')).toBe('INSERT OR IGNORE INTO a VALUES (1)')
    expect(idempotent('INSERT OR IGNORE INTO a VALUES (1)')).toBe('INSERT OR IGNORE INTO a VALUES (1)')
  })
})
