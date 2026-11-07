/**
 * Cálculo de ganhos/perdas e de dívidas. Módulo puro (sem I/O), testado em
 * settlement.test.ts. Todos os valores são cêntimos inteiros.
 *
 * Regra única para os 4 modos: o pote total é dividido pelos vencedores na
 * proporção do que cada um apostou.
 *   - 1v1 e odds: só há um vencedor, que fica com o pote todo.
 *   - Aberta e escolha múltipla: divisão proporcional, arredondada ao cêntimo
 *     pelo método do maior resto (a soma dá sempre exatamente o pote).
 * Apostas canceladas/anuladas não contam (ninguém ganha nem perde).
 */

export interface StakeEntry {
  userId: string
  optionId: string
  amountCents: number
}

export interface SettleableBet {
  status: string
  winningOptionId: string | null
  entries: StakeEntry[]
}

export interface PaymentLike {
  fromUser: string
  toUser: string
  amountCents: number
}

export interface Transfer {
  from: string
  to: string
  amountCents: number
}

/**
 * Divide `total` cêntimos por várias partes proporcionalmente ao peso de cada
 * uma. Arredonda para baixo e distribui os cêntimos que sobram às partes com
 * maior resto (empates: maior peso, depois ordem de entrada).
 */
export function splitProportionally(
  total: number,
  parts: { key: string; weight: number }[],
): Map<string, number> {
  assertCents(total)
  const result = new Map<string, number>()
  if (parts.length === 0) return result
  const weights = parts.map((p) => {
    assertCents(p.weight)
    if (p.weight <= 0) throw new Error('Peso tem de ser positivo')
    return BigInt(p.weight)
  })
  const sumW = weights.reduce((a, b) => a + b, 0n)
  const T = BigInt(total)

  const rows = parts.map((p, i) => {
    const num = T * weights[i]
    return { key: p.key, index: i, weight: weights[i], base: num / sumW, rem: num % sumW }
  })
  let leftover = T - rows.reduce((a, r) => a + r.base, 0n)
  const order = [...rows].sort((a, b) => {
    if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1
    if (a.weight !== b.weight) return a.weight > b.weight ? -1 : 1
    return a.index - b.index
  })
  for (const r of order) {
    if (leftover <= 0n) break
    r.base += 1n
    leftover -= 1n
  }
  for (const r of rows) result.set(r.key, (result.get(r.key) ?? 0) + Number(r.base))
  return result
}

/**
 * Resultado líquido de cada participante se `winningOptionId` ganhar.
 * Devolve um mapa vazio se ninguém tiver apostado na opção vencedora
 * (aposta anulada: todos recuperam o que apostaram).
 */
export function netForOutcome(entries: StakeEntry[], winningOptionId: string): Map<string, number> {
  const net = new Map<string, number>()
  const winners = entries.filter((e) => e.optionId === winningOptionId)
  if (winners.length === 0) return net
  const losers = entries.filter((e) => e.optionId !== winningOptionId)
  if (losers.length === 0) {
    // Ninguém do outro lado: não há nada a ganhar.
    for (const e of entries) net.set(e.userId, 0)
    return net
  }
  const pot = entries.reduce((a, e) => a + e.amountCents, 0)
  const payouts = splitProportionally(
    pot,
    winners.map((w) => ({ key: w.userId, weight: w.amountCents })),
  )
  for (const e of entries) {
    const payout = payouts.get(e.userId) ?? 0
    net.set(e.userId, (net.get(e.userId) ?? 0) + payout - e.amountCents)
  }
  return net
}

/** Resultado líquido de uma aposta (vazio se não estiver resolvida). */
export function settleBet(bet: SettleableBet): Map<string, number> {
  if (bet.status !== 'resolved' || !bet.winningOptionId) return new Map()
  return netForOutcome(bet.entries, bet.winningOptionId)
}

/** Lucro acumulado de cada pessoa só com as apostas (para o ranking). */
export function betProfits(bets: SettleableBet[]): Map<string, number> {
  const total = new Map<string, number>()
  for (const bet of bets) {
    for (const [user, v] of settleBet(bet)) total.set(user, (total.get(user) ?? 0) + v)
  }
  return total
}

/**
 * Saldo atual de cada pessoa: lucro das apostas + pagamentos já feitos.
 * Positivo = tem a receber; negativo = deve.
 * Um pagamento de A para B aproxima ambos de zero: A sobe, B desce.
 */
