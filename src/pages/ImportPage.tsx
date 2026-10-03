import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { EMPTY_TAGS, qk, useTags } from '../hooks/data'
import { useMember } from '../hooks/auth'
import { analyzeRows, CSV_COLUMNS, parseCsv, templateCsv } from '../lib/csvImport'
import { proposeZone, saveCard } from '../lib/api'
import { errorMessage } from '../lib/http'
import { normalize } from '../lib/text'
import { Badge, Button, cx, inputClass, Spinner } from '../components/ui'
import { useToast } from '../components/toast'

export default function ImportPage() {
  const me = useMember()
  const qc = useQueryClient()
  const toast = useToast()
  const tags = useTags().data ?? EMPTY_TAGS
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [createZones, setCreateZones] = useState(true)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ ok: number; failed: { line: number; message: string }[] } | null>(null)

  const parsed = useMemo(() => (text.trim() ? parseCsv(text) : null), [text])
  const rows = useMemo(() => (parsed && !parsed.error ? analyzeRows(parsed.rows, tags, createZones) : []), [parsed, tags, createZones])
  const valid = rows.filter((r) => r.payload)

  function download() {
    const blob = new Blob([templateCsv(tags)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modele-import-cartes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setText(await file.text())
  }

  async function runImport() {
    setProgress({ done: 0, total: valid.length })
    const failed: { line: number; message: string }[] = []
    let ok = 0
    // 1. Crée les zones manquantes une seule fois par map.
    const created = new Map<string, number>()
    for (const row of valid) {
      for (const name of row.newZones) {
        const k = `${row.payload!.map_id}:${normalize(name)}`
        if (created.has(k)) continue
        try {
          const z = await proposeZone(row.payload!.map_id!, name, me.id)
          created.set(k, z.id)
        } catch (e) {
          failed.push({ line: row.line, message: `Zone « ${name} » : ${errorMessage(e)}` })
        }
      }
    }
    // 2. Crée les cartes une par une (chaque carte est une transaction).
    for (const row of valid) {
      const extra = row.newZones.map((n) => created.get(`${row.payload!.map_id}:${normalize(n)}`)).filter((x): x is number => !!x)
      try {
        await saveCard({ ...row.payload!, zone_ids: [...row.payload!.zone_ids, ...extra] })
        ok++
      } catch (e) {
        failed.push({ line: row.line, message: errorMessage(e) })
      }
      setProgress((p) => p && { ...p, done: p.done + 1 })
    }
    setProgress(null)
    setResult({ ok, failed })
    setText('')
    setFileName(null)
    qc.invalidateQueries({ queryKey: qk.cards })
    qc.invalidateQueries({ queryKey: qk.tags })
    toast(`${ok} carte${ok > 1 ? 's' : ''} importée${ok > 1 ? 's' : ''}`, failed.length ? 'info' : 'success')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Import CSV</h1>
          <p className="text-sm text-slate-400">Une ligne = une carte. Plusieurs étiquettes ou liens dans une cellule : séparés par « ; ».</p>
        </div>
        <Button onClick={download}>⬇ Télécharger le modèle CSV</Button>
      </div>

      <details className="rounded-xl bg-slate-900 p-4 text-sm ring-1 ring-slate-800">
        <summary className="cursor-pointer font-semibold">Format attendu</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-300">
          <li>
            Colonnes : {CSV_COLUMNS.map((c) => <code key={c} className="mx-0.5 rounded bg-slate-800 px-1">{c}</code>)}
          </li>
          <li>Obligatoires : titre, map, side (CT ou T), au moins une catégorie, et un lien ou une description.</li>
          <li>Les noms d'étiquettes doivent correspondre aux listes (majuscules et accents indifférents). Les rôles sont cherchés dans le side de la ligne.</li>
          <li>statut : « publié » (défaut) ou « brouillon ». Dans la description, \n crée un retour à la ligne.</li>
          <li>Séparateur de colonnes : virgule ou point-virgule (détecté automatiquement ; mettre les cellules entre guillemets).</li>
        </ul>
      </details>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-700 px-6 py-8 text-center hover:border-amber-500">
          <span className="text-2xl">📄</span>
          <span className="text-sm font-medium">{fileName ?? 'Choisir un fichier .csv'}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(null)
          }}
          placeholder="…ou colle le contenu CSV ici"
          rows={6}
          className={cx(inputClass, 'font-mono text-xs')}
        />
      </div>

      {result && (
        <div className="rounded-xl bg-emerald-500/10 p-4 text-sm ring-1 ring-emerald-500/30">
          <p className="font-semibold text-emerald-100">
            {result.ok} carte{result.ok > 1 ? 's' : ''} importée{result.ok > 1 ? 's' : ''}.{' '}
            <Link to="/" className="underline">
              Voir les cartes
            </Link>
          </p>
          {result.failed.map((f, i) => (
            <p key={i} className="text-red-300">
              Ligne {f.line} : {f.message}
            </p>
          ))}
        </div>
      )}

      {parsed?.error && <p className="text-sm text-red-400">{parsed.error}</p>}
      {parsed && parsed.unknownColumns.length > 0 && (
        <p className="text-sm text-amber-300">Colonnes ignorées : {parsed.unknownColumns.join(', ')}</p>
      )}

      {rows.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Prévisualisation</h2>
            <Badge className="bg-emerald-500/15 text-emerald-200 ring-emerald-500/30">{valid.length} valide(s)</Badge>
            {rows.length - valid.length > 0 && (
              <Badge className="bg-red-500/15 text-red-200 ring-red-500/30">{rows.length - valid.length} en erreur</Badge>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={createZones} onChange={(e) => setCreateZones(e.target.checked)} className="accent-amber-500" />
              Créer les zones inconnues (marquées « à valider »)
            </label>
            <span className="flex-1" />
            <Button variant="primary" disabled={!valid.length || !!progress} onClick={runImport}>
              {progress ? (
                <>
                  <Spinner className="size-4" /> {progress.done}/{progress.total}
                </>
              ) : (
                `Importer ${valid.length} carte${valid.length > 1 ? 's' : ''}`
              )}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2">Ligne</th>
                  <th className="px-3 py-2">Titre</th>
                  <th className="px-3 py-2">Carte</th>
                  <th className="px-3 py-2">Contrôle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((r) => {
                  const p = r.payload
                  return (
                    <tr key={r.line} className={cx(!p && 'bg-red-500/5')}>
                      <td className="px-3 py-2 text-slate-500 tabular-nums">{r.line}</td>
                      <td className="max-w-64 truncate px-3 py-2 font-medium">{r.title || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {p
                          ? [
                              tags.maps.find((m) => m.id === p.map_id)?.name,
                              p.side,
                              `${p.media.length} lien(s)`,
                              p.status === 'draft' ? 'brouillon' : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.errors.map((e, i) => (
                          <p key={i} className="text-red-300">✕ {e}</p>
                        ))}
                        {r.warnings.map((w, i) => (
                          <p key={i} className="text-amber-300">⚠ {w}</p>
                        ))}
                        {!r.errors.length && !r.warnings.length && <span className="text-emerald-400">✓ OK</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
