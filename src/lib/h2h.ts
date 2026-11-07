/**
 * Confrontos (head-to-head) entre duas pessoas. Módulo puro, testado em h2h.test.ts.
 *
 * Quanto é que "eu ganhei ao X" numa aposta?
 *   Numa aposta resolvida, cada perdedor perde o que apostou e esse dinheiro é
 *   repartido pelos vencedores na proporção do que cada um apostou. Por isso o
 *   fluxo do perdedor P para o vencedor V é:  aposta(P) × aposta(V) / total apostado pelos vencedores.
 *   O resultado "eu vs X" é o que recebi do X menos o que dei ao X.
 *   - 1v1 e odds: é exatamente o ganho/perda da aposta.
 *   - Aberta/múltipla: só conta a parte que veio (ou foi) para essa pessoa.
 *   - Do mesmo lado: não há dinheiro entre os dois → "mesmo lado".
 */

export interface H2HEntry {
  userId: string
  optionId: string
  amountCents: number
}

export interface H2HBetInput {
  id: string
  status: string
  winningOptionId: string | null
  /** quando terminou (resolvida/anulada/cancelada) ou foi criada, para ordenar */
  date: string
  entries: H2HEntry[]
}

export type H2HOutcome = 'win' | 'loss' | 'draw' | 'same' | 'pending' | 'void'

export interface H2HBet {
  id: string
  outcome: H2HOutcome
  /** cêntimos ganhos (+) ou perdidos (−) contra a outra pessoa nesta aposta */
  pairNet: number
  myStake: number
  theirStake: number
  sameSide: boolean
}

export interface H2HSummary {
  bets: H2HBet[]
  together: number
  wins: number
  losses: number
  draws: number
  sameSide: number
  pending: number
  voided: number
  /** total ganho (+) ou perdido (−) contra a outra pessoa */
  net: number
  myStakeTotal: number
  biggestWin: H2HBet | null
  biggestLoss: H2HBet | null
  /** sequência atual (das mais recentes para trás) */
  streak: { type: 'win' | 'loss'; count: number } | null
  /** percentagem de vitórias nas apostas decididas entre os dois (0–100), ou null */
  winRate: number | null
}

/** Fluxo de dinheiro (em cêntimos, pode ter decimais) de `from` para `to` numa aposta resolvida. */
export function pairFlow(entries: H2HEntry[], winningOptionId: string, from: string, to: string): number {
  const f = entries.find((e) => e.userId === from)
  const t = entries.find((e) => e.userId === to)
  if (!f || !t) return 0
  if (f.optionId === winningOptionId || t.optionId !== winningOptionId) return 0
  const losers = entries.filter((e) => e.optionId !== winningOptionId)
  if (losers.length === 0) return 0
  const winnersTotal = entries.filter((e) => e.optionId === winningOptionId).reduce((a, e) => a + e.amountCents, 0)
  if (winnersTotal === 0) return 0
  return (f.amountCents * t.amountCents) / winnersTotal
}

/** Arredonda ao cêntimo de forma simétrica (−12,5 → −13, como 12,5 → 13). */
const roundSym = (x: number) => Math.sign(x) * Math.round(Math.abs(x))

export function headToHead(bets: H2HBetInput[], me: string, other: string): H2HSummary {
  const rows: (H2HBet & { date: string })[] = []
  for (const b of bets) {
    const mine = b.entries.find((e) => e.userId === me)
    const theirs = b.entries.find((e) => e.userId === other)
    if (!mine || !theirs) continue
    const sameSide = mine.optionId === theirs.optionId
    let outcome: H2HOutcome
    let pairNet = 0
    if (b.status === 'open' || b.status === 'closed') outcome = 'pending'
    else if (b.status !== 'resolved' || !b.winningOptionId) outcome = 'void'
    else if (sameSide) outcome = 'same'
    else {
      pairNet = roundSym(pairFlow(b.entries, b.winningOptionId, other, me) - pairFlow(b.entries, b.winningOptionId, me, other))
      outcome = pairNet > 0 ? 'win' : pairNet < 0 ? 'loss' : 'draw'
    }
    rows.push({ id: b.id, outcome, pairNet, myStake: mine.amountCents, theirStake: theirs.amountCents, sameSide, date: b.date })
  }
  rows.sort((a, b) => b.date.localeCompare(a.date))

  const count = (o: H2HOutcome) => rows.filter((r) => r.outcome === o).length
  const wins = count('win')
  const losses = count('loss')
  const decided = rows.filter((r) => r.outcome === 'win' || r.outcome === 'loss')

  let streak: H2HSummary['streak'] = null
  for (const r of decided) {
    if (!streak) streak = { type: r.outcome as 'win' | 'loss', count: 1 }
    else if (r.outcome === streak.type) streak.count++
    else break
  }

  const best = (pick: (r: H2HBet) => boolean, cmp: (a: H2HBet, b: H2HBet) => number) => {
    const c = rows.filter(pick).sort(cmp)
    return c[0] ?? null
  }

  const list = rows.map(({ date: _date, ...r }) => r)
  return {
    bets: list,
    together: rows.length,
    wins,
    losses,
    draws: count('draw'),
    sameSide: count('same'),
    pending: count('pending'),
    voided: count('void'),
    net: rows.reduce((a, r) => a + r.pairNet, 0),
    myStakeTotal: rows.filter((r) => r.outcome !== 'void').reduce((a, r) => a + r.myStake, 0),
    biggestWin: best((r) => r.outcome === 'win', (a, b) => b.pairNet - a.pairNet),
    biggestLoss: best((r) => r.outcome === 'loss', (a, b) => a.pairNet - b.pairNet),
    streak,
    winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null,
  }
}
