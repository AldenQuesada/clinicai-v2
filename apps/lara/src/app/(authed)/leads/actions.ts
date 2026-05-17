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
  LeadSource,
  LeadSourceType,
  LeadTemperature,
  UpdateLeadInput,
  ListLeadsFilter,
  LeadExportRow,
} from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import { requireAction } from '@/lib/permissions'
import { createLogger, hashPhone, maskEmail } from '@clinicai/logger'

const log = createLogger({ app: 'lara' })

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

// ── 0. createLead · wizard 3-step "Novo lead" ───────────────────────────────
//
// Lote 2 P0.1 (2026-05-17) · substitui placeholder modal por wizard funcional.
//
// Fluxo:
//   1. Valida input (Zod já não · validação manual igual demais actions
//      pra reusar normalizePhone/isValidEmail e ficar 1:1 com updateLeadAction).
//   2. Dedup por phone via repos.leads.findByPhoneVariants (canônico · webhook
//      usa o mesmo). Email dedup via SELECT direto (LeadRepository não tem
//      método dedicado · evitamos adicionar pra não criar API nova).
//   3. Cria via LeadRepository.createViaRpc (RPC `lead_create` · idempotente
//      por (clinic_id, phone) · ADR · evita race com webhook que pode estar
//      processando msg do mesmo número exatamente nesse momento).
//   4. Revalida /leads + /crm/leads + /crm/dashboard.
//   5. Logger estruturado · phone hash, email mask (compliance LGPD).
//
// NÃO chama `repos.leads.create()` direto porque a RPC já trata:
//   - clinic_id via app_clinic_id() (JWT)
//   - dedup atômico
//   - phase default 'lead', source/source_type default seguros
//
// Caller (UI wizard) controla redirect pra detalhe · server action só retorna
// leadId + flag `existed` quando RPC indica que lead já estava ativo.

export interface NewLeadInput {
  name: string
  phone: string
  email?: string | null
  cpf?: string | null
  birthDate?: string | null
  source?: LeadSource | null
  sourceType?: LeadSourceType | null
  funnel?: Funnel | null
  temperature?: LeadTemperature | null
  score?: number | null
  notes?: string | null
}

export interface CreateLeadActionResult {
  leadId: string
  existed: boolean
  /** ID de lead já existente quando dedup bate · UI redireciona pra detalhe. */
  duplicate?: { leadId: string; reason: 'phone' | 'email'; name?: string | null }
}

const VALID_SOURCES: readonly LeadSource[] = [
  'manual',
  'lara_recipient',
  'lara_vpi_partner',
  'b2b_partnership_referral',
  'b2b_admin_registered',
  'quiz',
  'landing_page',
  'import',
  'webhook',
]
const VALID_SOURCE_TYPES: readonly LeadSourceType[] = [
  'manual',
  'quiz',
  'import',
  'referral',
  'social',
  'whatsapp',
  'whatsapp_fullface',
  'landing_page',
  'b2b_voucher',
  'vpi_referral',
]

