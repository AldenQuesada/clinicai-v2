'use server'

/**
 * Server Actions · /leads (Lara · port 1:1 do clinic-dashboard).
 *
 * Wrappers tipados em volta de LeadRepository · cada action faz
 * `requireAction` no inicio (gate UX rapido) e revalida `/leads` no fim.
 * RLS no Postgres e a defesa final.
 *
 * Validacoes alinhadas com a UI do clinic-dashboard:
 *   - phone E.164 ou BR (10-11 digitos) com mascara aplicada
 *   - email RFC 5322 simplificado
 *   - idade 0-120
 *   - score 0-100
 */

import { revalidatePath } from 'next/cache'
import type {
  Funnel,
  LeadPhase,
  LeadTemperature,
  UpdateLeadInput,
} from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import { requireAction } from '@/lib/permissions'

const ROUTE = '/leads'

// ── Validators ──────────────────────────────────────────────────────────────

const VALID_FUNNELS: readonly Funnel[] = ['olheiras', 'fullface', 'procedimentos']
const VALID_TEMPS: readonly LeadTemperature[] = ['cold', 'warm', 'hot']
// Contrato canonico (Fase 1C · 2026-05-11): 4 phases.
const VALID_PHASES: readonly LeadPhase[] = ['lead', 'agendado', 'paciente', 'orcamento']

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  // E.164 (com +) ou BR puro (10-11). Aceita 12-13 (com 55 prefixo).
  if (digits.length < 10 || digits.length > 13) return null
  return digits
}

function isValidEmail(raw: string | null | undefined): boolean {
  if (!raw) return true // email opcional
  const s = String(raw).trim()
  if (!s) return true
  // RFC 5322 simplificado · igual clinic-dashboard
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function parseIdade(raw: string | null | undefined): number | null | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 120) return undefined
  return Math.floor(n)
}

function parseScore(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n)
}

export type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }

function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data }
}
function fail<T = unknown>(error: string): ActionResult<T> {
  return { ok: false, error }
}

// ── 1. updateLead · campos da aba "Info" ────────────────────────────────────

export async function updateLeadAction(
  leadId: string,
  formData: FormData,
): Promise<ActionResult<{ leadId: string }>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const phoneRaw = String(formData.get('phone') || '').trim()
  const phone = normalizePhone(phoneRaw)
  if (phoneRaw && !phone) {
    return fail('Telefone invalido · esperado 10-13 digitos')
  }

  const emailRaw = String(formData.get('email') || '').trim()
  if (!isValidEmail(emailRaw)) return fail('Email invalido')

  const idade = parseIdade(String(formData.get('idade') || ''))
  if (idade === undefined && (formData.get('idade') ?? '') !== '') {
    return fail('Idade invalida · 0 a 120')
  }

  const funnelRaw = String(formData.get('funnel') || '').trim()
  if (funnelRaw && !VALID_FUNNELS.includes(funnelRaw as Funnel)) {
    return fail('Funnel invalido')
  }

  const tempRaw = String(formData.get('temperature') || '').trim()
  if (tempRaw && !VALID_TEMPS.includes(tempRaw as LeadTemperature)) {
    return fail('Temperatura invalida')
  }

  const queixasRaw = String(formData.get('queixas_faciais') || '').trim()
  const queixas = queixasRaw
    ? queixasRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined

  const fields: UpdateLeadInput = {
    name: String(formData.get('name') || '').trim() || null,
    email: emailRaw || null,
  }
  if (phone) fields.phone = phone
  if (idade !== undefined) fields.idade = idade as number | null
  if (funnelRaw) fields.funnel = funnelRaw as Funnel
  if (tempRaw) fields.temperature = tempRaw as LeadTemperature
  if (queixas !== undefined) fields.queixasFaciais = queixas

  const updated = await repos.leads.update(leadId, fields)
  if (!updated) return fail('Nao foi possivel atualizar o lead')

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok({ leadId: updated.id })
}

// ── 2. setLeadFunnel · pill funil ───────────────────────────────────────────

export async function setLeadFunnelAction(
  leadId: string,
  funnel: Funnel,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  if (!VALID_FUNNELS.includes(funnel)) return fail('Funnel invalido')

  await repos.leads.setFunnel(leadId, funnel)

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok()
}

// ── 3. setLeadTemperature ───────────────────────────────────────────────────

export async function setLeadTemperatureAction(
  leadId: string,
  temperature: LeadTemperature,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  if (!VALID_TEMPS.includes(temperature)) return fail('Temperatura invalida')

  await repos.leads.setTemperature(leadId, temperature)

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok()
}

// ── 4. setLeadPhase · drag-drop kanban + tab acoes ──────────────────────────

export async function setLeadPhaseAction(
  leadId: string,
  phase: LeadPhase,
  reason?: string | null,
): Promise<ActionResult<{ fromPhase?: string; toPhase?: string }>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  if (!VALID_PHASES.includes(phase)) return fail('Phase invalida')

  // RPC sdr_change_phase · matriz canônica 4×4 (Fase 1C) + audit trail
  // em phase_history. Perda (lifecycle_status='perdido') usa lead_lost
  // dedicada · orcamento exige items+subtotal · usar lead_to_orcamento.
  const result = await repos.leads.changePhase(leadId, phase, reason ?? null)
  if (!result.ok) return fail(result.error || 'Nao foi possivel mudar a fase')

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok({ fromPhase: result.fromPhase, toPhase: result.toPhase })
}

