const dateTime = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})
const dateOnly = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
const rtf = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' })

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))
export const formatDate = (iso: string) => dateOnly.format(new Date(iso))

/** "daqui a 3 horas", "há 2 dias" */
export function relative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  const abs = Math.abs(diff)
  const min = 60_000, hour = 60 * min, day = 24 * hour
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute')
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour')
  return rtf.format(Math.round(diff / day), 'day')
}

/** Date → valor para <input type="datetime-local"> (hora local). */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const isPast = (iso: string, now = Date.now()) => new Date(iso).getTime() <= now
