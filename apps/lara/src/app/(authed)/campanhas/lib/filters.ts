/**
 * Filtros canonicos para target_filter (jsonb).
 *
 * Espelho 1:1 das opcoes do clinic-dashboard/js/broadcast.ui.js linhas 533–567:
 *  · phase: lead | agendado | compareceu | orcamento | paciente | perdido
 *  · temperature: hot | warm | cold
 *  · funnel: fullface | procedimentos
 *  · source_type: quiz | manual | import
 *
 * Helper aceita strings vazias / null e remove chaves vazias antes de mandar
 * pra RPC — mesma logica de _bcSaveFormFields + save (broadcast-events.ui.js).
 */

import type { BroadcastTargetFilter } from '@clinicai/repositories'

export const PHASE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'compareceu', label: 'Compareceu' },
  { value: 'orcamento', label: 'Orcamento' },
  { value: 'paciente', label: 'Paciente' },
  { value: 'perdido', label: 'Perdido' },
] as const

export const TEMPERATURE_OPTIONS = [
  { value: 'hot', label: 'Quente' },
  { value: 'warm', label: 'Morno' },
  { value: 'cold', label: 'Frio' },
] as const

export const FUNNEL_OPTIONS = [
  { value: 'fullface', label: 'Full Face' },
  { value: 'procedimentos', label: 'Procedimentos' },
] as const

export const SOURCE_OPTIONS = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'manual', label: 'Manual' },
  { value: 'import', label: 'Importacao' },
] as const

export const BATCH_SIZE_OPTIONS = [5, 10, 15, 20] as const
export const BATCH_INTERVAL_OPTIONS = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
] as const

/** Monta o filter limpo (sem chaves vazias) pra mandar pra RPC. */
export function buildTargetFilter(input: {
  phase?: string | null
  temperature?: string | null
  funnel?: string | null
  source_type?: string | null
  queixa?: string | null
}): BroadcastTargetFilter {
  const out: BroadcastTargetFilter = {}
  if (input.phase) out.phase = input.phase
  if (input.temperature) {
    out.temperature = input.temperature as 'cold' | 'warm' | 'hot'
  }
  if (input.funnel) out.funnel = input.funnel
  if (input.source_type) out.source_type = input.source_type
  if (input.queixa) out.queixa = input.queixa
  return out
}

/** Tags humanas pra UI (lista/detalhes). */
export function describeFilter(f: BroadcastTargetFilter | null | undefined): string[] {
  if (!f) return []
  const out: string[] = []
  if (f.phase) out.push(`Fase: ${f.phase}`)
  if (f.temperature) out.push(`Temp: ${f.temperature}`)
  if (f.funnel) out.push(`Funil: ${f.funnel}`)
  if (f.source_type) out.push(`Origem: ${f.source_type}`)
  if (f.queixa) out.push(`Queixa: ${f.queixa}`)
  return out
}

/** Valida pelo menos um filtro OU um lead manual (espelho de broadcast.service.js linha 47). */
export function hasAnyTarget(
  filter: BroadcastTargetFilter,
  selectedLeads: string[],
): boolean {
  const hasFilters = Object.keys(filter).length > 0
  const hasManual = selectedLeads.length > 0
  return hasFilters || hasManual
}

/** Status helpers (espelho de _bcStatusLabel/_bcStatusColor). */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'Rascunho',
    sending: 'Enviando',
    completed: 'Concluido',
    cancelled: 'Cancelado',
  }
  return map[status] ?? status
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    draft: '#6B7280',
    sending: '#F59E0B',
    completed: '#10B981',
    cancelled: '#EF4444',
  }
  return map[status] ?? '#6B7280'
}

/** Interpolacao de variaveis dinamicas — preview client-side. */
export function interpolatePreview(
  content: string,
  sample: { nome?: string | null; queixa?: string | null } = {},
): string {
  const nome = sample.nome ?? 'Maria'
  const queixa = sample.queixa ?? 'rugas finais'
  return content
    .replace(/\[nome\]/gi, nome)
    .replace(/\[queixa(?:_principal)?\]/gi, queixa)
    .replace(/\{nome\}/gi, nome)
    .replace(/\{queixa(?:_principal)?\}/gi, queixa)
}

/** Format WhatsApp markdown como HTML (espelho de _waFormat). */
export function whatsappFormatToHtml(text: string): string {
  let t = text
  // Order matters: bold+italic combo first, then individual
  t = t.replace(/\*_([^_]+)_\*/g, '<b><i>$1</i></b>')
  t = t.replace(/_\*([^*]+)\*_/g, '<i><b>$1</b></i>')
  t = t.replace(/\*([^*]+)\*/g, '<b>$1</b>')
  t = t.replace(/_([^_]+)_/g, '<i>$1</i>')
  t = t.replace(/~([^~]+)~/g, '<s>$1</s>')
  t = t.replace(/```([^`]+)```/g, '<code>$1</code>')
  return t
}

/** Escape HTML antes de aplicar formatacao. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const WHATSAPP_MAX_LENGTH = 4096
export const WHATSAPP_WARN_LENGTH = 3500

export const DRAFT_KEY = 'lara_broadcast_draft'
export const DRAFT_TTL_MS = 7 * 86400 * 1000
