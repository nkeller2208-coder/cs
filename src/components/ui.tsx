import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 ring-1 ring-inset ring-slate-700',
  ghost: 'text-slate-300 hover:bg-slate-800 hover:text-slate-100',
  danger: 'bg-red-600/90 text-white hover:bg-red-500',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
        size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3.5 py-2 text-sm',
        variants[variant],
        className,
      )}
    />
  )
}

/** Bouton-étiquette sélectionnable (utilisé partout dans le formulaire et les filtres). */
export function Chip({
  selected,
  onClick,
  children,
  tone,
  count,
  disabled,
  className,
  title,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  tone?: 'ct' | 't' | 'neutral'
  count?: number
  disabled?: boolean
  className?: string
  title?: string
}) {
  const on =
    tone === 'ct'
      ? 'bg-ct/20 text-sky-200 ring-ct/70'
      : tone === 't'
        ? 'bg-t/20 text-amber-200 ring-t/70'
        : 'bg-amber-500/15 text-amber-100 ring-amber-400/70'
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset transition-colors select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400',
        selected ? on : 'bg-slate-900 text-slate-300 ring-slate-700 hover:bg-slate-800 hover:text-slate-100',
        disabled && 'opacity-40',
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cx('text-xs tabular-nums', selected ? 'opacity-80' : 'text-slate-500')}>{count}</span>
      )}
    </button>
  )
}

export function Badge({
  children,
  className,
  style,
  title,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  title?: string
}) {
  return (
    <span
      title={title}
      style={style}
      className={cx(
        'inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        className ?? 'bg-slate-800 text-slate-300 ring-slate-700',
      )}
    >
      {children}
    </span>
  )
}

export function SideBadge({ side }: { side: 'CT' | 'T' }) {
  return (
    <Badge className={side === 'CT' ? 'bg-ct/20 text-sky-300 ring-ct/40 font-bold' : 'bg-t/20 text-amber-300 ring-t/40 font-bold'}>
      {side}
    </Badge>
  )
}

export function RiskBadge({ name, color }: { name: string; color: string }) {
  return (
    <Badge style={{ color, backgroundColor: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}55` }} className="ring-0">
      {name}
    </Badge>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Chargement"
      className={cx('inline-block size-5 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400', className)}
    />
  )
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner className="size-8" />
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  optional,
  htmlFor,
  action,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  optional?: boolean
  htmlFor?: string
  action?: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-100">
          {label}
          {optional && <span className="ml-1.5 text-xs font-normal text-slate-500">optionnel</span>}
        </label>
        {action}
      </div>
      {hint && <p className="-mt-1 text-xs text-slate-500">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100 ring-1 ring-inset ring-slate-700 placeholder:text-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-amber-400'

export function Modal({
  open,
  onClose,
  children,
  title,
  wide,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-0 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative w-full rounded-none bg-slate-900 shadow-2xl ring-1 ring-slate-800 outline-none sm:rounded-2xl',
          wide ? 'max-w-4xl' : 'max-w-md',
          'min-h-dvh sm:min-h-0',
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Fermer">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-800 px-6 py-16 text-center">
      <p className="text-lg font-semibold text-slate-200">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-400">{children}</div>}
    </div>
  )
}
