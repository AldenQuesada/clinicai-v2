/**
 * E2E happy path · Camada 11d.
 *
 * Cenario: Lead novo → criar orcamento via UI → marcar enviado → marcar
 * aprovado. Valida o ciclo completo do modulo Orcamento (Camada 9).
 *
 * Setup: cria lead seed via API direta (mais rapido que pela UI · evita
 * acoplar com pacientes.actions.createLead). Cleanup via afterAll · DELETE
 * por id (alem do tag is_e2e_test pra fallback do cleanup script).
 *
 * Tudo criado tem `metadata.is_e2e_test=true` · cleanup defensivo via
 * `pnpm e2e:cleanup` se algo escapar.
 */
import { test, expect, getAuthedSupabase } from '../_fixtures/auth'

// Skip todo o describe se 4 envs nao setadas · evita CI fail enquanto
// usuario nao ativou (rodou pnpm e2e:setup + colou secrets no GitHub).
// Quando setado, spec roda normalmente.
const HAS_TEST_ENVS =
  !!process.env.TEST_SUPABASE_URL &&
  !!process.env.TEST_SUPABASE_ANON_KEY &&
  !!process.env.TEST_USER_EMAIL_OWNER &&
  !!process.env.TEST_USER_PASSWORD
test.skip(!HAS_TEST_ENVS, 'TEST_SUPABASE_* envs ausentes · ver E2E.md secao Happy path E2E setup')

test.use({ authedAs: 'owner' })

const E2E_TAG = 'is_e2e_test'

let leadId: string | null = null
let orcamentoId: string | null = null

test.beforeAll(async () => {
  // Cria lead seed via Supabase direto · skip UI pra ser rapido
  const sb = await getAuthedSupabase()
  const phone = `0000${Date.now().toString().slice(-9)}` // unique fake
  const { data, error } = await sb
    .from('leads')
    .insert({
      phone,
      name: 'E2E Test Lead',
      source: 'manual',
      source_type: 'manual',
      funnel: 'direct',
      metadata: { [E2E_TAG]: true },
    })
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`Setup failed · seed lead · ${error?.message}`)
  }
  leadId = data.id
})

test.afterAll(async () => {
  // Cleanup explicito · belt and suspenders alem do cleanup script
  const sb = await getAuthedSupabase()
  if (orcamentoId) {
    await sb.from('orcamentos').delete().eq('id', orcamentoId)
  }
  if (leadId) {
    await sb.from('leads').delete().eq('id', leadId)
  }
})

test.describe('happy path · lead → orcamento → aprovar', () => {
  test('navega pra novo orcamento, cria, marca enviado, aprova', async ({ page }) => {
    if (!leadId) throw new Error('Setup nao rodou · leadId null')

    // 1. Navega direto pra form de novo orcamento (atalho · pula listagem)
    await page.goto(`/crm/orcamentos/novo?leadId=${leadId}`)
    await expect(page.getByRole('heading', { name: /novo or[çc]amento/i })).toBeVisible()

    // 2. Preencher item · 1 procedimento R$ 200
    await page
      .getByLabel(/procedimento/i)
      .first()
      .fill('Consulta de avaliação E2E')
    await page.getByLabel(/unit[áa]rio/i).first().fill('200')

    // 3. Validade · default eh hoje+30, ok
    // 4. Submit
    await Promise.all([
      page.waitForURL(/\/crm\/orcamentos\/[0-9a-f-]{36}$/, { timeout: 15_000 }),
      page.getByRole('button', { name: /criar or[çc]amento/i }).click(),
    ])

    // 5. Captura ID do orcamento criado pra cleanup
    const url = new URL(page.url())
    orcamentoId = url.pathname.split('/').pop()!
    expect(orcamentoId).toMatch(/^[0-9a-f-]{36}$/)

    // 6. Marca como is_e2e_test via SQL direto (notes hack · UI nao expoe)
    const sb = await getAuthedSupabase()
    await sb
      .from('orcamentos')
      .update({ notes: '[E2E_TEST] auto-cleanup' })
      .eq('id', orcamentoId)

    // 7. Verifica detalhe carregou · status badge "Rascunho"
    await expect(page.getByText(/rascunho/i).first()).toBeVisible()

    // 8. Click "Marcar enviado"
    await page.getByRole('button', { name: /marcar enviado/i }).click()
    // Espera badge mudar pra "Enviado" (tabela/badge re-render)
    await expect(page.getByText(/^enviado$/i).first()).toBeVisible({ timeout: 10_000 })

    // 9. Click "Aprovar" · abre modal confirm
    await page.getByRole('button', { name: /^aprovar$/i }).click()
    await expect(page.getByText(/aprovar or[çc]amento\?/i)).toBeVisible()
    // Confirm
    await page.getByRole('button', { name: /^aprovar$/i }).last().click()

    // 10. Verifica status final · "Aprovado" + linha do tempo registra
    await expect(page.getByText(/aprovado/i).first()).toBeVisible({ timeout: 10_000 })

    // Sanity: lead source orig deve ter sido soft-deleted via lead_to_orcamento
    // (mas como criamos via INSERT direto ao inves de via lead_create RPC,
    // pode nao ter ficado · skip esse assert v1)
  })
})
