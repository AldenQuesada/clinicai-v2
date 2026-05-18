/**
 * DTOs camelCase devolvidos pelos repositories. Espelham schemas SQL com
 * naming convertido pra TS-friendly (snake_case fica preso em src/, callers
 * so veem camelCase) · ADR-005 boundary.
 */

import type {
  AppointmentConsentImg,
  AppointmentPaymentStatus,
  AppointmentStatus,
  ConversationStatus,
  DedupHitKind,
  Funnel,
  LeadChannelMode,
  LeadPhase,
  LeadPriority,
  LeadSource,
  LeadSourceType,
  LeadTemperature,
  LifecycleStatus,
  MessageDirection,
  OrcamentoStatus,
  PatientSex,
  PatientStatus,
  PhaseOrigin,
  PulseBehavior,
  ResponseColor,
} from './enums'

/**
 * LeadDTO · espelho 1:1 do schema canonico mig 60. Phase tipada como
 * LeadPhase (era `string` solto) · narrowing seguro em consumidores.
 *
 * Camada 4 audit (2026-04-28): expandido de 14 → 30 colunas pra cobrir
 * o schema completo. Callers existentes (Lara, Mira) continuam compativeis
 * porque so consomem o subset original; novos campos sao opcional/nullable.
 */
export interface LeadDTO {
  id: string
  clinicId: string

  // Identidade
  name: string | null
  phone: string
  email: string | null
  cpf: string | null
  rg: string | null
  birthDate: string | null
  idade: number | null

  // State machine
  phase: LeadPhase
  phaseUpdatedAt: string | null
  phaseUpdatedBy: string | null
  phaseOrigin: PhaseOrigin | null

  /**
   * Status do ciclo de vida do lead · ortogonal a `phase`.
   * - ativo: lead operacional (default)
   * - perdido: marcado via RPC lead_lost (não é phase desde Fase 1C)
   * - recuperacao: candidato a campanha de recuperação
   * - arquivado: removido da listagem operacional sem soft-delete
   *
   * Fase 1E (2026-05-11): mapeado no DTO + filtrável em ListLeadsFilter.
   */
  lifecycleStatus: LifecycleStatus

  // Funil + roteamento
  source: LeadSource
  sourceType: LeadSourceType
  sourceQuizId: string | null
  funnel: Funnel
  aiPersona: string
  temperature: LeadTemperature
  priority: LeadPriority
  leadScore: number
  dayBucket: number | null
  channelMode: LeadChannelMode

  // Atribuicao
  assignedTo: string | null

  // Recovery / perdido
  isInRecovery: boolean
  lostReason: string | null
  lostAt: string | null
  lostBy: string | null

  // Payload Lara
  queixasFaciais: string[]
  /** Tags · campo legado mantido pra compat (na mig 60 tags nao existe; vem de Lara) */
  tags: string[]
  metadata: Record<string, unknown>

  // WhatsApp
  waOptIn: boolean
  lastContactedAt: string | null
  lastResponseAt: string | null

