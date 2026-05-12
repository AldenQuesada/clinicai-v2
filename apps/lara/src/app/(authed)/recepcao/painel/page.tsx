/**
 * /recepcao/painel · CRM_PHASE_2ALEXA.2 · painel-TV recepção.
 *
 * Modo kiosk visual · read-only · sem provider externo. Mostra:
 *   1. "Chegaram agora" (status=na_clinica)
 *   2. "Em atendimento" (status=em_atendimento)
 *   3. "Próximos horários" (agendado/aguardando_confirmacao/confirmado/aguardando)
 *   4. "Atenção" (overdue · agendado/confirmado com start_time já passado)
 *
 * Auto-refresh: server-side `revalidate=15` (Next.js · simples · zero polling
 * cliente). Componente client `ReceptionTicker` re-renderiza "tempo decorrido"
 * a cada 30s sem refetch.
 *
 * PRIVACIDADE:
 * - Telefone: mostra apenas últimos 4 dígitos (mascarado)
 * - SEM anamnese/consentimento/valores/observações
 * - SEM dados clínicos sensíveis
 * - Subject name OK (já é mostrado pra recepção física)
 * - Profissional name OK
 * - Procedimento name OK (nome do serviço · não detalhes clínicos)
 *
 * Sem provider · sem WhatsApp · sem Alexa · sem wa_outbox · sem mutação.
 */

import { loadServerReposContext } from '@/lib/repos'
import type { AppointmentDTO } from '@clinicai/repositories'
import { ReceptionPanelClient } from './_client'

export const dynamic = 'force-dynamic'
export const revalidate = 15 // server-side refresh interval

const ACTIVE_STATUSES = new Set([
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'aguardando',
])

interface PanelRow {
  id: string
  status: string
  scheduledDate: string
  startTime: string
  endTime: string
  subjectName: string
  phoneLast4: string | null
  professionalName: string
  procedureName: string
  chegadaEm: string | null
}

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 4) return null
  return digits.slice(-4)
}

function toRow(a: AppointmentDTO): PanelRow {
  return {
    id: a.id,
    status: a.status,
    scheduledDate: a.scheduledDate,
    startTime: a.startTime,
    endTime: a.endTime,
    subjectName: a.subjectName || 'Sem nome',
    phoneLast4: maskPhone(a.subjectPhone),
    professionalName: a.professionalName || '',
    procedureName: a.procedureName || a.consultType || '',
    chegadaEm: a.chegadaEm,
  }
}

export default async function ReceptionPanelPage() {
  const { ctx, repos } = await loadServerReposContext()
  const today = new Date().toISOString().slice(0, 10)

  const all = await repos.appointments
    .listByDate(ctx.clinic_id, today)
    .catch(() => [])

  const arrived: PanelRow[] = []
  const inService: PanelRow[] = []
  const upcoming: PanelRow[] = []
  const overdue: PanelRow[] = []

  const nowMin = (() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })()

  function timeToMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10) || 0)
    return h * 60 + m
  }

  for (const a of all) {
    const row = toRow(a)
    if (a.status === 'na_clinica') {
      arrived.push(row)
    } else if (a.status === 'em_atendimento') {
      inService.push(row)
    } else if (ACTIVE_STATUSES.has(a.status)) {
      const startMin = timeToMin(a.startTime)
      // Atrasado: start_time já passou ≥ 10 min e ainda em status pré-chegada
      if (nowMin - startMin >= 10) {
        overdue.push(row)
      } else {
        upcoming.push(row)
      }
    }
  }

  // Ordering
  arrived.sort((a, b) => (a.chegadaEm ?? '').localeCompare(b.chegadaEm ?? ''))
  inService.sort((a, b) => a.startTime.localeCompare(b.startTime))
  upcoming.sort((a, b) => a.startTime.localeCompare(b.startTime))
  overdue.sort((a, b) => a.startTime.localeCompare(b.startTime))

  return (
    <ReceptionPanelClient
      arrived={arrived}
      inService={inService}
      upcoming={upcoming}
      overdue={overdue}
      today={today}
    />
  )
}

export type { PanelRow }
