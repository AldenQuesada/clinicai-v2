'use client'

/**
 * NewAppointmentForm · CRM_PHASE_2AUX + 2AUX.2 · Wizard rich em 4 passos.
 *
 *   1. Subject     · toggle Paciente / Lead + select da fonte canônica
 *   2. Tempo       · data + início/fim + profissional FK + LIVE conflict check
 *   3. Detalhes    · tipo, procedimento, valor, status, origem, observações
 *   4. Revisão     · resumo final + submit "Criar agendamento"
 *
 * CRM_PHASE_2AUX.2:
 *   - Profissional é FK first-class · Select de `professional_profiles`
 *     (agenda_enabled=true) · NUNCA mais texto livre
 *   - Lead support · permite agendar pra lead ativo (phase ∈ lead/agendado ·
 *     lifecycle='ativo') sem virar paciente antes · XOR com patientId
 *   - Conflict check passa professionalId real → bloqueia overlap por
 *     profissional, libera profissionais diferentes no mesmo horário
 *   - Edit mode preserva subject (lead OR patient) e profissional original
 *
 * Validações operacionais:
 *   - Data >= hoje (refine no Zod + UI)
 *   - End > Start + duração 15..240min
 *   - Status zumbi rejeitado (CHECK constraint DB)
 *   - Subject XOR (lead OU patient · nunca ambos)
 *   - Conflict check pré-submit
 *
 * Zero WhatsApp · zero provider call · não toca cron.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
  Textarea,
  useToast,
} from '@clinicai/ui'
import { Save, X, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  createAppointmentAction,
  updateAppointmentAction,
  checkAppointmentConflictAction,
  type ConflictDetailEntry,
} from '@/app/crm/_actions/appointment.actions'
import type { HorariosMap } from '@/app/(authed)/configuracoes/clinica/lib/horarios'
import { RecurrenceSection, type SeriesBasePayload } from './_components/recurrence-section'
import {
  checkInPeriods,
  checkMinAdvance,
  getClinicDay,
} from './_components/agenda-validation'

interface SubjectOption {
  id: string
  name: string
  phone: string
}

interface ProfessionalOption {
  id: string
  displayName: string
  specialty: string | null
  color: string | null
}

/**
 * CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · Trilha B1.
 *
 * Procedimento canônico vindo de `clinic_procedimentos`. Sentinel `__manual__`
 * libera o modo legado (texto livre). FK `procedure_id` em `appointments` AINDA
 * NÃO existe · gravamos apenas snapshot em `procedure_name` por enquanto.
 */
export interface ProcedureOption {
  id: string
  nome: string
  categoria: string | null
  preco: number
  precoPromo: number | null
  duracaoMin: number | null
}

const MANUAL_PROCEDURE_SENTINEL = '__manual__'

type SubjectKind = 'patient' | 'lead'

interface EditingPrefill {
  appointmentId: string
  patientId: string | null
  leadId: string | null
  professionalId: string | null
  professionalName: string
  /**
   * FK canônica (mig 182) · `null` quando appointment é legado/manual.
   * Em edit, prioriza este vínculo · senão tenta match por nome.
   */
  procedureId: string | null
  procedureName: string
  consultType: string | null
  value: number
  /** CRM_PARITY_PATCH_0A · payment fields opcionais em edit */
  paymentMethod?: string | null
  paymentStatus?: string | null
  status: string
  origem: string | null
  obs: string | null
}

export interface NewAppointmentFormProps {
  patients: ReadonlyArray<SubjectOption>
  /** CRM_PHASE_2AUX.2 · leads ativos disponíveis pra agendar diretamente */
  leads: ReadonlyArray<SubjectOption>
  /** CRM_PHASE_2AUX.2 · profissionais ativos com agenda_enabled=true */
  professionals: ReadonlyArray<ProfessionalOption>
  /** CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · catálogo ativo de clinic_procedimentos */
  procedures: ReadonlyArray<ProcedureOption>
  /**
   * CRM_PARITY_PATCH_0A · horários de funcionamento da clínica
   * (`operating_hours` jsonb). `null` = sem contrato configurado · UI
   * pula validação de periods.
   */
  operatingHours?: HorariosMap | null
  /**
   * CRM_PARITY_PATCH_0A · antecedência mínima em horas
   * (`settings.antecedencia_min`). 0/null = sem regra.
   */
  antecedenciaMinHoras?: string | number | null
  prefillDate: string | null
  prefillTime: string | null
  prefillPatient: SubjectOption | null
  prefillLead: SubjectOption | null
  editing?: EditingPrefill | null
}

interface FormState {
  subjectKind: SubjectKind
  patientId: string
  leadId: string
  scheduledDate: string
  startTime: string
  endTime: string
  professionalId: string
  /**
   * Canonical procedure id (vindo de clinic_procedimentos). Vazio = sem
   * vínculo canônico (modo manual/legado · ver `procedureMode`).
   */
  procedureId: string
  /** Modo do campo procedimento · `canonical` lista oficial · `manual` texto livre. */
  procedureMode: 'canonical' | 'manual'
  /** Snapshot texto · sempre escrito no DB para compat até FK existir. */
  procedureName: string
  consultType: string
  value: string
  /**
   * CRM_PARITY_PATCH_0A · forma de pagamento · texto livre alinhado com
   * PAYMENT_METHODS canônico do legado. Persiste em
   * `appointments.payment_method`. Vazio = não definido (NULL no DB).
   */
  paymentMethod: string
  /**
   * CRM_PARITY_PATCH_0A · status do pagamento · enum mig 152
   * (`pendente|parcial|pago|cortesia|isento`). Default `pendente`.
   */
  paymentStatus: string
  /**
   * CRM_PARITY_PATCH_0A · motivo obrigatório quando paymentStatus ∈
   * {cortesia,isento}. Persiste em `appointments.obs` (prepend) na criação ·
   * sem schema novo. Fase 2 (Patch B) decide se vira coluna dedicada.
   */
  motivoPagamento: string
  status: string
  origem: string
  obs: string
}