export function computeBalances(bets: SettleableBet[], payments: PaymentLike[]): Map<string, number> {
  const bal = betProfits(bets)
  for (const p of payments) {
    bal.set(p.fromUser, (bal.get(p.fromUser) ?? 0) + p.amountCents)
    bal.set(p.toUser, (bal.get(p.toUser) ?? 0) - p.amountCents)
  }
  return bal
}

/**
 * Converte saldos em transferências "quem deve a quem", com poucas
 * transferências: o maior devedor paga ao maior credor, repetidamente.
 * Garante no máximo n−1 transferências e liquida tudo exatamente.
 */
export function simplifyDebts(balances: Map<string, number>): Transfer[] {
  const sum = [...balances.values()].reduce((a, b) => a + b, 0)
  if (sum !== 0) throw new Error(`Saldos não somam zero (${sum})`)

  const creditors = [...balances].filter(([, v]) => v > 0).map(([k, v]) => ({ k, v }))
  const debtors = [...balances].filter(([, v]) => v < 0).map(([k, v]) => ({ k, v: -v }))
  const byAmount = (a: { k: string; v: number }, b: { k: string; v: number }) =>
    b.v - a.v || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)

  const transfers: Transfer[] = []
  while (creditors.length && debtors.length) {
    creditors.sort(byAmount)
    debtors.sort(byAmount)
    const c = creditors[0]
    const d = debtors[0]
    const amount = Math.min(c.v, d.v)
    transfers.push({ from: d.k, to: c.k, amountCents: amount })
    c.v -= amount
    d.v -= amount
    if (c.v === 0) creditors.shift()
    if (d.v === 0) debtors.shift()
  }
  return transfers
}

/** Valor de quem aceita uma aposta com odds X:Y (o criador põe X por cada Y). */
export function oddsTakerAmount(creatorCents: number, oddsCreator: number, oddsTaker: number): number {
  assertCents(creatorCents)
  if (!(oddsCreator > 0) || !(oddsTaker > 0)) throw new Error('Odds inválidas')
  // Aritmética exata (as odds têm no máximo 2 casas decimais na BD), com o
  // mesmo arredondamento do round() do Postgres: meio arredonda para cima.
  const C = BigInt(Math.round(oddsCreator * 100))
  const T = BigInt(Math.round(oddsTaker * 100))
  const n = BigInt(creatorCents) * T
  return Number((2n * n + C) / (2n * C))
}

function assertCents(n: number) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Valor inválido em cêntimos: ${n}`)
}

export interface OddsContext {
  mode: string
  creatorId: string
  oddsCreator: number | null
  oddsTaker: number | null
  entries: StakeEntry[]
}

/**
 * "Cota" de uma opção, ao estilo das casas de apostas: quanto recebe (no total)
 * cada euro apostado nessa opção se ela ganhar.
 *   - Opção com apostadores: pote / total apostado nessa opção.
 *   - Opção vazia em 1v1/odds: cota para quem aceitar (o valor de entrada é fixo).
 *   - Opção vazia em aberta/múltipla, ou sem adversários: null (ainda não há cota).
 */
export function optionOdds(ctx: OddsContext, optionId: string): number | null {
  const pot = ctx.entries.reduce((a, e) => a + e.amountCents, 0)
  const side = ctx.entries.filter((e) => e.optionId === optionId).reduce((a, e) => a + e.amountCents, 0)
  if (side > 0) {
    const r = pot / side
    return r > 1 ? r : null
  }
  if (ctx.mode === 'one_v_one' || ctx.mode === 'odds') {
    const creator = ctx.entries.find((e) => e.userId === ctx.creatorId)
    if (!creator || creator.optionId === optionId || ctx.entries.length >= 2) return null
    const stake = ctx.mode === 'one_v_one'
      ? creator.amountCents
      : oddsTakerAmount(creator.amountCents, Number(ctx.oddsCreator), Number(ctx.oddsTaker))
    return (pot + stake) / stake
  }
  return null
}

/** Quanto recebe (total, incluindo o que apostou) quem entrar com `stake` em `optionId`, se ganhar. */
export function potentialPayout(entries: StakeEntry[], optionId: string, stake: number): number {
  const me = '__simulacao__'
  const net = netForOutcome([...entries, { userId: me, optionId, amountCents: stake }], optionId).get(me) ?? 0
  return stake + net
}
