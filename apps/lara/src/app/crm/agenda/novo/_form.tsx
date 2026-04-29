'use client'

/**
 * NewAppointmentForm · cria appointment a partir de paciente existente.
 *
 * Camada 8a: simplificado pra MVP do calendario · cria via
 * createAppointmentAction (Camada 5 · sem state machine de phase do lead).
 *
 * Camada 8b adiciona:
 *   - Search de leads ativos (criar appt via lead → scheduleAppointmentAction)
 *   - Recurrence (createSeriesAction)
 *   - Block time (createBlockTimeAction)
 *   - Smart-pick de slot
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
import { Save, X } from 'lucide-react'
import { createAppointmentAction } from '@/app/crm/_actions/appointment.actions'

interface PatientOption {
  id: string
  name: string
  phone: string
}

interface NewAppointmentFormProps {
  patients: ReadonlyArray<PatientOption>
  prefillDate: string | null
  prefillTime: string | null
  prefillPatient: PatientOption | null
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

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map((s) => parseInt(s, 10) || 0)
  const total = h * 60 + m + mins
  const newH = Math.floor(total / 60) % 24
  const newM = total % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

const STATUS_OPTIONS = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'aguardando_confirmacao', label: 'Aguard. Confirmação' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'pre_consulta', label: 'Pré-consulta' },
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

export function NewAppointmentForm({
  patients,
  prefillDate,
  prefillTime,
  prefillPatient,
}: NewAppointmentFormProps) {
  const router = useRouter()
  const { fromResult, success, error: toastError } = useToast()

  const startTime = prefillTime ?? '09:00'
  const [data, setData] = React.useState<FormState>({
    patientId: prefillPatient?.id ?? '',
    scheduledDate:
      prefillDate ?? new Date().toISOString().slice(0, 10),
    startTime,
    endTime: addMinutes(startTime, 60),
    professionalName: '',
    procedureName: '',
    consultType: 'consulta',
    value: '',
    status: 'agendado',
    origem: 'manual',
    obs: '',
  })
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof FormState, string>>
  >({})
  const [busy, setBusy] = React.useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  // Auto-recalcula endTime quando startTime muda · mantém duração
  function handleStartTimeChange(newStart: string) {
    const oldStart = data.startTime
    const oldEnd = data.endTime
    const oldDuration =
      oldEnd && oldStart
        ? Math.max(
            30,
            (parseInt(oldEnd.slice(0, 2)) * 60 + parseInt(oldEnd.slice(3, 5))) -
              (parseInt(oldStart.slice(0, 2)) * 60 +
                parseInt(oldStart.slice(3, 5))),
          )
        : 60
    setData((d) => ({
      ...d,
      startTime: newStart,
      endTime: addMinutes(newStart, oldDuration),
    }))
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!data.patientId) errs.patientId = 'Selecione um paciente'
    if (!data.scheduledDate) errs.scheduledDate = 'Data obrigatória'
    if (!data.startTime) errs.startTime = 'Horário inicial obrigatório'
    if (!data.endTime) errs.endTime = 'Horário final obrigatório'
    if (data.startTime && data.endTime && data.endTime <= data.startTime) {
      errs.endTime = 'Horário final deve ser depois do inicial'
    }
    if (!data.status) errs.status = 'Status obrigatório'
    if (!data.origem) errs.origem = 'Origem obrigatória'

    // Data passada
    if (data.scheduledDate) {
      const today = new Date().toISOString().slice(0, 10)
      if (data.scheduledDate < today) {
        errs.scheduledDate = 'Não é possível agendar em data passada'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submit() {
    if (!validate()) return

    const patient = patients.find((p) => p.id === data.patientId)
    if (!patient) {
      toastError('Paciente não encontrado')
      return
    }

    setBusy(true)
    try {
      const r = await createAppointmentAction({
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
          | 'confirmado'
          | 'pre_consulta',
        origem: data.origem || null,
        obs: data.obs || null,
      })

      if (!r.ok) {
        if (r.error === 'invalid_input' && r.details?.issues) {
          const issues = r.details.issues as {
            fieldErrors?: Record<string, string[]>
          }
          if (issues.fieldErrors) {
            const newErrs: Partial<Record<keyof FormState, string>> = {}
            for (const [field, msgs] of Object.entries(issues.fieldErrors)) {
              if (msgs?.[0]) {
                newErrs[field as keyof FormState] = msgs[0]
              }
            }
            setErrors(newErrs)
          }
          toastError('Revise os campos com erro')
          return
        }
        fromResult(r)
        return
      }

      success('Agendamento criado!')
      router.push(`/crm/agenda/${r.data.appointmentId}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label="Paciente"
          htmlFor="patientId"
          required
          error={errors.patientId}
          className="md:col-span-2"
          hint={
            patients.length === 0
              ? 'Sem pacientes cadastrados · adicione em /crm/pacientes/novo'
              : undefined
          }
        >
          <Select
            id="patientId"
            value={data.patientId}
            onChange={(e) => set('patientId', e.target.value)}
            invalid={!!errors.patientId}
          >
            <option value="">Selecione…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.phone ? `· ${p.phone}` : ''}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Data"
          htmlFor="scheduledDate"
          required
          error={errors.scheduledDate}
        >
          <Input
            id="scheduledDate"
            type="date"
            value={data.scheduledDate}
            onChange={(e) => set('scheduledDate', e.target.value)}
            invalid={!!errors.scheduledDate}
          />
        </FormField>

        <FormField label="Profissional" htmlFor="professionalName">
          <Input
            id="professionalName"
            value={data.professionalName}
            onChange={(e) => set('professionalName', e.target.value)}
            maxLength={120}
            placeholder="Dra. Mirian de Paula"
          />
        </FormField>

        <FormField
          label="Início"
          htmlFor="startTime"
          required
          error={errors.startTime}
        >
          <Input
            id="startTime"
            type="time"
            value={data.startTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            invalid={!!errors.startTime}
          />
        </FormField>

        <FormField
          label="Fim"
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

        <FormField
          label="Status inicial"
          htmlFor="status"
          required
          error={errors.status}
        >
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

        <FormField
          label="Observações"
          htmlFor="obs"
          className="md:col-span-2"
        >
          <Textarea
            id="obs"
            value={data.obs}
            onChange={(e) => set('obs', e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </FormField>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
        <Button
          variant="ghost"
          onClick={() => router.push('/crm/agenda')}
          disabled={busy}
        >
          <X className="h-4 w-4" />
          Cancelar
        </Button>
        <Button onClick={submit} disabled={busy}>
          <Save className="h-4 w-4" />
          {busy ? 'Salvando…' : 'Criar agendamento'}
        </Button>
      </div>
    </Card>
  )
}
