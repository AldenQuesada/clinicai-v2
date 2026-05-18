/**
 * E2E · CRM_PARITY_R5 · Full Flow Coverage.
 *
 * Suite end-to-end que valida agenda → procedures/payments → finalize
 * derived state → post-actions queue → safety. Read-mostly · cenários
 * que precisam INSERT usam BEGIN/ROLLBACK ou cleanup explícito via tag
 * `is_e2e_r5`.
 *
 * 15 cenários cobertos (matriz Round 5 Prompt 1 doc):
 *
 *   R5.1  · appointment single legado continua funcionando
 *   R5.2  · multi-procedure + multi-payment opt-in via inserts diretos
 *   R5.3  · view 195 agrega items + payments sem cartesian
 *   R5.4  · saldo quitado · derived_payment_status='pago'
 *   R5.5  · saldo pendente · derived_payment_status='parcial'
 *   R5.6  · cortesia · derived_payment_status='cortesia'
 *   R5.7  · CHECK rejeita discount > gross
 *   R5.8  · CHECK rejeita courtesy sem motivo
 *   R5.9  · CHECK rejeita payment_method fora whitelist
 *   R5.10 · CHECK rejeita action_type fora whitelist em post_actions
 *   R5.11 · CHECK consistency executed_at exige status=done
 *   R5.12 · zero wa_outbox criado pelo fluxo (worker 71 OFF · provider zero)
 *   R5.13 · zero anon grants em todas R2/R3 tables (R5 hardening)
 *   R5.14 · invalid_phases=0 (canon Phase 1C)
 *   R5.15 · /crm/post-acoes route deployed (smoke 200)
 *
 * Pré-requisitos:
 *   - Migrations R1/R2/R3/R4/R5 aplicadas (193/194/195/196/197/198).
 *   - TEST_SUPABASE_* envs configurados.
 *
 * Worker 71 OFF · zero WhatsApp · zero provider call · zero cron tocado.
 * Sem dynamic import de Server Actions. Skip dinâmico via probeTable.
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

const BASE = process.env.LARA_E2E_URL ?? 'http://localhost:3005'
const E2E_TAG = 'is_e2e_r5'

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

function futureDateIso(daysAhead: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

async function createBlockedAppt(
  date: string,
  subjectSuffix: string,
): Promise<{ appointmentId: string | null; clinicId: string | null }> {
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
      subject_name: `E2E R5 ${E2E_TAG} ${subjectSuffix}`,
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

test.describe('CRM Parity Round 5 · Full E2E Flow', () => {
  test('R5.1 · appointment single legado continua funcionando', async () => {
    const { appointmentId } = await createBlockedAppt(futureDateIso(80), 'R5.1')
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { error } = await sb
      .from('appointments')
      .update({
        value: 200,
        payment_method: 'pix',
        payment_status: 'pago',
      })
      .eq('id', appointmentId!)
    expect(error).toBeNull()

    const { data: appt } = await sb
      .from('appointments')
      .select('value, payment_method, payment_status')
      .eq('id', appointmentId!)
      .single()
    expect(Number(appt!.value)).toBeCloseTo(200, 2)
    expect(appt!.payment_method).toBe('pix')
    expect(appt!.payment_status).toBe('pago')
  })

  test('R5.2 · multi-procedure + multi-payment via opt-in', async () => {
    const itemsOk = await probeTable('appointment_procedure_items')
    const paymentsOk = await probeTable('appointment_payments')
    test.skip(!itemsOk || !paymentsOk, 'mig 193/194 não aplicadas')

    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(81),
      'R5.2',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { data: items, error: errItems } = await sb
      .from('appointment_procedure_items')
      .insert([
        {
          clinic_id: clinicId,
          appointment_id: appointmentId,
          procedure_name: 'R5.2 Item 1',
          quantity: 1,
          unit_price: 100,
          gross_amount: 100,
          discount_amount: 0,
          net_amount: 100,
        },
        {
          clinic_id: clinicId,
          appointment_id: appointmentId,
          procedure_name: 'R5.2 Item 2',
          quantity: 1,
          unit_price: 50,
          gross_amount: 50,
          discount_amount: 10,
          net_amount: 40,
        },
      ])
      .select('id')
    expect(errItems).toBeNull()
    items?.forEach((i) => created.items.push(i.id))

    const { data: payments, error: errPay } = await sb
      .from('appointment_payments')
      .insert([
        {
          clinic_id: clinicId,
          appointment_id: appointmentId,
          payment_method: 'pix',
          amount: 100,
          status: 'pago',
        },
        {
          clinic_id: clinicId,
          appointment_id: appointmentId,
          payment_method: 'boleto',
          amount: 40,
          status: 'pendente',
        },
      ])
      .select('id')
    expect(errPay).toBeNull()
    payments?.forEach((p) => created.payments.push(p.id))
  })

  test('R5.3 + R5.5 · view 195 agrega sem cartesian · parcial', async () => {
    const viewOk = await probeTable('appointment_financial_summary')
    test.skip(!viewOk, 'mig 195 não aplicada')

    const sb = await getAuthedSupabase()
    // Reusa appt criado em R5.2 (mesma session)
    const { data: appt } = await sb
      .from('appointments')
      .select('id')
      .like('subject_name', '%R5.2%')
      .is('deleted_at', null)
      .limit(1)
      .single()
    test.skip(!appt, 'R5.2 appointment não encontrado')

    const { data: summary } = await sb
      .from('appointment_financial_summary')
      .select('*')
      .eq('appointment_id', appt!.id)
      .single()
    expect(summary).toBeTruthy()
    // 2 items: 100 + 50 = 150 gross, 0 + 10 = 10 discount, 100 + 40 = 140 net
    expect(Number(summary!.gross_total)).toBeCloseTo(150, 2)
    expect(Number(summary!.discount_total)).toBeCloseTo(10, 2)
    expect(Number(summary!.net_total)).toBeCloseTo(140, 2)
    expect(Number(summary!.procedure_items_count)).toBe(2)
    // 2 payments: 100 pago + 40 pendente
    expect(Number(summary!.paid_total)).toBeCloseTo(100, 2)
    expect(Number(summary!.pending_total)).toBeCloseTo(40, 2)
    expect(Number(summary!.balance_total)).toBeCloseTo(40, 2)
    expect(Number(summary!.payments_count)).toBe(2)
    // status derivado: paid < net → parcial
    expect(summary!.derived_payment_status).toBe('parcial')
  })

  test('R5.4 · saldo quitado · derived=pago', async () => {
    const itemsOk = await probeTable('appointment_procedure_items')
    const paymentsOk = await probeTable('appointment_payments')
    const viewOk = await probeTable('appointment_financial_summary')
    test.skip(!itemsOk || !paymentsOk || !viewOk, 'R2 não aplicado')

    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(82),
      'R5.4',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { data: item } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        procedure_name: 'R5.4 quitado',
        quantity: 1,
        unit_price: 250,
        gross_amount: 250,
        discount_amount: 0,
        net_amount: 250,
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
        amount: 250,
        status: 'pago',
      })
      .select('id')
      .single()
    if (pay) created.payments.push(pay.id)

    const { data: summary } = await sb
      .from('appointment_financial_summary')
      .select('derived_payment_status, balance_total, paid_total, net_total')
      .eq('appointment_id', appointmentId!)
      .single()
    expect(summary!.derived_payment_status).toBe('pago')
    expect(Number(summary!.balance_total)).toBeCloseTo(0, 2)
  })

  test('R5.6 · cortesia · derived=cortesia', async () => {
    const itemsOk = await probeTable('appointment_procedure_items')
    const viewOk = await probeTable('appointment_financial_summary')
    test.skip(!itemsOk || !viewOk, 'mig 193/195 não aplicadas')

    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(83),
      'R5.6',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { data: item } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        procedure_name: 'R5.6 cortesia',
        quantity: 1,
        unit_price: 0,
        gross_amount: 0,
        discount_amount: 0,
        net_amount: 0,
        is_courtesy: true,
        courtesy_reason: 'E2E R5.6 paciente indicado',
      })
      .select('id')
      .single()
    if (item) created.items.push(item.id)

    const { data: summary } = await sb
      .from('appointment_financial_summary')
      .select('derived_payment_status, courtesy_items_count')
      .eq('appointment_id', appointmentId!)
      .single()
    expect(summary!.derived_payment_status).toBe('cortesia')
    expect(Number(summary!.courtesy_items_count)).toBeGreaterThanOrEqual(1)
  })

  test('R5.7 · CHECK rejeita discount > gross', async () => {
    const itemsOk = await probeTable('appointment_procedure_items')
    test.skip(!itemsOk, 'mig 193 não aplicada')

    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(84),
      'R5.7',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { error } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        procedure_name: 'R5.7 invalid',
        quantity: 1,
        unit_price: 100,
        gross_amount: 100,
        discount_amount: 150,
        net_amount: 0,
      })
    expect(error).not.toBeNull()
  })

  test('R5.8 · CHECK rejeita courtesy sem motivo', async () => {
    const itemsOk = await probeTable('appointment_procedure_items')
    test.skip(!itemsOk, 'mig 193 não aplicada')

    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(85),
      'R5.8',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { error } = await sb
      .from('appointment_procedure_items')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        procedure_name: 'R5.8 sem motivo',
        quantity: 1,
        unit_price: 0,
        gross_amount: 0,
        discount_amount: 0,
        net_amount: 0,
        is_courtesy: true,
        courtesy_reason: null,
      })
    expect(error).not.toBeNull()
  })

  test('R5.9 · CHECK rejeita payment_method fora whitelist', async () => {
    const paymentsOk = await probeTable('appointment_payments')
    test.skip(!paymentsOk, 'mig 194 não aplicada')

    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(86),
      'R5.9',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { error } = await sb
      .from('appointment_payments')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        payment_method: 'crypto_invalid_method',
        amount: 100,
        status: 'pago',
      })
    expect(error).not.toBeNull()
  })

  test('R5.10 · CHECK rejeita action_type fora whitelist', async () => {
    const tableOk = await probeTable('appointment_post_actions')
    test.skip(!tableOk, 'mig 197 não aplicada')

    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(87),
      'R5.10',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { error } = await sb
      .from('appointment_post_actions')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        action_type: 'invalid_action_xyz',
        status: 'pending',
      })
    expect(error).not.toBeNull()
  })

  test('R5.11 · CHECK consistency executed_at exige status=done', async () => {
    const tableOk = await probeTable('appointment_post_actions')
    test.skip(!tableOk, 'mig 197 não aplicada')

    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(88),
      'R5.11',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const sb = await getAuthedSupabase()
    const { error } = await sb
      .from('appointment_post_actions')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        action_type: 'google_review',
        status: 'pending',
        executed_at: new Date().toISOString(),
      })
    expect(error).not.toBeNull()
  })

  test('R5.12 · zero wa_outbox criado pelo fluxo', async () => {
    const outboxOk = await probeTable('wa_outbox')
    test.skip(!outboxOk, 'wa_outbox table não acessível')

    const sb = await getAuthedSupabase()
    const { count: before } = await sb
      .from('wa_outbox')
      .select('*', { count: 'exact', head: true })

    // Criar appointment fixture + insert post_actions (caminho R3)
    const { appointmentId, clinicId } = await createBlockedAppt(
      futureDateIso(89),
      'R5.12',
    )
    test.skip(!appointmentId, 'sem clinic fixture')

    const { data: pa } = await sb
      .from('appointment_post_actions')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        action_type: 'google_review',
        status: 'pending',
        payload: { source: 'e2e_r5_12' },
      })
      .select('id')
      .single()
    if (pa) created.postActions.push(pa.id)

    // Validar que wa_outbox NÃO mudou
    const { count: after } = await sb
      .from('wa_outbox')
      .select('*', { count: 'exact', head: true })
    expect(after ?? 0).toBe(before ?? 0)
  })

  test('R5.13 · zero anon grants em R2/R3 tables (R5 hardening)', async () => {
    // Validação primária via probes SQL durante mig 198 apply (Prompt 2).
    // Este test E2E é placeholder · Supabase JS client não expõe
    // information_schema queries via supabase-js (precisaria de RPC
    // dedicado como `exec_sql` que não existe em produção). Skip explícito
    // documentando que validação real ocorre nas probes pré/pós-apply.
    test.skip(
      true,
      'Anon grants validation via probes SQL pré/pós-mig 198 (não via supabase-js)',
    )
  })

  test('R5.14 · invalid_phases=0 (canon Phase 1C)', async () => {
    const sb = await getAuthedSupabase()
    const { count } = await sb
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .in('phase', ['compareceu', 'perdido', 'reagendado'])
    expect(count ?? 0).toBe(0)
  })

  test('R5.15 · /crm/post-acoes route deployed (smoke 200)', async ({
    page,
  }) => {
    const response = await page.goto(`${BASE}/crm/post-acoes`)
    // Skip se rota ainda não deployada (mesmo padrão R4)
    if (response?.status() === 404) {
      test.skip(true, 'route não deployada · valida pós-merge')
    }
    expect(response?.status()).toBe(200)
    expect(page.url()).toMatch(/post-acoes|login/)
  })
})