// ── 5. addLeadTags · adiciona tags (append-only · dedup) ────────────────────

export async function addLeadTagsAction(
  leadId: string,
  tags: string[],
): Promise<ActionResult<{ tags: string[] }>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const clean = (tags || [])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
  if (!clean.length) return fail('Nenhuma tag valida')

  const next = await repos.leads.addTags(leadId, clean)

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok({ tags: next })
}

// ── 6. removeLeadTags ───────────────────────────────────────────────────────

export async function removeLeadTagsAction(
  leadId: string,
  tags: string[],
): Promise<ActionResult<{ tags: string[] }>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const next = await repos.leads.removeTags(leadId, tags || [])

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok({ tags: next })
}

// ── 7. updateLeadScore · UI e "score quiz" (0-100) ──────────────────────────

export async function updateLeadScoreAction(
  leadId: string,
  scoreRaw: string | number,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const score = parseScore(String(scoreRaw))
  if (score === null) return fail('Score deve ser 0-100')

  await repos.leads.updateScore(leadId, score)

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok()
}

// ── 8. softDeleteLead · seta deleted_at ─────────────────────────────────────

export async function softDeleteLeadAction(
  leadId: string,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:delete')

  const ok_ = await repos.leads.softDelete(leadId)
  if (!ok_) return fail('Nao foi possivel deletar')

  revalidatePath(ROUTE)
  return ok()
}

// ── 9. restoreLead · undo soft-delete ───────────────────────────────────────

export async function restoreLeadAction(
  leadId: string,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:delete')

  const ok_ = await repos.leads.restore(leadId)
  if (!ok_) return fail('Nao foi possivel restaurar')

  revalidatePath(ROUTE)
  return ok()
}

// ── 9.5 markLeadLost · BLOCO 3.3 · marca lifecycle=perdido (lead_lost RPC) ──

/**
 * Marca lead como perdido (lifecycle_status='perdido') via RPC `lead_lost`.
 *
 * Reusa o mesmo repository.markLost que a Mesa Operacional 3.2D e o
 * markLeadLostAction do CRM. Aqui é um wrapper local pra manter coerência
 * com o ActionResult pattern desta área (/leads). Motivo obrigatório (3-500).
 *
 * Revalida todas as rotas que mostram contagens/listas afetadas:
 *   - /leads (lista)
 *   - /leads/[id] (detalhe)
 *   - /crm/kanban
 *   - /crm/mesa-operacional
 *   - /crm/dashboard
 *   - /crm/recuperacao
 *
 * Guards de UI (em LeadActions.tsx):
 *   - esconde botão se lifecycleStatus !== 'ativo'
 *   - esconde botão se deletedAt
 */
export async function markLeadLostAction(
  leadId: string,
  reason: string,
): Promise<ActionResult<{ leadId: string }>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const cleanReason = String(reason || '').trim()
  if (cleanReason.length < 3) return fail('Motivo curto · mínimo 3 caracteres')
  if (cleanReason.length > 500) return fail('Motivo longo · máximo 500 caracteres')

  const result = await repos.leads.markLost(leadId, cleanReason)
  if (!result.ok) return fail(result.error || 'Não foi possível marcar perdido')

  // Suprimir warn no console pra ctx (usado só pra type narrowing)
  void ctx

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  revalidatePath('/crm/kanban')
  revalidatePath('/crm/mesa-operacional')
  revalidatePath('/crm/dashboard')
  revalidatePath('/crm/recuperacao')
  return ok({ leadId: result.leadId })
}

// ── 10. transbordarLead · pausa IA + status=dra (transferir pra humano) ─────

/**
 * Transbordar pra atendimento humano · port da acao `Transferir para Dra.`
 * do clinic-dashboard. Achata 2 ops: pausa AI na conversa associada
 * (via ConversationRepository.pause se existir) + marca lead.tags com
 * `transbordo_humano`. Se conversa nao existe, soh adiciona a tag.
 */
export async function transbordarLeadAction(
  leadId: string,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const lead = await repos.leads.getById(leadId)
  if (!lead) return fail('Lead nao encontrado')

  // 1. Tag transbordo no lead (campo tags · text[])
  await repos.leads.addTags(leadId, ['transbordo_humano'])

  // 2. Tenta encontrar conversa ativa pelo phone e mudar status pra 'dra'
  try {
    const conv = await repos.conversations.findActiveByPhoneVariants(
      ctx.clinic_id,
      [lead.phone].filter(Boolean) as string[],
    )
    if (conv?.id) {
      await repos.conversations.setStatus(conv.id, 'dra')
    }
  } catch (e) {
    console.warn('[transbordarLeadAction] falha ao mudar conversa:', (e as Error).message)
  }

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok()
}
