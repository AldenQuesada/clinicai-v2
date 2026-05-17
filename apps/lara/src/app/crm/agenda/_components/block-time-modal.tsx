'use client'

/**
 * BlockTimeModal · CRM_FUNCTIONALITY_MULTI_AGENT Lote 3 · Agente B (P1.2).
 *
 * Form modal que cria slot bloqueado (almoço, intervalo, manutenção, etc).
 * Server-side: chama `createBlockTimeAction` que invoca
 * `AppointmentRepository.createBlockTime()` (insert direto · status='bloqueado'
 * sem subject, conforme chk_appt_subject_xor).
 *
 * Calendário pinta automaticamente porque WeekCalendar/DayView renderizam
 * QUALQUER appointment não-deletado retornado por `listByDateRange`. Cor de
 * 'bloqueado' já vem do helper APPOINTMENT_STATUS_COLORS (cinza).
 *
 * Conflict check: `createAppointmentAction` (gate de conflito existente) já
 * trata status='bloqueado' como BLOCKS_CALENDAR (mig 62 enum +
 * helpers/appointment-state.ts). Logo, ao tentar criar appointment normal num
 * slot que tenha block, `checkConflicts()` retorna conflito. Reverse-side:
 * block-time NÃO faz conflict check próprio · operador é responsável (caso
 * comum: almoço durante slot de paciente já é problema operacional)
 *
 * Form spec (alinhado com CreateBlockTimeSchema do appointment.actions.ts):
 *   - professionalId (uuid · obrigatório)
 *   - scheduledDate (YYYY-MM-DD · obrigatório)
 *   - startTime (HH:MM · obrigatório)
 *   - endDate (YYYY-MM-DD · obrigatório · default = scheduledDate)
 *   - endTime (HH:MM · obrigatório · > startTime se mesmo dia)
 *   - reason (enum · select obrigatório)
 *   - obs (textarea · ≥3 chars · obrigatório · usado como motivo livre)
 *
 * NOTA mig 62: schema canônico tem `scheduled_date` + `start_time`/`end_time`
 * separados. Multi-dia (data início ≠ data fim) requer N appointments
 * separados. V1 cria APENAS 1 dia: se endDate ≠ scheduledDate, exibimos erro
 * pedindo pra usar 1 bloco por dia. (Roadmap: gerar série multi-dia atomic.)
 */

import * as React from 'react'
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@clinicai/ui'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { createBlockTimeAction } from '@/app/crm/_actions/appointment.actions'

export interface BlockTimeProfessional {
  id: string
  name: string
}

interface BlockTimeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  professionals: BlockTimeProfessional[]
  /** YYYY-MM-DD default (anchor da agenda). */
  defaultDate: string
}

// ── Reason options · alinhados com server schema (appointment.actions.ts) ──
const REASON_OPTIONS = [
  { value: 'almoco', label: 'Almoço' },
  { value: 'intervalo', label: 'Intervalo' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'ferias', label: 'Férias' },
  { value: 'pessoal', label: 'Pessoal' },
  { value: 'outro', label: 'Outro' },
] as const

// ── Zod client-side · espelha server CreateBlockTimeSchema + UI specifics ──
const BlockTimeClientSchema = z
  .object({
    professionalId: z.string().uuid('Profissional obrigatório'),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data início inválida'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data fim inválida'),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora início inválida'),
    endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora fim inválida'),
    reason: z.enum(
      REASON_OPTIONS.map((o) => o.value) as unknown as readonly [
        string,
        ...string[],
      ],
    ),
    obs: z
      .string()
      .trim()
      .min(3, 'Motivo precisa ter no mínimo 3 caracteres')
      .max(2000),
  })
  .refine((d) => d.endDate === d.scheduledDate, {
    message:
      'V1 suporta 1 dia por bloco · use 1 bloco para cada dia (ou ajuste a data fim para igualar a data início).',
    path: ['endDate'],
  })
  .refine(
    (d) => {
      if (d.endDate !== d.scheduledDate) return true
      // Mesmo dia → endTime > startTime
      return d.endTime > d.startTime
    },
    {
      message: 'Hora fim deve ser maior que hora início.',
      path: ['endTime'],
    },
  )

type FormState = {
  professionalId: string
  scheduledDate: string
  endDate: string
  startTime: string
  endTime: string
  reason: string
  obs: string
}

function emptyForm(defaultDate: string): FormState {
  return {
    professionalId: '',
    scheduledDate: defaultDate,
    endDate: defaultDate,
    startTime: '12:00',
    endTime: '13:00',
    reason: 'almoco',
    obs: '',
  }
}