type Step = 1 | 2 | 3 | 4

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map((s) => parseInt(s, 10) || 0)
  const total = h * 60 + m + mins
  const newH = Math.floor(total / 60) % 24
  const newM = total % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function durationMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map((s) => parseInt(s, 10) || 0)
  const [eh, em] = end.split(':').map((s) => parseInt(s, 10) || 0)
  return eh * 60 + em - (sh * 60 + sm)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const STATUS_OPTIONS = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'aguardando_confirmacao', label: 'Aguard. Confirmação' },
  { value: 'confirmado', label: 'Confirmado' },
]

// CRM_PARITY_PATCH_0A · paridade 1:1 com PAYMENT_METHODS legado
// (apps/lara/public/legacy/js/agenda-smart.constants.js linhas 108-119).
// Texto livre no DB (sem enum) · UI mantém lista canônica pra evitar typos.
const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: '—' },
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'parcelado', label: 'Parcelado' },
  { value: 'entrada_saldo', label: 'Entrada + Saldo' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'link', label: 'Link Pagamento' },
  { value: 'cortesia', label: 'Cortesia' },
  { value: 'convenio', label: 'Convênio' },
]

// CRM_PARITY_PATCH_0A · enum canônico mig 152
// (chk_appt_payment_status). `cortesia` ≠ `isento` (vide enums.ts:96-104).
const PAYMENT_STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'pago', label: 'Pago' },
  { value: 'cortesia', label: 'Cortesia · gratuito intencional' },
  { value: 'isento', label: 'Isento · convênio/parceria' },
]

const PAYMENT_STATUS_REQUIRES_MOTIVO = new Set(['cortesia', 'isento'])

const ORIGEM_OPTIONS = [
  { value: 'manual', label: 'Manual (recepção)' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'lara', label: 'Lara IA' },
  { value: 'api', label: 'API/Webhook' },
  { value: 'import', label: 'Importação' },
]

const CONSULT_TYPE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'consulta', label: 'Consulta' },
  { value: 'avaliacao', label: 'Avaliação' },
  { value: 'retorno', label: 'Retorno' },
  { value: 'procedimento', label: 'Procedimento' },
]

