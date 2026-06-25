/**
 * Recovery Radar · service de enriquecimento por IA · Prompt 4.
 *
 * Carrega findings `open` ainda não-analisados, monta contexto por finding,
 * chama analyzeRecoveryFinding (packages/ai), e — quando dry_run=false —
 * persiste via RPC lara_recovery_finding_apply_suggestion (guards no DB).
 *
 * NÃO envia WhatsApp. NÃO altera status/evidence/priority. Humano aprova depois.
 *
 * Elegibilidade (server-side · cap duro):
 *   status='open' · suggested_action IS NULL (marca "ainda não analisado") ·
 *   priority IN (default P0/P1) · clinic_id = tenant. Limit ≤ HARD_CAP.
 */

import { createServiceRoleClient } from '@clinicai/supabase/server'
import { analyzeRecoveryFinding, type RecoveryFindingInput, type RecoverySuggestion } from '@clinicai/ai'

/** Teto absoluto de findings por request · custo IA controlado. */
export const ENRICH_HARD_CAP = 10

export interface EnrichParams {
  clinicId: string
  userId?: string
  limit?: number
  priority?: string[]
  dry_run?: boolean
  force?: boolean
}

export interface EnrichResultItem {
  finding_id: string
  suggestion?: RecoverySuggestion
  persisted: boolean
  persist_reason?: string
  error?: string
}

export interface EnrichResult {
  dry_run: boolean
  eligible: number
  processed: number
  persisted: number
  items: EnrichResultItem[]
}

interface FindingRow {
  id: string
  conversation_id: string
  lead_id: string | null
  phone: string | null
  lead_name: string | null
  failure_type: string
  all_failure_types: string[] | null
  priority: string
  recovery_score: number
  candidate_reason: string | null
  evidence: unknown
  stage_hint: string | null
}

interface MsgRow {
  direction: string | null
  sender: string | null
  content: string | null
  sent_at: string | null
}

