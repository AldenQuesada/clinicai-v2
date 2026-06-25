/**
 * Recovery Radar · AI analyzer · Prompt 4.
 *
 * Recebe UM finding `open` do Recovery Radar (lara_recovery_findings) + contexto
 * da conversa e gera sugestão de recuperação em JSON estrito. NÃO envia nada ·
 * só sugere · humano aprova.
 *
 * Reusa:
 *  - callAnthropic (budget + usage embutidos · source 'lara.recovery_radar.enrich')
 *  - COMMERCIAL_CLINICAL_GUARDRAILS (guardrails.ts · fonte única · provados no copilot)
 *
 * Modelo: Haiku primeiro (barato) · fallback default do callAnthropic (Haiku == principal
 * aqui, então no_fallback implícito · sem segundo modelo). Output: JSON via prompt + parse.
 */

import { callAnthropic, MODELS } from './anthropic'
import { COMMERCIAL_CLINICAL_GUARDRAILS } from './guardrails'

// ── Enums permitidos (espelham o contrato do Prompt 4) ───────────────────────
export const RECOVERY_ROLES = ['SDR', 'Closer', 'Reativacao', 'Agendamento', 'PosConsulta', 'HumanoObrigatorio'] as const
export const RECOVERY_OWNERS = ['secretaria', 'closer', 'mirian', 'dr_alden', 'humano_obrigatorio'] as const
export const RECOVERY_RISK_FLAGS = [
  'optout_detected', 'medical_advice_needed', 'pricing_sensitive', 'patient_angry',
  'too_old', 'insufficient_context', 'do_not_contact', 'none',
] as const

export type RecoveryRole = (typeof RECOVERY_ROLES)[number]
export type RecoveryOwner = (typeof RECOVERY_OWNERS)[number]
export type RecoveryRiskFlag = (typeof RECOVERY_RISK_FLAGS)[number]

export interface RecoveryFindingInput {
  finding_id: string
  conversation_id: string
  lead_id?: string | null
  lead_name?: string | null
  phone?: string | null
  failure_type: string
  all_failure_types: string[]
  priority: string
  recovery_score: number
  candidate_reason?: string | null
  /** evidence jsonb da RPC de candidatos · [{at, who, excerpt}] */
  evidence?: unknown
  /** últimas mensagens da conversa (mais antiga em cima) */
  messages: Array<{ role: 'user' | 'assistant'; content: string; isManual?: boolean; sentAt?: string }>
  /** resumo da Lara, se existir (wa_conversations.ai_secretaria_summary) */
  summary?: string | null
  lead?: { phase?: string | null; funnel?: string | null; temperature?: string | null } | null
  /** agendamentos relevantes, se houver */
  appointments?: Array<{ status?: string | null; scheduled_date?: string | null; procedure_name?: string | null }>
  clinicName: string
  /** sinal de opt-out já detectado no backend (defesa extra) */
  isOptout?: boolean
}

export interface RecoverySuggestion {
  finding_id: string
  should_contact: boolean
  role: RecoveryRole
  suggested_action: string
  suggested_message: string | null
  reason: string
  risk_flags: RecoveryRiskFlag[]
  recommended_owner: RecoveryOwner
  action_deadline_hours: number | null
  confidence: number
}

