import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cx } from './ui'

type Toast = { id: number; message: ReactNode; tone: 'success' | 'error' | 'info' }
const ToastContext = createContext<(message: ReactNode, tone?: Toast['tone']) => void>(() => {})

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: ReactNode, tone: Toast['tone'] = 'success') => {
    const id = nextId++
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-xl ring-1',
              t.tone === 'success' && 'bg-emerald-950 text-emerald-100 ring-emerald-700',
              t.tone === 'error' && 'bg-red-950 text-red-100 ring-red-700',
              t.tone === 'info' && 'bg-slate-800 text-slate-100 ring-slate-600',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