  // Timestamps
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ConversationDTO {
  id: string
  clinicId: string
  phone: string
  leadId: string | null
  displayName: string | null
  status: ConversationStatus
  aiEnabled: boolean
  aiPausedUntil: string | null
  pausedBy: string | null
  remoteJid: string | null
  reactivationSent: boolean
  lastMessageAt: string | null
  lastMessageText: string | null
  lastLeadMsg: string | null
  createdAt: string
  /**
   * FK pra wa_numbers.id (mig 800-49) · permite resolver credenciais Cloud API
   * per-tenant via createWhatsAppCloudFromWaNumber. Quando NULL, callers caem
   * em fallback de env global (deprecated em multi-tenant ADR-028).
   *
   * BUG LATENTE descoberto na auditoria Camada 3 (2026-04-28): callers da Lara
   * usavam `(conv as any).waNumberId` esperando o campo aqui · `mapConversationRow`
   * nao retornava. Resultado: blindagem N7 da Lara nunca funcionou de verdade ·
   * sempre caia em env global. Camada 3.5 fixa.
   */
  waNumberId: string | null
  /**
   * P-12 multi-atendente · profile id atribuido a esta conversa.
   * Soft-lock visual · null quando nao atribuida. Mig 87.
   */
  assignedTo: string | null
  /** P-12 · timestamp do ultimo assign · null quando unassigned. */
  assignedAt: string | null
  /**
   * Mig 91 · qual inbox alimenta esta conversa.
   *  - 'sdr'        · Lara · /conversas
   *  - 'secretaria' · clinic · /secretaria
   *
   * Cache denormalizado do wa_numbers.inbox_role (sync via trigger). Quando
   * waNumberId e null (legacy/Evolution), default 'sdr'.
   */
  inboxRole: 'sdr' | 'secretaria'
  /**
   * Mig 001/136 · discriminador de contexto · denorm de
   * wa_numbers.default_context_type sincronizado pelo trigger
   * fn_wa_conversations_inbox_role_sync.
   * Valores conhecidos: 'lara_sdr' · 'lara_beneficiary' · 'secretaria_patient' ·
   * 'secretaria_general' · 'mira_b2b' · 'mira_admin'. Tipado como string
   * pra tolerar valores futuros sem breaking change.
   * NULL pra rows pré mig 001 (improvável em prod).
   */
  contextType: string | null
  /**
   * Mig 91 · timestamp do handoff Lara→Secretaria (NULL = sem handoff).
   * Quando preenchido: Lara pausada 30d, secretaria notificada via inbox.
   */
  handoffToSecretariaAt: string | null
  /**
   * Mig 91 · profile que disparou o handoff manual (botao no painel).
   * NULL quando IA decidiu via tag [ACIONAR_HUMANO:secretaria] no webhook.
   */
  handoffToSecretariaBy: string | null
  // ── SLA · performance da secretaria (computado por sla.ts) ────────────────
  // Single source of truth pra contador "Aguardando" + filtro tab + badge ⏱.
  // Computados pelo repository com base em wa_conversations.last_lead_msg
  // + MAX(wa_messages.sent_at) WHERE sender='humano' AND status≠'note'.
  /** Alias canônico de lastLeadMsg · ISO da última msg do paciente */
  lastPatientMsgAt: string | null
  /** ISO da última resposta humana válida · null se nenhuma até agora */
  lastHumanReplyAt: string | null
  /** Conteúdo da última resposta humana válida · null se nenhuma. Usado pra
      detectar promessa de retorno (KPI Retorno · isReturnPending) sem
      reabrir wa_messages no client. */
  lastHumanReplyText: string | null
  /** Paciente esperando resposta humana neste momento */
  waitingHumanResponse: boolean
  /** Minutos desde lastPatientMsgAt · null se !waiting */
  minutesWaiting: number | null
  /** Cor pra renderizar no badge · UI mapeia direto, não recalcula regra */
  responseColor: ResponseColor
  /** Se badge deve pulsar (true só pra amarelo, vermelho, critico) */
  shouldPulse: boolean
  /** Intensidade do pulso · 'none' | 'suave' | 'forte' */
  pulseBehavior: PulseBehavior
}

/**
 * Patient (paciente ativo). UUID compartilhado com leads.id (modelo
 * excludente). Linha aqui implica leads.deleted_at IS NOT NULL.
 */
export interface PatientDTO {
  id: string
  clinicId: string
  name: string
  phone: string
  email: string | null
  cpf: string | null
  rg: string | null
  birthDate: string | null
  sex: PatientSex | null
  /** Endereco serializado · shape decidido pela UI */
  addressJson: Record<string, unknown> | null
  status: PatientStatus
  assignedTo: string | null
  notes: string | null
  totalProcedures: number
  totalRevenue: number
  firstProcedureAt: string | null
  lastProcedureAt: string | null
  /**
   * Timestamp histórico em que o lead foi promovido para patient
   * (legacy: marcava transição lead.phase=compareceu, agora preservado como
   * snapshot do `leads.phase_updated_at` no momento do `lead_to_paciente`).
   */
  sourceLeadPhaseAt: string | null
  /** Snapshot do lead.metadata + source/funnel no momento da promocao · imutavel */
  sourceLeadMeta: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Appointment com schema canonico v2 (mig 62). Subject dual: leadId OU
 * patientId (chk_appt_subject_xor garante exatamente um · exceto bloqueado).
 */
export interface AppointmentDTO {
  id: string
  clinicId: string
  leadId: string | null
  patientId: string | null
  /** Snapshot imutavel do nome no momento da criacao */
  subjectName: string
  subjectPhone: string | null
  professionalId: string | null
  professionalName: string
  /**
   * Legado index-based. Preservado para backward-compat até backfill em Round 5
   * (parity-r5-backfills) e freeze em Round 7. Use `roomId` (FK canônica) para
   * código novo.
   */
  roomIdx: number | null
  /**
   * CRM_PARITY_R1 (mig 190) · FK canônica para `clinic_rooms(id)`.
   * `null` durante deprecation period · backfill em Round 5.
   */
  roomId: string | null
  /** YYYY-MM-DD */
  scheduledDate: string
  /** HH:MM:SS */
  startTime: string
  endTime: string
  /**
   * FK canônica → `clinic_procedimentos.id` (mig 182).
   * `null` = appointment legado/manual sem vínculo · UI usa `procedureName`
   * como snapshot textual.
   */
  procedureId: string | null
  /**
   * Snapshot textual do nome do procedimento no momento da gravação.
   * Mantido em paralelo a `procedureId` para compat com appointments legados
   * (criados antes da mig 182 ou em modo "Outro/manual").
   */
  procedureName: string
  consultType: string | null
  evalType: string | null
  value: number
  paymentMethod: string | null
  paymentStatus: AppointmentPaymentStatus
  status: AppointmentStatus
  origem: string | null
  chegadaEm: string | null
  canceladoEm: string | null
  motivoCancelamento: string | null
  noShowEm: string | null
  motivoNoShow: string | null
  consentimentoImg: AppointmentConsentImg
  obs: string | null
  recurrenceGroupId: string | null
  recurrenceIndex: number | null
  recurrenceTotal: number | null
  recurrenceProcedure: string | null
  recurrenceIntervalDays: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Item dentro de orcamentos.items[]. Shape contratado em mig 63 · validado
 * pela UI/Server Action antes do INSERT (CHECK so garante array typeof).
 */
export interface OrcamentoItem {
  name: string
  qty: number
  unitPrice: number
  subtotal: number
  procedureCode?: string | null
}

/**
 * Pagamento dentro de orcamentos.payments[]. Shape solto · adicionado por
 * relatorios financeiros futuros. Campos abaixo sao convencao, nao gate DB.
 */
export interface OrcamentoPayment {
  date?: string
  method?: string
  amount?: number
  reference?: string
  [k: string]: unknown
}

/**
 * Orcamento clinico (NAO confundir com BudgetRepository · cost control IA).
 * Subject dual igual appointments. Total = subtotal - discount (CHECK
 * chk_orc_total_consistency garante coerencia).
 */
export interface OrcamentoDTO {
  id: string
  clinicId: string
  leadId: string | null
  patientId: string | null
  number: string | null
  title: string | null
  notes: string | null
  items: OrcamentoItem[]
  subtotal: number
  discount: number
  total: number
  status: OrcamentoStatus
  sentAt: string | null
  viewedAt: string | null
  approvedAt: string | null
  lostAt: string | null
  lostReason: string | null
  validUntil: string | null
  payments: OrcamentoPayment[]
  shareToken: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Audit trail imutavel de transicoes phase. UPDATE/DELETE proibidos via RLS
 * (so service_role) · repository expoe SO leitura + insert append-only.
 */
export interface PhaseHistoryDTO {
  id: string
  clinicId: string
  leadId: string | null
  fromPhase: LeadPhase | null
  fromStatus: string | null
  toPhase: LeadPhase
  toStatus: string | null
  origin: PhaseOrigin
  triggeredBy: string | null
  actorId: string | null
  reason: string | null
  createdAt: string
}

export interface MessageDTO {
  id: string
  clinicId: string
  conversationId: string
  phone: string | null
  direction: MessageDirection
  sender: string
  content: string
  contentType: string
  mediaUrl: string | null
  status: string
  sentAt: string
  /** Sprint C · SC-03 (W-11) · nota interna entre atendentes (nao envia ao paciente) */
  internalNote?: boolean
  /** Sprint C · SC-01 (W-06) · status do envio: sent | delivered | read | failed */
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed' | null
  /**
   * Audit 2026-05-06 · uuid do template em b2b_comm_templates que renderizou
   * a mensagem (quando aplicavel · null pra mensagens livres). Usado pelo
   * dash pra rotular B2B/voucher (label "Mira · Voucher" via whitelist de
   * template_ids de voucher).
   */
  templateId?: string | null
  /**
   * Mig 143 (2026-05-07) · provider_msg_id da mensagem original respondida
   * via quoted reply. Cobre Cloud wamid e Evolution/Baileys key.id (mesmo
   * campo que `provider_msg_id` da mensagem alvo). NULL pra mensagens sem
   * reply. Habilita timeline de resposta · UI mostra "respondendo a..."
   * resolvendo target via lookup local.
   */
  replyToProviderMsgId?: string | null
  /**
   * Provider id (wamid Cloud · key.id Evolution) da própria mensagem.
   * Exposto no DTO pra UI/backend de quoted reply localizarem o alvo via
   * `wa_messages.provider_msg_id`. Não é secret · é o id público que o
   * provider devolve no send/receive.
   */
  providerMsgId?: string | null
  /**
   * Mig 144 (2026-05-07) · payload normalizado pra mensagens ricas
   * (contact, location, reaction, sticker, forward, poll). Shape mínimo
   * com discriminator `kind` · NUNCA payload bruto do provider. Null pra
   * mensagens de texto/mídia simples (continuam usando content + media_url).
   * Tipo `unknown` aqui · validação final fica no consumer (ex: UI faz
   * type-guard `kind === 'contact'`).
   */
  payload?: unknown | null
  /**
   * React A (2026-05-07) · emoji da última reação aplicada à mensagem.
   * Coluna `wa_messages.reaction` (text · existe desde mig legacy 90+).
   * UPDATE in-place quando atendente reage · NULL quando reação é removida.
   * Cobre apenas a reação CORRENTE · histórico não é preservado neste MVP.
   */
  reaction?: string | null
}

export interface TemplateDTO {
  id: string
  clinicId: string
  name: string
  /** Slug snake-case · trigger pra quick-templates dropdown (ex: `/olheiras`) */
  slug: string | null
  message: string | null
  content: string | null
  category: string | null
  triggerPhase: string | null
  /** Tipo legacy clinic-dashboard · 8 valores · controla cor/icone da timeline */
  type: string | null
  /** Dia relativo a consulta · -7 (7d antes) · 0 (mesmo dia) · +30 (30d depois) */
  day: number | null
  active: boolean
  isActive: boolean
  sortOrder: number | null
  createdAt: string
}

export interface BudgetDayDTO {
  dayBucket: string
  costUsd: number
}

export interface ClinicDataValue<T = unknown> {
  clinicId: string
  key: string
  value: T
  updatedAt: string | null
}

/**
 * Resultado da varredura cross-tabela `LeadRepository.findInAnySystem`.
 *
 * `kind` segue ordem de relevancia (mais forte → mais fraco):
 *   patient            → leads.phase = 'patient' (ja virou paciente real)
 *   lead               → leads (qualquer phase != patient)
 *   voucher_recipient  → b2b_vouchers.recipient_phone (ja recebeu voucher antes)
 *   partner_referral   → b2b_attributions via lead_id (ja foi indicada via outra parceira)
 *
 * Usado pelo handler `b2b-emit-voucher` pra bloquear emissao duplicada.
 * Mensagem formatada construida em `formatDedupReply` (apps/mira).
 */
export interface DedupHit {
  kind: DedupHitKind
  id: string
  name: string | null
  phone: string
  /** ISO date · usada pra formatar "Set/24" no reply */
  since: string
  /** Nome da parceria origem · disponivel em voucher_recipient e partner_referral */
  partnershipName?: string | null
}
