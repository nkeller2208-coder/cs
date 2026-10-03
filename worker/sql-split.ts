// Découpage des fichiers de migration (module pur, testé dans src/lib/splitSql.test.ts).

/** Découpe un fichier SQL en instructions (en ignorant les commentaires et les « ; » entre guillemets). */
export function splitSql(sql: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (!quote && ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      cur += '\n'
      continue
    }
    if (ch === "'") quote = !quote
    if (!quote && ch === ';') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  // D1 applique toujours les clés étrangères : les PRAGMA sont inutiles (et refusés en lot).
  return out.filter((s) => !/^PRAGMA\b/i.test(s))
}