export async function enrichRecoveryFindings(params: EnrichParams): Promise<EnrichResult> {
  const { clinicId, userId } = params
  const dryRun = params.dry_run !== false // default seguro: true
  const force = params.force === true
  const priorities = params.priority && params.priority.length > 0 ? params.priority : ['P0', 'P1']
  const limit = Math.min(Math.max(params.limit ?? 5, 1), ENRICH_HARD_CAP)

  // NOTE: lara_recovery_* ainda não estão nos types gerados (codegen) · cast pragmático
  // (mesmo precedente do packages/ai/budget.ts). Remover o cast quando regenerar os types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceRoleClient() as any

  // 1. findings elegíveis (RLS bypassada · clinic filtrada explicitamente)
  const { data: rawFindings, error: fErr } = await supabase
    .from('lara_recovery_findings')
    .select('id, conversation_id, lead_id, phone, lead_name, failure_type, all_failure_types, priority, recovery_score, candidate_reason, evidence, stage_hint')
    .eq('clinic_id', clinicId)
    .eq('status', 'open')
    .is('suggested_action', null)
    .in('priority', priorities)
    .order('priority', { ascending: true })
    .order('recovery_score', { ascending: false })
    .limit(limit)

  if (fErr) throw new Error(`findings_query_failed: ${fErr.message}`)
  const findings = (rawFindings ?? []) as FindingRow[]

  // clinic name (1 query)
  const { data: clinicRow } = await supabase.from('clinics').select('name').eq('id', clinicId).maybeSingle()
  const clinicName = (clinicRow?.name as string) ?? 'Clínica Mirian de Paula'

  const items: EnrichResultItem[] = []
  let persisted = 0

  for (const f of findings) {
    try {
      // 2. contexto por finding (mensagens, summary, lead, appointments) · TODAS clinic-safe.
      //    wa_messages/wa_conversations/leads/appointments têm clinic_id (provado · 4C).
      //    wa_messages: pega as 40 MAIS RECENTES e inverte em memória → ordem cronológica.
      const [{ data: msgs }, { data: convRow }, { data: leadRow }, { data: appts }] = await Promise.all([
        supabase
          .from('wa_messages')
          .select('direction, sender, content, sent_at')
          .eq('clinic_id', clinicId)
          .eq('conversation_id', f.conversation_id)
          .is('deleted_at', null)
          .order('sent_at', { ascending: false })
          .limit(40),
        supabase
          .from('wa_conversations')
          .select('ai_secretaria_summary')
          .eq('clinic_id', clinicId)
          .eq('id', f.conversation_id)
          .maybeSingle(),
        f.lead_id
          ? supabase.from('leads').select('phase, funnel, temperature').eq('clinic_id', clinicId).eq('id', f.lead_id).maybeSingle()
          : Promise.resolve({ data: null }),
        f.lead_id
          ? supabase
              .from('appointments')
              .select('status, scheduled_date, procedure_name')
              .eq('clinic_id', clinicId)
              .eq('lead_id', f.lead_id)
              .is('deleted_at', null)
              .order('scheduled_date', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),
      ])

      // 40 mais recentes vieram desc → inverte p/ cronológico (mais antiga em cima)
      const orderedMsgs = ((msgs ?? []) as MsgRow[]).slice().reverse()

      const input: RecoveryFindingInput = {
        finding_id: f.id,
        conversation_id: f.conversation_id,
        lead_id: f.lead_id,
        lead_name: f.lead_name,
        phone: f.phone,
        failure_type: f.failure_type,
        all_failure_types: f.all_failure_types ?? [f.failure_type],
        priority: f.priority,
        recovery_score: f.recovery_score,
        candidate_reason: f.candidate_reason,
        evidence: f.evidence,
        summary: (convRow?.ai_secretaria_summary as string) ?? null,
        lead: leadRow
          ? { phase: leadRow.phase as string, funnel: leadRow.funnel as string, temperature: leadRow.temperature as string }
          : null,
        appointments: (appts ?? []) as RecoveryFindingInput['appointments'],
        messages: orderedMsgs.map((m) => ({
          role: m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
          content: (m.content as string) || '',
          isManual: m.sender === 'humano',
          sentAt: m.sent_at as string,
        })),
        clinicName,
        isOptout: false, // findings já excluem opt-out na origem; analyzer ainda checa stop-words
      }

      // 3. IA (Haiku · budget+usage embutidos no callAnthropic)
      const suggestion = await analyzeRecoveryFinding(input, { clinicId, userId })

      // 4. persistência controlada
      let persistedThis = false
      let persistReason: string | undefined
      if (!dryRun) {
        const deadlineAt =
          suggestion.action_deadline_hours != null
            ? new Date(Date.now() + suggestion.action_deadline_hours * 3600_000).toISOString()
            : null
        const { data: applyRes, error: aErr } = await supabase.rpc('lara_recovery_finding_apply_suggestion', {
          p_finding_id: f.id,
          p_suggested_message: suggestion.suggested_message,
          p_suggested_action: suggestion.suggested_action || `[${suggestion.role}] sem mensagem`, // garante marca de "analisado"
          p_recommended_owner: suggestion.recommended_owner,
          p_action_deadline_at: deadlineAt,
          p_force: force,
        })
        if (aErr) {
          persistReason = `apply_failed: ${aErr.message}`
        } else {
          const r = applyRes as { applied?: boolean; reason?: string }
          persistedThis = r?.applied === true
          persistReason = r?.reason
          if (persistedThis) persisted++
        }
      }

      items.push({ finding_id: f.id, suggestion, persisted: persistedThis, persist_reason: persistReason })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      // BUDGET_EXCEEDED para o lote inteiro e propaga (route → 402) · NÃO muta findings.
      if (msg.startsWith('BUDGET_EXCEEDED')) throw err
      // Qualquer outro erro: isola este finding e segue os próximos.
      console.error('[recovery/enrich] finding falhou', JSON.stringify({ finding_id: f.id, error: msg }))
      items.push({ finding_id: f.id, persisted: false, error: msg })
    }
  }

  return {
    dry_run: dryRun,
    eligible: findings.length,
    processed: items.length,
    persisted,
    items,
  }
}
