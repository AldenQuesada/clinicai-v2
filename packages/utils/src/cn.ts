import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combina classes condicionais (clsx) + resolve conflitos do Tailwind (twMerge).
 * Padrão shadcn-style. Usar em todo lugar que monta className dinâmica.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
