'use client'

/**
 * NewAppointmentForm · CRM_PHASE_2AUX · Wizard rich em 4 passos.
 *
 *   1. Paciente    · select de patient + lead-ready summary
 *   2. Tempo       · data + início/fim + profissional + LIVE conflict check
 *   3. Detalhes    · tipo, procedimento, valor, status, origem, observações
 *   4. Revisão     · resumo final + submit "Criar agendamento"
 *
 * Validações operacionais:
 *   - Data >= hoje (refine no Zod + UI)
 *   - End > Start + duração 15..240min (refine no Zod + UI)
 *   - Status zumbi rejeitado (CHECK constraint DB · 2H.1 TS limpou)
 *   - Conflict check pré-submit via `checkAppointmentConflictAction`
 *
 * Edit mode: prop `editing?: { appointmentId, ...prefill }`. Quando presente,
 * usa `updateAppointmentAction` em vez de `createAppointmentAction`.
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
} from '@/app/crm/_actions/appointment.actions'

interface PatientOption {
  id: string
  name: string
  phone: string
}

interface EditingPrefill {
  appointmentId: string
  patientId: string | null
  professionalName: string
  procedureName: string
  consultType: string | null
  value: number
  status: string
  origem: string | null
  obs: string | null
}

export interface NewAppointmentFormProps {
  patients: ReadonlyArray<PatientOption>
  prefillDate: string | null
  prefillTime: string | null
  prefillPatient: PatientOption | null
  /** CRM_PHASE_2AUX · presença = modo edit. Form chama updateAppointmentAction. */
  editing?: EditingPrefill | null
}

