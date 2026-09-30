import { useCallback, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { signOut, useMember } from '../hooks/auth'
import { useHotkey } from '../hooks/useHotkey'
import { cx } from './ui'

/** Lien vers le formulaire, pré-rempli avec les filtres actifs si on est sur la liste. */
export function useNewCardHref() {
  const location = useLocation()
  return location.pathname === '/' && location.search ? `/new${location.search}` : '/new'
}

export function Layout() {
  const me = useMember()
  const navigate = useNavigate()
  const location = useLocation()
  const newHref = useNewCardHref()
  const [menu, setMenu] = useState(false)
  const onForm = location.pathname === '/new' || location.pathname.endsWith('/edit')

  const openForm = useCallback(() => navigate(newHref), [navigate, newHref])
  useHotkey('n', openForm, !onForm)

  const nav = ({ isActive }: { isActive: boolean }) =>
    cx('rounded-lg px-3 py-1.5 text-sm', isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-100')

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-slate-50">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="hidden sm:inline">
              CS2 <span className="text-amber-400">Playbook</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={nav}>
              Cartes
            </NavLink>
            <NavLink to="/import" className={nav}>
              Import
            </NavLink>
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
              title="Ajouter une carte (N)"
              className="hidden items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 sm:inline-flex"
            >
              + Ajouter
              <kbd className="rounded bg-slate-950/20 px-1.5 text-xs">N</kbd>
            </Link>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className="flex items-center gap-2 rounded-full p-0.5 ring-1 ring-slate-700 hover:ring-slate-500"
              aria-label="Menu du compte"
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
                <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl bg-slate-900 p-2 shadow-xl ring-1 ring-slate-700">
                  <p className="truncate px-2 pt-1 text-sm font-semibold">{me.display_name || me.email}</p>
                  <p className="truncate px-2 pb-2 text-xs text-slate-500">
                    {me.role === 'admin' ? 'Admin' : 'Membre'} · {me.email}
                  </p>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800"
                  >
                    Se déconnecter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <Outlet />
      {!onForm && (
        <Link
          to={newHref}
          aria-label="Ajouter une carte"
          className="fixed right-4 bottom-4 z-30 grid size-14 place-items-center rounded-full bg-amber-500 text-3xl font-light text-slate-950 shadow-lg shadow-black/50 hover:bg-amber-400 sm:hidden"
        >
          +
        </Link>
      )}
    </div>
  )
}
