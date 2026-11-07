const fmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })

/** 1234 → "12,34 €" */
export function formatEuros(cents: number): string {
  return fmt.format(cents / 100)
}

/** 1234 → "+12,34 €", -500 → "−5,00 €", 0 → "0,00 €" */
export function formatSigned(cents: number): string {
  if (cents > 0) return `+${formatEuros(cents)}`
  if (cents < 0) return `−${formatEuros(-cents)}`
  return formatEuros(0)
}

/**
 * Converte texto escrito pelo utilizador em cêntimos.
 * Aceita "5", "5,5", "5,50", "5.50", "1 000,00", "€ 2". Devolve null se inválido.
 */
export function parseEuros(input: string): number | null {
  let s = input.replace(/[€\s ]/g, '')
  if (s === '') return null
  // Se tiver vírgula, os pontos são separadores de milhares.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [int, dec = ''] = s.split('.')
  const cents = Number(int) * 100 + Number(dec.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** "1,5" → 1.5 (até 2 casas decimais, > 0). Para odds. Devolve null se inválido. */
export function parseOddsNumber(input: string): number | null {
  const s = input.trim().replace(',', '.')
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return n > 0 ? n : null
}
