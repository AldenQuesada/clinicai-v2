/**
 * Mapeamento sex legacy ↔ canonico v2.
 *
 * Schema canonico v2 (mig 61): patients.sex CHECK in ['F','M','O','N']
 * Legacy (clinic-dashboard): 'feminino', 'masculino', 'outro', 'nao-informar'
 *
 * UI form mostra opcoes humanas (Feminino/Masculino/Outro/Nao informar)
 * mas SALVA single-char F/M/O/N · canon constraint.
 */

export type PatientSex = 'F' | 'M' | 'O' | 'N'

export const SEX_OPTIONS: ReadonlyArray<{ value: PatientSex; label: string }> = [
  { value: 'F', label: 'Feminino' },
  { value: 'M', label: 'Masculino' },
  { value: 'O', label: 'Outro' },
  { value: 'N', label: 'Não informar' },
] as const

/**
 * Aceita legacy ('feminino', 'masculino') OU canonico (F/M) e devolve
 * canonico. Util pra migracao de dados antigos.
 */
export function normalizeSex(input: string | null | undefined): PatientSex | null {
  if (!input) return null
  const v = input.toLowerCase().trim()
  if (v === 'f' || v.startsWith('fem')) return 'F'
  if (v === 'm' || v.startsWith('masc')) return 'M'
  if (v === 'o' || v.startsWith('out')) return 'O'
  if (v === 'n' || v.startsWith('nao') || v.startsWith('não')) return 'N'
  return null
}

export function sexLabel(value: PatientSex | null | undefined): string {
  if (!value) return '—'
  const opt = SEX_OPTIONS.find((o) => o.value === value)
  return opt?.label ?? '—'
}