/** Playbook por failure_type (FASE 3) · injetado no prompt conforme o finding. */
const FAILURE_PLAYBOOK: Record<string, string> = {
  no_human_reply:
    'Reconheca a continuidade, peca desculpa LEVE (sem exagero), retome o ponto que o paciente trouxe e termine com CTA claro.',
  late_reply:
    'Retome com agilidade, reconheca a espera de forma breve e conduza pro proximo passo concreto.',
  asked_price_no_close:
    'NAO responda so preco. Reancore em avaliacao/necessidade individual e conduza pra avaliacao ou conversa com especialista. Nunca cite valor.',
  asked_availability_no_booking:
    'Ofereca dois caminhos/horarios SE houver agenda; se nao houver agenda integrada, peca o melhor periodo e prometa encaixe humano. Pergunta de fechamento com 2 opcoes.',
  price_objection_not_handled:
    'Acolha a objecao, explique valor percebido em termos qualitativos, NUNCA invente desconto, e proponha avaliacao pra indicar o plano correto.',
  lead_interest_ignored:
    'Retome o interesse demonstrado, faca uma pergunta de avanco e de um CTA direto.',
  no_follow_up:
    'Follow-up leve, sem culpar o paciente, trazendo beneficio/continuidade do que ja foi conversado.',
  campaign_responded_not_closed:
    'O paciente respondeu uma campanha e ficou sem condução. Retome com objetividade e conduza pro proximo passo.',
  post_consult_no_followup:
    'Retome a avaliacao/proposta pos-consulta e pergunte se quer seguir com o plano.',
  no_show_recovery:
    'Acolha a ausencia sem cobranca e ofereca remarcacao simples.',
  reschedule_not_completed:
    'Ofereca retomar a agenda de forma simples, com 2 opcoes de periodo quando possivel.',
  medical_question_unhandled:
    'Pergunta clinica: NAO responda a duvida medica. role=HumanoObrigatorio, encaminhe pra avaliacao com a equipe/Dra. Mirian.',
  stop_or_optout_do_not_contact:
    'Opt-out: should_contact=false, sem mensagem. risk_flags inclui optout_detected/do_not_contact.',
}

function buildSystemPrompt(failureTypes: string[]): string {
  const relevant = Array.from(new Set(failureTypes))
    .map((ft) => FAILURE_PLAYBOOK[ft])
    .filter(Boolean)
  const playbook = relevant.length > 0 ? relevant.map((r) => `- ${r}`).join('\n') : '- Conduza com bom senso comercial, sempre dentro das regras de seguranca.'

  return `Voce e um analista de recuperacao comercial da Clinica Mirian de Paula (medicina estetica · Maringa-PR), atuando sobre o WhatsApp. Recebe UMA oportunidade perdida detectada (um "finding") e gera uma sugestao de recuperacao pra um atendente humano APROVAR. Voce NAO envia nada · so sugere.

Sua tarefa: dado o contexto, devolver UM JSON estrito com a melhor jogada de recuperacao.

${COMMERCIAL_CLINICAL_GUARDRAILS}

REGRAS DA MENSAGEM SUGERIDA (suggested_message):
- Portugues do Brasil · maximo 500 caracteres.
- Use o nome do paciente se disponivel · cite o contexto sem parecer invasivo · conduza pro proximo passo.
- Quando for agendamento, prefira pergunta de fechamento com DUAS opcoes.
- Se should_contact=false, suggested_message DEVE ser null e o "reason" explica o porque.

PLAYBOOK ESPECIFICO PARA ESTE CASO (failure_type detectado):
${playbook}

VALORES PERMITIDOS:
- role: SDR | Closer | Reativacao | Agendamento | PosConsulta | HumanoObrigatorio
- recommended_owner: secretaria | closer | mirian | dr_alden | humano_obrigatorio
- risk_flags (array · use ["none"] se nenhum): optout_detected | medical_advice_needed | pricing_sensitive | patient_angry | too_old | insufficient_context | do_not_contact | none

SAIDA · responda APENAS com JSON valido (sem texto antes/depois, sem markdown, sem crases):
{
  "finding_id": "<repita o finding_id recebido>",
  "should_contact": boolean,
  "role": "SDR|Closer|Reativacao|Agendamento|PosConsulta|HumanoObrigatorio",
  "suggested_action": "frase curta da jogada (<=160 chars)",
  "suggested_message": "mensagem pt-BR <=500 chars OU null se should_contact=false",
  "reason": "1 frase explicando a decisao",
  "risk_flags": ["none"],
  "recommended_owner": "secretaria|closer|mirian|dr_alden|humano_obrigatorio",
  "action_deadline_hours": number | null,
  "confidence": number entre 0 e 1
}`
}

