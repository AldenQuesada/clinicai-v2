/**
 * E2E · CRM_BACKEND_CANONICAL_PHASE_SWEEP (2026-05-18).
 *
 * Cenario: valida o pipeline canonico v2 sem 'compareceu' como phase.
 *
 *   1. lead_create  · lead em phase='lead'
 *   2. lead_to_appointment · phase='agendado' + appointment.status='agendado'
 *   3. appointment_attend  · status='na_clinica' (NAO toca lead.phase)
 *   4. appointment_finalize(outcome='paciente') · status='finalizado' +
 *      lead.phase='paciente' via lead_to_paciente (NAO passa por 'compareceu')
 *   5. SQL asserts no leads, appointments, patients, phase_history
 *
 * O spec roda as RPCs direto via supabase-js (autenticado como E2E owner).
 * Eh o caminho mais robusto pra verificar contratos · UI nao tem fluxo
 * unificado attend→finalize ainda. Quando existir, este spec serve de
 * baseline pra paridade.
 *
 * Cobertura post-sweep:
 *   - appointment_attend nao exige phase='compareceu'
 *   - appointment_finalize(paciente) → lead_to_paciente aceita phase='agendado'
 *   - lead.phase nunca passa por 'compareceu' no caminho canonico v2
 *   - lifecycle_status fica 'ativo' o tempo inteiro
 *   - deleted_at nunca eh tocado como sinal operacional
 *
 * Cleanup: afterAll deleta lead seed (patients/appointments cascadeiam OU
 * sao deletados por id explicitamente). Toda data tem metadata.is_e2e_test=true.
 */
import { test, expect, getAuthedSupabase } from '../_fixtures/auth'

const HAS_TEST_ENVS =
  !!process.env.TEST_SUPABASE_URL &&
  !!process.env.TEST_SUPABASE_ANON_KEY &&
  !!process.env.TEST_USER_EMAIL_OWNER &&
  !!process.env.TEST_USER_PASSWORD
test.skip(!HAS_TEST_ENVS, 'TEST_SUPABASE_* envs ausentes · ver E2E.md secao Happy path E2E setup')

test.use({ authedAs: 'owner' })

const E2E_TAG = 'is_e2e_test'

let leadId: string | null = null
let appointmentId: string | null = null
let patientId: string | null = null

