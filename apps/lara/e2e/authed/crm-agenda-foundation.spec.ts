/**
 * E2E · CRM_PARITY_R1 · Agenda Foundation.
 *
 * Cobre os 5 cenários verificados no Round 1 do plano de paridade:
 *   1. Agendar com sala válida → `room_id` é persistido em `appointments`.
 *   2. Profissional em férias bloqueia agendamento (mig 188).
 *   3. Antecedência mínima bloqueia (clinic_settings.antecedencia_min).
 *   4. Fora do expediente bloqueia (clinic_settings.horarios).
 *   5. Conflito de sala mostra nome do paciente conflitante.
 *
 * Pre-requisitos:
 *   - Migrations 188 (`professional_profiles.ferias`), 189 (`sala_id`) e
 *     190 (`appointments.room_id`) aplicadas no banco TEST.
 *   - Pelo menos 1 sala ativa em `clinic_rooms`.
 *   - Pelo menos 1 profissional com `agenda_enabled=true`.
 *
 * Quando as migrations ainda NÃO foram aplicadas, todos os asserts que dependem
 * de `room_id`/`ferias` falham de forma graciosa via test.skip dinâmico
 * (column-presence probe) · permite rodar suite parcial em staging antes de
 * mig apply.
 *
 * Worker 71 OFF · zero WhatsApp · zero provider call · zero cron tocado.
 */
import { test, expect, getAuthedSupabase } from '../_fixtures/auth'

const HAS_TEST_ENVS =
  !!process.env.TEST_SUPABASE_URL &&
  !!process.env.TEST_SUPABASE_ANON_KEY &&
  !!process.env.TEST_USER_EMAIL_OWNER &&
  !!process.env.TEST_USER_PASSWORD
test.skip(
  !HAS_TEST_ENVS,
  'TEST_SUPABASE_* envs ausentes · ver E2E.md secao Happy path E2E setup',
)

test.use({ authedAs: 'owner' })

const E2E_TAG = 'is_e2e_r1'

function futureDateIso(daysAhead: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

function isoToBr(iso: string): string {
  return iso.split('-').reverse().join('/')
}

// Snapshot dos ids criados em cada teste · cleanup em afterAll.
const created: { appointments: string[]; vacationProfId: string | null } = {
  appointments: [],
  vacationProfId: null,
}

test.afterAll(async () => {
  if (!HAS_TEST_ENVS) return
  const sb = await getAuthedSupabase()
  if (created.appointments.length > 0) {
    await sb.from('appointments').delete().in('id', created.appointments)
  }
  // Reverte ferias inseridas durante teste de vacation.
  if (created.vacationProfId) {
    await sb
      .from('professional_profiles')
      .update({ ferias: [] })
      .eq('id', created.vacationProfId)
  }
})

async function probeColumn(
  table: string,
  column: string,
): Promise<boolean> {
  const sb = await getAuthedSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from(table as any).select(column).limit(1) as any)
  return !error
}

