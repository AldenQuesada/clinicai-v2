/**
 * Schemas Zod pra appointments. Cobre create direto + RPC wrappers
 * (attend, finalize) + CRUD (update, cancel, no-show).
 */

import { z } from 'zod'
import { OrcamentoItemSchema } from './lead.schemas'

// ── Enums (espelham CHECK constraints mig 62) ───────────────────────────────

// CRM_PHASE_2H.1 cleanup (2026-05-12): `pre_consulta` e `em_consulta` removidos
// (nunca foram canônicos no DB · zumbis da iteração inicial).
const AppointmentStatus = z.enum([
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'aguardando',
  'na_clinica',
  'em_atendimento',
  'finalizado',
  'remarcado',
  'cancelado',
  'no_show',
  'bloqueado',
])

// BLOCO 2.4 · alinhado com contrato real do banco (mig 152 ·
// chk_appt_payment_status). `cortesia` é distinta de `isento`:
//   - cortesia: atendimento gratuito intencional · exige motivo
//   - isento: paciente fora de cobrança (convênio, parceria fechada)
const AppointmentPaymentStatus = z.enum([
  'pendente',
  'parcial',
  'pago',
  'cortesia',
  'isento',
])

const AppointmentConsentImg = z.enum([
  'pendente',
  'assinado',
  'recusado',
  'nao_aplica',
])

// CRM_PHASE_2J: alinhado 1:1 com RPC banco (4 outcomes).
// PATCH_0C_FINALIZE_BACKEND_GUARD (2026-05-17):
// Zod restringe a 3 outcomes clinicos · 'perdido' bloqueado no runtime.
// Path comercial via lead_lost RPC dedicado (markLeadLostAction)
// usa Zod separado · NAO reusa AppointmentFinalizeOutcome.
const AppointmentFinalizeOutcome = z.enum([
  'paciente',
  'orcamento',
  'paciente_orcamento',
])

const TimeStr = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Esperado HH:MM ou HH:MM:SS')
const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD')

// ── CRM_PARITY_R2 · procedure items + payment items (multi) ────────────────
//
// `appointment_procedure_items` (mig 193) · uma linha por procedimento
// agendado. Paridade com legacy `_apptProcs[]`. Court esia: net_amount=0 e
// courtesyReason obrigatorio (≥3 chars).
//
// `appointment_payments` (mig 194) · uma linha por pagamento. 10 formas
// canônicas. Status pendente/pago/cancelado.
//
// Tolerância de centavo (0.01) espelha CHECK constraints DB.

const APPOINTMENT_PAYMENT_METHOD_CANON = z.enum([
  'pix',
  'dinheiro',
  'debito',
  'credito',
  'parcelado',
  'entrada_saldo',
  'boleto',
  'link',
  'cortesia',
  'convenio',
])

const APPOINTMENT_PAYMENT_ROW_STATUS = z.enum([
  'pendente',
  'pago',
  'cancelado',
])