function evidenceToText(evidence: unknown): string {
  if (!Array.isArray(evidence) || evidence.length === 0) return '(sem evidencia textual)'
  return evidence
    .slice(0, 6)
    .map((e) => {
      const ev = e as { at?: string; who?: string; excerpt?: string }
      return `- [${ev.who ?? 'lead'}${ev.at ? ` ${ev.at}` : ''}] ${(ev.excerpt ?? '').slice(0, 160)}`
    })
    .join('\n')
}

function buildUserPrompt(input: RecoveryFindingInput): string {
  const recentMsgs = input.messages
    .slice(-12)
    .map((m) => {
      const label = m.role === 'user' ? '[Paciente]' : m.isManual ? '[Atendente]' : '[Lara IA]'
      return `${label} ${m.content}`
    })
    .join('\n')

  const appts =
    input.appointments && input.appointments.length > 0
      ? input.appointments
          .slice(0, 5)
          .map((a) => `- ${a.status ?? '?'} · ${a.scheduled_date ?? '?'}${a.procedure_name ? ` · ${a.procedure_name}` : ''}`)
          .join('\n')
      : '(sem agendamentos)'

  return [
    `finding_id: ${input.finding_id}`,
    `clinica: ${input.clinicName}`,
    `failure_type (principal): ${input.failure_type}`,
    `all_failure_types: ${input.all_failure_types.join(', ') || input.failure_type}`,
    `priority: ${input.priority} · recovery_score: ${input.recovery_score}`,
    input.candidate_reason ? `motivo detectado: ${input.candidate_reason}` : '',
    input.isOptout ? 'ATENCAO: backend sinalizou OPT-OUT · should_contact deve ser false.' : '',
    '',
    'LEAD:',
    `- Nome: ${input.lead_name || 'desconhecido'}`,
    `- Fase: ${input.lead?.phase || 'novo'} · Funil: ${input.lead?.funnel || 'geral'} · Temperatura: ${input.lead?.temperature || 'n/d'}`,
    '',
    'RESUMO DA LARA:',
    input.summary ? input.summary.slice(0, 600) : '(sem resumo)',
    '',
    'EVIDENCIA (mensagens-chave que dispararam o finding):',
    evidenceToText(input.evidence),
    '',
    'AGENDAMENTOS:',
    appts,
    '',
    'ULTIMAS MENSAGENS (mais antigas em cima):',
    recentMsgs || '(nenhuma mensagem)',
  ]
    .filter(Boolean)
    .join('\n')
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * Validação DETERMINÍSTICA de conteúdo proibido na suggested_message (defesa em
 * profundidade · independe do modelo). Retorna o motivo + a flag de risco mais
 * adequada quando viola um guardrail; null se a mensagem está limpa.
 *
 * Categorias bloqueadas: preço/cifra/desconto/promo · linguagem absoluta (100%/
 * garantir) · promessa de resultado · conduta/diagnóstico médico.
 */
function violatesGuardrails(message: string): { flag: RecoveryRiskFlag; category: string } | null {
  const m = message.toLowerCase()
  // preço / desconto / promoção / parcelamento / cifra
  if (/r\$|reais|pre[çc]o|\bvalor\b|custa|or[çc]amento|investimento|desconto|promo|parcel|cashback|\bpix\b/.test(m)) {
    return { flag: 'pricing_sensitive', category: 'preco/desconto/promo' }
  }
  // linguagem absoluta · 100% / garantir / garantia / garantido
  if (/100\s*%|garant(ir|ia|ido|imos|e)\b/.test(m)) {
    return { flag: 'medical_advice_needed', category: 'linguagem absoluta (100%/garantir)' }
  }
  // promessa de resultado
  if (/vai resolver|resultado garantido|fica perfeito|resolve tudo|sem risco/.test(m)) {
    return { flag: 'medical_advice_needed', category: 'promessa de resultado' }
  }
  // conduta / diagnóstico / prescrição médica
  if (/diagn[oó]stic|prescri|receit(a|ar)|medicament|posologia|dosagem|\bdose\b/.test(m)) {
    return { flag: 'medical_advice_needed', category: 'conduta/diagnostico medico' }
  }
  return null
}

function parseRecovery(raw: string, input: RecoveryFindingInput): RecoverySuggestion {
  let text = raw.trim()
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) text = text.slice(first, last + 1)
  const p = JSON.parse(text) as Partial<RecoverySuggestion>

  // risk_flags · normaliza pro enum permitido
  const rawFlags = Array.isArray(p.risk_flags) ? p.risk_flags : []
  const flagSet = new Set<RecoveryRiskFlag>(
    rawFlags.filter((f): f is RecoveryRiskFlag => (RECOVERY_RISK_FLAGS as readonly string[]).includes(f as string)),
  )

  // Enforcement de opt-out (defesa em profundidade · independe do modelo)
  const optoutSignal = !!input.isOptout || flagSet.has('optout_detected') || flagSet.has('do_not_contact')

  let should_contact = typeof p.should_contact === 'boolean' ? p.should_contact : false
  if (optoutSignal) should_contact = false

  let suggested_message: string | null =
    typeof p.suggested_message === 'string' && p.suggested_message.trim().length > 0
      ? p.suggested_message.trim().slice(0, 500)
      : null
  // should_contact=false ⇒ sem mensagem
  if (!should_contact) suggested_message = null

  let reason = typeof p.reason === 'string' ? p.reason.slice(0, 300) : ''

  // VALIDAÇÃO DE CONTEÚDO PROIBIDO · se a mensagem viola guardrail, zera e bloqueia.
  if (suggested_message) {
    const violation = violatesGuardrails(suggested_message)
    if (violation) {
      should_contact = false
      suggested_message = null
      flagSet.add(violation.flag)
      reason = `bloqueado por guardrail (${violation.category}); requer revisão humana. ${reason}`.slice(0, 300)
    }
  }

  // Resolve role/owner; medical enforcement DETERMINÍSTICO depois.
  let role = coerceEnum<RecoveryRole>(p.role, RECOVERY_ROLES, optoutSignal ? 'HumanoObrigatorio' : 'SDR')
  let recommended_owner = coerceEnum<RecoveryOwner>(p.recommended_owner, RECOVERY_OWNERS, 'secretaria')

  // ENFORCEMENT MÉDICO · medical_advice_needed força handoff humano (não SDR/Closer).
  if (flagSet.has('medical_advice_needed')) {
    role = 'HumanoObrigatorio'
    recommended_owner = 'humano_obrigatorio'
  }

  let risk_flags = Array.from(flagSet)
  if (risk_flags.length === 0) risk_flags = ['none']

  return {
    finding_id: input.finding_id, // sempre o real · ignora o que o modelo devolveu
    should_contact,
    role,
    suggested_action: typeof p.suggested_action === 'string' ? p.suggested_action.slice(0, 200) : '',
    suggested_message,
    reason,
    risk_flags,
    recommended_owner,
    action_deadline_hours:
      typeof p.action_deadline_hours === 'number' && p.action_deadline_hours >= 0
        ? Math.min(p.action_deadline_hours, 24 * 14)
        : null,
    confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
  }
}

/**
 * Analisa UM finding e gera a sugestão de recuperação.
 * Throws 'BUDGET_EXCEEDED · ...' se estourar o budget (caller trata → 402).
 */
export async function analyzeRecoveryFinding(
  input: RecoveryFindingInput,
  opts?: { clinicId: string; userId?: string },
): Promise<RecoverySuggestion> {
  const raw = await callAnthropic({
    clinic_id: opts?.clinicId ?? '',
    user_id: opts?.userId,
    source: 'lara.recovery_radar.enrich',
    model: MODELS.HAIKU, // barato primeiro
    no_fallback: true, // Haiku já é o mais barato · não escala custo no fallback
    max_tokens: 700,
    temperature: 0.3,
    system: buildSystemPrompt([input.failure_type, ...input.all_failure_types]),
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  })
  return parseRecovery(raw, input)
}
