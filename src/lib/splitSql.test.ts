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
