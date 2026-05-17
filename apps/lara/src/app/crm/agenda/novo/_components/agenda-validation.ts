/**
 * CRM_PARITY_PATCH_0A · validações operacionais do wizard de novo
 * agendamento.
 *
 * Port enxuto do legacy `apps/lara/public/legacy/js/agenda-validation.js`
 * (linhas 90-160 + 152-161). Aqui:
 *   - `getClinicDayPeriods()` extrai `manha` + `tarde` ativos do dia da semana
 *     a partir do `operating_hours` JSONB (mesma forma que o /configuracoes
 *     grava).
 *   - `checkInPeriods()` valida slot [start,end] contra periods. Retorna
 *     mensagem clara ou null.
 *   - `checkMinAdvance()` valida antecedencia minima (horas) lida de
 *     `clinic_settings.settings.antecedencia_min`.
 *
 * Contrato consumido pelo wizard novo. Não toca legacy.
 */

import type {
  HorariosMap,
  HorarioDia,
} from '@/app/(authed)/configuracoes/clinica/lib/horarios'

const DIAS_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const

function toMinutes(time: string): number {
  if (!time) return 0
  const [h, m] = time.split(':').map((s) => parseInt(s, 10) || 0)
  return h * 60 + m
}

function getDayKey(dateIso: string): string {
  // dateIso YYYY-MM-DD · usa Date local-aware. Sem UTC offset (consulta dom..sab
  // do dia local do agendamento).
  const [y, m, d] = dateIso.split('-').map((s) => parseInt(s, 10))
  if (!y || !m || !d) return 'seg'
  const dt = new Date(y, m - 1, d)
  return DIAS_KEYS[dt.getDay()] ?? 'seg'
}

export interface PeriodWindow {
  inicio: string
  fim: string
  label: 'manha' | 'tarde'
}

export interface ClinicDayInfo {
  aberto: boolean
  periods: PeriodWindow[]
}

export function getClinicDay(
  horarios: HorariosMap | null | undefined,
  dateIso: string,
): ClinicDayInfo {
  if (!horarios) return { aberto: true, periods: [] }
  const key = getDayKey(dateIso)
  const raw = horarios[key] as HorarioDia | undefined
  if (!raw) return { aberto: true, periods: [] }
  if (raw.aberto === false) return { aberto: false, periods: [] }
  const periods: PeriodWindow[] = []
  if (raw.manha && raw.manha.ativo !== false) {
    periods.push({ inicio: raw.manha.inicio, fim: raw.manha.fim, label: 'manha' })
  }
  if (raw.tarde && raw.tarde.ativo !== false) {
    periods.push({ inicio: raw.tarde.inicio, fim: raw.tarde.fim, label: 'tarde' })
  }
  return { aberto: true, periods }
}

function formatPeriods(periods: PeriodWindow[]): string {
  return periods.map((p) => `${p.inicio}-${p.fim}`).join(' / ')
}

/**
 * Retorna null se [startTime,endTime] cabe inteiro em algum period do dia.
 * Senão retorna string descritiva (fechado, almoço, fora do horário).
 */
export function checkInPeriods(
  day: ClinicDayInfo,
  startTime: string,
  endTime: string,
): string | null {
  if (!day.aberto) {
    return 'Clínica fechada neste dia da semana. Ajuste em /configuracoes/clinica se precisar abrir.'
  }
  if (day.periods.length === 0) {
    // Sem periods definidos · permite (clínica sem horários configurados)
    return null
  }
  const s = toMinutes(startTime)
  const e = toMinutes(endTime)
  for (const p of day.periods) {
    const pS = toMinutes(p.inicio)
    const pE = toMinutes(p.fim)
    if (s >= pS && e <= pE) return null
  }
  const horarios = formatPeriods(day.periods)
  if (day.periods.length === 2) {
    const m = day.periods[0]!
    const t = day.periods[1]!
    const mE = toMinutes(m.fim)
    const tS = toMinutes(t.inicio)
    if ((s >= mE && s < tS) || (e > mE && e <= tS) || (s < mE && e > tS)) {
      return `Horário ${startTime}-${endTime} cai no intervalo de almoço (${m.fim}-${t.inicio}). Horários válidos: ${horarios}.`
    }
  }
  return `Horário ${startTime}-${endTime} fora do funcionamento da clínica. Horários válidos neste dia: ${horarios}.`
}

/**
 * Antecedência mínima · lê `clinic_settings.settings.antecedencia_min` (horas).
 * Retorna null se OK, string com erro se faltar antecedência.
 *
 * Skip se `minHours <= 0` ou se a data agendada já estiver definitivamente no
 * futuro (>1 dia).
 */
export function checkMinAdvance(
  minHoursRaw: string | number | null | undefined,
  scheduledDate: string,
  startTime: string,
  now: Date = new Date(),
): string | null {
  const minH =
    typeof minHoursRaw === 'number'
      ? minHoursRaw
      : Number(String(minHoursRaw ?? '').trim())
  if (!Number.isFinite(minH) || minH <= 0) return null
  const apptAt = new Date(`${scheduledDate}T${startTime.slice(0, 5)}:00`)
  if (Number.isNaN(apptAt.getTime())) return null
  const deltaH = (apptAt.getTime() - now.getTime()) / 3600000
  if (deltaH < minH) {
    return `Antecedência mínima da clínica é ${minH}h. Este horário está a ${deltaH.toFixed(1)}h de agora.`
  }
  return null
}
