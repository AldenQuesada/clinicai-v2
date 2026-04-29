/**
 * Horarios · structure compartilhado entre legacy e novo · port linhas
 * 514-706 do clinic-settings.js. Mantemos a mesma forma que vai pro JSONB
 * `operating_hours` no Supabase pra zero migration de dados.
 */

export interface HorarioPeriodo {
  ativo: boolean
  inicio: string
  fim: string
}

export interface HorarioDia {
  aberto: boolean
  manha: HorarioPeriodo
  tarde: HorarioPeriodo
}

export type HorariosMap = Record<string, HorarioDia>

export interface DiaSemanaInfo {
  key: string
  label: string
}

export const DIAS_SEMANA: DiaSemanaInfo[] = [
  { key: 'seg', label: 'Segunda' },
  { key: 'ter', label: 'Terça' },
  { key: 'qua', label: 'Quarta' },
  { key: 'qui', label: 'Quinta' },
  { key: 'sex', label: 'Sexta' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
]

/** Default por dia · igual aos defaults da renderHorariosGrid (linhas 528-535). */
export function defaultHorarioDia(diaKey: string): HorarioDia {
  return {
    aberto: diaKey !== 'dom',
    manha: { ativo: true, inicio: '08:30', fim: '12:00' },
    tarde: { ativo: true, inicio: '13:30', fim: '18:00' },
  }
}

/**
 * Normaliza horarios (com retrocompatibilidade ao formato antigo
 * abertura/fechamento) · port das linhas 533-535.
 */
export function normalizeHorarios(
  horarios: Partial<Record<string, Partial<HorarioDia> & { abertura?: string; fechamento?: string }>>,
): HorariosMap {
  const out: HorariosMap = {}
  for (const dia of DIAS_SEMANA) {
    const raw = horarios[dia.key] || {}
    const def = defaultHorarioDia(dia.key)
    const manha: HorarioPeriodo =
      raw.manha ?? { ativo: true, inicio: raw.abertura ?? def.manha.inicio, fim: def.manha.fim }
    const tarde: HorarioPeriodo =
      raw.tarde ?? {
        ativo: !!raw.abertura,
        inicio: def.tarde.inicio,
        fim: raw.fechamento ?? def.tarde.fim,
      }
    out[dia.key] = {
      aberto: typeof raw.aberto === 'boolean' ? raw.aberto : def.aberto,
      manha: {
        ativo: manha.ativo !== false,
        inicio: manha.inicio || def.manha.inicio,
        fim: manha.fim || def.manha.fim,
      },
      tarde: {
        ativo: tarde.ativo !== false,
        inicio: tarde.inicio || def.tarde.inicio,
        fim: tarde.fim || def.tarde.fim,
      },
    }
  }
  return out
}
