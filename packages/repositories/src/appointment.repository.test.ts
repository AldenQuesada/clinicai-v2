/**
 * Testes do AppointmentRepository helpers · regras de calendario
 * (Camada 11a).
 *
 * Foco no estado canonico (helpers/appointment-state.ts) que espelha 1:1
 * a RPC `_appointment_status_transition_allowed` (mig 72) · helpers sao a
 * unica fonte client-side, entao precisam estar em parity exata.
 *
 *   - appointmentsOverlap: detecta sobreposicao por minutos (helper
 *     usado em checkConflicts).
 *   - isAppointmentTransitionAllowed: matriz de status (agendado →
 *     confirmado ok, finalizado/na_clinica → agendado bloqueados).
 *   - BLOCKS_CALENDAR: status que reservam slot (cancelado libera).
 */
import { describe, it, expect } from 'vitest'
import {
  appointmentsOverlap,
  isAppointmentTransitionAllowed,
  BLOCKS_CALENDAR,
} from './helpers/appointment-state'

describe('AppointmentRepository · helpers (appointment-state)', () => {
  describe('appointmentsOverlap', () => {
    it('detecta sobreposicao quando ranges cruzam (parcial)', () => {
      const a = { startTime: '10:00', endTime: '11:00' }
      const b = { startTime: '10:30', endTime: '11:30' }
      expect(appointmentsOverlap(a, b)).toBe(true)
    })

    it('NAO sobrepoe quando ranges sao adjacentes (e1 === s2)', () => {
      // 10:00-11:00 + 11:00-12:00 · slots em sequencia, NAO conflita.
      const a = { startTime: '10:00', endTime: '11:00' }
      const b = { startTime: '11:00', endTime: '12:00' }
      expect(appointmentsOverlap(a, b)).toBe(false)
    })

    it('NAO sobrepoe quando ranges totalmente disjuntos', () => {
      const a = { startTime: '09:00', endTime: '10:00' }
      const b = { startTime: '14:00', endTime: '15:00' }
      expect(appointmentsOverlap(a, b)).toBe(false)
    })
  })

  describe('isAppointmentTransitionAllowed · matriz canonica (espelho mig 72)', () => {
    it('agendado → confirmado permitido', () => {
      expect(isAppointmentTransitionAllowed('agendado', 'confirmado')).toBe(true)
    })

    it('finalizado → agendado bloqueado (terminal)', () => {
      expect(isAppointmentTransitionAllowed('finalizado', 'agendado')).toBe(false)
    })

    it('na_clinica → agendado bloqueado (no caminho de volta sem cancelar antes)', () => {
      expect(isAppointmentTransitionAllowed('na_clinica', 'agendado')).toBe(false)
    })
  })

  describe('BLOCKS_CALENDAR · status que reservam slot', () => {
    it('cancelado NAO bloqueia o calendario (slot livre)', () => {
      // Set.has() === false · slot fica disponivel pra remarcacao.
      expect(BLOCKS_CALENDAR.has('cancelado')).toBe(false)
    })

    it('agendado bloqueia (slot ocupado)', () => {
      expect(BLOCKS_CALENDAR.has('agendado')).toBe(true)
    })
  })
})