export const AppointmentProcedureItemInputSchema = z
  .object({
    procedureId: z.string().uuid().nullable().optional(),
    procedureName: z.string().min(2, 'Procedimento exige nome ≥ 2 chars').max(200),
    quantity: z.number().int().positive().default(1),
    unitPrice: z.number().nonnegative().default(0),
    grossAmount: z.number().nonnegative().optional(),
    discountAmount: z.number().nonnegative().default(0),
    netAmount: z.number().nonnegative().optional(),
    isCourtesy: z.boolean().default(false),
    courtesyReason: z.string().max(500).nullable().optional(),
    isReturn: z.boolean().default(false),
    returnIntervalDays: z.number().int().positive().nullable().optional(),
    sortOrder: z.number().int().nonnegative().default(0),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (v) => {
      // courtesy exige motivo ≥ 3 chars
      if (v.isCourtesy) {
        return !!v.courtesyReason && v.courtesyReason.trim().length >= 3
      }
      return true
    },
    {
      message: 'courtesyReason obrigatório (≥ 3 chars) quando isCourtesy=true',
      path: ['courtesyReason'],
    },
  )
  .refine(
    (v) => {
      // return exige intervalo
      if (v.isReturn) {
        return v.returnIntervalDays != null && v.returnIntervalDays > 0
      }
      return true
    },
    {
      message: 'returnIntervalDays obrigatório (> 0) quando isReturn=true',
      path: ['returnIntervalDays'],
    },
  )
  .refine(
    (v) => {
      // discount ≤ gross (tolerância 0.01)
      const gross = v.grossAmount ?? v.unitPrice * v.quantity
      const discount = v.discountAmount ?? 0
      return discount <= gross + 0.01
    },
    {
      message: 'discountAmount não pode exceder grossAmount',
      path: ['discountAmount'],
    },
  )
  .refine(
    (v) => {
      // courtesy → net=0 (defensivo · DB força via CHECK)
      if (v.isCourtesy && v.netAmount != null) {
        return v.netAmount === 0
      }
      return true
    },
    {
      message: 'netAmount deve ser 0 quando isCourtesy=true',
      path: ['netAmount'],
    },
  )
  .refine(
    (v) => {
      // net = gross - discount (tolerância 0.01) · só valida se net foi enviado
      if (v.netAmount == null) return true
      if (v.isCourtesy) return true // courtesy ignora regra
      const gross = v.grossAmount ?? v.unitPrice * v.quantity
      const discount = v.discountAmount ?? 0
      const expected = Math.max(0, gross - discount)
      return Math.abs(v.netAmount - expected) <= 0.01
    },
    {
      message: 'netAmount deve ser grossAmount - discountAmount (tolerância 0.01)',
      path: ['netAmount'],
    },
  )

export type AppointmentProcedureItemInput = z.infer<
  typeof AppointmentProcedureItemInputSchema
>

export const AppointmentPaymentInputSchema = z.object({
  paymentMethod: APPOINTMENT_PAYMENT_METHOD_CANON,
  amount: z.number().positive('amount deve ser > 0'),
  installments: z.number().int().positive().nullable().optional(),
  dueDate: DateStr.nullable().optional(),
  paidAt: z.string().datetime().nullable().optional(),
  status: APPOINTMENT_PAYMENT_ROW_STATUS.default('pendente'),
  notes: z.string().max(1000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type AppointmentPaymentInput = z.infer<
  typeof AppointmentPaymentInputSchema
>

// Helpers compartilhados pelas refines de Create/Update.
function sumItemsNet(items: AppointmentProcedureItemInput[] | undefined): number {
  if (!items || items.length === 0) return 0
  let totalCents = 0
  for (const it of items) {
    if (it.isCourtesy) continue // net=0
    const gross = it.grossAmount ?? it.unitPrice * it.quantity
    const discount = it.discountAmount ?? 0
    const net = it.netAmount ?? Math.max(0, gross - discount)
    totalCents += Math.round(net * 100)
  }
  return totalCents / 100
}

function sumPayments(
  payments: AppointmentPaymentInput[] | undefined,
  statuses: ReadonlyArray<'pendente' | 'pago' | 'cancelado'>,
): number {
  if (!payments || payments.length === 0) return 0
  let totalCents = 0
  for (const p of payments) {
    if (!statuses.includes(p.status)) continue
    totalCents += Math.round(p.amount * 100)
  }
  return totalCents / 100
}

function hasCourtesyItem(items: AppointmentProcedureItemInput[] | undefined): boolean {
  return !!items && items.some((i) => i.isCourtesy === true)
}

// ── Create direto (paciente recorrente · sem passar por lead) ───────────────
//
// Pra criar appointment NOVO de um lead, prefira ScheduleAppointmentSchema
// (lead.actions.ts → scheduleAppointmentAction) que faz a transacao atomica
// de phase. Esse schema aqui e pra paciente ja existente OU bloqueio de slot.

export const CreateAppointmentSchema = z
  .object({
    leadId: z.string().uuid().nullable().optional(),
    patientId: z.string().uuid().nullable().optional(),
    subjectName: z.string().max(120),
    subjectPhone: z.string().max(20).nullable().optional(),
    professionalId: z.string().uuid().nullable().optional(),
    professionalName: z.string().max(120).optional(),
    // CRM_PARITY_R1 (mig 190) · FK opcional para `clinic_rooms`. UI envia
    // quando user escolhe sala no Step 2. Server action também valida que o
    // room_id pertence à clinic (RLS faz isso · este Zod só checa formato).
    roomId: z.string().uuid().nullable().optional(),
    scheduledDate: DateStr,
    startTime: TimeStr,
    endTime: TimeStr,
    // CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE (mig 182): vínculo canônico
    // opcional. UI nova envia procedureId quando user selecionar do catálogo.
    // procedureName continua sendo gravado como snapshot.
    procedureId: z.string().uuid().nullable().optional(),
    procedureName: z.string().max(200).optional(),
    consultType: z.string().max(50).nullable().optional(),
    evalType: z.string().max(50).nullable().optional(),
    value: z.number().nonnegative().optional(),
    // CRM_PARITY_PATCH_0A · texto livre (sem enum no DB · contrato legado).
    // UI valida contra PAYMENT_METHODS canônico mas DB aceita qualquer string.
    paymentMethod: z.string().max(50).nullable().optional(),
    paymentStatus: AppointmentPaymentStatus.optional(),
    status: AppointmentStatus.optional(),
    origem: z.string().max(50).nullable().optional(),
    obs: z.string().max(2000).nullable().optional(),
    consentimentoImg: AppointmentConsentImg.optional(),
    recurrenceGroupId: z.string().uuid().nullable().optional(),
    recurrenceIndex: z.number().int().positive().nullable().optional(),
    recurrenceTotal: z.number().int().positive().nullable().optional(),
    recurrenceProcedure: z.string().max(200).nullable().optional(),
    recurrenceIntervalDays: z.number().int().positive().nullable().optional(),
    // CRM_PARITY_R2 · multi-procedimento (mig 193) + multi-pagamento (mig 194).
    // Quando ausentes, action faz fallback pra campos legacy single (value +
    // paymentMethod) · dual-write em ambos modos durante migração.
    procedureItems: z.array(AppointmentProcedureItemInputSchema).optional(),
    payments: z.array(AppointmentPaymentInputSchema).optional(),
  })
  .refine(
    (v) => {
      // Modelo excludente forte (chk_appt_subject_xor da mig 62)
      const status = v.status ?? 'agendado'
      if (status === 'bloqueado') {
        return v.leadId == null && v.patientId == null
      }
      const subjects = (v.leadId ? 1 : 0) + (v.patientId ? 1 : 0)
      return subjects === 1
    },
    {
      message:
        'Deve setar EXATAMENTE um de leadId/patientId (ou nenhum se status=bloqueado)',
      path: ['leadId'],
    },
  )
  // CRM_PARITY_R2 · validação cruzada items × payments × paymentStatus.
  .refine(
    (v) => {
      // Block-time não tem procedimento/pagamento.
      if (v.status === 'bloqueado') {
        return (
          (!v.procedureItems || v.procedureItems.length === 0) &&
          (!v.payments || v.payments.length === 0)
        )
      }
      return true
    },
    {
      message: 'status=bloqueado não aceita procedureItems nem payments',
      path: ['procedureItems'],
    },
  )
  .refine(
    (v) => {
      // Soma de payments (pago+pendente) não pode exceder net (tolerância 0.01).
      if (!v.payments || v.payments.length === 0) return true
      if (!v.procedureItems || v.procedureItems.length === 0) {
        // Sem items · fallback no value legacy se presente.
        const net = v.value ?? 0
        if (net === 0) return true // permite pagamento contra valor legacy não informado
        const total = sumPayments(v.payments, ['pago', 'pendente'])
        return total <= net + 0.01
      }
      const net = sumItemsNet(v.procedureItems)
      const total = sumPayments(v.payments, ['pago', 'pendente'])
      return total <= net + 0.01
    },
    {
      message: 'Soma de pagamentos (pago+pendente) excede netTotal dos procedimentos',
      path: ['payments'],
    },
  )
  .refine(
    (v) => {
      // Se paymentStatus=pago no header, soma de payments status=pago precisa
      // cobrir o net (tolerância 0.01).
      if (v.paymentStatus !== 'pago') return true
      const net = v.procedureItems && v.procedureItems.length > 0
        ? sumItemsNet(v.procedureItems)
        : v.value ?? 0
      if (net === 0) return true
      const paid = sumPayments(v.payments, ['pago'])
      return paid + 0.01 >= net
    },
    {
      message:
        'paymentStatus=pago exige soma de payments status=pago >= netTotal',
      path: ['paymentStatus'],
    },
  )
  .refine(
    (v) => {
      // paymentStatus=cortesia exige ter ao menos um item courtesy + net=0.
      if (v.paymentStatus !== 'cortesia') return true
      // Se enviou items, precisa ter courtesy E net=0.
      if (v.procedureItems && v.procedureItems.length > 0) {
        const net = sumItemsNet(v.procedureItems)
        return hasCourtesyItem(v.procedureItems) && net === 0
      }
      // Sem items · respeita value=0 (já validado via outro refine antigo).
      return v.value == null || v.value === 0
    },
    {
      message:
        'paymentStatus=cortesia exige item is_courtesy=true com netTotal=0',
      path: ['paymentStatus'],
    },
  )
  // CRM_PHASE_2AUX: validações operacionais reforçadas
  .refine(
    (v) => {
      // Duração: end > start (mesmo dia)
      return v.endTime > v.startTime
    },
    {
      message: 'Horário final deve ser maior que o inicial',
      path: ['endTime'],
    },
  )
  .refine(
    (v) => {
      // Duração mínima 15min, máxima 4h (240min)
      const [sh, sm] = v.startTime.split(':').map((s) => parseInt(s, 10))
      const [eh, em] = v.endTime.split(':').map((s) => parseInt(s, 10))
      const durMin = eh * 60 + em - (sh * 60 + sm)
      return durMin >= 15 && durMin <= 240
    },
    {
      message: 'Duração deve estar entre 15 minutos e 4 horas',
      path: ['endTime'],
    },
  )
  .refine(
    (v) => {
      // Data não pode ser passada (hoje OK · ontem ou antes não)
      const todayIso = new Date().toISOString().slice(0, 10)
      return v.scheduledDate >= todayIso
    },
    {
      message: 'Data de agendamento não pode ser anterior a hoje',
      path: ['scheduledDate'],
    },
  )

// ── Update generico (data/horario/profissional/notas/status simples) ────────
//
// NAO usar pra: chegada (use AttendAppointmentSchema), finalizacao (use
// FinalizeAppointmentSchema), cancel (use CancelAppointmentSchema), no-show
// (use MarkNoShowSchema). Essas tem invariantes de phase do lead.

export const UpdateAppointmentSchema = z
  .object({
    appointmentId: z.string().uuid(),
    scheduledDate: DateStr.optional(),
    startTime: TimeStr.optional(),
    endTime: TimeStr.optional(),
    professionalId: z.string().uuid().nullable().optional(),
    professionalName: z.string().max(120).optional(),
    // CRM_PARITY_R1 (mig 190) · permite mudar/limpar sala em edit.
    roomId: z.string().uuid().nullable().optional(),
    // CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE: aceita null pra mover row de
    // catálogo→manual sem destruir snapshot.
    procedureId: z.string().uuid().nullable().optional(),
    procedureName: z.string().max(200).optional(),
    consultType: z.string().max(50).nullable().optional(),
    evalType: z.string().max(50).nullable().optional(),
    value: z.number().nonnegative().optional(),
    paymentMethod: z.string().max(50).nullable().optional(),
    paymentStatus: AppointmentPaymentStatus.optional(),
    status: AppointmentStatus.optional(),
    consentimentoImg: AppointmentConsentImg.optional(),
    obs: z.string().max(2000).nullable().optional(),
    // CRM_PARITY_R2 · replace-set semântica · quando enviado, ação faz
    // soft-delete dos existentes + insert do novo conjunto. Undefined = preserva.
    procedureItems: z.array(AppointmentProcedureItemInputSchema).optional(),
    payments: z.array(AppointmentPaymentInputSchema).optional(),
  })
  // CRM_PHASE_2AUX: validações operacionais (só quando os campos estiverem presentes)
  .refine(
    (v) => {
      if (v.startTime && v.endTime) return v.endTime > v.startTime
      return true
    },
    { message: 'Horário final deve ser maior que o inicial', path: ['endTime'] },
  )
  // CRM_PARITY_R2 · validação cruzada (replicada do create).
  .refine(
    (v) => {
      if (!v.payments || v.payments.length === 0) return true
      if (!v.procedureItems || v.procedureItems.length === 0) {
        const net = v.value ?? 0
        if (net === 0) return true
        const total = sumPayments(v.payments, ['pago', 'pendente'])
        return total <= net + 0.01
      }
      const net = sumItemsNet(v.procedureItems)
      const total = sumPayments(v.payments, ['pago', 'pendente'])
      return total <= net + 0.01
    },
    {
      message: 'Soma de pagamentos (pago+pendente) excede netTotal',
      path: ['payments'],
    },
  )
  .refine(
    (v) => {
      if (v.paymentStatus !== 'pago') return true
      const net = v.procedureItems && v.procedureItems.length > 0
        ? sumItemsNet(v.procedureItems)
        : v.value ?? 0
      if (net === 0) return true
      const paid = sumPayments(v.payments, ['pago'])
      return paid + 0.01 >= net
    },
    {
      message:
        'paymentStatus=pago exige soma de payments status=pago >= netTotal',
      path: ['paymentStatus'],
    },
  )
  .refine(
    (v) => {
      if (v.startTime && v.endTime) {
        const [sh, sm] = v.startTime.split(':').map((s) => parseInt(s, 10))
        const [eh, em] = v.endTime.split(':').map((s) => parseInt(s, 10))
        const durMin = eh * 60 + em - (sh * 60 + sm)
        return durMin >= 15 && durMin <= 240
      }
      return true
    },
    {
      message: 'Duração deve estar entre 15 minutos e 4 horas',
      path: ['endTime'],
    },
  )
  .refine(
    (v) => {
      if (v.scheduledDate) {
        const todayIso = new Date().toISOString().slice(0, 10)
        return v.scheduledDate >= todayIso
      }
      return true
    },
    {
      message: 'Data não pode ser anterior a hoje',
      path: ['scheduledDate'],
    },
  )

// ── CRM_PHASE_2AUX · check de conflito pré-submit (UI wizard chama antes) ───

export const CheckAppointmentConflictSchema = z
  .object({
    appointmentId: z.string().uuid().nullable().optional(), // ao editar · exclude self
    scheduledDate: DateStr,
    startTime: TimeStr,
    endTime: TimeStr,
    professionalId: z.string().uuid().nullable().optional(),
    // CRM_PARITY_R1 (mig 190) · conflict-check por sala via FK canônica.
    roomId: z.string().uuid().nullable().optional(),
    leadId: z.string().uuid().nullable().optional(),
    patientId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'Horário final deve ser maior que o inicial',
    path: ['endTime'],
  })

// ── Cancel · motivo obrigatorio (chk_appt_cancelled_consistency) ────────────

export const CancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  motivo: z.string().min(2, 'Motivo obrigatorio').max(500),
})

// ── No-show · motivo obrigatorio (chk_appt_noshow_consistency) ──────────────

export const MarkNoShowSchema = z.object({
  appointmentId: z.string().uuid(),
  motivo: z.string().min(2, 'Motivo obrigatorio').max(500),
})

// ── attend · paciente chegou ────────────────────────────────────────────────

export const AttendAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  chegadaEm: z.string().datetime().optional(),
})

