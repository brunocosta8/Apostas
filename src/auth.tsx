import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { errorMessage, supabase } from './lib/supabase'
import { disablePush } from './lib/push'
import type { Profile } from './lib/types'

type AuthState =
  | { kind: 'loading' }
  | { kind: 'signedOut'; error?: string }
  | { kind: 'noAccess'; email: string }
  | { kind: 'ready'; session: Session; profile: Profile; isAdmin: boolean }

interface AuthCtx {
  state: AuthState
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

// Se o login falhar, o Supabase/Google volta à app com ?error_description=…
// (na query ou no hash). Guardamos a mensagem para a mostrar no ecrã de login.
function readUrlError(): string | undefined {
  const params = new URLSearchParams(`${window.location.search.slice(1)}&${window.location.hash.slice(1)}`)
  const msg = params.get('error_description') ?? params.get('error') ?? undefined
  if (msg) window.history.replaceState(null, '', window.location.pathname)
  return msg ? `Falha no login: ${msg.replace(/\+/g, ' ')}` : undefined
}
const urlError = readUrlError()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })

  const load = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ kind: 'signedOut', error: urlError })
      return
    }
    const { data, error } = await supabase.rpc('ensure_profile')
    if (error) {
      if (error.code === '42501') setState({ kind: 'noAccess', email: session.user.email ?? '' })
      else setState({ kind: 'signedOut', error: `Erro ao carregar o perfil: ${errorMessage(error)}` })
      return
    }
    const { data: isAdmin } = await supabase.rpc('is_admin')
    setState({ kind: 'ready', session, profile: data as Profile, isAdmin: Boolean(isAdmin) })
  }, [])

  useEffect(() => {
    let current: string | undefined
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Evita recarregar o perfil a cada renovação de token.
      const id = session?.user.id
      if (event === 'TOKEN_REFRESHED' && id === current) return
      current = id
      // Sair do callback antes de chamar a API (recomendação do supabase-js).
      setTimeout(() => void load(session), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  const value: AuthCtx = {
    state,
    signIn: async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
      })
      if (error) setState({ kind: 'signedOut', error: errorMessage(error) })
    },
    signOut: async () => {
      // Este dispositivo deixa de receber notificações desta conta.
      await disablePush().catch(() => {})
      await supabase.auth.signOut()
      setState({ kind: 'signedOut' })
    },
    refresh: async () => {
      const { data } = await supabase.auth.getSession()
      await load(data.session)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}

/** Para páginas dentro da área autenticada. */
export function useMe() {
  const { state } = useAuth()
  if (state.kind !== 'ready') throw new Error('Sem sessão')
  return { me: state.profile, isAdmin: state.isAdmin }
}
