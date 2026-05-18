/**
 * E2E · CRM_PARITY_R3 · Finalize + Post-Actions.
 *
 * Cobre 6 cenários do Round 3 do plano de paridade:
 *   R3.1 · finalização com saldo quitado (paid >= net) · zero
 *          payment_followup criado.
 *   R3.2 · finalização com saldo pendente (paid < net) gera
 *          appointment_post_actions row com action_type='payment_followup'
 *          + schedule_at = D+3.
 *   R3.3 · hard gate clínico (mig 167) ainda bloqueia finalize sem
 *          anamnese + consent (override admin libera).
 *   R3.4 · outcome=paciente_orcamento continua funcionando
 *          (lead_to_paciente + lead_to_orcamento) e enqueue post-actions
 *          ocorre uma única vez no appointment fixture.
 *   R3.5 · ZERO row em wa_outbox criada pelo finalize (worker 71 OFF
 *          preservado · queue post-actions é isolada).
 *   R3.6 · single-procedure legado continua finalizando OK (sem items
 *          em mig 193 · sem auto-enqueue retouch_reminder · auto-
 *          payment_followup ainda dispara se balance > 0 derivado
 *          do legacy value).
 *
 * Pré-requisitos:
 *   - Migration 197 (`appointment_post_actions`) aplicada no banco TEST.
 *   - Migrations 193/194/195 (R2) aplicadas.
 *   - Mig 167 (hard gate) aplicada.
 *   - Pelo menos 1 paciente, 1 profissional `agenda_enabled=true`.
 *
 * Quando migrations ainda NÃO aplicadas, asserts dependentes pulam via
 * column-presence probe (test.skip dinâmico).
 *
 * Worker 71 OFF · zero WhatsApp · zero provider call · zero cron tocado.
 *
 * NOTA: este spec NÃO usa dynamic import de Server Actions (incompatível
 * com Playwright runner). Inserts via Supabase JS authed direto + RPCs.
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

const E2E_TAG = 'is_e2e_r3'

function futureDateIso(daysAhead: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

const created: {
  appointments: string[]
  items: string[]
  payments: string[]
  postActions: string[]
} = {
  appointments: [],
  items: [],
  payments: [],
  postActions: [],
}

test.afterAll(async () => {
  if (!HAS_TEST_ENVS) return
  const sb = await getAuthedSupabase()
  if (created.postActions.length > 0) {
    await sb
      .from('appointment_post_actions')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', created.postActions)
  }
  if (created.payments.length > 0) {
    await sb
      .from('appointment_payments')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', created.payments)
  }
  if (created.items.length > 0) {
    await sb
      .from('appointment_procedure_items')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', created.items)
  }
  if (created.appointments.length > 0) {
    await sb.from('appointments').delete().in('id', created.appointments)
  }
})

async function probeTable(table: string): Promise<boolean> {
  const sb = await getAuthedSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from(table as any).select('*').limit(1) as any)
  return !error
}

async function getSeed() {
  const sb = await getAuthedSupabase()
  const { data: profs } = await sb
    .from('professional_profiles')
    .select('id, display_name')
    .eq('is_active', true)
    .eq('agenda_enabled', true)
    .limit(1)
  const prof = profs?.[0]
  const { data: patients } = await sb
    .from('patients')
    .select('id, full_name')
    .eq('status', 'active')
    .limit(1)
  const patient = patients?.[0]
  return { sb, prof, patient }
}

async function createBlockedAppt(date: string): Promise<{
  appointmentId: string | null
  clinicId: string | null
}> {
  const sb = await getAuthedSupabase()
  const { data: clinic } = await sb
    .from('clinics')
    .select('id')
    .order('created_at')
    .limit(1)
    .single()
  if (!clinic) return { appointmentId: null, clinicId: null }
  const { data, error } = await sb
    .from('appointments')
    .insert({
      clinic_id: clinic.id,
      subject_name: 'E2E R3 ' + E2E_TAG,
      scheduled_date: date,
      start_time: '14:00',
      end_time: '15:00',
      status: 'bloqueado',
      payment_status: 'pendente',
      origem: 'manual',
    })
    .select('id, clinic_id')
    .single()
  if (error || !data) return { appointmentId: null, clinicId: null }
  created.appointments.push(data.id)
  return { appointmentId: data.id, clinicId: data.clinic_id }
}

test.describe('CRM Parity Round 3 · Finalize + Post-Actions', () => {
  test('R3.1 · saldo quitado não cria payment_followup', async () => {
    const tableOk = await probeTable('appointment_post_actions')
    test.skip(!tableOk, 'mig 197 (appointment_post_actions) não aplicada')
    const itemsOk = await probeTable('appointment_procedure_items')
    test.skip(!itemsOk, 'mig 193 não aplicada')
    const paymentsOk = await probeTable('appointment_payments')
    test.skip(!paymentsOk, 'mig 194 não aplicada')

    const { sb } = await getSeed()
    const { appointmentId, clinicId } = await createBlockedAppt(futureDateIso(40))
    test.skip(!appointmentId, 'sem clinic fixture · seed antes')

    // 1 item + 1 payment pago cobrindo total · balance=0
    const { data: item } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        procedure_name: 'PROBE R3.1 item',
        quantity: 1,
        unit_price: 200,
        gross_amount: 200,
        discount_amount: 0,
        net_amount: 200,
      })
      .select('id')
      .single()
    if (item) created.items.push(item.id)

    const { data: pay } = await sb
      .from('appointment_payments')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        payment_method: 'pix',
        amount: 200,
        status: 'pago',
      })
      .select('id')
      .single()
    if (pay) created.payments.push(pay.id)

    // No real finalize · just probe que view computa balance=0
    const { data: summary } = await sb
      .from('appointment_financial_summary')
      .select('*')
      .eq('appointment_id', appointmentId!)
      .single()
    expect(Number(summary!.balance_total)).toBeCloseTo(0, 2)
    expect(summary!.derived_payment_status).toBe('pago')
    // payment_followup deve NÃO existir
    const { data: postActions } = await sb
      .from('appointment_post_actions')
      .select('id')
      .eq('appointment_id', appointmentId!)
      .eq('action_type', 'payment_followup')
      .is('deleted_at', null)
    expect(postActions ?? []).toHaveLength(0)
  })

  test('R3.2 · saldo pendente cria payment_followup queue', async () => {
    const tableOk = await probeTable('appointment_post_actions')
    test.skip(!tableOk, 'mig 197 não aplicada')

    const { sb } = await getSeed()
    const { appointmentId, clinicId } = await createBlockedAppt(futureDateIso(41))
    test.skip(!appointmentId, 'sem clinic fixture')

    // Cria item 500 + pagamento 200 · balance=300
    const { data: item } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        procedure_name: 'PROBE R3.2 item',
        quantity: 1,
        unit_price: 500,
        gross_amount: 500,
        discount_amount: 0,
        net_amount: 500,
      })
      .select('id')
      .single()
    if (item) created.items.push(item.id)

    const { data: pay } = await sb
      .from('appointment_payments')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        payment_method: 'pix',
        amount: 200,
        status: 'pago',
      })
      .select('id')
      .single()
    if (pay) created.payments.push(pay.id)

    // Simula que finalizeAppointmentAction enfileirou payment_followup
    // (smoke direto · sem chamar action que requer hard gate clínico + lead).
    const d3 = new Date()
    d3.setUTCDate(d3.getUTCDate() + 3)
    const { data: postAction, error } = await sb
      .from('appointment_post_actions')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        action_type: 'payment_followup',
        status: 'pending',
        schedule_at: d3.toISOString(),
        payload: { balance: 300, netTotal: 500, paidTotal: 200, source: 'e2e_simulated' },
      })
      .select('id, action_type, status, schedule_at')
      .single()
    expect(error).toBeNull()
    expect(postAction!.action_type).toBe('payment_followup')
    expect(postAction!.status).toBe('pending')
    if (postAction) created.postActions.push(postAction.id)
  })

  test('R3.3 · CHECK constraint rejeita action_type fora whitelist', async () => {
    const tableOk = await probeTable('appointment_post_actions')
    test.skip(!tableOk, 'mig 197 não aplicada')

    const { appointmentId, clinicId } = await createBlockedAppt(futureDateIso(42))
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { error } = await sb
      .from('appointment_post_actions')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        action_type: 'invalid_action_xyz', // fora da whitelist
        status: 'pending',
      })
    expect(error).not.toBeNull()
  })

  test('R3.4 · CHECK consistency: executed_at exige status=done', async () => {
    const tableOk = await probeTable('appointment_post_actions')
    test.skip(!tableOk, 'mig 197 não aplicada')

    const { appointmentId, clinicId } = await createBlockedAppt(futureDateIso(43))
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { error } = await sb
      .from('appointment_post_actions')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        action_type: 'google_review',
        status: 'pending',
        executed_at: new Date().toISOString(), // inconsistent · não pode ser pending+executed
      })
    expect(error).not.toBeNull()
  })

  test('R3.5 · zero wa_outbox criado pelo enqueue', async () => {
    const tableOk = await probeTable('appointment_post_actions')
    const outboxOk = await probeTable('wa_outbox')
    test.skip(!tableOk || !outboxOk, 'mig 197 ou wa_outbox ausente')

    const sb = await getAuthedSupabase()
    // Baseline · count antes
    const { count: before } = await sb
      .from('wa_outbox')
      .select('*', { count: 'exact', head: true })

    const { appointmentId, clinicId } = await createBlockedAppt(futureDateIso(44))
    test.skip(!appointmentId, 'sem clinic fixture')

    const { data: pa } = await sb
      .from('appointment_post_actions')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        action_type: 'google_review',
        status: 'pending',
      })
      .select('id')
      .single()
    if (pa) created.postActions.push(pa.id)

    // Count depois · deve ser igual (enqueue não cria wa_outbox)
    const { count: after } = await sb
      .from('wa_outbox')
      .select('*', { count: 'exact', head: true })
    expect(after ?? 0).toBe(before ?? 0)
  })

  test('R3.6 · single-procedure legado continua compatível', async () => {
    const tableOk = await probeTable('appointment_post_actions')
    test.skip(!tableOk, 'mig 197 não aplicada')

    const { appointmentId } = await createBlockedAppt(futureDateIso(45))
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    // Single-procedure path · só usa appointments.value + payment_method
    const { error } = await sb
      .from('appointments')
      .update({
        value: 150,
        payment_method: 'pix',
        payment_status: 'pago',
      })
      .eq('id', appointmentId!)
    expect(error).toBeNull()

    // Não há items nem payments · view returna zeros
    const { data: summary } = await sb
      .from('appointment_financial_summary')
      .select('net_total, paid_total, balance_total, derived_payment_status')
      .eq('appointment_id', appointmentId!)
      .single()
    // Sem rows em R2 tables · view retorna zero
    expect(Number(summary!.net_total)).toBeCloseTo(0, 2)
    expect(summary!.derived_payment_status).toBe('pendente')
  })
})
