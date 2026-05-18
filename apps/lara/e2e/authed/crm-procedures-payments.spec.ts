/**
 * E2E · CRM_PARITY_R2 · Multi-Procedimento + Multi-Pagamento.
 *
 * Cobre 6 cenários do Round 2 do plano de paridade:
 *   R2.1 · 2 procedimentos em 1 appointment → 2 linhas em
 *           `appointment_procedure_items`, view 195 agrega gross/net.
 *   R2.2 · Procedimento cortesia exige courtesy_reason ≥ 3 chars · net=0.
 *   R2.3 · discount_amount > unit_price → CHECK constraint rejeita.
 *   R2.4 · Pagamento parcial (paid_total < net_total) → view 195
 *          derived_payment_status='parcial'.
 *   R2.5 · Pagamento excedente (paid > net) → view 195 retorna 'pago'
 *          (excesso ainda conta como pago) · balance_total negativo.
 *   R2.6 · Regressão: agendamento single-procedure legado (sem items)
 *          continua funcionando via colunas `appointments.value` /
 *          `appointments.payment_method`.
 *
 * Pré-requisitos:
 *   - Migrations 193 (`appointment_procedure_items`), 194
 *     (`appointment_payments`) e 195 (view `appointment_financial_summary`)
 *     aplicadas no banco TEST.
 *   - Pelo menos 1 paciente, 1 profissional `agenda_enabled=true`.
 *
 * Quando migrations ainda NÃO aplicadas, asserts dependentes pulam via
 * column-presence probe (test.skip dinâmico).
 *
 * Worker 71 OFF · zero WhatsApp · zero provider call · zero cron tocado.
 *
 * NOTA: este spec NÃO usa dynamic import de Server Actions (incompatível
 * com Playwright runner). Inserts via Supabase JS diretos.
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

const E2E_TAG = 'is_e2e_r2'

function futureDateIso(daysAhead: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

const created: {
  appointments: string[]
  items: string[]
  payments: string[]
} = {
  appointments: [],
  items: [],
  payments: [],
}

test.afterAll(async () => {
  if (!HAS_TEST_ENVS) return
  const sb = await getAuthedSupabase()
  // Soft-delete dos rows criados pra não interferir com outros suites.
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

async function probeColumn(
  table: string,
  column: string,
): Promise<boolean> {
  const sb = await getAuthedSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from(table as any).select(column).limit(1) as any)
  return !error
}

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

async function createAppointment(
  professionalId: string,
  patientId: string,
  date: string,
): Promise<string | null> {
  const sb = await getAuthedSupabase()
  const { data, error } = await sb
    .from('appointments')
    .insert({
      patient_id: patientId,
      subject_name: 'E2E R2 ' + E2E_TAG,
      professional_id: professionalId,
      scheduled_date: date,
      start_time: '14:00',
      end_time: '15:00',
      status: 'agendado',
      payment_status: 'pendente',
      origem: 'manual',
    })
    .select('id')
    .single()
  if (error || !data) return null
  created.appointments.push(data.id)
  return data.id
}

test.describe('CRM Parity Round 2 · Procedimentos + Pagamentos', () => {
  test('R2.1 · 2 procedimentos em 1 appointment · view agrega', async () => {
    const itemsApplied = await probeTable('appointment_procedure_items')
    test.skip(!itemsApplied, 'mig 193 (appointment_procedure_items) não aplicada')
    const viewApplied = await probeTable('appointment_financial_summary')
    test.skip(!viewApplied, 'mig 195 (view) não aplicada')

    const { sb, prof, patient } = await getSeed()
    test.skip(!prof, 'sem profissional · seed antes')
    test.skip(!patient, 'sem paciente ativo · seed antes')

    const apptId = await createAppointment(
      prof!.id,
      patient!.id,
      futureDateIso(30),
    )
    expect(apptId).toBeTruthy()

    const { data: clinicProfile } = await sb
      .from('appointments')
      .select('clinic_id')
      .eq('id', apptId!)
      .single()
    const clinicId = clinicProfile?.clinic_id
    expect(clinicId).toBeTruthy()

    const rows = [
      {
        clinic_id: clinicId,
        appointment_id: apptId,
        procedure_name: 'Botox testa',
        quantity: 1,
        unit_price: 1200,
        gross_amount: 1200,
        discount_amount: 0,
        net_amount: 1200,
        sort_order: 0,
      },
      {
        clinic_id: clinicId,
        appointment_id: apptId,
        procedure_name: 'Botox glabela',
        quantity: 1,
        unit_price: 800,
        gross_amount: 800,
        discount_amount: 100,
        net_amount: 700,
        sort_order: 1,
      },
    ]
    const { data: inserted, error } = await sb
      .from('appointment_procedure_items')
      .insert(rows)
      .select('id')
    expect(error).toBeNull()
    expect(inserted?.length).toBe(2)
    inserted?.forEach((r) => created.items.push(r.id))

    const { data: summary } = await sb
      .from('appointment_financial_summary')
      .select('*')
      .eq('appointment_id', apptId!)
      .single()
    expect(summary).toBeTruthy()
    expect(Number(summary!.gross_total)).toBeCloseTo(2000, 2)
    expect(Number(summary!.discount_total)).toBeCloseTo(100, 2)
    expect(Number(summary!.net_total)).toBeCloseTo(1900, 2)
    expect(Number(summary!.procedure_items_count)).toBe(2)
    expect(summary!.derived_payment_status).toBe('pendente')
  })

  test('R2.2 · cortesia exige motivo · net=0', async () => {
    const itemsApplied = await probeTable('appointment_procedure_items')
    test.skip(!itemsApplied, 'mig 193 não aplicada')

    const { sb, prof, patient } = await getSeed()
    test.skip(!prof, 'sem profissional')
    test.skip(!patient, 'sem paciente')

    const apptId = await createAppointment(
      prof!.id,
      patient!.id,
      futureDateIso(31),
    )
    const { data: ap } = await sb
      .from('appointments')
      .select('clinic_id')
      .eq('id', apptId!)
      .single()

    // sem motivo · CHECK rejeita
    const { error: errNoReason } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: ap!.clinic_id,
        appointment_id: apptId,
        procedure_name: 'Consulta cortesia',
        quantity: 1,
        unit_price: 0,
        gross_amount: 0,
        discount_amount: 0,
        net_amount: 0,
        is_courtesy: true,
        courtesy_reason: null,
      })
    expect(errNoReason).not.toBeNull()

    // com motivo + net=0 · OK
    const { data: ok, error: errOk } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: ap!.clinic_id,
        appointment_id: apptId,
        procedure_name: 'Consulta cortesia',
        quantity: 1,
        unit_price: 0,
        gross_amount: 0,
        discount_amount: 0,
        net_amount: 0,
        is_courtesy: true,
        courtesy_reason: 'Indicação amiga da clínica',
      })
      .select('id')
      .single()
    expect(errOk).toBeNull()
    expect(ok).toBeTruthy()
    if (ok) created.items.push(ok.id)
  })

  test('R2.3 · discount > gross é rejeitado pelo CHECK', async () => {
    const itemsApplied = await probeTable('appointment_procedure_items')
    test.skip(!itemsApplied, 'mig 193 não aplicada')

    const { sb, prof, patient } = await getSeed()
    test.skip(!prof || !patient, 'sem seed')

    const apptId = await createAppointment(
      prof!.id,
      patient!.id,
      futureDateIso(32),
    )
    const { data: ap } = await sb
      .from('appointments')
      .select('clinic_id')
      .eq('id', apptId!)
      .single()

    const { error } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: ap!.clinic_id,
        appointment_id: apptId,
        procedure_name: 'Item com desconto inválido',
        quantity: 1,
        unit_price: 100,
        gross_amount: 100,
        discount_amount: 150,
        net_amount: 0,
      })
    expect(error).not.toBeNull()
  })

  test('R2.4 · pagamento parcial → derived_payment_status=parcial', async () => {
    const paymentsApplied = await probeTable('appointment_payments')
    const viewApplied = await probeTable('appointment_financial_summary')
    test.skip(
      !paymentsApplied || !viewApplied,
      'mig 194/195 não aplicadas',
    )

    const { sb, prof, patient } = await getSeed()
    test.skip(!prof || !patient, 'sem seed')

    const apptId = await createAppointment(
      prof!.id,
      patient!.id,
      futureDateIso(33),
    )
    const { data: ap } = await sb
      .from('appointments')
      .select('clinic_id')
      .eq('id', apptId!)
      .single()
    const clinicId = ap!.clinic_id

    const { data: item } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: clinicId,
        appointment_id: apptId,
        procedure_name: 'Sessão laser',
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
        appointment_id: apptId,
        payment_method: 'pix',
        amount: 200,
        status: 'pago',
      })
      .select('id')
      .single()
    if (pay) created.payments.push(pay.id)

    const { data: summary } = await sb
      .from('appointment_financial_summary')
      .select('*')
      .eq('appointment_id', apptId!)
      .single()
    expect(summary!.derived_payment_status).toBe('parcial')
    expect(Number(summary!.paid_total)).toBeCloseTo(200, 2)
    expect(Number(summary!.balance_total)).toBeCloseTo(300, 2)
  })

  test('R2.5 · pagamento excedente → status pago + balance negativo', async () => {
    const paymentsApplied = await probeTable('appointment_payments')
    const viewApplied = await probeTable('appointment_financial_summary')
    test.skip(
      !paymentsApplied || !viewApplied,
      'mig 194/195 não aplicadas',
    )

    const { sb, prof, patient } = await getSeed()
    test.skip(!prof || !patient, 'sem seed')

    const apptId = await createAppointment(
      prof!.id,
      patient!.id,
      futureDateIso(34),
    )
    const { data: ap } = await sb
      .from('appointments')
      .select('clinic_id')
      .eq('id', apptId!)
      .single()
    const clinicId = ap!.clinic_id

    const { data: item } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: clinicId,
        appointment_id: apptId,
        procedure_name: 'Item 100',
        quantity: 1,
        unit_price: 100,
        gross_amount: 100,
        discount_amount: 0,
        net_amount: 100,
      })
      .select('id')
      .single()
    if (item) created.items.push(item.id)

    const { data: pay } = await sb
      .from('appointment_payments')
      .insert({
        clinic_id: clinicId,
        appointment_id: apptId,
        payment_method: 'pix',
        amount: 150,
        status: 'pago',
      })
      .select('id')
      .single()
    if (pay) created.payments.push(pay.id)

    const { data: summary } = await sb
      .from('appointment_financial_summary')
      .select('*')
      .eq('appointment_id', apptId!)
      .single()
    expect(summary!.derived_payment_status).toBe('pago')
    expect(Number(summary!.balance_total)).toBeCloseTo(-50, 2)
  })

  test('R2.6 · regressão single-procedure legado continua funcionando', async () => {
    // Não depende de mig 193/194 · valida que appointments single ainda OK.
    const { sb, prof, patient } = await getSeed()
    test.skip(!prof || !patient, 'sem seed')

    const apptId = await createAppointment(
      prof!.id,
      patient!.id,
      futureDateIso(35),
    )
    expect(apptId).toBeTruthy()

    // Update legacy `value` + `payment_method`.
    const { error } = await sb
      .from('appointments')
      .update({
        value: 250,
        payment_method: 'pix',
        payment_status: 'pago',
      })
      .eq('id', apptId!)
    expect(error).toBeNull()

    const { data: appt } = await sb
      .from('appointments')
      .select('value, payment_method, payment_status')
      .eq('id', apptId!)
      .single()
    expect(Number(appt!.value)).toBeCloseTo(250, 2)
    expect(appt!.payment_method).toBe('pix')
    expect(appt!.payment_status).toBe('pago')
  })
})
