import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { isConfigured } from './lib/supabase'
import { Layout } from './components/Layout'
import { Loading } from './components/ui'
import { Login, NoAccess, Splash } from './pages/Login'
import { Home } from './pages/Home'
import { NewBet } from './pages/NewBet'
import { BetDetail } from './pages/BetDetail'
import { Balances } from './pages/Balances'
import { History } from './pages/History'
import { ProfilePage } from './pages/Profile'
import { Admin } from './pages/Admin'

export function App() {
  const { state } = useAuth()

  if (!isConfigured) {
    return (
      <Splash>
        <h1 className="text-xl font-bold text-white">Falta configurar o Supabase</h1>
        <p className="mt-2 text-white/70">Define <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (ver README).</p>
      </Splash>
    )
  }
  if (state.kind === 'loading') return <Splash><Loading /></Splash>
  if (state.kind === 'signedOut') return <Login error={state.error} />
  if (state.kind === 'noAccess') return <NoAccess email={state.email} />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="nova" element={<NewBet />} />
          <Route path="aposta/:id" element={<BetDetail />} />
          <Route path="saldos" element={<Balances />} />
          <Route path="historico" element={<History />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
