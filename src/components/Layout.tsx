import { useCallback, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { signOut, useMember } from '../hooks/auth'
import { useHotkey } from '../hooks/useHotkey'
import { cx } from './ui'
import { ErrorBoundary } from './ErrorBoundary'

/** Lien vers le formulaire : stratégie ou stuff selon la rubrique, pré-rempli avec ses filtres actifs. */
export function useNewCardHref() {
  const location = useLocation()
  if (location.pathname === '/stuff') {
    const q = new URLSearchParams(location.search)
    q.set('kind', 'stuff')
    return `/new?${q}`
  }
  return location.pathname === '/' && location.search ? `/new${location.search}` : '/new'
}

/** Rubriques principales (en-tête sur ordinateur, barre du bas sur mobile). */
const SECTIONS: { to: string; label: string; icon: string; mobile?: boolean; minWidth?: string; match?: (path: string) => boolean }[] = [
  // Playbook : stratégies (/) et stuff (/stuff), avec leurs fiches et formulaires.
  { to: '/', label: 'Playbook', icon: '🎯', mobile: true, match: (p) => p === '/' || p === '/stuff' || p.startsWith('/c/') || p === '/new' },
  { to: '/principes', label: 'Principes', icon: '📘', mobile: true },
  { to: '/equipes', label: 'Équipes', icon: '👥', mobile: true },
  { to: '/stats', label: 'Tableau de bord', icon: '📊', minWidth: 'max-xl:hidden' },
]

export function Layout() {
  const me = useMember()
  const navigate = useNavigate()
  const location = useLocation()
  const newHref = useNewCardHref()
  const [menu, setMenu] = useState(false)
  const onForm = location.pathname === '/new' || location.pathname.endsWith('/edit') || location.pathname === '/principes/new'
  const addLabel = location.pathname === '/stuff' ? 'stuff' : 'stratégie'

  const openForm = useCallback(() => navigate(newHref), [navigate, newHref])
  useHotkey('n', openForm, !onForm)

  const nav = ({ isActive }: { isActive: boolean }) =>
    cx('rounded-lg px-3 py-1.5 text-sm whitespace-nowrap', isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-100')
  const menuLink = 'block rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800'

  return (
    <div className={cx('min-h-dvh md:pb-0', !onForm && 'pb-16')}>
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight text-slate-50">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="hidden lg:inline">
              CS2 <span className="text-amber-400">Playbook</span>
            </span>
          </Link>
          <nav className="scrollbar-thin hidden items-center gap-1 overflow-x-auto md:flex" aria-label="Rubriques">
            {SECTIONS.map((s) => (
              <NavLink key={s.to} to={s.to} className={({ isActive }) => cx(nav({ isActive: s.match ? s.match(location.pathname) : isActive }), s.minWidth)}>
                {s.label}
              </NavLink>
            ))}
            {me.role === 'admin' && (
              <NavLink to="/admin" className={nav}>
                Admin
              </NavLink>
            )}
          </nav>
          <span className="flex-1" />
          {!onForm && (
            <Link
              to={newHref}
              title={`Ajouter (N)`}
              className="hidden shrink-0 items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 sm:inline-flex"
            >
              + {addLabel === 'stuff' ? 'Stuff' : 'Stratégie'}
              <kbd className="rounded bg-slate-950/20 px-1.5 text-xs">N</kbd>
            </Link>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className="flex items-center gap-2 rounded-full p-0.5 ring-1 ring-slate-700 hover:ring-slate-500"
              aria-label="Menu du compte"
              aria-expanded={menu}
            >
              {me.avatar_url ? (
                <img src={me.avatar_url} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-slate-700 text-sm font-semibold">
                  {(me.display_name || me.email || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl bg-slate-900 p-2 shadow-xl ring-1 ring-slate-700" onClick={() => setMenu(false)}>
                  <p className="truncate px-2 pt-1 text-sm font-semibold">{me.display_name || me.email}</p>
                  <p className="truncate px-2 pb-2 text-xs text-slate-500">
                    {me.role === 'admin' ? 'Admin' : 'Membre'} · {me.email}
                  </p>
                  <Link to="/moi" className={cx(menuLink, 'font-medium text-amber-200')}>
                    ★ Mon espace
                  </Link>
                  {/* Rubriques absentes de la barre du bas sur mobile */}
                  <Link to="/stats" className={cx(menuLink, 'xl:hidden')}>
                    Tableau de bord
                  </Link>
                  {me.role === 'admin' && (
                    <Link to="/admin" className={cx(menuLink, 'md:hidden')}>
                      Admin
                    </Link>
                  )}
                  <Link to="/import" className={menuLink}>
                    Import CSV
                  </Link>
                  <button type="button" onClick={() => signOut()} className={cx(menuLink, 'w-full text-left')}>
                    Se déconnecter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <ErrorBoundary resetKey={location.pathname}>
        <Outlet />
      </ErrorBoundary>
      {!onForm && (
        <Link
          to={newHref}
          aria-label={`Ajouter : ${addLabel}`}
          className="fixed right-4 bottom-20 z-30 grid size-14 place-items-center rounded-full bg-amber-500 text-3xl font-light text-slate-950 shadow-lg shadow-black/50 hover:bg-amber-400 sm:hidden"
        >
          +
        </Link>
      )}
      {/* Barre d'onglets sur mobile (masquée dans un formulaire, qui a sa barre d'actions) */}
      {!onForm && (
        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {SECTIONS.filter((s) => s.mobile).map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                cx('flex flex-col items-center gap-0.5 py-2 text-[11px]', (s.match ? s.match(location.pathname) : isActive) ? 'text-amber-300' : 'text-slate-400')
              }
            >
              <span className="text-lg leading-none" aria-hidden>
                {s.icon}
              </span>
              {s.label}
            </NavLink>
          ))}
          <NavLink to="/moi" className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-amber-300' : 'text-slate-400')}>
            <span className="text-lg leading-none" aria-hidden>
              ★
            </span>
            Moi
          </NavLink>
        </nav>
      )}
    </div>
  )
}
