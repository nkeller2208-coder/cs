import { describe, expect, it } from 'vitest'
import { markdownToText, renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('gras, italique, paragraphes', () => {
    expect(renderMarkdown('**Smoke** puis *flash*\nligne 2\n\nautre')).toBe(
      '<p><strong>Smoke</strong> puis <em>flash</em><br>ligne 2</p><p>autre</p>',
    )
  })
  it('listes', () => {
    expect(renderMarkdown('- a\n- b\n1. c')).toBe('<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>')
  })
  it('liens', () => {
    expect(renderMarkdown('[vidéo](https://youtu.be/x) et https://a.b/c.')).toBe(
      '<p><a href="https://youtu.be/x" target="_blank" rel="noopener noreferrer">vidéo</a> et ' +
        '<a href="https://a.b/c" target="_blank" rel="noopener noreferrer">https://a.b/c</a>.</p>',
    )
  })
  it('échappe le HTML et refuse les liens dangereux', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](https://a.b/"onmouseover=")')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('href="javascript')
    expect(out).not.toMatch(/href="[^"]*"onmouseover/)
  })
  it('texte brut', () => {
    expect(markdownToText('**a** [b](https://x.y)\n- c')).toBe('a b • c')
  })
})
