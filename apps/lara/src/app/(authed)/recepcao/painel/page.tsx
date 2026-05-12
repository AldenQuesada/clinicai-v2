/**
 * /recepcao/painel · CRM_PHASE_2ALEXA.2 + 2ALEXA.2.1 · painel-TV recepção.
 *
 * 2ALEXA.2.1: consome foto consentida do prontuário via
 * `getReceptionDisplayProfile()`. Server gera signed URL (TTL 5 min) e entrega
 * pronta · path bruto NUNCA viaja pro client.
 *
 * Pacientes em `na_clinica` com profile reception-ready ganham:
 *   - hero premium · foto + nome de exibição + animação consentida
 *   - mensagem de boas-vindas
 *
 * Fallback elegante: avatar com iniciais quando não houver consentimento/foto.
 *
 * Auto-refresh: server-side `revalidate=15` (Next.js · simples · zero polling
 * cliente). Signed URLs sempre frescas porque o server refaz a cada refresh.
 *
 * PRIVACIDADE (contrato 2ALEXA.2.1):
 * - Telefone: mostra apenas últimos 4 dígitos (mascarado)
 * - SEM anamnese/consentimento clínico/valores/observações
 * - SEM dados clínicos sensíveis
 * - Foto só aparece quando consent=granted AND welcome=true AND photo NOT NULL
 * - Path bruto de storage NUNCA chega no client (só signed URL)
 *
 * Sem provider · sem WhatsApp · sem Alexa · sem wa_outbox · sem mutação.
 */

import { loadServerReposContext } from '@/lib/repos'
import type { AppointmentDTO } from '@clinicai/repositories'
import { createServiceRoleClient } from '@clinicai/supabase'
import { ReceptionPanelClient } from './_client'

export const dynamic = 'force-dynamic'
export const revalidate = 15 // server-side refresh interval

const ACTIVE_STATUSES = new Set([
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'aguardando',
])

type AnimationStyle = 'premium_soft' | 'premium_glow' | 'premium_clean'

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
  patientId: string | null
  /** Signed URL (TTL 5 min) · só presente quando consent+welcome+photo. */
  photoSignedUrl: string | null
  /** Nome de exibição vindo do prontuário (preferred_name ou display_name). */
  receptionDisplayName: string | null
  /** Animation style consentida · só presente quando reception-ready. */
  animationStyle: AnimationStyle | null
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
    patientId: a.patientId ?? null,
    photoSignedUrl: null,
    receptionDisplayName: null,
    animationStyle: null,
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

  // ── 2ALEXA.2.1 · resolve foto consentida apenas para arrived/inService ────
  // (upcoming não recebe foto · paciente ainda não chegou)
  // Service role só pra signed URL · UI rows continuam scoped por RLS.
  const rowsNeedingPhoto = [...arrived, ...inService].filter((r) => r.patientId)
  if (rowsNeedingPhoto.length > 0) {
    // 1 query agrupada por patient_id pra evitar N requests
    const patientIds = [...new Set(rowsNeedingPhoto.map((r) => r.patientId!))]
    const profiles = await Promise.all(
      patientIds.map((pid) =>
        repos.patientProfile.getReceptionDisplayProfile(pid).catch(() => null),
      ),
    )
    const profileByPatient = new Map(
      profiles
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => [p.patientId, p]),
    )

    if (profileByPatient.size > 0) {
      const service = createServiceRoleClient()
      // Signed URLs em paralelo · TTL 5 min · NUNCA expor path bruto
      const signedEntries = await Promise.all(
        Array.from(profileByPatient.values()).map(async (p) => {
          try {
            const { data } = await service.storage
              .from('media')
              .createSignedUrl(p.profilePhotoPath, 60 * 5)
            return [p.patientId, data?.signedUrl ?? null] as const
          } catch {
            return [p.patientId, null] as const
          }
        }),
      )
      const urlByPatient = new Map(signedEntries)

      const applyPhoto = (row: PanelRow) => {
        if (!row.patientId) return
        const profile = profileByPatient.get(row.patientId)
        if (!profile) return
        const signedUrl = urlByPatient.get(row.patientId) ?? null
        row.photoSignedUrl = signedUrl
        row.receptionDisplayName =
          profile.preferredName ?? profile.displayName ?? null
        row.animationStyle = profile.animationStyle
      }
      arrived.forEach(applyPhoto)
      inService.forEach(applyPhoto)
    }
  }

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

export type { PanelRow, AnimationStyle }