test.describe('CRM Parity Round 1 · Agenda Foundation', () => {
  test('R1.1 · cria appointment com room_id persistido', async () => {
    const roomFkApplied = await probeColumn('appointments', 'room_id')
    test.skip(
      !roomFkApplied,
      'mig 190 (appointments.room_id) não aplicada · rode db apply antes',
    )

    const sb = await getAuthedSupabase()
    const { data: rooms } = await sb
      .from('clinic_rooms')
      .select('id, nome')
      .eq('ativo', true)
      .limit(1)
    const room = rooms?.[0]
    test.skip(!room, 'sem sala ativa em clinic_rooms · seed antes do teste')

    const { data: profs } = await sb
      .from('professional_profiles')
      .select('id, display_name')
      .eq('is_active', true)
      .eq('agenda_enabled', true)
      .limit(1)
    const prof = profs?.[0]
    test.skip(!prof, 'sem profissional com agenda habilitada')

    const { data: patients } = await sb
      .from('patients')
      .select('id')
      .eq('status', 'active')
      .limit(1)
    const patient = patients?.[0]
    test.skip(!patient, 'sem paciente ativo')

    const targetDate = futureDateIso(30)
    const { data: inserted, error } = await sb
      .from('appointments')
      .insert({
        patient_id: patient!.id,
        subject_name: 'E2E R1 ' + E2E_TAG,
        scheduled_date: targetDate,
        start_time: '14:00:00',
        end_time: '15:00:00',
        professional_id: prof!.id,
        professional_name: prof!.display_name,
        room_id: room!.id,
        status: 'agendado',
        value: 0,
        obs: E2E_TAG,
      })
      .select('id, room_id')
      .single()

    expect(error).toBeNull()
    expect(inserted?.room_id).toBe(room!.id)
    if (inserted?.id) created.appointments.push(inserted.id)
  })

  test('R1.2 · profissional em férias bloqueia agendamento', async () => {
    const feriasApplied = await probeColumn('professional_profiles', 'ferias')
    test.skip(!feriasApplied, 'mig 188 (ferias) não aplicada')

    const sb = await getAuthedSupabase()
    const { data: profs } = await sb
      .from('professional_profiles')
      .select('id, display_name')
      .eq('is_active', true)
      .eq('agenda_enabled', true)
      .limit(1)
    const prof = profs?.[0]
    test.skip(!prof, 'sem profissional com agenda habilitada')

    const targetDate = futureDateIso(45)
    // Insere férias cobrindo a data alvo.
    await sb
      .from('professional_profiles')
      .update({
        ferias: [
          {
            start_date: targetDate,
            end_date: targetDate,
            reason: 'E2E R1.2 ferias',
          },
        ],
      })
      .eq('id', prof!.id)
    created.vacationProfId = prof!.id

    // Importa lazy para evitar carregar bundle no setup.
    const { createAppointmentAction } = await import(
      '../../src/app/crm/_actions/appointment.actions'
    )

    const r = await createAppointmentAction({
      patientId: null,
      leadId: null,
      subjectName: 'E2E R1.2 bloqueado',
      scheduledDate: targetDate,
      startTime: '14:00',
      endTime: '15:00',
      professionalId: prof!.id,
      status: 'bloqueado',
      origem: 'manual',
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('professional_on_vacation')
      const det = r.details as { start_date?: string; end_date?: string }
      expect(det?.start_date).toBe(targetDate)
      expect(det?.end_date).toBe(targetDate)
    }
  })

  test('R1.3 · antecedência mínima bloqueia se < setting', async () => {
    const sb = await getAuthedSupabase()
    const { data: settingsRow } = await sb
      .from('clinic_settings')
      .select('settings')
      .limit(1)
      .maybeSingle()
    const minHours = Number(
      (settingsRow?.settings as { antecedencia_min?: unknown })
        ?.antecedencia_min ?? 0,
    )
    test.skip(
      !minHours || minHours <= 0,
      'clinic_settings.antecedencia_min não configurado · seed > 0 para validar',
    )

    const { createAppointmentAction } = await import(
      '../../src/app/crm/_actions/appointment.actions'
    )

    // Hoje · horário 5 min no futuro · vai falhar se min > 0.
    const today = futureDateIso(0)
    const now = new Date()
    const targetTime =
      String(now.getHours()).padStart(2, '0') +
      ':' +
      String(now.getMinutes() + 5).padStart(2, '0')

    const r = await createAppointmentAction({
      patientId: null,
      leadId: null,
      subjectName: 'E2E R1.3 antecedencia',
      scheduledDate: today,
      startTime: targetTime,
      endTime: targetTime.replace(/(\d{2}):(\d{2})/, (_m, h, m) => {
        const next = parseInt(m, 10) + 30
        return next >= 60
          ? `${(parseInt(h, 10) + 1).toString().padStart(2, '0')}:${(next - 60).toString().padStart(2, '0')}`
          : `${h}:${next.toString().padStart(2, '0')}`
      }),
      status: 'bloqueado',
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('min_advance_required')
    }
  })

  test('R1.4 · fora do expediente bloqueia', async () => {
    const sb = await getAuthedSupabase()
    const { data: settingsRow } = await sb
      .from('clinic_settings')
      .select('horarios')
      .limit(1)
      .maybeSingle()
    const horarios = settingsRow?.horarios as
      | Record<string, { aberto?: boolean }>
      | null
      | undefined
    test.skip(!horarios, 'clinic_settings.horarios não configurado')

    const { createAppointmentAction } = await import(
      '../../src/app/crm/_actions/appointment.actions'
    )

    // 03:00 da manhã geralmente está fora de qualquer expediente.
    const targetDate = futureDateIso(7)
    const r = await createAppointmentAction({
      patientId: null,
      leadId: null,
      subjectName: 'E2E R1.4 fora expediente',
      scheduledDate: targetDate,
      startTime: '03:00',
      endTime: '04:00',
      status: 'bloqueado',
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      // Aceita outside_working_hours OU min_advance_required (3am pode tropeçar
      // antes na antecedência se a setting cobrir 24h+).
      expect(['outside_working_hours', 'min_advance_required']).toContain(r.error)
    }
  })

  test('R1.5 · conflito de sala retorna nome do paciente conflitante', async () => {
    const roomFkApplied = await probeColumn('appointments', 'room_id')
    test.skip(!roomFkApplied, 'mig 190 não aplicada')

    const sb = await getAuthedSupabase()
    const { data: rooms } = await sb
      .from('clinic_rooms')
      .select('id, nome')
      .eq('ativo', true)
      .limit(1)
    const room = rooms?.[0]
    test.skip(!room, 'sem sala ativa')

    const { data: patients } = await sb
      .from('patients')
      .select('id, name')
      .eq('status', 'active')
      .limit(2)
    const [pA, pB] = patients ?? []
    test.skip(
      !pA || !pB,
      'precisamos 2 pacientes distintos para testar conflito',
    )

    const targetDate = futureDateIso(60)
    // Cria primeiro com sala X.
    const { data: first } = await sb
      .from('appointments')
      .insert({
        patient_id: pA!.id,
        subject_name: pA!.name,
        scheduled_date: targetDate,
        start_time: '10:00:00',
        end_time: '11:00:00',
        room_id: room!.id,
        status: 'agendado',
        value: 0,
        obs: E2E_TAG,
      })
      .select('id')
      .single()
    if (first?.id) created.appointments.push(first.id)

    // Tenta segundo overlap na mesma sala.
    const { checkAppointmentConflictAction } = await import(
      '../../src/app/crm/_actions/appointment.actions'
    )
    const r = await checkAppointmentConflictAction({
      scheduledDate: targetDate,
      startTime: '10:30',
      endTime: '11:30',
      roomId: room!.id,
      patientId: pB!.id,
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.hasConflict).toBe(true)
      expect(r.data.counts.room).toBeGreaterThan(0)
      const roomDetail = r.data.details.find((d) => d.kind === 'room')
      expect(roomDetail).toBeTruthy()
      expect(roomDetail?.subjectName).toBe(pA!.name)
    }
    // Demo: msg verbatim formada pelo UI seria
    // `Sala ${room.nome} ocupada · ${pA.name} (${roomDetail.startTime}-${roomDetail.endTime}) · ${isoToBr(targetDate)}`
    isoToBr(targetDate) // keep helper referenced
  })
})
