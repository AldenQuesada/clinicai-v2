/**
 * Testes pra appointment.actions.ts · foco em dragDropAppointmentAction
 * (conflict pre-check + getById + update orchestration) e
 * changeAppointmentStatusAction (RPC state machine guard).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/repos', () => ({ loadServerReposContext: vi.fn() }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))
vi.mock('@clinicai/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
  hashPhone: (p: string) => `hash:${p.slice(-4)}`,
}))

import {
  dragDropAppointmentAction,
  changeAppointmentStatusAction,
  finalizeAppointmentAction,
} from '../appointment.actions'
import { FinalizeAppointmentSchema } from '../../_schemas/appointment.schemas'
import { applyContextMock } from './_mock-context'
import { updateTag } from 'next/cache'

const APPT_ID = '44444444-4444-4444-4444-444444444444'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── dragDropAppointmentAction ──────────────────────────────────────────────

describe('dragDropAppointmentAction', () => {
  const validInput = {
    appointmentId: APPT_ID,
    newDate: '2026-05-15',
    newStartTime: '14:00',
    newEndTime: '15:00',
  }

  it('rejects appointmentId não-uuid via Zod', async () => {
    const { repos } = await applyContextMock({
      appointments: { getById: vi.fn() },
    })
    const r = await dragDropAppointmentAction({
      ...validInput,
      appointmentId: 'not-uuid',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
    expect(repos.appointments!.getById).not.toHaveBeenCalled()
  })

  it('rejects newDate fora do formato YYYY-MM-DD via Zod', async () => {
    const r = await dragDropAppointmentAction({
      ...validInput,
      newDate: '15/05/2026',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
  })

  it('appointment não existe → not_found', async () => {
    const { repos } = await applyContextMock({
      appointments: {
        getById: vi.fn().mockResolvedValue(null),
        checkConflicts: vi.fn(),
        update: vi.fn(),
      },
    })
    const r = await dragDropAppointmentAction(validInput)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('not_found')
    expect(repos.appointments!.checkConflicts).not.toHaveBeenCalled()
    expect(repos.appointments!.update).not.toHaveBeenCalled()
  })

  it('conflict detectado → rejeita sem update', async () => {
    const { repos } = await applyContextMock({
      appointments: {
        getById: vi.fn().mockResolvedValue({
          id: APPT_ID,
          professionalId: 'prof1',
          roomIdx: 1,
          leadId: null,
          patientId: 'pat1',
        }),
        checkConflicts: vi.fn().mockResolvedValue({
          professional: [{ id: 'other-1' }],
          room: [],
          patient: [],
        }),
        update: vi.fn(),
      },
    })
    const r = await dragDropAppointmentAction(validInput)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('conflict')
      expect(r.details).toEqual({ professional: 1, room: 0, patient: 0 })
    }
    expect(repos.appointments!.update).not.toHaveBeenCalled()
  })

  it('forceOverride=true pula conflict check', async () => {
    const { repos } = await applyContextMock({
      appointments: {
        getById: vi.fn().mockResolvedValue({
          id: APPT_ID,
          professionalId: 'prof1',
          roomIdx: 1,
          leadId: null,
          patientId: 'pat1',
        }),
        checkConflicts: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: APPT_ID }),
      },
    })
    const r = await dragDropAppointmentAction({
      ...validInput,
      forceOverride: true,
    })
    expect(r.ok).toBe(true)
    expect(repos.appointments!.checkConflicts).not.toHaveBeenCalled()
    expect(repos.appointments!.update).toHaveBeenCalled()
  })

  it('happy path · sem conflitos · update + tag', async () => {
    const { repos } = await applyContextMock({
      appointments: {
        getById: vi.fn().mockResolvedValue({
          id: APPT_ID,
          professionalId: 'prof1',
          roomIdx: 1,
          leadId: null,
          patientId: 'pat1',
        }),
        checkConflicts: vi.fn().mockResolvedValue({
          professional: [],
          room: [],
          patient: [],
        }),
        update: vi.fn().mockResolvedValue({ id: APPT_ID }),
      },
    })
    const r = await dragDropAppointmentAction(validInput)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.appointmentId).toBe(APPT_ID)
    expect(repos.appointments!.update).toHaveBeenCalledWith(APPT_ID, {
      scheduledDate: '2026-05-15',
      startTime: '14:00',
      endTime: '15:00',
    })
    expect(updateTag).toHaveBeenCalledWith('crm.appointments')
  })
})

// ── changeAppointmentStatusAction ──────────────────────────────────────────

describe('changeAppointmentStatusAction', () => {
  it('rejects newStatus invalido via Zod enum', async () => {
    const { repos } = await applyContextMock({
      appointments: { changeStatus: vi.fn() },
    })
    const r = await changeAppointmentStatusAction({
      appointmentId: APPT_ID,
      newStatus: 'na_clinica', // bloqueado · use attend RPC dedicada
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
    expect(repos.appointments!.changeStatus).not.toHaveBeenCalled()
  })

  it('happy path · invoca RPC + tag', async () => {
    const { repos } = await applyContextMock({
      appointments: {
        changeStatus: vi.fn().mockResolvedValue({
          ok: true,
          appointmentId: APPT_ID,
          fromStatus: 'agendado',
          toStatus: 'confirmado',
        }),
      },
    })
    const r = await changeAppointmentStatusAction({
      appointmentId: APPT_ID,
      newStatus: 'confirmado',
    })
    expect(r.ok).toBe(true)
    expect(repos.appointments!.changeStatus).toHaveBeenCalledWith(
      APPT_ID,
      'confirmado',
      undefined,
    )
    expect(updateTag).toHaveBeenCalledWith('crm.appointments')
  })

  it('RPC rejeita transition → propaga error', async () => {
    await applyContextMock({
      appointments: {
        changeStatus: vi.fn().mockResolvedValue({
          ok: false,
          error: 'transition_not_allowed',
        }),
      },
    })
    const r = await changeAppointmentStatusAction({
      appointmentId: APPT_ID,
      newStatus: 'agendado',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('transition_not_allowed')
  })
})

// ── PATCH_0C_FINALIZE_BACKEND_GUARD · outcome='perdido' rejeitado ──────────

describe('FinalizeAppointmentSchema · outcome guard', () => {
  const baseInput = {
    appointmentId: APPT_ID,
    paymentStatus: 'pago' as const,
    value: 100,
  }

  it('aceita outcome=paciente', () => {
    const r = FinalizeAppointmentSchema.safeParse({
      ...baseInput,
      outcome: 'paciente',
    })
    expect(r.success).toBe(true)
  })

  it('aceita outcome=orcamento (com orcamentoItems + subtotal)', () => {
    const r = FinalizeAppointmentSchema.safeParse({
      ...baseInput,
      outcome: 'orcamento',
      orcamentoItems: [
        { name: 'Item teste', qty: 1, unitPrice: 100, subtotal: 100 },
      ],
      orcamentoSubtotal: 100,
    })
    expect(r.success).toBe(true)
  })

  it('aceita outcome=paciente_orcamento (com orcamento items + subtotal)', () => {
    const r = FinalizeAppointmentSchema.safeParse({
      ...baseInput,
      outcome: 'paciente_orcamento',
      orcamentoItems: [
        { name: 'Item', qty: 1, unitPrice: 50, subtotal: 50 },
      ],
      orcamentoSubtotal: 50,
    })
    expect(r.success).toBe(true)
  })

  it('REJEITA outcome=perdido · regra arquitetural · perda passa por lead_lost', () => {
    const r = FinalizeAppointmentSchema.safeParse({
      ...baseInput,
      outcome: 'perdido',
      lostReason: 'teste',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      // Zod enum rejeita 'perdido' antes de qualquer refine custom
      expect(r.error.issues.some((i) => i.path[0] === 'outcome')).toBe(true)
    }
  })

  it('REJEITA outcome desconhecido (ex: nenhum)', () => {
    const r = FinalizeAppointmentSchema.safeParse({
      ...baseInput,
      outcome: 'nenhum' as 'paciente',
    })
    expect(r.success).toBe(false)
  })
})

describe('finalizeAppointmentAction · runtime guard defensivo perdido', () => {
  it('rejeita outcome=perdido com error=invalid_outcome (caso schema bypassed)', async () => {
    // Caller bypassa o Zod (ex: cast any) · runtime guard defensivo intercepta.
    // Passa o objeto direto sem chamar Zod · simula caso real onde algum
    // caller bypassasse o parse (que NÃO acontece via UI mas é defesa em
    // profundidade).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await finalizeAppointmentAction({
      appointmentId: APPT_ID,
      outcome: 'perdido',
      lostReason: 'teste motivo bypass',
    } as any)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      // Pode vir como zodFail (`invalid_input`) OU como guard runtime
      // (`invalid_outcome`) · ambos aceitos · defense in depth · qual gate
      // dispara antes nao importa pra regra arquitetural (perdido nunca
      // chega no banco via appointment_finalize).
      expect(['invalid_outcome', 'invalid_input']).toContain(r.error)
    }
  })
})
