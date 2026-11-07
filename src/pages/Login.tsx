import { useState } from 'react'
import { useAuth } from '../auth'
import { Button, ErrorBox } from '../components/ui'

export function Login({ error }: { error?: string }) {
  const { signIn } = useAuth()
  const [loading, setLoading] = useState(false)
  return (
    <Splash>
      <h1 className="text-3xl font-bold text-white">Apostas</h1>
      <p className="mt-2 text-slate-400">Registo de apostas entre amigos.<br />A app só regista — os pagamentos fazem-se fora.</p>
      <div className="mt-8 w-full max-w-xs space-y-3">
        <ErrorBox error={error} />
        <Button
          className="w-full bg-white! text-slate-900! hover:bg-slate-100!"
          loading={loading}
          onClick={() => { setLoading(true); void signIn() }}
        >
          <GoogleLogo /> Entrar com Google
        </Button>
      </div>
    </Splash>
  )
}

export function NoAccess({ email }: { email: string }) {
  const { signOut, refresh } = useAuth()
  return (
    <Splash>
      <h1 className="text-2xl font-bold text-white">Sem acesso</h1>
      <p className="mt-3 text-slate-400">
        A conta <span className="font-medium text-slate-200">{email}</span> não está na lista de membros do grupo.
        Pede ao admin para te adicionar.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button onClick={() => void refresh()}>Já me adicionaram — tentar de novo</Button>
        <Button variant="ghost" onClick={() => void signOut()}>Entrar com outra conta</Button>
      </div>
    </Splash>
  )
}

export function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-safe flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <img src="/pwa-192.png" alt="" className="mb-6 h-20 w-20 rounded-2xl" />
      {children}
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.6-.4-3.5z"/>
    </svg>
  )
}
