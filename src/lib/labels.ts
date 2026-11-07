import type { Bet, BetMode, BetStatus, VoidReason } from './types'

export const MODE_LABEL: Record<BetMode, string> = {
  one_v_one: '1 contra 1',
  pool: 'Aberta a vários',
  odds: 'Com odds',
  multi: 'Escolha múltipla',
}

export const VOID_REASON_LABEL: Record<VoidReason, string> = {
  sem_adversarios: 'ninguém do outro lado',
  empate: 'empate',
  ninguem_acertou: 'ninguém acertou',
}

/** Estado "efetivo": uma aposta aberta com prazo ultrapassado já está fechada. */
export function effectiveStatus(bet: Pick<Bet, 'status' | 'closes_at'>, now = Date.now()): BetStatus {
  if (bet.status === 'open' && new Date(bet.closes_at).getTime() <= now) return 'closed'
  return bet.status
}

export function statusLabel(bet: Bet): string {
  switch (effectiveStatus(bet)) {
    case 'open': return 'Aberta'
    case 'closed': return 'À espera do resultado'
    case 'resolved': return 'Resolvida'
    case 'void': return bet.void_reason ? `Anulada · ${VOID_REASON_LABEL[bet.void_reason]}` : 'Anulada'
    case 'cancelled': return 'Cancelada'
  }
}

export function formatOdds(a: number | null, b: number | null): string {
  const f = (n: number) => String(Number(n)).replace('.', ',')
  return a && b ? `${f(a)}:${f(b)}` : ''
}