// ── CRM_PHASE_2I · Anamnese intra-consulta ──────────────────────────────────

export const AppointmentAnamnesisUpsertSchema = z.object({
  appointmentId: z.string().uuid(),
  chiefComplaint: z.string().max(2000).nullable().optional(),
  medicalHistory: z.string().max(4000).nullable().optional(),
  medications: z.string().max(2000).nullable().optional(),
  allergies: z.string().max(2000).nullable().optional(),
  previousProcedures: z.string().max(2000).nullable().optional(),
  contraindications: z.string().max(2000).nullable().optional(),
  pregnancyLactation: z.string().max(500).nullable().optional(),
  autoimmuneDisease: z.string().max(500).nullable().optional(),
  anticoagulants: z.string().max(500).nullable().optional(),
  expectations: z.string().max(2000).nullable().optional(),
  professionalNotes: z.string().max(4000).nullable().optional(),
})

export const AppointmentAnamnesisCompleteSchema = z.object({
  appointmentId: z.string().uuid(),
})

// ── CRM_PHASE_2I · Consentimento informado intra-consulta ───────────────────

export const AppointmentConsentAcceptSchema = z.object({
  appointmentId: z.string().uuid(),
  termKey: z.string().min(2).max(100),
  termVersion: z.string().min(1).max(50),
  termTitle: z.string().min(2).max(300),
  signerName: z.string().min(2, 'Nome do assinante obrigatório (mín. 2)').max(200),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const AppointmentClinicalGateStatusSchema = z.object({
  appointmentId: z.string().uuid(),
})

// ── finalize · roteia outcome (paciente|orcamento|perdido) ──────────────────

export const FinalizeAppointmentSchema = z
  .object({
    appointmentId: z.string().uuid(),
    outcome: AppointmentFinalizeOutcome,
    value: z.number().nonnegative().nullable().optional(),
    paymentStatus: AppointmentPaymentStatus.nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    // PATCH_0C_FINALIZE_BACKEND_GUARD · lostReason mantido no schema
    // apenas pra compat backwards com callers antigos · validacao foi
    // removida. Finalize NAO aceita perdido · perda via lead_lost.
    lostReason: z.string().max(500).nullable().optional(),
    orcamentoItems: z.array(OrcamentoItemSchema).nullable().optional(),
    orcamentoSubtotal: z.number().nonnegative().nullable().optional(),
    orcamentoDiscount: z.number().nonnegative().optional(),
    // CRM_PHASE_2I.1 · hard gate clinico · override admin
    clinicalOverride: z.boolean().optional(),
    clinicalOverrideReason: z.string().max(1000).nullable().optional(),
    // BLOCO 2.4 · cortesia · motivo prepende em notes pelo action.
    // Marker server-side é `paymentStatus='cortesia'`. UI gate exige motivo
    // quando paymentStatus='cortesia'.
    motivoCortesia: z.string().max(500).nullable().optional(),
  })
  // PATCH_0C_FINALIZE_BACKEND_GUARD · refine de lostReason removido ·
  // outcome='perdido' agora rejeitado no enum acima (Zod parse falha
  // antes de chegar aqui). Perda passa por lead_lost RPC dedicado.
  .refine(
    (v) => {
      if (v.outcome === 'orcamento' || v.outcome === 'paciente_orcamento') {
        return (
          Array.isArray(v.orcamentoItems) &&
          v.orcamentoItems.length > 0 &&
          v.orcamentoSubtotal != null
        )
      }
      return true
    },
    {
      message:
        'orcamentoItems (>=1) + orcamentoSubtotal obrigatorios quando outcome=orcamento ou paciente_orcamento',
      path: ['orcamentoItems'],
    },
  )
  .refine(
    (v) => {
      // CRM_PHASE_2I.1 · override exige reason >= 5 chars
      if (v.clinicalOverride === true) {
        return (
          !!v.clinicalOverrideReason &&
          v.clinicalOverrideReason.trim().length >= 5
        )
      }
      return true
    },
    {
      message: 'clinicalOverrideReason obrigatorio (min 5 chars) quando clinicalOverride=true',
      path: ['clinicalOverrideReason'],
    },
  )
  .refine(
    (v) => {
      // BLOCO 2.4 · motivo obrigatório (min 3 chars) quando paymentStatus=cortesia
      if (v.paymentStatus === 'cortesia') {
        return !!v.motivoCortesia && v.motivoCortesia.trim().length >= 3
      }
      return true
    },
    {
      message: 'motivoCortesia obrigatorio (min 3 chars) quando paymentStatus=cortesia',
      path: ['motivoCortesia'],
    },
  )
  .refine(
    (v) => {
      // BLOCO 2.4 · cortesia exige value 0 ou null (atendimento gratuito).
      // Validação defensiva · UI deve forçar value=0 quando cortesia.
      if (v.paymentStatus === 'cortesia') {
        return v.value == null || v.value === 0
      }
      return true
    },
    {
      message: 'value deve ser 0 (ou null) quando paymentStatus=cortesia',
      path: ['value'],
    },
  )

// ── BLOCO 2.2 · Recorrência/Séries (V1 paridade) ────────────────────────────
//
// Cria série de N appointments com intervalo fixo a partir de uma data base.
// Reusa CreateAppointmentSchema como "base" (subject + horário + profissional +
// procedimento) e adiciona campos series-only: totalSessions + intervalDays.
//
// Limites alinhados com `repository.createSeries()` (linhas 656-661):
//   - totalSessions: 2..52  (V1 RPC suporta 1..100 · UI restringe a 2..52)
//   - intervalDays:  1..365
//
// Não atômico: repository chama `create()` per session com conflict-check
// individual. Retorna { created: [...], failed: [...] }.
// (V1 RPC `appt_create_series` server-side é atômica, mas V2 optou por
// criação parcial tolerável pra UX · ADR pendente.)

export const CreateAppointmentSeriesSchema = z
  .object({
    // Subject (XOR · lead OU patient · não bloqueado em série)
    leadId: z.string().uuid().nullable().optional(),
    patientId: z.string().uuid().nullable().optional(),
    subjectName: z.string().min(1).max(120),
    subjectPhone: z.string().max(20).nullable().optional(),
    // Tempo base · TODAS sessões usam mesmo horário + duração
    startDate: DateStr,
    startTime: TimeStr,
    endTime: TimeStr,
    // Profissional / procedimento (mesmos pra toda série)
    professionalId: z.string().uuid().nullable().optional(),
    professionalName: z.string().max(120).optional(),
    procedureId: z.string().uuid().nullable().optional(),
    procedureName: z.string().max(200).optional(),
    consultType: z.string().max(50).nullable().optional(),
    evalType: z.string().max(50).nullable().optional(),
    value: z.number().nonnegative().optional(),
    origem: z.string().max(50).nullable().optional(),
    obs: z.string().max(2000).nullable().optional(),
    // Series-specific
    totalSessions: z.number().int().min(2).max(52),
    intervalDays: z.number().int().min(1).max(365),
    recurrenceProcedure: z.string().max(200).nullable().optional(),
    // Opt-in pra pular conflict-check (uso administrativo · default false)
    skipConflictCheck: z.boolean().optional(),
  })
  .refine(
    (v) => {
      // Subject XOR · série exige subject (sem block-time em série)
      const subjects = (v.leadId ? 1 : 0) + (v.patientId ? 1 : 0)
      return subjects === 1
    },
    {
      message: 'Série exige EXATAMENTE um de leadId/patientId',
      path: ['leadId'],
    },
  )
  .refine((v) => v.endTime > v.startTime, {
    message: 'Horário final deve ser maior que o inicial',
    path: ['endTime'],
  })
  .refine(
    (v) => {
      // Duração 15..240min · alinhado com CreateAppointmentSchema
      const [sh, sm] = v.startTime.split(':').map((s) => parseInt(s, 10))
      const [eh, em] = v.endTime.split(':').map((s) => parseInt(s, 10))
      const durMin = eh * 60 + em - (sh * 60 + sm)
      return durMin >= 15 && durMin <= 240
    },
    { message: 'Duração deve estar entre 15 minutos e 4 horas', path: ['endTime'] },
  )
  .refine(
    (v) => {
      const todayIso = new Date().toISOString().slice(0, 10)
      return v.startDate >= todayIso
    },
    {
      message: 'Data inicial da série não pode ser anterior a hoje',
      path: ['startDate'],
    },
  )
