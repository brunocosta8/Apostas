import { describe, expect, it } from 'vitest'
import {
  betProfits,
  computeBalances,
  netForOutcome,
  oddsTakerAmount,
  settleBet,
  simplifyDebts,
  splitProportionally,
  type SettleableBet,
  type StakeEntry,
} from './settlement'
import { formatEuros, formatSigned, parseEuros } from './money'

const e = (userId: string, optionId: string, amountCents: number): StakeEntry => ({ userId, optionId, amountCents })
const resolved = (winningOptionId: string, entries: StakeEntry[]): SettleableBet => ({
  status: 'resolved',
  winningOptionId,
  entries,
})
const obj = (m: Map<string, number>) => Object.fromEntries(m)
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

describe('splitProportionally', () => {
  it('divide exatamente quando dá certo', () => {
    expect(obj(splitProportionally(1000, [{ key: 'a', weight: 1 }, { key: 'b', weight: 3 }]))).toEqual({ a: 250, b: 750 })
  })
  it('distribui os cêntimos que sobram pelo maior resto', () => {
    // 100 / 3 = 33,33… → 34 + 33 + 33 (empate de resto → ordem de entrada)
    expect(obj(splitProportionally(100, [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }, { key: 'c', weight: 1 }]))).toEqual({ a: 34, b: 33, c: 33 })
    // 10 por pesos 1 e 2 → 3,33 e 6,67 → 3 e 7
    expect(obj(splitProportionally(10, [{ key: 'a', weight: 1 }, { key: 'b', weight: 2 }]))).toEqual({ a: 3, b: 7 })
  })
  it('a soma é sempre o total', () => {
    for (let t = 0; t < 500; t++) {
      const parts = Array.from({ length: 1 + (t % 7) }, (_, i) => ({ key: `u${i}`, weight: 1 + ((t * 37 + i * 101) % 997) }))
      const total = (t * 7919) % 100000
      expect(sum(splitProportionally(total, parts))).toBe(total)
    }
  })
  it('rejeita valores não inteiros ou negativos', () => {
    expect(() => splitProportionally(10.5, [{ key: 'a', weight: 1 }])).toThrow()
    expect(() => splitProportionally(10, [{ key: 'a', weight: 0 }])).toThrow()
  })
})

describe('Modo 1 contra 1', () => {
  const entries = [e('ana', 'sim', 500), e('bruno', 'nao', 500)]
  it('o vencedor ganha o valor do outro', () => {
    expect(obj(settleBet(resolved('sim', entries)))).toEqual({ ana: 500, bruno: -500 })
    expect(obj(settleBet(resolved('nao', entries)))).toEqual({ ana: -500, bruno: 500 })
  })
  it('apostas não resolvidas não contam', () => {
    for (const status of ['open', 'closed', 'void', 'cancelled']) {
      expect(settleBet({ status, winningOptionId: 'sim', entries }).size).toBe(0)
    }
  })
  it('valores pequenos (sem mínimo): 1 cêntimo', () => {
    expect(obj(settleBet(resolved('sim', [e('a', 'sim', 1), e('b', 'nao', 1)])))).toEqual({ a: 1, b: -1 })
  })
})

describe('Modo aberto a vários (pote proporcional)', () => {
  it('vencedores dividem o pote proporcionalmente ao que apostaram', () => {
    // Lado X: Ana 10 €, Carla 2 €; lado Y: Bruno 3 €, Dina 3 €. Pote 18 €.
    const entries = [e('ana', 'x', 1000), e('carla', 'x', 200), e('bruno', 'y', 300), e('dina', 'y', 300)]
    const net = settleBet(resolved('x', entries))
    // Ana recebe 18 × 10/12 = 15 € (lucro 5 €); Carla 18 × 2/12 = 3 € (lucro 1 €)
    expect(obj(net)).toEqual({ ana: 500, carla: 100, bruno: -300, dina: -300 })
    expect(sum(net)).toBe(0)
  })
  it('arredondamento ao cêntimo continua a somar zero', () => {
    const entries = [e('a', 'x', 100), e('b', 'x', 100), e('c', 'x', 100), e('d', 'y', 100)]
    const net = settleBet(resolved('x', entries))
    // pote 4 € dividido por 3 → 1,34 + 1,33 + 1,33
    expect(obj(net)).toEqual({ a: 34, b: 33, c: 33, d: -100 })
    expect(sum(net)).toBe(0)
  })
  it('ninguém do lado vencedor → anulada (ninguém ganha nem perde)', () => {
    expect(netForOutcome([e('a', 'x', 100), e('b', 'x', 50)], 'y').size).toBe(0)
  })
  it('só um lado com apostas → todos a zero', () => {
    expect(obj(netForOutcome([e('a', 'x', 100), e('b', 'x', 50)], 'x'))).toEqual({ a: 0, b: 0 })
  })
})

