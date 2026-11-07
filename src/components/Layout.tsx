import { NavLink, Outlet } from 'react-router-dom'
import { useRealtimeRefresh } from '../lib/api'

const items = [
  { to: '/', label: 'Início', icon: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
  { to: '/saldos', label: 'Saldos', icon: 'M4 7h16M4 12h16M4 17h10' },
  { to: '/nova', label: 'Nova', icon: 'M12 5v14M5 12h14', primary: true },
  { to: '/historico', label: 'Histórico', icon: 'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/perfil', label: 'Perfil', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0' },
]

export function Layout() {
  useRealtimeRefresh(true)
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="pt-safe flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
        <ul className="mx-auto flex max-w-xl items-end justify-around px-2 pt-1.5">
          {items.map((it) => (
            <li key={it.to} className="flex-1">
              <NavLink
                to={it.to}
                end={it.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 pb-1.5 text-[11px] ${isActive ? 'text-emerald-400' : 'text-slate-400'}`
                }
              >
                {it.primary ? (
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20">
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
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