export function BlockTimeModal({
  open,
  onOpenChange,
  professionals,
  defaultDate,
}: BlockTimeModalProps) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = React.useState<FormState>(() => emptyForm(defaultDate))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)

  // Reset on close + sync defaultDate quando muda fora do modal
  React.useEffect(() => {
    if (!open) {
      setForm(emptyForm(defaultDate))
      setErrors({})
      setBusy(false)
    } else {
      // Ao abrir, garante que a data default está aplicada (caso o anchor
      // da agenda tenha mudado entre abertura do modal e nova abertura)
      setForm((prev) => ({
        ...prev,
        scheduledDate: prev.scheduledDate || defaultDate,
        endDate: prev.endDate || defaultDate,
      }))
    }
  }, [open, defaultDate])

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    // Limpa erro do campo ao editar
    setErrors((prev) => {
      if (!prev[key as string]) return prev
      const next = { ...prev }
      delete next[key as string]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = BlockTimeClientSchema.safeParse(form)
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      const flat: Record<string, string> = {}
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (v && v.length > 0) flat[k] = v[0]!
      }
      setErrors(flat)
      return
    }

    setBusy(true)
    try {
      const result = await createBlockTimeAction({
        scheduledDate: parsed.data.scheduledDate,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        professionalId: parsed.data.professionalId,
        reason: parsed.data.reason,
        obs: parsed.data.obs,
      })

      if (!result.ok) {
        toast.error(
          result.error === 'invalid_input'
            ? 'Dados inválidos · verifique os campos.'
            : result.error === 'insert_failed'
              ? 'Falha ao gravar bloqueio. Tente novamente.'
              : `Falha: ${result.error}`,
        )
        // Tenta mapear fieldErrors do Zod server
        const fieldErrors = (result.details?.issues as
          | { fieldErrors?: Record<string, string[]> }
          | undefined)?.fieldErrors
        if (fieldErrors) {
          const flat: Record<string, string> = {}
          for (const [k, v] of Object.entries(fieldErrors)) {
            if (v && v.length > 0) flat[k] = v[0]!
          }
          setErrors(flat)
        }
        return
      }

      toast.success('Horário bloqueado.')
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error'
      toast.error(`Erro: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Bloquear horário"
      description="Reserve um intervalo na agenda (almoço, manutenção, reunião, etc)."
      dismissable={!busy}
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField
          label="Profissional"
          htmlFor="bt-prof"
          error={errors.professionalId}
          required
        >
          <Select
            id="bt-prof"
            value={form.professionalId}
            onChange={(e) => patch('professionalId', e.target.value)}
            disabled={busy}
            invalid={!!errors.professionalId}
          >
            <option value="">Selecione…</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Data início"
            htmlFor="bt-dstart"
            error={errors.scheduledDate}
            required
          >
            <Input
              id="bt-dstart"
              type="date"
              value={form.scheduledDate}
              onChange={(e) => {
                patch('scheduledDate', e.target.value)
                // Mantém endDate alinhado pra UX simples · usuário pode editar depois
                if (form.endDate < e.target.value) {
                  patch('endDate', e.target.value)
                }
              }}
              disabled={busy}
              invalid={!!errors.scheduledDate}
            />
          </FormField>

          <FormField
            label="Data fim"
            htmlFor="bt-dend"
            error={errors.endDate}
            required
            hint="V1 · 1 dia por bloco. Use blocos separados para múltiplos dias."
          >
            <Input
              id="bt-dend"
              type="date"
              value={form.endDate}
              onChange={(e) => patch('endDate', e.target.value)}
              disabled={busy}
              invalid={!!errors.endDate}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Hora início"
            htmlFor="bt-tstart"
            error={errors.startTime}
            required
          >
            <Input
              id="bt-tstart"
              type="time"
              value={form.startTime}
              onChange={(e) => patch('startTime', e.target.value)}
              disabled={busy}
              invalid={!!errors.startTime}
            />
          </FormField>

          <FormField
            label="Hora fim"
            htmlFor="bt-tend"
            error={errors.endTime}
            required
          >
            <Input
              id="bt-tend"
              type="time"
              value={form.endTime}
              onChange={(e) => patch('endTime', e.target.value)}
              disabled={busy}
              invalid={!!errors.endTime}
            />
          </FormField>
        </div>

        <FormField
          label="Motivo"
          htmlFor="bt-reason"
          error={errors.reason}
          required
        >
          <Select
            id="bt-reason"
            value={form.reason}
            onChange={(e) => patch('reason', e.target.value)}
            disabled={busy}
            invalid={!!errors.reason}
          >
            {REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Observação"
          htmlFor="bt-obs"
          error={errors.obs}
          required
          hint="Mínimo 3 caracteres · aparece na agenda como contexto do bloqueio."
        >
          <Textarea
            id="bt-obs"
            rows={3}
            value={form.obs}
            onChange={(e) => patch('obs', e.target.value)}
            disabled={busy}
            invalid={!!errors.obs}
            placeholder="Ex: Almoço · Sala 1 ocupada por manutenção · etc"
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="default" disabled={busy}>
            {busy ? 'Bloqueando…' : 'Bloquear horário'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
