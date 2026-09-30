import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation, type Location } from 'react-router-dom'
import { useAuthState } from './hooks/auth'
import { Layout } from './components/Layout'
import { FullPageSpinner } from './components/ui'
import { BrowsePage } from './pages/BrowsePage'
import { CardDetailRoute } from './pages/CardDetail'
import { CardFormPage } from './pages/CardFormPage'
import { DeniedPage, LoginPage } from './pages/LoginPage'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))

export function App() {
  const auth = useAuthState()
  if (auth.status === 'loading') return <FullPageSpinner />
  // Aucune page n'est visible sans connexion.
  if (auth.status === 'anonymous') return <LoginPage />
  if (auth.status === 'denied') return <DeniedPage email={auth.session.user.email} />
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
          <Route index element={<BrowsePage />} />
          <Route path="c/:id" element={<CardDetailRoute asModal={false} />} />
          <Route path="c/:id/edit" element={<CardFormPage />} />
          <Route path="new" element={<CardFormPage />} />
          <Route path="import" element={<ImportPage />} />
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
