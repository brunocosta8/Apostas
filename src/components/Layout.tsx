import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useMe } from '../auth'
import { useBalances, useRealtimeRefresh } from '../lib/api'
import { formatSigned } from '../lib/money'
import { BetSlipProvider } from './BetSlip'
import { NotificationsWelcome } from './Notifications'
import { ErrorBoundary } from './ErrorBoundary'

const items = [
  { to: '/', label: 'Início', icon: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
  { to: '/minhas', label: 'Boletins', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
  { to: '/nova', label: 'Criar', icon: 'M12 5v14M5 12h14', primary: true },
  { to: '/confrontos', label: 'Confrontos', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { to: '/perfil', label: 'Perfil', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0' },
]

export function Layout() {
  useRealtimeRefresh(true)
  const { me } = useMe()
  const { pathname } = useLocation()
  // Cada ecrã novo começa no topo. (Chaveta obrigatória: nos browsers recentes
  // scrollTo devolve uma Promise, e um efeito só pode devolver uma função.)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <BetSlipProvider>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <AppBar />
        <NotificationsWelcome userId={me.id} />
        <main className="flex-1 px-4 pb-28">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-white">
          <ul className="mx-auto flex max-w-xl items-end justify-around px-2 pt-1.5">
            {items.map((it) => (
              <li key={it.to} className="flex-1">
                <NavLink
                  to={it.to}
                  end={it.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 pb-1.5 text-[11px] font-semibold ${isActive ? 'text-pitch-700' : 'text-ink/45'}`
                  }
                >
                  {it.primary ? (
                    <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-volt text-ink shadow-[0_2px_0_var(--color-volt-dark)] ring-4 ring-white">
                      <Icon d={it.icon} />
                    </span>
                  ) : (
                    <Icon d={it.icon} />
                  )}
                  {it.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </BetSlipProvider>
  )
}

/** Barra de topo fixa: logótipo e saldo. */
function AppBar() {
  const { me } = useMe()
  const balances = useBalances()
  const bal = balances?.get(me.id) ?? 0
  return (
    <header className="pt-safe sticky top-0 z-20 -mb-px bg-pitch-700 text-white">
      <div className="flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/pwa-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-display text-2xl font-extrabold uppercase italic tracking-tight">
            Apos<span className="text-volt">tas</span>
          </span>
        </Link>
        <Link to="/saldos" className="flex items-center gap-2 rounded-full bg-black/20 py-1 pl-3 pr-1">
          <span className="text-[11px] font-semibold uppercase text-white/70">Saldo</span>
          <span className={`rounded-full px-2.5 py-1 font-display text-base font-extrabold ${bal < 0 ? 'bg-white text-red-600' : 'bg-volt text-ink'}`}>
            {balances ? formatSigned(bal) : '…'}
          </span>
        </Link>
      </div>
    </header>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