describe('Modo com odds', () => {
  it('valor de quem aceita: odds X:Y = criador põe X por cada Y', () => {
    expect(oddsTakerAmount(2000, 2, 1)).toBe(1000)
    expect(oddsTakerAmount(1000, 1, 3)).toBe(3000)
    expect(oddsTakerAmount(100, 3, 1)).toBe(33) // 0,333… → 0,33 €
    expect(oddsTakerAmount(105, 2, 1)).toBe(53) // 0,525 → 0,53 € (meio arredonda para cima, como no Postgres)
    expect(oddsTakerAmount(1000, 1.5, 1)).toBe(667)
    expect(oddsTakerAmount(1000, 1.1, 1)).toBe(909)
  })
  it('criador ganha: fica com o valor de quem aceitou', () => {
    const entries = [e('ana', 'sim', 2000), e('bruno', 'nao', oddsTakerAmount(2000, 2, 1))]
    expect(obj(settleBet(resolved('sim', entries)))).toEqual({ ana: 1000, bruno: -1000 })
  })
  it('quem aceita ganha: recebe o valor do criador (2× o seu)', () => {
    const entries = [e('ana', 'sim', 2000), e('bruno', 'nao', 1000)]
    expect(obj(settleBet(resolved('nao', entries)))).toEqual({ ana: -2000, bruno: 2000 })
  })
})

describe('Modo escolha múltipla', () => {
  const entries = [
    e('ana', '1', 500),
    e('bruno', 'X', 200),
    e('carla', 'X', 300),
    e('dina', '2', 1000),
  ]
  it('vencedores dividem o pote todo proporcionalmente', () => {
    // pote 20 €; X: Bruno 2 €, Carla 3 € → Bruno 8 €, Carla 12 €
    expect(obj(settleBet(resolved('X', entries)))).toEqual({ ana: -500, bruno: 600, carla: 900, dina: -1000 })
  })
  it('um único vencedor leva tudo', () => {
    expect(obj(settleBet(resolved('2', entries)))).toEqual({ ana: -500, bruno: -200, carla: -300, dina: 1000 })
  })
  it('ninguém acertou → anulada', () => {
    expect(netForOutcome(entries, 'outra').size).toBe(0)
  })
})

