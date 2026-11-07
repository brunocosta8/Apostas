import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { errorMessage, supabase } from './lib/supabase'
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })

  const load = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ kind: 'signedOut' })
      return
    }
    const { data, error } = await supabase.rpc('ensure_profile')
    if (error) {
      if (error.code === '42501') setState({ kind: 'noAccess', email: session.user.email ?? '' })
      else setState({ kind: 'signedOut', error: errorMessage(error) })
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
