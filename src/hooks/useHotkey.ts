import { useEffect } from 'react'

function isTyping(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null
  if (!e) return false
  return e.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName)
}

/** Raccourci d'une touche, ignoré pendant la saisie et avec les modificateurs. */
export function useHotkey(key: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target)) return
      if (ev.key.toLowerCase() === key.toLowerCase()) {
        ev.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, handler, enabled])
}