describe('Saldos e dívidas', () => {
  const bets: SettleableBet[] = [
    resolved('sim', [e('ana', 'sim', 1000), e('bruno', 'nao', 1000)]), // ana +10, bruno −10
    resolved('x', [e('bruno', 'x', 500), e('carla', 'y', 500)]), // bruno +5, carla −5
    { status: 'cancelled', winningOptionId: null, entries: [e('ana', 'a', 9999), e('carla', 'b', 9999)] },
  ]

  it('lucro acumulado ignora apostas canceladas', () => {
    expect(obj(betProfits(bets))).toEqual({ ana: 1000, bruno: -500, carla: -500 })
  })

  it('pagamentos aproximam os saldos de zero', () => {
    const bal = computeBalances(bets, [{ fromUser: 'bruno', toUser: 'ana', amountCents: 500 }])
    expect(obj(bal)).toEqual({ ana: 500, bruno: 0, carla: -500 })
  })

  it('simplifica: em vez de carla→bruno→ana, carla paga diretamente à ana', () => {
    const transfers = simplifyDebts(betProfits(bets))
    expect(transfers).toEqual([
      { from: 'bruno', to: 'ana', amountCents: 500 },
      { from: 'carla', to: 'ana', amountCents: 500 },
    ])
  })

  it('cadeia A→B→C→D vira uma só transferência', () => {
    const bal = new Map([['a', -700], ['b', 0], ['c', 0], ['d', 700]])
    expect(simplifyDebts(bal)).toEqual([{ from: 'a', to: 'd', amountCents: 700 }])
  })

  it('tudo pago → nenhuma transferência', () => {
    expect(simplifyDebts(new Map([['a', 0], ['b', 0]]))).toEqual([])
  })

  it('recusa saldos que não somam zero', () => {
    expect(() => simplifyDebts(new Map([['a', 1]]))).toThrow()
  })

  it('aleatório: transferências liquidam tudo e são no máximo n−1', () => {
    let seed = 42
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    const users = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (let round = 0; round < 200; round++) {
      const bs: SettleableBet[] = []
      for (let i = 0; i < 1 + rnd(8); i++) {
        const opts = ['o1', 'o2', 'o3'].slice(0, 2 + rnd(2))
        const players = users.filter(() => rnd(2) === 0)
        if (players.length < 2) continue
        const entries = players.map((u) => e(u, opts[rnd(opts.length)], 1 + rnd(5000)))
        bs.push(resolved(opts[rnd(opts.length)], entries))
      }
      const bal = computeBalances(bs, [])
      expect(sum(bal)).toBe(0)
      const transfers = simplifyDebts(bal)
      const nonZero = [...bal.values()].filter((v) => v !== 0).length
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1))
      // Aplicar as transferências como pagamentos deixa todos a zero
      const after = computeBalances(bs, transfers.map((t) => ({ fromUser: t.from, toUser: t.to, amountCents: t.amountCents })))
      expect([...after.values()].every((v) => v === 0)).toBe(true)
    }
  })
})

describe('money', () => {
  it('parseEuros', () => {
    expect(parseEuros('5')).toBe(500)
    expect(parseEuros('5,5')).toBe(550)
    expect(parseEuros('0,01')).toBe(1)
    expect(parseEuros('2.75')).toBe(275)
    expect(parseEuros('1.000,00')).toBe(100000)
    expect(parseEuros(' 3 € ')).toBe(300)
    expect(parseEuros('')).toBeNull()
    expect(parseEuros('abc')).toBeNull()
    expect(parseEuros('1,234')).toBeNull()
    expect(parseEuros('-5')).toBeNull()
  })
  it('formatEuros / formatSigned', () => {
    expect(formatEuros(1234).replace(/\s/g, ' ')).toBe('12,34 €')
    expect(formatSigned(500).replace(/\s/g, ' ')).toBe('+5,00 €')
    expect(formatSigned(-1).replace(/\s/g, ' ')).toBe('−0,01 €')
  })
})

import { optionOdds, potentialPayout } from './settlement'

describe('Cotas e ganho potencial', () => {
  const ctx = (mode: string, entries: StakeEntry[], oc: number | null = null, ot: number | null = null) =>
    ({ mode, creatorId: 'ana', oddsCreator: oc, oddsTaker: ot, entries })

  it('1v1 à espera de adversário: lado contrário paga 2,00; lado do criador ainda sem cota', () => {
    const c = ctx('one_v_one', [e('ana', 'sim', 500)])
    expect(optionOdds(c, 'nao')).toBe(2)
    expect(optionOdds(c, 'sim')).toBeNull()
  })
  it('1v1 aceite: ambos 2,00 e já não há cota para entrar', () => {
    const c = ctx('one_v_one', [e('ana', 'sim', 500), e('bruno', 'nao', 500)])
    expect(optionOdds(c, 'sim')).toBe(2)
    expect(optionOdds(c, 'nao')).toBe(2)
  })
  it('odds 2:1: quem aceita tem cota 3,00 (põe 10 €, recebe 30 €)', () => {
    const c = ctx('odds', [e('ana', 'sim', 2000)], 2, 1)
    expect(optionOdds(c, 'nao')).toBe(3)
  })
  it('aberta: cota = pote / total da opção', () => {
    const c = ctx('pool', [e('ana', 'x', 1000), e('carla', 'x', 200), e('bruno', 'y', 300), e('dina', 'y', 300)])
    expect(optionOdds(c, 'x')).toBe(1.5)
    expect(optionOdds(c, 'y')).toBe(3)
  })
  it('opção vazia em aberta/múltipla: sem cota', () => {
    expect(optionOdds(ctx('multi', [e('ana', '1', 100)]), '2')).toBeNull()
  })
  it('ganho potencial inclui a própria entrada no pote', () => {
    // pote atual 6 € (X: 4 €, Y: 2 €); entro com 2 € em Y → Y = 4 €, pote 8 € → recebo 4 €
    expect(potentialPayout([e('a', 'x', 400), e('b', 'y', 200)], 'y', 200)).toBe(400)
    // 1v1: aceito 5 € contra 5 € → recebo 10 €
    expect(potentialPayout([e('ana', 'sim', 500)], 'nao', 500)).toBe(1000)
    // ninguém do outro lado → só recupero o que pus
    expect(potentialPayout([e('a', 'x', 400)], 'x', 100)).toBe(100)
  })
})

