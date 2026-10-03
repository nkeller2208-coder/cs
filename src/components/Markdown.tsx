import { useMemo, useRef, useState } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { cx, inputClass } from './ui'

export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source])
  return <div className={cx('prose-kb text-sm text-slate-300', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Éditeur de texte riche simple : Markdown avec barre d'outils (gras, italique, liste, lien) et aperçu. */
export function MarkdownEditor({
  value,
  onChange,
  id,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)

  function wrap(before: string, after = before, fallback = 'texte') {
    const ta = ref.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const sel = value.slice(s, e) || fallback
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + before.length, s + before.length + sel.length)
    })
  }

  function prefixLines(prefix: (i: number) => string) {
    const ta = ref.current
    if (!ta) return
    const s = value.lastIndexOf('\n', ta.selectionStart - 1) + 1
    const e = ta.selectionEnd
    const block = value.slice(s, e) || ''
    const lines = block.split('\n').map((l, i) => prefix(i) + l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))
    const next = value.slice(0, s) + lines.join('\n') + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => ta.focus())
  }

  function addLink() {
    const url = window.prompt('Adresse du lien (https://…)')
    if (!url) return
    wrap('[', `](${url.trim()})`, 'lien')
  }

  const tool = 'rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-700 hover:text-white'
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-slate-700 focus-within:ring-2 focus-within:ring-amber-400">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-700 bg-slate-800/60 px-1.5 py-1">
        <button type="button" className={cx(tool, 'font-bold')} onClick={() => wrap('**')} title="Gras (Ctrl+B)" disabled={preview}>
          G
        </button>
        <button type="button" className={cx(tool, 'italic')} onClick={() => wrap('*')} title="Italique (Ctrl+I)" disabled={preview}>
          I
        </button>
        <button type="button" className={tool} onClick={() => prefixLines(() => '- ')} title="Liste à puces" disabled={preview}>
          • Liste
        </button>
        <button type="button" className={tool} onClick={() => prefixLines((i) => `${i + 1}. `)} title="Liste numérotée" disabled={preview}>
          1. Liste
        </button>
        <button type="button" className={tool} onClick={addLink} title="Lien" disabled={preview}>
          🔗 Lien
        </button>
        <span className="flex-1" />
        <button type="button" className={cx(tool, preview && 'bg-slate-700 text-white')} onClick={() => setPreview((p) => !p)}>
          {preview ? 'Éditer' : 'Aperçu'}
        </button>
      </div>
      {preview ? (
        <div className="min-h-32 bg-slate-900 px-3 py-2">
          {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-slate-500">Rien à afficher.</p>}
        </div>
      ) : (
        <textarea
          ref={ref}
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (!(e.ctrlKey || e.metaKey)) return
            if (e.key === 'b') {
              e.preventDefault()
              wrap('**')
            } else if (e.key === 'i') {
              e.preventDefault()
              wrap('*')
            }
          }}
          rows={5}
          className={cx(inputClass, 'block min-h-32 resize-y rounded-none ring-0 focus:ring-0')}
        />
      )}
    </div>
  )
}