function futureDateIso(daysAhead: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

test.afterAll(async () => {
  if (!HAS_TEST_ENVS) return
  const sb = await getAuthedSupabase()
  // Order matters · patients antes de leads (FK), appointments antes de patients
  if (appointmentId) {
    await sb.from('appointments').delete().eq('id', appointmentId)
  }
  if (patientId) {
    await sb.from('patients').delete().eq('id', patientId)
  }
  if (leadId) {
    await sb.from('leads').delete().eq('id', leadId)
  }
})

test.describe('CRM canonical sweep · attend → finalize(paciente) sem compareceu', () => {
  test('lead → agendado → na_clinica → finalizado/paciente · phases canonicas', async ({}) => {
    const sb = await getAuthedSupabase()
    const ts = Date.now()
    const phone = `0000${String(ts).slice(-9)}`
    const targetDate = futureDateIso(45)

    // 1. Cria lead seed via SQL direto (lead_create RPC eh mais pesado · seed
    //    cobre o mesmo state inicial)
    const { data: leadRow, error: leadErr } = await sb
      .from('leads')
      .insert({
        phone,
        name: `E2E Sweep Lead ${ts}`,
        source: 'manual',
        source_type: 'manual',
        funnel: 'procedimentos',
        metadata: { [E2E_TAG]: true, e2e_spec: 'appointment-attend-finalize' },
      })
      .select('id, phase, lifecycle_status')
      .single()
    if (leadErr || !leadRow) {
      throw new Error(`Setup failed · seed lead · ${leadErr?.message}`)
    }
    leadId = leadRow.id
    expect(leadRow.phase).toBe('lead')
    expect(leadRow.lifecycle_status).toBe('ativo')

    // 2. RPC lead_to_appointment · phase=agendado, appointment.status=agendado
    const { data: apptResult, error: apptErr } = await sb.rpc('lead_to_appointment', {
      p_lead_id: leadId,
      p_scheduled_date: targetDate,
      p_start_time: '10:00',
      p_end_time: '11:00',
      p_professional_id: null,
      p_professional_name: 'Dra. Mirian',
      p_procedure_name: 'Avaliação E2E',
      p_consult_type: null,
      p_eval_type: null,
      p_value: 0,
      p_origem: 'manual',
      p_obs: '[E2E_TEST] sweep canonical',
    })
    if (apptErr) throw new Error(`lead_to_appointment ERR · ${apptErr.message}`)
    expect(apptResult).toMatchObject({ ok: true })
    const apptOk = apptResult as { ok: true; appointmentId: string }
    // RPC retorna snake_case → mapRpcResult vira camelCase no client TS,
    // mas chamada direta retorna o JSON cru
    appointmentId =
      (apptResult as Record<string, unknown>).appointment_id as string ??
      apptOk.appointmentId
    expect(appointmentId).toMatch(/^[0-9a-f-]{36}$/)

    // Sanity SQL pos lead_to_appointment
    const { data: leadAfterSchedule } = await sb
      .from('leads')
      .select('phase, lifecycle_status, deleted_at')
      .eq('id', leadId)
      .single()
    expect(leadAfterSchedule?.phase).toBe('agendado')
    expect(leadAfterSchedule?.lifecycle_status).toBe('ativo')
    expect(leadAfterSchedule?.deleted_at).toBeNull()

    const { data: apptRow } = await sb
      .from('appointments')
      .select('status')
      .eq('id', appointmentId)
      .single()
    expect(apptRow?.status).toBe('agendado')

    // 3. RPC appointment_attend · move status pra na_clinica
    // Contrato canonico: NAO toca lead.phase. Sweep verifica isso.
    const { data: attendResult, error: attendErr } = await sb.rpc(
      'appointment_attend',
      {
        p_appointment_id: appointmentId,
        p_chegada_em: new Date().toISOString(),
      },
    )
    if (attendErr) throw new Error(`appointment_attend ERR · ${attendErr.message}`)
    expect(attendResult).toMatchObject({ ok: true })

    const { data: apptAfterAttend } = await sb
      .from('appointments')
      .select('status, chegada_em')
      .eq('id', appointmentId)
      .single()
    expect(apptAfterAttend?.status).toBe('na_clinica')
    expect(apptAfterAttend?.chegada_em).not.toBeNull()

    // CRITICAL: lead.phase deve continuar 'agendado' (NAO virou 'compareceu'
    // · contrato canonico v2 isola atendimento em appointments.status)
    const { data: leadAfterAttend } = await sb
      .from('leads')
      .select('phase, lifecycle_status, deleted_at')
      .eq('id', leadId)
      .single()
    expect(leadAfterAttend?.phase).toBe('agendado')
    expect(leadAfterAttend?.lifecycle_status).toBe('ativo')
    expect(leadAfterAttend?.deleted_at).toBeNull()

    // 4. RPC appointment_finalize · outcome=paciente
    // Deve chamar lead_to_paciente internamente · lead.phase vira 'paciente',
    // NAO passa por 'compareceu', patient row criado.
    const { data: finalizeResult, error: finalizeErr } = await sb.rpc(
      'appointment_finalize',
      {
        p_appointment_id: appointmentId,
        p_outcome: 'paciente',
        p_value: 250,
        p_payment_status: 'pago',
        p_notes: '[E2E_TEST] sweep finalize paciente',
        p_lost_reason: null,
        p_orcamento_items: null,
        p_orcamento_subtotal: null,
        p_orcamento_discount: null,
        p_clinical_override: true,
        p_clinical_override_reason: 'E2E sweep · gate clinico nao aplicavel pra fixture',
      },
    )
    if (finalizeErr) throw new Error(`appointment_finalize ERR · ${finalizeErr.message}`)
    expect(finalizeResult).toMatchObject({
      ok: true,
      outcome: 'paciente',
      appointment_finalized: true,
    })

    // 5. SQL asserts pós-finalização
    const { data: apptFinal } = await sb
      .from('appointments')
      .select('status, value, payment_status')
      .eq('id', appointmentId)
      .single()
    expect(apptFinal?.status).toBe('finalizado')
    expect(Number(apptFinal?.value)).toBe(250)
    expect(apptFinal?.payment_status).toBe('pago')

    const { data: leadFinal } = await sb
      .from('leads')
      .select('phase, lifecycle_status, deleted_at')
      .eq('id', leadId)
      .single()
    expect(leadFinal?.phase).toBe('paciente')
    expect(leadFinal?.lifecycle_status).toBe('ativo')
    expect(leadFinal?.deleted_at).toBeNull()

    const { data: patientRow } = await sb
      .from('patients')
      .select('id, status, deleted_at')
      .eq('id', leadId)
      .single()
    expect(patientRow?.id).toBe(leadId)
    expect(patientRow?.deleted_at).toBeNull()
    patientId = patientRow?.id ?? null

    // 6. phase_history audit · transicoes esperadas (sem compareceu/reagendado)
    const { data: history } = await sb
      .from('phase_history')
      .select('from_phase, to_phase, origin')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
    expect(history ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from_phase: 'lead', to_phase: 'agendado' }),
        expect.objectContaining({ from_phase: 'agendado', to_phase: 'paciente' }),
      ]),
    )
    // Negative: nenhuma transicao para/de compareceu
    for (const row of history ?? []) {
      expect(row.from_phase).not.toBe('compareceu')
      expect(row.to_phase).not.toBe('compareceu')
    }
  })
})