import { parseOddsNumber } from './money'

describe('parseOddsNumber', () => {
  it('aceita inteiros e decimais com vírgula ou ponto', () => {
    expect(parseOddsNumber('2')).toBe(2)
    expect(parseOddsNumber('1,5')).toBe(1.5)
    expect(parseOddsNumber('0.25')).toBe(0.25)
  })
  it('rejeita zero, negativos, texto e mais de 2 casas', () => {
    expect(parseOddsNumber('0')).toBeNull()
    expect(parseOddsNumber('-1')).toBeNull()
    expect(parseOddsNumber('abc')).toBeNull()
    expect(parseOddsNumber('1,234')).toBeNull()
    expect(parseOddsNumber('')).toBeNull()
  })
})

import { computeLedger, type LedgerBet } from './settlement'

describe('Apostas secretas: contas à parte', () => {
  const lb = (id: string, secret: boolean, win: string, entries: StakeEntry[]): LedgerBet => ({ id, secret, status: 'resolved', winningOptionId: win, entries })
  const bets = [
    lb('p1', false, 'x', [e('ana', 'x', 1000), e('gil', 'y', 1000)]), // pública: ana +10, gil −10
    lb('s1', true, 'x', [e('ana', 'x', 500), e('bruno', 'y', 500)]), // secreta (escondida do gil): ana +5, bruno −5
  ]

  it('a aposta secreta não entra no "quem deve a quem" geral', () => {
    const l = computeLedger(bets, [])
    expect(obj(l.publicBalances)).toEqual({ ana: 1000, gil: -1000 })
    expect(l.publicTransfers).toEqual([{ from: 'gil', to: 'ana', amountCents: 1000 }])
  })

  it('cada aposta secreta é acertada só entre quem participou', () => {
    const l = computeLedger(bets, [])
    expect(l.secret).toHaveLength(1)
    expect(l.secret[0].transfers).toEqual([{ from: 'bruno', to: 'ana', amountCents: 500 }])
  })

  it('o saldo total junta as duas contas', () => {
    expect(obj(computeLedger(bets, []).total)).toEqual({ ana: 1500, gil: -1000, bruno: -500 })
  })

  it('pagamentos de aposta secreta só abatem nessa aposta', () => {
    const l = computeLedger(bets, [{ fromUser: 'bruno', toUser: 'ana', amountCents: 500, betId: 's1' }])
    expect(l.secret[0].transfers).toEqual([])
    expect(obj(l.publicBalances)).toEqual({ ana: 1000, gil: -1000 })
    expect(l.total.get('bruno')).toBe(0)
  })

  it('quem não vê a aposta secreta (Gil) obtém as mesmas contas gerais', () => {
    const gilView = computeLedger(bets.filter((b) => !b.secret), [])
    const anaView = computeLedger(bets, [])
    expect(gilView.publicTransfers).toEqual(anaView.publicTransfers)
  })

  it('apostas secretas por resolver não aparecem', () => {
    const open: LedgerBet = { id: 's2', secret: true, status: 'open', winningOptionId: null, entries: [e('ana', 'x', 100)] }
    expect(computeLedger([open], []).secret).toEqual([])
  })
})