const STEP_LABELS: Record<Step, string> = {
  1: 'Paciente/Lead',
  2: 'Tempo',
  3: 'Detalhes',
  4: 'Revisão',
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatProcedurePrice(p: ProcedureOption): string {
  if (!p.preco || p.preco <= 0) return 'A definir'
  if (p.precoPromo != null && p.precoPromo > 0 && p.precoPromo < p.preco) {
    return `${BRL.format(p.precoPromo)} (de ${BRL.format(p.preco)})`
  }
  return BRL.format(p.preco)
}

export function NewAppointmentForm({
  patients,
  leads,
  professionals,
  procedures,
  operatingHours = null,
  antecedenciaMinHoras = null,
  prefillDate,
  prefillTime,
  prefillPatient,
  prefillLead,
  editing,
}: NewAppointmentFormProps) {
  const router = useRouter()
  const { fromResult, success, error: toastError, warning } = useToast()

  const isEdit = !!editing
  const startTimeInit = prefillTime ?? '09:00'

  // CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE (mig 182):
  //   1. Em edit, se já existe FK (editing.procedureId), prefere ela.
  //   2. Senão, tenta match por procedureName legado para sugerir vínculo.
  //   3. Senão, modo manual (legacy snapshot puro).
  const editingProcedureByFk =
    editing?.procedureId
      ? procedures.find((p) => p.id === editing.procedureId) ?? null
      : null
  const editingProcedureByName =
    !editingProcedureByFk && editing?.procedureName
      ? procedures.find(
          (p) => p.nome.trim().toLowerCase() === editing.procedureName.trim().toLowerCase(),
        ) ?? null
      : null
  const editingProcedureMatch = editingProcedureByFk ?? editingProcedureByName
  const initialProcedureMode: 'canonical' | 'manual' =
    !editing
      ? procedures.length > 0
        ? 'canonical'
        : 'manual'
      : editingProcedureMatch
        ? 'canonical'
        : editing.procedureName
          ? 'manual'
          : procedures.length > 0
            ? 'canonical'
            : 'manual'
  const initialProcedureId = editingProcedureMatch?.id ?? ''

  // Decide initial subjectKind: edit→preserve original; create→prefill prefer lead if present
  const initialKind: SubjectKind =
    editing?.leadId
      ? 'lead'
      : editing?.patientId
        ? 'patient'
        : prefillLead
          ? 'lead'
          : 'patient'

  const [step, setStep] = React.useState<Step>(1)
  const [data, setData] = React.useState<FormState>({
    subjectKind: initialKind,
    patientId: editing?.patientId ?? prefillPatient?.id ?? '',
    leadId: editing?.leadId ?? prefillLead?.id ?? '',
    scheduledDate: prefillDate ?? todayIso(),
    startTime: startTimeInit,
    endTime: addMinutes(startTimeInit, 60),
    professionalId: editing?.professionalId ?? '',
    procedureId: initialProcedureId,
    procedureMode: initialProcedureMode,
    procedureName: editing?.procedureName ?? '',
    consultType: editing?.consultType ?? 'consulta',
    value: editing ? String(editing.value) : '',
    // CRM_PARITY_PATCH_0A · payment fields (Step 3)
    paymentMethod: editing?.paymentMethod ?? '',
    paymentStatus: editing?.paymentStatus ?? 'pendente',
    motivoPagamento: '',
    status: editing?.status ?? 'agendado',
    origem: editing?.origem ?? 'manual',
    obs: editing?.obs ?? '',
  })
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof FormState, string>>
  >({})
  const [busy, setBusy] = React.useState(false)

  // BLOCO 2.2 · modo série · quando true, RecurrenceSection assume o submit
  // e o botão padrão "Criar agendamento" é ocultado pra evitar ambiguidade.
  // Edit mode (isEdit=true) nunca ativa série · ediçao reutiliza appointment
  // existente, não cria nova série.
  const [recurrenceEnabled, setRecurrenceEnabled] = React.useState(false)

  const [conflictState, setConflictState] = React.useState<
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'ok' }
    | {
        kind: 'conflict'
        counts: { professional: number; room: number; patient: number }
        details: ConflictDetailEntry[]
      }
    | { kind: 'error' }
  >({ kind: 'idle' })

  // CRM_PARITY_PATCH_0A · erro estrutural de periods/antecedência (validação
  // pre-submit local, antes de chamar checkAppointmentConflictAction).
  const [scheduleConstraintError, setScheduleConstraintError] = React.useState<
    string | null
  >(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
    if (
      key === 'scheduledDate' ||
      key === 'startTime' ||
      key === 'endTime' ||
      key === 'professionalId'
    ) {
      setConflictState({ kind: 'idle' })
      setScheduleConstraintError(null)
    }
  }

  function changeSubjectKind(kind: SubjectKind) {
    if (isEdit) return // edit preserves subject
    setData((d) => ({ ...d, subjectKind: kind, patientId: '', leadId: '' }))
    setErrors({})
  }

  function handleStartTimeChange(newStart: string) {
    const oldStart = data.startTime
    const oldEnd = data.endTime
    const oldDuration =
      oldEnd && oldStart ? Math.max(30, durationMinutes(oldStart, oldEnd)) : 60
    setData((d) => ({
      ...d,
      startTime: newStart,
      endTime: addMinutes(newStart, oldDuration),
    }))
    setConflictState({ kind: 'idle' })
    setScheduleConstraintError(null)
  }

  function handleProcedureSelect(rawValue: string) {
    if (rawValue === MANUAL_PROCEDURE_SENTINEL) {
      setData((d) => ({
        ...d,
        procedureMode: 'manual',
        procedureId: '',
      }))
      if (errors.procedureName) setErrors((e) => ({ ...e, procedureName: undefined }))
      return
    }
    if (!rawValue) {
      setData((d) => ({ ...d, procedureId: '', procedureName: '' }))
      return
    }
    const picked = procedures.find((p) => p.id === rawValue)
    if (!picked) return
    setData((d) => {
      const nextDuration =
        picked.duracaoMin && picked.duracaoMin > 0
          ? picked.duracaoMin
          : Math.max(15, durationMinutes(d.startTime, d.endTime) || 60)
      const nextValue =
        picked.precoPromo != null && picked.precoPromo > 0
          ? String(picked.precoPromo)
          : picked.preco > 0
            ? String(picked.preco)
            : d.value
      return {
        ...d,
        procedureId: picked.id,
        procedureMode: 'canonical',
        procedureName: picked.nome,
        endTime: addMinutes(d.startTime, nextDuration),
        value: nextValue,
      }
    })
    if (errors.procedureName) setErrors((e) => ({ ...e, procedureName: undefined }))
    setConflictState({ kind: 'idle' })
  }

  function switchProcedureToCanonical() {
    if (procedures.length === 0) return
    setData((d) => ({
      ...d,
      procedureMode: 'canonical',
      procedureId: '',
      procedureName: '',
    }))
    if (errors.procedureName) setErrors((e) => ({ ...e, procedureName: undefined }))
  }

  // ── Validation por step ───────────────────────────────────────────────────
  function validateStep1(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (data.subjectKind === 'patient') {
      if (!data.patientId) errs.patientId = 'Selecione um paciente'
    } else {
      if (!data.leadId) errs.leadId = 'Selecione um lead'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep2(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!data.scheduledDate) errs.scheduledDate = 'Data obrigatória'
    else if (data.scheduledDate < todayIso()) errs.scheduledDate = 'Data não pode ser anterior a hoje'
    if (!data.startTime) errs.startTime = 'Horário inicial obrigatório'
    if (!data.endTime) errs.endTime = 'Horário final obrigatório'
    if (data.startTime && data.endTime) {
      const dur = durationMinutes(data.startTime, data.endTime)
      if (dur <= 0) errs.endTime = 'Horário final deve ser depois do inicial'
      else if (dur < 15) errs.endTime = 'Duração mínima: 15 minutos'
      else if (dur > 240) errs.endTime = 'Duração máxima: 4 horas'
    }
    if (!data.professionalId) errs.professionalId = 'Selecione um profissional'

    // CRM_PARITY_PATCH_0A · validação contra clinic_settings (periods +
    // antecedência mínima). Soft skip se settings indisponível (operatingHours
    // null OU antecedenciaMinHoras null/0).
    let constraintErr: string | null = null
    if (
      operatingHours &&
      data.scheduledDate &&
      data.startTime &&
      data.endTime &&
      !errs.scheduledDate &&
      !errs.startTime &&
      !errs.endTime
    ) {
      const day = getClinicDay(operatingHours, data.scheduledDate)
      constraintErr = checkInPeriods(day, data.startTime, data.endTime)
    }
    if (
      !constraintErr &&
      antecedenciaMinHoras != null &&
      data.scheduledDate &&
      data.startTime
    ) {
      constraintErr = checkMinAdvance(
        antecedenciaMinHoras,
        data.scheduledDate,
        data.startTime,
      )
    }
    setScheduleConstraintError(constraintErr)
    setErrors(errs)
    return Object.keys(errs).length === 0 && !constraintErr
  }

  function validateStep3(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!data.status) errs.status = 'Status obrigatório'
    if (!data.origem) errs.origem = 'Origem obrigatória'
    if (!data.paymentStatus) errs.paymentStatus = 'Status do pagamento obrigatório'
    // CRM_PARITY_PATCH_0A · cortesia/isento exige motivo (mínimo 3 chars).
    // Defesa em profundidade · FinalizeAppointmentSchema já valida no servidor
    // para cortesia, e aqui exigimos também na criação direta.
    if (
      PAYMENT_STATUS_REQUIRES_MOTIVO.has(data.paymentStatus) &&
      data.motivoPagamento.trim().length < 3
    ) {
      errs.motivoPagamento = 'Motivo obrigatório (mínimo 3 caracteres) para cortesia ou isento'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function runConflictCheck(): Promise<boolean> {
    setConflictState({ kind: 'checking' })
    try {
      const r = await checkAppointmentConflictAction({
        appointmentId: editing?.appointmentId ?? null,
        scheduledDate: data.scheduledDate,
        startTime: data.startTime,
        endTime: data.endTime,
        professionalId: data.professionalId || null,
        leadId: data.subjectKind === 'lead' ? data.leadId || null : null,
        patientId: data.subjectKind === 'patient' ? data.patientId || null : null,
      })
      if (!r.ok) {
        setConflictState({ kind: 'error' })
        return false
      }
      if (r.data.hasConflict) {
        setConflictState({
          kind: 'conflict',
          counts: r.data.counts,
          details: r.data.details ?? [],
        })
        return false
      }
      setConflictState({ kind: 'ok' })
      return true
    } catch {
      setConflictState({ kind: 'error' })
      return false
    }
  }

  async function goNext() {
    if (step === 1) {
      if (!validateStep1()) return
      setStep(2)
      return
    }
    if (step === 2) {
      if (!validateStep2()) return
      const ok = await runConflictCheck()
      if (!ok) return
      setStep(3)
      return
    }
    if (step === 3) {
      if (!validateStep3()) return
      setStep(4)
      return
    }
  }

  function goPrev() {
    if (step > 1) setStep((step - 1) as Step)
  }

  async function submit() {
    if (!validateStep1() || !validateStep2() || !validateStep3()) {
      toastError('Revise os campos com erro')
      return
    }

    const subject =
      data.subjectKind === 'patient'
        ? patients.find((p) => p.id === data.patientId) ?? null
        : leads.find((l) => l.id === data.leadId) ?? null

    if (!subject) {
      toastError(data.subjectKind === 'patient' ? 'Paciente não encontrado' : 'Lead não encontrado')
      return
    }

    const professional = professionals.find((p) => p.id === data.professionalId) ?? null
    if (!professional) {
      toastError('Profissional inválido')
      return
    }

    // CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE: persiste procedureId quando
    // user selecionou do catálogo · null em modo manual ou sem seleção.
    const procedureIdPayload =
      data.procedureMode === 'canonical' && data.procedureId ? data.procedureId : null

    // CRM_PARITY_PATCH_0A · cortesia/isento prepende motivo em obs pra preservar
    // contexto operacional sem schema novo (mesmo padrão usado em
    // finalizeAppointmentAction · ver appointment.actions.ts:447-454).
    const motivoTag =
      PAYMENT_STATUS_REQUIRES_MOTIVO.has(data.paymentStatus) &&
      data.motivoPagamento.trim()
        ? `[${data.paymentStatus === 'cortesia' ? 'Cortesia' : 'Isento'}] ${data.motivoPagamento.trim()}`
        : null
    const obsPayload = motivoTag
      ? `${motivoTag}${data.obs ? `\n\n${data.obs}` : ''}`
      : data.obs || null

    // CRM_PARITY_PATCH_0A · cortesia força value=0 (defensivo · regra de
    // negócio do enum, mesma lógica do FinalizeAppointmentSchema:368-380).
    const valuePayload =
      data.paymentStatus === 'cortesia'
        ? 0
        : data.value
          ? parseFloat(data.value) || 0
          : 0

    const paymentMethodPayload = data.paymentMethod || null
    const paymentStatusPayload = data.paymentStatus as
      | 'pendente'
      | 'parcial'
      | 'pago'
      | 'cortesia'
      | 'isento'

    setBusy(true)
    try {
      const r = isEdit
        ? await updateAppointmentAction({
            appointmentId: editing!.appointmentId,
            scheduledDate: data.scheduledDate,
            startTime: data.startTime,
            endTime: data.endTime,
            professionalId: data.professionalId,
            professionalName: professional.displayName,
            procedureId: procedureIdPayload,
            procedureName: data.procedureName || '',
            consultType: data.consultType || null,
            value: valuePayload,
            paymentMethod: paymentMethodPayload,
            paymentStatus: paymentStatusPayload,
            status: data.status as
              | 'agendado'
              | 'aguardando_confirmacao'
              | 'confirmado',
            obs: obsPayload,
          })
        : await createAppointmentAction({
            patientId: data.subjectKind === 'patient' ? data.patientId : null,
            leadId: data.subjectKind === 'lead' ? data.leadId : null,
            subjectName: subject.name,
            subjectPhone: subject.phone,
            scheduledDate: data.scheduledDate,
            startTime: data.startTime,
            endTime: data.endTime,
            professionalId: data.professionalId,
            professionalName: professional.displayName,
            procedureId: procedureIdPayload,
            procedureName: data.procedureName || '',
            consultType: data.consultType || null,
            value: valuePayload,
            paymentMethod: paymentMethodPayload,
            paymentStatus: paymentStatusPayload,
            status: data.status as
              | 'agendado'
              | 'aguardando_confirmacao'
              | 'confirmado',
            origem: data.origem || null,
            obs: obsPayload,
          })

      if (!r.ok) {
        if (r.error === 'schedule_conflict') {
          warning('Conflito de agenda detectado · revise horário/profissional')
          setStep(2)
          // CRM_PARITY_PATCH_0A · re-roda checkAppointmentConflictAction pra
          // obter `details` enriquecidos (createAppointmentAction só devolve
          // counts no `details` legado). Fallback: usa counts do retorno.
          await runConflictCheck().catch(() => {
            setConflictState({
              kind: 'conflict',
              counts: (r.details as { professional?: number; room?: number; patient?: number } | undefined)
                ? {
                    professional: (r.details as { professional?: number }).professional ?? 0,
                    room: (r.details as { room?: number }).room ?? 0,
                    patient: (r.details as { patient?: number }).patient ?? 0,
                  }
                : { professional: 0, room: 0, patient: 0 },
              details: [],
            })
          })
          return
        }
        if (r.error === 'appointment_terminal') {
          toastError(
            'Este agendamento já foi finalizado/cancelado/no-show · edição bloqueada',
          )
          return
        }
        if (r.error === 'invalid_input' && (r.details as { issues?: unknown })?.issues) {
          const issues = (r.details as { issues: { fieldErrors?: Record<string, string[]> } }).issues
          if (issues.fieldErrors) {
            const newErrs: Partial<Record<keyof FormState, string>> = {}
            for (const [field, msgs] of Object.entries(issues.fieldErrors)) {
              if (msgs?.[0]) newErrs[field as keyof FormState] = msgs[0]
            }
            setErrors(newErrs)
          }
          toastError('Revise os campos com erro')
          if (errors.patientId || errors.leadId) setStep(1)
          else if (errors.scheduledDate || errors.startTime || errors.endTime || errors.professionalId) setStep(2)
          else setStep(3)
          return
        }
        fromResult(r)
        return
      }

      success(isEdit ? 'Agendamento atualizado!' : 'Agendamento criado!')
      const targetId = isEdit ? editing!.appointmentId : (r.data as { appointmentId: string }).appointmentId
      router.push(`/crm/agenda/${targetId}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const selectedSubject =
    data.subjectKind === 'patient'
      ? patients.find((p) => p.id === data.patientId) ?? null
      : leads.find((l) => l.id === data.leadId) ?? null

  const selectedProfessional = professionals.find((p) => p.id === data.professionalId) ?? null
  const duration = durationMinutes(data.startTime, data.endTime)
  const submitLabel = isEdit ? 'Atualizar agendamento' : 'Criar agendamento'

  return (
    <Card className="p-6">
      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2 text-xs">
        {([1, 2, 3, 4] as const).map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={`flex items-center gap-2 ${s === step ? 'font-semibold' : 'opacity-50'}`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${s === step ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]' : 'border-[var(--border)]'}`}
              >
                {s}
              </span>
              <span>{STEP_LABELS[s]}</span>
            </div>
            {i < 3 && <span className="opacity-30">/</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1 · Subject (Paciente OU Lead) */}
      {step === 1 && (
        <div className="space-y-4">
          {!isEdit && (
            <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
              <button
                type="button"
                onClick={() => changeSubjectKind('patient')}
                className={`rounded px-3 py-1 text-xs font-display-uppercase tracking-widest transition-colors ${
                  data.subjectKind === 'patient'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40'
                }`}
              >
                Paciente ({patients.length})
              </button>
              <button
                type="button"
                onClick={() => changeSubjectKind('lead')}
                className={`rounded px-3 py-1 text-xs font-display-uppercase tracking-widest transition-colors ${
                  data.subjectKind === 'lead'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40'
                }`}
              >
                Lead ({leads.length})
              </button>
            </div>
          )}

          {data.subjectKind === 'patient' ? (
            <FormField
              label="Paciente"
              htmlFor="patientId"
              required
              error={errors.patientId}
              hint={
                patients.length === 0
                  ? 'Sem pacientes cadastrados · adicione em /crm/pacientes/novo'
                  : 'Pacientes ativos da clínica'
              }
            >
              <Select
                id="patientId"
                value={data.patientId}
                onChange={(e) => set('patientId', e.target.value)}
                invalid={!!errors.patientId}
                disabled={isEdit}
              >
                <option value="">Selecione…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.phone ? `· ${p.phone}` : ''}
                  </option>
                ))}
              </Select>
              {isEdit && (
                <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                  Paciente do appointment não pode ser alterado em edição. Para
                  trocar paciente, cancele e crie um novo agendamento.
                </p>
              )}
            </FormField>
          ) : (
            <FormField
              label="Lead ativo"
              htmlFor="leadId"
              required
              error={errors.leadId}
              hint={
                leads.length === 0
                  ? 'Sem leads ativos · cadastre em /crm/leads ou aguarde captação'
                  : 'Leads com phase lead/agendado e lifecycle ativo'
              }
            >
              <Select
                id="leadId"
                value={data.leadId}
                onChange={(e) => set('leadId', e.target.value)}
                invalid={!!errors.leadId}
                disabled={isEdit}
              >
                <option value="">Selecione…</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.phone ? `· ${l.phone}` : ''}
                  </option>
                ))}
              </Select>
              {isEdit && (
                <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                  Lead do appointment não pode ser alterado em edição.
                </p>
              )}
            </FormField>
          )}
        </div>
      )}

      {/* Step 2 · Tempo + Profissional FK + Conflict check */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormField label="Data" htmlFor="scheduledDate" required error={errors.scheduledDate}>
              <Input
                id="scheduledDate"
                type="date"
                value={data.scheduledDate}
                onChange={(e) => set('scheduledDate', e.target.value)}
                invalid={!!errors.scheduledDate}
                min={todayIso()}
              />
            </FormField>
            <FormField label="Início" htmlFor="startTime" required error={errors.startTime}>
              <Input
                id="startTime"
                type="time"
                value={data.startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                invalid={!!errors.startTime}
              />
            </FormField>
            <FormField
              label={`Fim · duração ${duration > 0 ? `${duration}min` : '—'}`}
              htmlFor="endTime"
              required
              error={errors.endTime}
            >
              <Input
                id="endTime"
                type="time"
                value={data.endTime}
                onChange={(e) => set('endTime', e.target.value)}
                invalid={!!errors.endTime}
              />
            </FormField>
          </div>

          <FormField
            label="Profissional"
            htmlFor="professionalId"
            required
            error={errors.professionalId}
            hint={
              professionals.length === 0
                ? 'Nenhum profissional com agenda habilitada · habilite em /configuracoes/profissionais'
                : 'Profissionais com agenda habilitada da clínica'
            }
          >
            <Select
              id="professionalId"
              value={data.professionalId}
              onChange={(e) => set('professionalId', e.target.value)}
              invalid={!!errors.professionalId}
              disabled={professionals.length === 0}
            >
              <option value="">Selecione…</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                  {p.specialty ? ` · ${p.specialty}` : ''}
                </option>
              ))}
            </Select>
          </FormField>

          {conflictState.kind === 'checking' && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Verificando conflitos…
            </p>
          )}
          {conflictState.kind === 'ok' && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              Horário livre · sem conflitos detectados
            </div>
          )}
          {conflictState.kind === 'conflict' && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-900 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <strong>Conflito detectado:</strong>
                {/* CRM_PARITY_PATCH_0A · conflito não-silencioso · mensagens
                    granulares por categoria (profissional/sala/paciente) com
                    nome + horário do appointment conflitante. */}
                {conflictState.details.length > 0 ? (
                  <ul className="mt-1 space-y-1 list-disc pl-4">
                    {conflictState.details.map((d) => (
                      <li key={`${d.kind}-${d.appointmentId}`}>
                        {d.kind === 'professional' && (
                          <>
                            Profissional ocupado · {d.professionalName || 'sem nome'} já tem consulta {d.startTime}–{d.endTime}
                            {d.subjectName ? ` com ${d.subjectName}` : ''}.
                          </>
                        )}
                        {d.kind === 'patient' && (
                          <>
                            Paciente/lead já tem agenda · {d.subjectName || 'sem nome'} às {d.startTime}–{d.endTime}.
                          </>
                        )}
                        {d.kind === 'room' && (
                          <>
                            Sala ocupada · {d.startTime}–{d.endTime}
                            {d.subjectName ? ` (${d.subjectName})` : ''}.
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="mt-1 list-disc pl-4">
                    {conflictState.counts.professional > 0 && (
                      <li>{conflictState.counts.professional} appointment(s) do mesmo profissional</li>
                    )}
                    {conflictState.counts.room > 0 && (
                      <li>{conflictState.counts.room} appointment(s) na mesma sala</li>
                    )}
                    {conflictState.counts.patient > 0 && (
                      <li>{conflictState.counts.patient} appointment(s) do mesmo paciente/lead</li>
                    )}
                  </ul>
                )}
                <p className="mt-1">Ajuste data, horário ou profissional.</p>
              </div>
            </div>
          )}
          {conflictState.kind === 'error' && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Não foi possível verificar conflitos · prosseguir mesmo assim
              é arriscado (servidor revalida no submit).
            </p>
          )}
          {scheduleConstraintError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Fora do horário permitido:</strong>
                <p className="mt-1">{scheduleConstraintError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3 · Detalhes */}
      {step === 3 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Tipo de atendimento" htmlFor="consultType">
            <Select
              id="consultType"
              value={data.consultType}
              onChange={(e) => set('consultType', e.target.value)}
            >
              {CONSULT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>

          {procedures.length > 0 && data.procedureMode === 'canonical' ? (
            <FormField
              label="Procedimento"
              htmlFor="procedureId"
              error={errors.procedureName}
              hint={
                isEdit && editing?.procedureName && !editingProcedureMatch
                  ? 'Agendamento legado · selecione um procedimento oficial ou volte ao texto livre.'
                  : `${procedures.length} procedimento(s) ativos · preço/duração sugeridos automaticamente.`
              }
            >
              <Select
                id="procedureId"
                value={data.procedureId}
                onChange={(e) => handleProcedureSelect(e.target.value)}
                invalid={!!errors.procedureName}
              >
                <option value="">Selecione o procedimento</option>
                {(() => {
                  const byCategory = new Map<string, ProcedureOption[]>()
                  for (const p of procedures) {
                    const key = p.categoria ?? 'Sem categoria'
                    if (!byCategory.has(key)) byCategory.set(key, [])
                    byCategory.get(key)!.push(p)
                  }
                  return Array.from(byCategory.entries())
                    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
                    .map(([cat, list]) => (
                      <optgroup key={cat} label={cat}>
                        {list.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                            {p.duracaoMin ? ` · ${p.duracaoMin}min` : ''}
                            {` · ${formatProcedurePrice(p)}`}
                          </option>
                        ))}
                      </optgroup>
                    ))
                })()}
                <option value={MANUAL_PROCEDURE_SENTINEL}>
                  Outro · procedimento manual (legado)
                </option>
              </Select>
            </FormField>
          ) : (
            <FormField
              label="Procedimento (texto livre)"
              htmlFor="procedureName"
              error={errors.procedureName}
              hint={
                procedures.length === 0
                  ? 'Nenhum procedimento ativo · cadastre em /configuracoes/procedimentos para usar o Select canônico.'
                  : isEdit && editing?.procedureName && !editingProcedureMatch
                    ? 'Agendamento legado · valor original preservado. Mudar para Select oficial trocaria o snapshot.'
                    : 'Modo manual · sem vínculo com clinic_procedimentos. Use o Select sempre que possível.'
              }
            >
              <Input
                id="procedureName"
                value={data.procedureName}
                onChange={(e) => set('procedureName', e.target.value)}
                maxLength={200}
              />
              {procedures.length > 0 && (
                <button
                  type="button"
                  onClick={switchProcedureToCanonical}
                  className="mt-2 text-[10px] uppercase tracking-widest text-[var(--primary)] hover:underline"
                >
                  Voltar ao Select oficial
                </button>
              )}
            </FormField>
          )}

          <FormField label="Valor" htmlFor="value" hint="R$ · 0 se cortesia">
            <Input
              id="value"
              type="number"
              min="0"
              step="0.01"
              value={data.value}
              onChange={(e) => set('value', e.target.value)}
              placeholder="0,00"
            />
          </FormField>

          <FormField label="Status inicial" htmlFor="status" required error={errors.status}>
            <Select
              id="status"
              value={data.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>

          {/* CRM_PARITY_PATCH_0A · Forma de pagamento (texto livre · DB sem
              enum) + Status do pagamento (enum mig 152). Cortesia/isento
              exigem motivo (prepend em obs). */}
          <FormField
            label="Forma de pagamento"
            htmlFor="paymentMethod"
            hint="Opcional · pode ser definido na finalização"
          >
            <Select
              id="paymentMethod"
              value={data.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
            >
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Status do pagamento"
            htmlFor="paymentStatus"
            required
            error={errors.paymentStatus}
            hint={
              data.paymentStatus === 'cortesia'
                ? 'Cortesia força valor 0 · motivo obrigatório'
                : data.paymentStatus === 'isento'
                  ? 'Isento exige motivo (convênio/parceria)'
                  : undefined
            }
          >
            <Select
              id="paymentStatus"
              value={data.paymentStatus}
              onChange={(e) => set('paymentStatus', e.target.value)}
              invalid={!!errors.paymentStatus}
            >
              {PAYMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>

          {PAYMENT_STATUS_REQUIRES_MOTIVO.has(data.paymentStatus) && (
            <FormField
              label={`Motivo · ${data.paymentStatus === 'cortesia' ? 'cortesia' : 'isenção'}`}
              htmlFor="motivoPagamento"
              required
              error={errors.motivoPagamento}
              className="md:col-span-2"
              hint="Mínimo 3 caracteres · prepende em observações pra auditoria"
            >
              <Textarea
                id="motivoPagamento"
                value={data.motivoPagamento}
                onChange={(e) => set('motivoPagamento', e.target.value)}
                maxLength={500}
                rows={2}
                placeholder={
                  data.paymentStatus === 'cortesia'
                    ? 'Ex: cliente VIP, atendimento institucional, fechamento de campanha'
                    : 'Ex: convênio Unimed, parceria B2B, isenção judicial'
                }
              />
            </FormField>
          )}

          {!isEdit && (
            <FormField label="Origem" htmlFor="origem" required error={errors.origem}>
              <Select
                id="origem"
                value={data.origem}
                onChange={(e) => set('origem', e.target.value)}
              >
                {ORIGEM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <FormField label="Observações" htmlFor="obs" className="md:col-span-2">
            <Textarea
              id="obs"
              value={data.obs}
              onChange={(e) => set('obs', e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </FormField>
        </div>
      )}

      {/* Step 4 · Revisão */}
      {step === 4 && (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-[var(--muted-foreground)]">
            Confira os dados antes de {isEdit ? 'atualizar' : 'criar'}:
          </p>
          <SummaryRow
            label={data.subjectKind === 'patient' ? 'Paciente' : 'Lead'}
            value={selectedSubject?.name ?? '—'}
          />
          <SummaryRow label="Telefone" value={selectedSubject?.phone ?? '—'} />
          <SummaryRow label="Data" value={data.scheduledDate} />
          <SummaryRow
            label="Horário"
            value={`${data.startTime} – ${data.endTime} (${duration}min)`}
          />
          <SummaryRow
            label="Profissional"
            value={
              selectedProfessional
                ? `${selectedProfessional.displayName}${selectedProfessional.specialty ? ` · ${selectedProfessional.specialty}` : ''}`
                : '—'
            }
          />
          <SummaryRow label="Tipo" value={data.consultType || '—'} />
          <SummaryRow
            label="Procedimento"
            value={
              data.procedureName
                ? data.procedureMode === 'canonical' && data.procedureId
                  ? `${data.procedureName} · catálogo oficial`
                  : `${data.procedureName} · texto livre`
                : '—'
            }
          />
          <SummaryRow label="Valor" value={data.value ? BRL.format(parseFloat(data.value) || 0) : '—'} />
          <SummaryRow
            label="Pagamento · forma"
            value={
              PAYMENT_METHOD_OPTIONS.find((o) => o.value === data.paymentMethod)?.label ??
              data.paymentMethod ??
              '—'
            }
          />
          <SummaryRow
            label="Pagamento · status"
            value={
              PAYMENT_STATUS_OPTIONS.find((o) => o.value === data.paymentStatus)?.label ??
              data.paymentStatus
            }
          />
          {PAYMENT_STATUS_REQUIRES_MOTIVO.has(data.paymentStatus) && data.motivoPagamento && (
            <SummaryRow
              label={`Motivo ${data.paymentStatus}`}
              value={data.motivoPagamento}
            />
          )}
          <SummaryRow
            label="Status inicial"
            value={STATUS_OPTIONS.find((s) => s.value === data.status)?.label ?? data.status}
          />
          {!isEdit && (
            <SummaryRow
              label="Origem"
              value={ORIGEM_OPTIONS.find((s) => s.value === data.origem)?.label ?? data.origem}
            />
          )}
          {data.obs && <SummaryRow label="Observações" value={data.obs} />}

          {conflictState.kind === 'conflict' && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <strong>⚠️ Conflito detectado no passo 2.</strong> Volte e ajuste
              antes de salvar. O servidor revalida e bloqueará se persistir.
            </div>
          )}

          {/* BLOCO 2.2 · Recorrência opt-in · só em create mode (edit reusa appt) */}
          {!isEdit && (
            <div className="pt-2">
              <RecurrenceSection
                enabled={recurrenceEnabled}
                onEnabledChange={setRecurrenceEnabled}
                onBusy={setBusy}
                getBasePayload={(): SeriesBasePayload | null => {
                  const subject =
                    data.subjectKind === 'patient'
                      ? patients.find((p) => p.id === data.patientId) ?? null
                      : leads.find((l) => l.id === data.leadId) ?? null
                  if (!subject) return null
                  const professional =
                    professionals.find((p) => p.id === data.professionalId) ?? null
                  const procedureIdPayload =
                    data.procedureMode === 'canonical' && data.procedureId
                      ? data.procedureId
                      : null
                  return {
                    leadId: data.subjectKind === 'lead' ? data.leadId : null,
                    patientId: data.subjectKind === 'patient' ? data.patientId : null,
                    subjectName: subject.name,
                    subjectPhone: subject.phone,
                    startDate: data.scheduledDate,
                    startTime: data.startTime,
                    endTime: data.endTime,
                    professionalId: data.professionalId || null,
                    professionalName: professional?.displayName ?? '',
                    procedureId: procedureIdPayload,
                    procedureName: data.procedureName || '',
                    consultType: data.consultType || null,
                    value: data.value ? parseFloat(data.value) || 0 : 0,
                    origem: data.origem || null,
                    obs: data.obs || null,
                  }
                }}
                onSeriesCreated={({ groupId, createdCount }) => {
                  // BLOCO 2.2A · sucesso ATÔMICO (all-or-nothing) · sempre
                  // redireciona pra agenda filtrada pelo group_id. Conflitos
                  // de pré-check ou falha de RPC mantêm user no form (não
                  // chamam este callback).
                  void createdCount
                  router.push(`/crm/agenda?group=${groupId}`)
                  router.refresh()
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="mt-6 flex justify-between gap-2 border-t border-[var(--border)] pt-4">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.push(isEdit ? `/crm/agenda/${editing!.appointmentId}` : '/crm/agenda')}
            disabled={busy}
          >
            <X className="h-4 w-4" />
            {isEdit ? 'Voltar ao detalhe' : 'Cancelar'}
          </Button>
        </div>
        <div className="flex gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={goPrev} disabled={busy}>
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Button>
          )}
          {step < 4 && (
            <Button onClick={goNext} disabled={busy || conflictState.kind === 'checking'}>
              {conflictState.kind === 'checking' ? 'Verificando…' : 'Próximo'}
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {/* BLOCO 2.2 · botão padrão oculto quando modo série ativo · UX
              evita dois CTAs concorrentes no mesmo passo. RecurrenceSection
              renderiza seu próprio botão "Criar X sessões". */}
          {step === 4 && !recurrenceEnabled && (
            <Button onClick={submit} disabled={busy}>
              <Save className="h-4 w-4" />
              {busy ? 'Salvando…' : submitLabel}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-32 shrink-0 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="text-[var(--foreground)]">{value}</span>
    </div>
  )
}
