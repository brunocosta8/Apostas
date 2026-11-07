import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { AllowedEmail, Bet, BetMode, Payment, Profile } from './types'
import type { SettleableBet } from './settlement'

// ---------------------------------------------------------------------------
// Leituras (o grupo é pequeno: carregamos tudo e filtramos no cliente)
// ---------------------------------------------------------------------------

export function useProfiles() {
  const q = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id,email,display_name,avatar_url').order('display_name')
      if (error) throw error
      return data as Profile[]
    },
    staleTime: 60_000,
  })
  const byId = useMemo(() => new Map((q.data ?? []).map((p) => [p.id, p])), [q.data])
  return { ...q, byId }
}

export function useBets() {
  return useQuery({
    queryKey: ['bets'],
    queryFn: async () => {
      // Fecha apostas com prazo ultrapassado (o cron também o faz a cada 5 min).
      await supabase.rpc('close_expired_bets')
      const { data, error } = await supabase
        .from('bets')
        .select('*, bet_options!bet_options_bet_id_fkey(*), bet_entries!bet_entries_bet_id_fkey(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      const bets = data as Bet[]
      for (const b of bets) {
        b.bet_options.sort((x, y) => x.position - y.position)
        b.bet_entries.sort((x, y) => x.created_at.localeCompare(y.created_at))
      }
      return bets
    },
  })
}

export function usePayments() {
  return useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Payment[]
    },
  })
}

export function useAllowedEmails() {
  return useQuery({
    queryKey: ['allowed_emails'],
    queryFn: async () => {
      const { data, error } = await supabase.from('allowed_emails').select('*').order('email')
      if (error) throw error
      return data as AllowedEmail[]
    },
  })
}

/** Atualiza a app quando alguém muda apostas/pagamentos (Supabase Realtime). */
export function useRealtimeRefresh(enabled: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = (key: string) => () => {
      clearTimeout(timer)
      timer = setTimeout(() => qc.invalidateQueries({ queryKey: [key] }), 300)
    }
    const channel = supabase
      .channel('alteracoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, refresh('bets'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bet_entries' }, refresh('bets'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, refresh('payments'))
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [enabled, qc])
}

export function toSettleable(b: Bet): SettleableBet {
  return {
    status: b.status,
    winningOptionId: b.winning_option_id,
    entries: b.bet_entries.map((e) => ({ userId: e.user_id, optionId: e.option_id, amountCents: Number(e.amount_cents) })),
  }
}

// ---------------------------------------------------------------------------
// Escritas (todas via funções RPC validadas no servidor)
// ---------------------------------------------------------------------------

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

function useRpcMutation<A>(fn: (args: A) => Promise<unknown>, keys: string[] = ['bets']) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  })
}

export interface CreateBetInput {
  title: string
  description: string
  mode: BetMode
  closesAt: Date
  resolveBy: Date
  options: string[]
  creatorOption: number
  amountCents: number
  oddsCreator?: number
  oddsTaker?: number
}

export const useCreateBet = () =>
  useRpcMutation((i: CreateBetInput) =>
    rpc<string>('create_bet', {
      p_title: i.title,
      p_description: i.description,
      p_mode: i.mode,
      p_closes_at: i.closesAt.toISOString(),
      p_resolve_by: i.resolveBy.toISOString(),
      p_options: i.options,
      p_creator_option: i.creatorOption,
      p_amount_cents: i.amountCents,
      p_odds_creator: i.oddsCreator ?? null,
      p_odds_taker: i.oddsTaker ?? null,
    }),
  )

export const useJoinBet = () =>
  useRpcMutation((a: { betId: string; optionId: string; amountCents?: number }) =>
    rpc('join_bet', { p_bet_id: a.betId, p_option_id: a.optionId, p_amount_cents: a.amountCents ?? null }),
  )

export const useCloseBet = () => useRpcMutation((betId: string) => rpc('close_bet', { p_bet_id: betId }))

export const useResolveBet = () =>
  useRpcMutation((a: { betId: string; winningOptionId: string | null }) =>
    rpc('resolve_bet', { p_bet_id: a.betId, p_winning_option_id: a.winningOptionId }),
  )

export const useReopenBet = () => useRpcMutation((betId: string) => rpc('reopen_bet', { p_bet_id: betId }))
export const useCancelBet = () => useRpcMutation((betId: string) => rpc('cancel_bet', { p_bet_id: betId }))

export const useRecordPayment = () =>
  useRpcMutation(
    (a: { from: string; to: string; amountCents: number; note?: string }) =>
      rpc('record_payment', { p_from: a.from, p_to: a.to, p_amount_cents: a.amountCents, p_note: a.note ?? '' }),
    ['payments'],
  )

export const useDeletePayment = () =>
  useRpcMutation((id: string) => rpc('delete_payment', { p_payment_id: id }), ['payments'])

export const useUpdateDisplayName = () =>
  useRpcMutation(async (a: { id: string; name: string }) => {
    const { error } = await supabase.from('profiles').update({ display_name: a.name }).eq('id', a.id)
    if (error) throw error
  }, ['profiles'])

export const useAddAllowedEmail = () =>
  useRpcMutation(async (a: { email: string; isAdmin: boolean }) => {
    const { error } = await supabase.from('allowed_emails').insert({ email: a.email.trim().toLowerCase(), is_admin: a.isAdmin })
    if (error) throw error.code === '23505' ? new Error('Esse email já está na lista.') : error
  }, ['allowed_emails'])

export const useSetAdmin = () =>
  useRpcMutation(async (a: { email: string; isAdmin: boolean }) => {
    const { error } = await supabase.from('allowed_emails').update({ is_admin: a.isAdmin }).eq('email', a.email)
    if (error) throw error
  }, ['allowed_emails'])

export const useRemoveAllowedEmail = () =>
  useRpcMutation(async (email: string) => {
    const { error } = await supabase.from('allowed_emails').delete().eq('email', email)
    if (error) throw error
  }, ['allowed_emails'])