interface FormState {
  patientId: string
  scheduledDate: string
  startTime: string
  endTime: string
  professionalName: string
  procedureName: string
  consultType: string
  value: string
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

// CRM_PHASE_2H.1: `pre_consulta` removido (zumbi não-canônico no DB).
const STATUS_OPTIONS = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'aguardando_confirmacao', label: 'Aguard. Confirmação' },
  { value: 'confirmado', label: 'Confirmado' },
]

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
  1: 'Paciente',
  2: 'Tempo',
  3: 'Detalhes',
  4: 'Revisão',
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function NewAppointmentForm({
  patients,
  prefillDate,
  prefillTime,
  prefillPatient,
  editing,
}: NewAppointmentFormProps) {
  const router = useRouter()
  const { fromResult, success, error: toastError, warning } = useToast()

  const isEdit = !!editing
  const startTimeInit = prefillTime ?? '09:00'

  const [step, setStep] = React.useState<Step>(1)
  const [data, setData] = React.useState<FormState>({
    patientId: editing?.patientId ?? prefillPatient?.id ?? '',
    scheduledDate: prefillDate ?? todayIso(),
    startTime: startTimeInit,
    endTime: addMinutes(startTimeInit, 60),
    professionalName: editing?.professionalName ?? '',
    procedureName: editing?.procedureName ?? '',
    consultType: editing?.consultType ?? 'consulta',
    value: editing ? String(editing.value) : '',
    status: editing?.status ?? 'agendado',
    origem: editing?.origem ?? 'manual',
    obs: editing?.obs ?? '',
  })
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof FormState, string>>
  >({})
  const [busy, setBusy] = React.useState(false)

  // CRM_PHASE_2AUX · Live conflict state
  const [conflictState, setConflictState] = React.useState<
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'ok' }
    | { kind: 'conflict'; counts: { professional: number; room: number; patient: number } }
    | { kind: 'error' }
  >({ kind: 'idle' })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
    // Reset conflict state quando muda dados de tempo
    if (key === 'scheduledDate' || key === 'startTime' || key === 'endTime' || key === 'professionalName') {
      setConflictState({ kind: 'idle' })
    }
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
  }

  // ── Validation por step ───────────────────────────────────────────────────
  function validateStep1(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!data.patientId) errs.patientId = 'Selecione um paciente'
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
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep3(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!data.status) errs.status = 'Status obrigatório'
    if (!data.origem) errs.origem = 'Origem obrigatória'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function runConflictCheck(): Promise<boolean> {
    // Sem profissional, não tem o que conflitar entre profissionais
    // (verifica overlap por paciente mesmo assim)
    setConflictState({ kind: 'checking' })
    try {
      const r = await checkAppointmentConflictAction({
        appointmentId: editing?.appointmentId ?? null,
        scheduledDate: data.scheduledDate,
        startTime: data.startTime,
        endTime: data.endTime,
        professionalId: null, // form atual usa professionalName (text-free) · TODO: integrar professional FK
        leadId: null,
        patientId: data.patientId || null,
      })
      if (!r.ok) {
        setConflictState({ kind: 'error' })
        return false
      }
      if (r.data.hasConflict) {
        setConflictState({ kind: 'conflict', counts: r.data.counts })
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
      // Live conflict check antes de avançar
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

    const patient = patients.find((p) => p.id === data.patientId)
    if (!patient) {
      toastError('Paciente não encontrado')
      return
    }

    setBusy(true)
    try {
      const r = isEdit
        ? await updateAppointmentAction({
            appointmentId: editing!.appointmentId,
            scheduledDate: data.scheduledDate,
            startTime: data.startTime,
            endTime: data.endTime,
            professionalName: data.professionalName || '',
            procedureName: data.procedureName || '',
            consultType: data.consultType || null,
            value: data.value ? parseFloat(data.value) || 0 : 0,
            status: data.status as
              | 'agendado'
              | 'aguardando_confirmacao'
              | 'confirmado',
            obs: data.obs || null,
          })
        : await createAppointmentAction({
            patientId: data.patientId,
            subjectName: patient.name,
            subjectPhone: patient.phone,
            scheduledDate: data.scheduledDate,
            startTime: data.startTime,
            endTime: data.endTime,
            professionalName: data.professionalName || '',
            procedureName: data.procedureName || '',
            consultType: data.consultType || null,
            value: data.value ? parseFloat(data.value) || 0 : 0,
            status: data.status as
              | 'agendado'
              | 'aguardando_confirmacao'
              | 'confirmado',
            origem: data.origem || null,
            obs: data.obs || null,
          })

      if (!r.ok) {
        if (r.error === 'schedule_conflict') {
          warning('Conflito de agenda detectado · revise horário/profissional')
          setStep(2)
          setConflictState({
            kind: 'conflict',
            counts: (r.details as { professional?: number; room?: number; patient?: number } | undefined)
              ? {
                  professional: (r.details as { professional?: number }).professional ?? 0,
                  room: (r.details as { room?: number }).room ?? 0,
                  patient: (r.details as { patient?: number }).patient ?? 0,
                }
              : { professional: 0, room: 0, patient: 0 },
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
          // Volta para o passo mais relevante
          if (errors.patientId) setStep(1)
          else if (errors.scheduledDate || errors.startTime || errors.endTime) setStep(2)
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

  const selectedPatient = patients.find((p) => p.id === data.patientId) ?? null
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

      {/* Step 1 · Paciente */}
      {step === 1 && (
        <div className="space-y-4">
          <FormField
            label="Paciente"
            htmlFor="patientId"
            required
            error={errors.patientId}
            hint={
              patients.length === 0
                ? 'Sem pacientes cadastrados · adicione em /crm/pacientes/novo'
                : 'Pacientes ativos da clínica · busca por nome ou telefone'
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
        </div>
      )}

      {/* Step 2 · Tempo + Conflict check */}
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

          <FormField label="Profissional" htmlFor="professionalName">
            <Input
              id="professionalName"
              value={data.professionalName}
              onChange={(e) => set('professionalName', e.target.value)}
              maxLength={120}
              placeholder="Dra. Mirian de Paula"
            />
          </FormField>

          {/* Conflict state visual */}
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
              <div>
                <strong>Conflito detectado:</strong>
                <ul className="mt-1 list-disc pl-4">
                  {conflictState.counts.professional > 0 && (
                    <li>{conflictState.counts.professional} appointment(s) do mesmo profissional</li>
                  )}
                  {conflictState.counts.room > 0 && (
                    <li>{conflictState.counts.room} appointment(s) na mesma sala</li>
                  )}
                  {conflictState.counts.patient > 0 && (
                    <li>{conflictState.counts.patient} appointment(s) do mesmo paciente</li>
                  )}
                </ul>
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

          <FormField label="Procedimento" htmlFor="procedureName">
            <Input
              id="procedureName"
              value={data.procedureName}
              onChange={(e) => set('procedureName', e.target.value)}
              maxLength={200}
            />
          </FormField>

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
          <SummaryRow label="Paciente" value={selectedPatient?.name ?? '—'} />
          <SummaryRow label="Telefone" value={selectedPatient?.phone ?? '—'} />
          <SummaryRow label="Data" value={data.scheduledDate} />
          <SummaryRow
            label="Horário"
            value={`${data.startTime} – ${data.endTime} (${duration}min)`}
          />
          <SummaryRow label="Profissional" value={data.professionalName || '—'} />
          <SummaryRow label="Tipo" value={data.consultType || '—'} />
          <SummaryRow label="Procedimento" value={data.procedureName || '—'} />
          <SummaryRow label="Valor" value={data.value ? BRL.format(parseFloat(data.value) || 0) : '—'} />
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
          {step === 4 && (
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
