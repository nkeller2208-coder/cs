import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation, type Location } from 'react-router-dom'
import { useAuthState } from './hooks/auth'
import { Layout } from './components/Layout'
import { FullPageSpinner } from './components/ui'
import { BrowsePage } from './pages/BrowsePage'
import { CardDetailRoute } from './pages/CardDetail'
import { CardFormPage } from './pages/CardFormPage'
import { DeniedPage, LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TeamsPage = lazy(() => import('./pages/TeamsPage'))
const MePage = lazy(() => import('./pages/MePage'))
const PrinciplesPage = lazy(() => import('./pages/PrinciplesPage'))
const PrincipleDetailPage = lazy(() => import('./pages/PrinciplesPage').then((m) => ({ default: m.PrincipleDetailPage })))
const PrincipleFormPage = lazy(() => import('./pages/PrinciplesPage').then((m) => ({ default: m.PrincipleFormPage })))

export function App() {
  const auth = useAuthState()
  const { pathname } = useLocation()
  // Lien d'inscription : page publique, accessible même déjà connecté (ex. nouveau mot de passe).
  const signup = /^\/inscription\/([^/]+)\/?$/.exec(pathname)
  if (signup) return <RegisterPage token={decodeURIComponent(signup[1])} />
  if (auth.status === 'loading') return <FullPageSpinner />
  // Aucune page n'est visible sans connexion.
  if (auth.status === 'anonymous') return <LoginPage />
  if (auth.status === 'error') return <DeniedPage message={auth.message} />
  return <MemberApp isAdmin={auth.member.role === 'admin'} />
}

function MemberApp({ isAdmin }: { isAdmin: boolean }) {
  const location = useLocation()
  const background = (location.state as { background?: Location } | null)?.background

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes location={background ?? location}>
        <Route element={<Layout />}>
          <Route index element={<BrowsePage key="strategy" kind="strategy" />} />
          <Route path="stuff" element={<BrowsePage key="stuff" kind="stuff" />} />
          <Route path="moi" element={<MePage />} />
          <Route path="c/:id" element={<CardDetailRoute asModal={false} />} />
          <Route path="c/:id/edit" element={<CardFormPage />} />
          <Route path="new" element={<CardFormPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="stats" element={<DashboardPage />} />
          <Route path="equipes" element={<TeamsPage />} />
          <Route path="principes" element={<PrinciplesPage />} />
          <Route path="principes/new" element={<PrincipleFormPage />} />
          <Route path="principes/:id" element={<PrincipleDetailPage />} />
          <Route path="principes/:id/edit" element={<PrincipleFormPage />} />
          <Route path="admin/*" element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {background && (
        <Routes>
          <Route path="c/:id" element={<CardDetailRoute asModal />} />
        </Routes>
      )}
    </Suspense>
  )
}
