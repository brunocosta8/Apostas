import { describe, expect, it } from 'vitest'
import { headToHead, pairFlow, type H2HBetInput, type H2HEntry } from './h2h'
import { netForOutcome } from './settlement'

const e = (userId: string, optionId: string, amountCents: number): H2HEntry => ({ userId, optionId, amountCents })
let n = 0
const bet = (status: string, win: string | null, entries: H2HEntry[], date?: string): H2HBetInput => ({
  id: `b${++n}`, status, winningOptionId: win, entries, date: date ?? `2026-11-${String(10 + n).padStart(2, '0')}`,
})

describe('pairFlow', () => {
  it('1v1: o perdedor dá tudo ao vencedor', () => {
    const es = [e('ana', 'x', 500), e('bruno', 'y', 500)]
    expect(pairFlow(es, 'x', 'bruno', 'ana')).toBe(500)
    expect(pairFlow(es, 'x', 'ana', 'bruno')).toBe(0)
  })
  it('aberta: o dinheiro de cada perdedor é dividido pelos vencedores na proporção', () => {
    // X: ana 10, carla 2 | Y: bruno 3, dina 3
    const es = [e('ana', 'x', 1000), e('carla', 'x', 200), e('bruno', 'y', 300), e('dina', 'y', 300)]
    expect(pairFlow(es, 'x', 'bruno', 'ana')).toBeCloseTo(250) // 3 € × 10/12
    expect(pairFlow(es, 'x', 'bruno', 'carla')).toBeCloseTo(50)
    // A soma dos fluxos recebidos = ganho total do vencedor
    const net = netForOutcome(es, 'x')
    expect(pairFlow(es, 'x', 'bruno', 'ana') + pairFlow(es, 'x', 'dina', 'ana')).toBeCloseTo(net.get('ana')!)
  })
  it('do mesmo lado não há fluxo', () => {
    const es = [e('ana', 'x', 100), e('carla', 'x', 100), e('bruno', 'y', 100)]
    expect(pairFlow(es, 'x', 'carla', 'ana')).toBe(0)
  })
})

describe('headToHead', () => {
  it('conta vitórias, derrotas e dinheiro contra a pessoa', () => {
    const s = headToHead([
      bet('resolved', 'x', [e('eu', 'x', 500), e('rui', 'y', 500)]),
      bet('resolved', 'y', [e('eu', 'x', 200), e('rui', 'y', 200)]),
      bet('resolved', 'x', [e('eu', 'x', 1000), e('rui', 'y', 500)]), // odds: ganho 5 €
    ], 'eu', 'rui')
    expect([s.wins, s.losses, s.together]).toEqual([2, 1, 3])
    expect(s.net).toBe(500 - 200 + 500)
    expect(s.winRate).toBe(67)
    expect(s.biggestLoss?.pairNet).toBe(-200)
  })

  it('ignora apostas em que a outra pessoa não entrou', () => {
    const s = headToHead([bet('resolved', 'x', [e('eu', 'x', 500), e('ana', 'y', 500)])], 'eu', 'rui')
    expect(s.together).toBe(0)
    expect(s.winRate).toBeNull()
  })

  it('mesmo lado, pendentes, anuladas e "ninguém acertou"', () => {
    const s = headToHead([
      bet('resolved', 'x', [e('eu', 'x', 100), e('rui', 'x', 100), e('ana', 'y', 100)]), // mesmo lado
      bet('open', null, [e('eu', 'x', 100), e('rui', 'y', 100)]),
      bet('cancelled', null, [e('eu', 'x', 100), e('rui', 'y', 100)]),
      bet('void', 'z', [e('eu', 'x', 100), e('rui', 'y', 100)]),
      // múltipla: ganhou a Ana, eu e o Rui perdemos em opções diferentes → empate entre nós
      bet('resolved', 'c', [e('eu', 'a', 100), e('rui', 'b', 100), e('ana', 'c', 100)]),
    ], 'eu', 'rui')
    expect([s.sameSide, s.pending, s.voided, s.draws, s.wins, s.losses]).toEqual([1, 1, 2, 1, 0, 0])
    expect(s.net).toBe(0)
    expect(s.myStakeTotal).toBe(300) // anuladas não contam
  })

  it('sequência atual: só as mais recentes seguidas', () => {
    const s = headToHead([
      bet('resolved', 'y', [e('eu', 'x', 100), e('rui', 'y', 100)], '2026-01-01'), // derrota antiga
      bet('resolved', 'x', [e('eu', 'x', 100), e('rui', 'y', 100)], '2026-02-01'),
      bet('resolved', 'x', [e('eu', 'x', 100), e('rui', 'y', 100)], '2026-03-01'),
      bet('open', null, [e('eu', 'x', 100), e('rui', 'y', 100)], '2026-04-01'), // pendente não quebra
    ], 'eu', 'rui')
    expect(s.streak).toEqual({ type: 'win', count: 2 })
    expect(s.bets[0].outcome).toBe('pending') // mais recente primeiro
  })

  it('é simétrico: o que eu ganho ao Rui é o que o Rui perde para mim', () => {
    const bets = [
      bet('resolved', 'x', [e('eu', 'x', 700), e('rui', 'y', 300), e('ana', 'y', 400), e('bia', 'x', 100)]),
      bet('resolved', 'y', [e('eu', 'x', 250), e('rui', 'y', 50), e('ana', 'x', 100)]),
    ]
    expect(headToHead(bets, 'eu', 'rui').net).toBe(-headToHead(bets, 'rui', 'eu').net)
  })
})