export async function createLeadAction(
  input: NewLeadInput,
): Promise<ActionResult<CreateLeadActionResult>> {
  const { supabase, ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:create')

  // 1. Identificação · nome obrigatório (≥2 chars)
  const name = String(input?.name ?? '').trim()
  if (name.length < 2) return fail('Nome obrigatório · mínimo 2 caracteres')
  if (name.length > 200) return fail('Nome longo · máximo 200 caracteres')

  // 1.b Telefone obrigatório · 10-13 dígitos (BR + variantes com 55)
  const phone = normalizePhone(input?.phone)
  if (!phone) return fail('Telefone obrigatório · esperado 10-13 dígitos')

  // 1.c Email opcional
  const emailRaw = String(input?.email ?? '').trim() || null
  if (emailRaw && !isValidEmail(emailRaw)) return fail('Email inválido')

  // 1.d CPF opcional · só normaliza (apenas dígitos · 11)
  const cpfRaw = String(input?.cpf ?? '').replace(/\D/g, '').trim() || null
  if (cpfRaw && cpfRaw.length !== 11) return fail('CPF inválido · esperado 11 dígitos')

  // 1.e birthDate opcional · YYYY-MM-DD
  const birthDateRaw = String(input?.birthDate ?? '').trim() || null
  if (birthDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(birthDateRaw)) {
    return fail('Data de nascimento inválida · use formato YYYY-MM-DD')
  }

  // 2. Origem & qualificação
  const source: LeadSource =
    input?.source && VALID_SOURCES.includes(input.source) ? input.source : 'manual'
  const sourceType: LeadSourceType =
    input?.sourceType && VALID_SOURCE_TYPES.includes(input.sourceType)
      ? input.sourceType
      : 'manual'
  const funnel: Funnel =
    input?.funnel && VALID_FUNNELS.includes(input.funnel)
      ? input.funnel
      : 'procedimentos'
  const temperature: LeadTemperature =
    input?.temperature && VALID_TEMPS.includes(input.temperature)
      ? input.temperature
      : 'hot' // Default hot · mig 20260532000000_leads_default_temperature_hot.sql

  const score = parseScore(input?.score == null ? null : String(input.score))

  // 3. Operação & notas · phase=lead fixed (Step 3 da spec)
  const notesRaw = String(input?.notes ?? '').trim() || null
  if (notesRaw && notesRaw.length > 1000) {
    return fail('Notas longas · máximo 1000 caracteres')
  }

  // 4. Dedup phone · usa findByPhoneVariants (canônico · igual webhook)
  try {
    const existingByPhone = await repos.leads.findByPhoneVariants(ctx.clinic_id, [phone])
    if (existingByPhone) {
      log.info(
        {
          clinic_id: ctx.clinic_id,
          user_id: ctx.user_id,
          phone: hashPhone(phone),
          existing_lead_id: existingByPhone.id,
          action: 'create_lead_dedup_phone',
        },
        'createLeadAction · phone duplicado',
      )
      return ok({
        leadId: existingByPhone.id,
        existed: true,
        duplicate: {
          leadId: existingByPhone.id,
          reason: 'phone',
          name: existingByPhone.name ?? null,
        },
      })
    }
  } catch (err) {
    log.error(
      { err: (err as Error).message, clinic_id: ctx.clinic_id },
      'createLeadAction · falha em dedup phone',
    )
    // Não bloqueia · RPC lead_create tem dedup atômico defensivo
  }

  // 5. Dedup email opcional · SELECT direto (sem método dedicado no repo)
  if (emailRaw) {
    try {
      const { data } = await supabase
        .from('leads')
        .select('id, name')
        .eq('clinic_id', ctx.clinic_id)
        .eq('email', emailRaw)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      // Multi-line select faz supabase-js retornar GenericStringError[] no
      // generic · cast via unknown pra shape conhecido (mesmo pattern do
      // LeadRepository.listForExport).
      const existingByEmail = data as { id: string; name: string | null } | null
      if (existingByEmail?.id) {
        log.info(
          {
            clinic_id: ctx.clinic_id,
            user_id: ctx.user_id,
            email: maskEmail(emailRaw),
            existing_lead_id: existingByEmail.id,
            action: 'create_lead_dedup_email',
          },
          'createLeadAction · email duplicado',
        )
        return ok({
          leadId: existingByEmail.id,
          existed: true,
          duplicate: {
            leadId: existingByEmail.id,
            reason: 'email',
            name: existingByEmail.name,
          },
        })
      }
    } catch (err) {
      log.error(
        { err: (err as Error).message, clinic_id: ctx.clinic_id },
        'createLeadAction · falha em dedup email',
      )
      // Não bloqueia
    }
  }

  // 6. Cria via RPC `lead_create` · idempotente (clinic_id, phone)
  const rpcResult = await repos.leads.createViaRpc({
    phone,
    name,
    email: emailRaw,
    source,
    sourceType,
    funnel,
    temperature,
    metadata: {
      created_via: 'crm_ui_wizard_p0_1',
      ...(cpfRaw ? { cpf: cpfRaw } : {}),
      ...(birthDateRaw ? { birth_date: birthDateRaw } : {}),
      ...(score != null ? { initial_score: score } : {}),
      ...(notesRaw ? { initial_notes: notesRaw } : {}),
    },
  })

  if (!rpcResult.ok) {
    log.warn(
      {
        clinic_id: ctx.clinic_id,
        user_id: ctx.user_id,
        phone: hashPhone(phone),
        err: rpcResult.error,
        detail: rpcResult.detail,
        action: 'create_lead_failed',
      },
      'createLeadAction · RPC lead_create falhou',
    )
    return fail(rpcResult.error || 'Não foi possível criar o lead')
  }

  const leadId = rpcResult.leadId
  if (!leadId) {
    log.error(
      { clinic_id: ctx.clinic_id, action: 'create_lead_no_id' },
      'createLeadAction · RPC ok mas sem leadId',
    )
    return fail('Resposta inesperada · lead criado sem ID')
  }

  // RPC pode retornar existed=true em race (dedup escapa do nosso check) ·
  // tratamos como duplicate explícito · UI mostra link pra detalhe.
  if (rpcResult.existed) {
    log.info(
      {
        clinic_id: ctx.clinic_id,
        user_id: ctx.user_id,
        lead_id: leadId,
        phone: hashPhone(phone),
        action: 'create_lead_rpc_dedup',
      },
      'createLeadAction · RPC detectou lead existente (race)',
    )
    return ok({
      leadId,
      existed: true,
      duplicate: { leadId, reason: 'phone' },
    })
  }

  log.info(
    {
      clinic_id: ctx.clinic_id,
      user_id: ctx.user_id,
      lead_id: leadId,
      phone: hashPhone(phone),
      action: 'create_lead_ok',
      source,
      source_type: sourceType,
      funnel,
      temperature,
    },
    'createLeadAction · lead criado',
  )

  // 7. Score inicial · RPC lead_create não aceita score · UPDATE separado
  if (score != null && score > 0) {
    try {
      await repos.leads.updateScore(leadId, score)
    } catch (err) {
      log.warn(
        { err: (err as Error).message, lead_id: leadId },
        'createLeadAction · score inicial falhou (não fatal)',
      )
    }
  }

  revalidatePath(ROUTE)
  revalidatePath('/crm/leads')
  revalidatePath('/crm/dashboard')

  return ok({ leadId, existed: false })
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

// ── 5. addLeadTags · OUT desta release (Lote 2 P0.2) ────────────────────────
//
// Tags livres foram pausadas em 2026-05-05 · coluna `leads.tags` removida em
// produção durante REFACTOR_LEAD_MODEL · ver `apps/lara/docs/OUT_P0_TAGS.md`.
// UI de tags foi removida do LeadsClient/bulk-actions/LeadTagsPanel. Action
// mantida pra compat de import path mas falha explicitamente · UI nunca
// deveria chamar mais.

export async function addLeadTagsAction(
  leadId: string,
  tags: string[],
): Promise<ActionResult<{ tags: string[] }>> {
  // Suprimir unused vars (mantemos assinatura pra evitar quebrar imports do
  // call site antigo se ainda existir · TS pega quem chamar inválido).
  void leadId
  void tags
  log.warn(
    { lead_id: leadId, action: 'add_tags_blocked' },
    'addLeadTagsAction · TAGS_NOT_SUPPORTED · ver OUT_P0_TAGS',
  )
  return fail('TAGS_NOT_SUPPORTED · pending audit · ver doc OUT_P0_TAGS')
}

// ── 6. removeLeadTags · OUT desta release (Lote 2 P0.2) ─────────────────────

export async function removeLeadTagsAction(
  leadId: string,
  tags: string[],
): Promise<ActionResult<{ tags: string[] }>> {
  void leadId
  void tags
  log.warn(
    { lead_id: leadId, action: 'remove_tags_blocked' },
    'removeLeadTagsAction · TAGS_NOT_SUPPORTED · ver OUT_P0_TAGS',
  )
  return fail('TAGS_NOT_SUPPORTED · pending audit · ver doc OUT_P0_TAGS')
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
 * do clinic-dashboard. Pausa IA na conversa associada (via
 * ConversationRepository.setStatus('dra')).
 *
 * Lote 2 P0.2 (2026-05-17): tag `transbordo_humano` no lead foi removida ·
 * `leads.tags` está pausada (ver OUT_P0_TAGS). Sinal de transbordo já fica
 * em `wa_conversations.status='dra'` (canônico · view operacional). Se
 * conversa não existir, ainda assim a ação retorna ok (efeito principal era
 * pausar IA · sem conversa não há IA pra pausar).
 */
export async function transbordarLeadAction(
  leadId: string,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const lead = await repos.leads.getById(leadId)
  if (!lead) return fail('Lead nao encontrado')

  // Tenta encontrar conversa ativa pelo phone e mudar status pra 'dra'
  try {
    const conv = await repos.conversations.findActiveByPhoneVariants(
      ctx.clinic_id,
      [lead.phone].filter(Boolean) as string[],
    )
    if (conv?.id) {
      await repos.conversations.setStatus(conv.id, 'dra')
    } else {
      log.info(
        { clinic_id: ctx.clinic_id, lead_id: leadId, action: 'transbordo_no_conv' },
        'transbordarLeadAction · lead sem conversa ativa · noop',
      )
    }
  } catch (e) {
    log.warn(
      { err: (e as Error).message, lead_id: leadId, action: 'transbordo_failed' },
      'transbordarLeadAction · falha ao mudar conversa',
    )
  }

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${leadId}`)
  return ok()
}

// ── BLOCO 3.4B · Bulk Actions /leads ────────────────────────────────────────
//
// Reusa contratos canônicos:
//   - RPC `leads_bulk_change_phase` (ATÔMICA · phase_history automático)
//   - `repos.leads.markLost(id, reason)` em loop (lead_lost · sem RPC bulk)
//   - `repos.leads.listForExport()` para CSV server-side
//
// `bulkAddLeadTagsAction` deliberadamente FORA neste bloco · repository
// `addTags` está @deprecated porque `leads.tags` foi removida em produção
// durante REFACTOR_LEAD_MODEL. Calls fail silently · merged set nunca chega
// no DB. Implementar bulk seria UI sem efeito. Re-adicionar quando arquitetura
// de tags persistentes for restaurada (FASE 3.4M ou conversation_tags).

// Cap rígido pra evitar abuso · pacientes também usa 500.
const BULK_MAX_IDS = 500
const EXPORT_MAX_IDS = 5000

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function parseBulkIds(raw: unknown, max = BULK_MAX_IDS): string[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length === 0 || raw.length > max) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (!isUuid(v)) return null
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

// ── 11. bulkChangeLeadPhaseAction · atômica via leads_bulk_change_phase ─────

/**
 * Muda phase de N leads em lote. ATÔMICA via RPC `leads_bulk_change_phase`
 * (transação plpgsql única · phase_history automático). Reason é livre ·
 * gravado no campo phase_history.reason quando suportado.
 *
 * Transições inválidas pela matriz `_lead_phase_transition_allowed` por lead
 * são puladas pela RPC e refletidas no count de `updated` retornado.
 */
export async function bulkChangeLeadPhaseAction(
  input: { ids: string[]; toPhase: LeadPhase; reason?: string },
): Promise<ActionResult<{ updated: number; total: number }>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const ids = parseBulkIds(input?.ids)
  if (!ids) return fail(`Selecione 1-${BULK_MAX_IDS} leads válidos`)

  if (!VALID_PHASES.includes(input?.toPhase)) {
    return fail('Fase inválida · use lead, agendado, paciente ou orcamento')
  }

  // reason é opcional · RPC não obriga
  const reason = String(input?.reason ?? '').trim()
  if (reason.length > 500) return fail('Motivo longo · máximo 500 caracteres')

  const result = await repos.leads.bulkChangePhase(ids, input.toPhase)
  if (!result.ok) {
    return fail(result.error || 'Falha ao mudar fase em lote')
  }

  void ctx
  void reason // RPC atual não recebe reason · preservado pra futuro

  revalidatePath(ROUTE)
  revalidatePath('/crm/kanban')
  revalidatePath('/crm/mesa-operacional')
  revalidatePath('/crm/dashboard')
  return ok({ updated: result.updated, total: result.total })
}

// ── 12. bulkMarkLeadsLostAction · loop sequencial · partial result ──────────

/**
 * Marca N leads como perdidos via loop em `lead_lost` RPC. NÃO atômico ·
 * partial success possível. Retorna {updated, failed, total, failedIds}
 * pra UI mostrar feedback granular. Reason min 3 max 500 obrigatório.
 *
 * Cap 500 IDs. Volume operacional típico (até 50 leads em batch · ~5-10s
 * total). Se um lead já está em lifecycle perdido, RPC retorna idempotent
 * ou erro · contado em failed defensivamente.
 */
export async function bulkMarkLeadsLostAction(
  input: { ids: string[]; reason: string },
): Promise<
  ActionResult<{
    updated: number
    failed: number
    total: number
    failedIds: string[]
  }>
> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:edit')

  const ids = parseBulkIds(input?.ids)
  if (!ids) return fail(`Selecione 1-${BULK_MAX_IDS} leads válidos`)

  const reason = String(input?.reason ?? '').trim()
  if (reason.length < 3) return fail('Motivo curto · mínimo 3 caracteres')
  if (reason.length > 500) return fail('Motivo longo · máximo 500 caracteres')

  const failedIds: string[] = []
  let updated = 0

  for (const leadId of ids) {
    try {
      const r = await repos.leads.markLost(leadId, reason)
      if (r.ok) {
        updated++
      } else {
        failedIds.push(leadId)
      }
    } catch {
      failedIds.push(leadId)
    }
  }

  void ctx

  revalidatePath(ROUTE)
  revalidatePath('/crm/kanban')
  revalidatePath('/crm/mesa-operacional')
  revalidatePath('/crm/dashboard')
  revalidatePath('/crm/recuperacao')

  return ok({
    updated,
    failed: failedIds.length,
    total: ids.length,
    failedIds,
  })
}

// ── 13. exportLeadsCsvAction · read-only · CSV BOM UTF-8 ────────────────────

const EXPORT_FILTER_KEYS = [
  'q',
  'funnel',
  'phase',
  'temp',
  'source',
  'status',
  'period',
  'from',
  'to',
  'tag',
  'queixa',
  'no_resp_days',
] as const
type ExportFilterKey = (typeof EXPORT_FILTER_KEYS)[number]
type ExportFiltersInput = Partial<Record<ExportFilterKey, string>>

const EXPORT_PHASE_LABEL: Record<string, string> = {
  lead: 'Lead',
  agendado: 'Agendado',
  paciente: 'Paciente',
  orcamento: 'Orçamento',
}

const EXPORT_LIFECYCLE_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  perdido: 'Perdido',
  recuperacao: 'Em recuperação',
  arquivado: 'Arquivado',
}

const EXPORT_TEMP_LABEL: Record<string, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

function formatDateIsoForCsv(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

function formatQueixasForCsv(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.map((v) => String(v)).join(' / ')
}

function buildFilterFromInput(raw: ExportFiltersInput | undefined): ListLeadsFilter {
  if (!raw) return {}
  const f: ListLeadsFilter = {}
  if (raw.q) f.search = String(raw.q).slice(0, 200)
  if (raw.funnel && VALID_FUNNELS.includes(raw.funnel as Funnel)) f.funnel = raw.funnel as Funnel
  if (raw.phase && VALID_PHASES.includes(raw.phase as LeadPhase)) f.phase = raw.phase as LeadPhase
  if (raw.temp && VALID_TEMPS.includes(raw.temp as LeadTemperature)) f.temperature = raw.temp as LeadTemperature
  // source/source_type ficam fora do filter do repo aqui · subset minimalista.
  // status → mapeia pra excludePhases/excludeLifecycleStatuses (mesma regra de page.tsx)
  const status = raw.status || 'active'
  if (status === 'active') {
    f.excludePhases = ['paciente', 'orcamento']
    f.excludeLifecycleStatuses = ['perdido', 'arquivado']
  } else if (status === 'patient') {
    f.phases = ['paciente']
    f.excludeLifecycleStatuses = ['perdido', 'arquivado']
  } else if (status === 'archived') {
    f.lifecycleStatus = 'perdido'
  }
  return f
}

/**
 * Gera CSV server-side · BOM UTF-8 + separador `;` (Excel pt-BR).
 *
 * Modos:
 *   - input.ids → exporta apenas esses (cap 5000)
 *   - input.filters → aplica subset dos filtros da página
 *   - nenhum → exporta até 5000 leads ativos
 *
 * Read-only · zero revalidatePath. Loga count + tipo (selected vs filter).
 */
export async function exportLeadsCsvAction(
  input: { ids?: string[]; filters?: ExportFiltersInput },
): Promise<ActionResult<{ csv: string; filename: string; count: number }>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'patients:view')

  let ids: string[] | undefined
  if (input?.ids) {
    const parsed = parseBulkIds(input.ids, EXPORT_MAX_IDS)
    if (!parsed) return fail(`Lista de IDs inválida · máximo ${EXPORT_MAX_IDS}`)
    ids = parsed
  }

  const filter = ids ? undefined : buildFilterFromInput(input?.filters)
  const rows = await repos.leads.listForExport(ctx.clinic_id, {
    ids,
    filter,
    limit: EXPORT_MAX_IDS,
  })

  if (rows.length === 0) return fail('empty_export')

  const sep = ';'
  const header = [
    'Nome',
    'Telefone',
    'Email',
    'Funnel',
    'Fase',
    'Lifecycle',
    'Perdido de (lost_from_phase)',
    'Temperatura',
    'Origem',
    'Source type',
    'Score',
    'Queixas',
    'Última resposta',
    'Criado em',
    'Atualizado em',
  ]
    .map(csvEscape)
    .join(sep)

  const lines = rows.map((r: LeadExportRow) =>
    [
      r.name,
      r.phone,
      r.email,
      r.funnel,
      r.phase ? EXPORT_PHASE_LABEL[r.phase] ?? r.phase : '',
      r.lifecycle_status ? EXPORT_LIFECYCLE_LABEL[r.lifecycle_status] ?? r.lifecycle_status : '',
      r.lost_from_phase ?? '',
      r.temperature ? EXPORT_TEMP_LABEL[r.temperature] ?? r.temperature : '',
      r.source ?? '',
      r.source_type ?? '',
      r.lead_score ?? 0,
      formatQueixasForCsv(r.queixas_faciais),
      formatDateIsoForCsv(r.last_response_at),
      formatDateIsoForCsv(r.created_at),
      formatDateIsoForCsv(r.updated_at),
    ]
      .map(csvEscape)
      .join(sep),
  )

  const csv = '﻿' + header + '\n' + lines.join('\n')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `leads-export-${today}.csv`

  return ok({ csv, filename, count: rows.length })
}
