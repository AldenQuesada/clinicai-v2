import { format, formatDistanceToNow, differenceInDays, isToday as isTodayFn } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Formato BR padrão · "23/04/2026 14:32" */
export function formatDateBR(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR })
}

/** "há 3 horas" · pt-BR */
export function timeAgoBR(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
}

/** Dias atrás (inteiro) */
export function daysAgo(date: Date | string | number): number {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return differenceInDays(new Date(), d)
}

export const isToday = isTodayFn
