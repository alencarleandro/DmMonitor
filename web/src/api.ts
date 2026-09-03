export type Role = 'user' | 'companion'
export type User = { id: string; name: string; email: string; role: Role }
export type Measurement = { id: string; value: number; measuredAt: string; context: string; notes: string }
export type Grant = { id: string; email: string; createdAt: string }
export type Patient = { id: string; name: string; email: string }
export const contexts: Record<string, string> = { fasting: 'Em jejum', before_meal: 'Antes da refeição', after_meal: 'Após a refeição', bedtime: 'Antes de dormir', other: 'Outro momento' }
export const today = () => localDate(new Date())
export function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
export function localDateTime() { const d = new Date(); return `${localDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'DMMonitor', ...options.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'))
    throw new Error(body.error || 'Não foi possível conectar. Tente novamente.')
  }
  return response.status === 204 ? undefined as T : response.json()
}
export function sampleMeasurements(): Measurement[] {
  return [
    { id: 'demo-1', value: 98, measuredAt: new Date(`${today()}T07:15`).toISOString(), context: 'fasting', notes: 'Ao acordar, antes do café.' },
    { id: 'demo-2', value: 126, measuredAt: new Date(`${today()}T10:30`).toISOString(), context: 'after_meal', notes: 'Duas horas após o café da manhã.' },
    { id: 'demo-3', value: 112, measuredAt: new Date(`${today()}T12:10`).toISOString(), context: 'before_meal', notes: '' },
  ].filter(m => new Date(m.measuredAt) <= new Date()).reverse()
}
