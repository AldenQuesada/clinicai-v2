/**
 * E2E · CRM_FUNCTIONALITY_MULTI_AGENT · Lote 4 Agente G (testes).
 *
 * Cenario: Criar lead via wizard 3-step (Lote 2 P0.1 · 2026-05-17).
 *
 * Fluxo coberto:
 *   1. Login owner via TEST_USER_*
 *   2. Navegar /crm/leads (CRM shell · usa LeadsClient compartilhado com /leads)
 *   3. Click "Novo lead" → abre NewLeadModal (wizard 3 steps)
 *   4. Step 1 · Identificacao: nome unico + phone BR (10 digitos)
 *   5. Step 2 · Origem & qualificacao: source=manual, sourceType=whatsapp,
 *      funnel=fullface, temperature=hot
 *   6. Step 3 · Operacao: notes pre-marcadas com tag e2e
 *   7. Submit "Criar lead" → redirect pra /leads/[id] (router.push)
 *
 * Tag isolamento: notes contem "[E2E_TEST]" pra cleanup script identificar
 * + metadata atualizada via SQL pos-criacao (createLeadAction nao expoe
 * metadata na UI · update direto).
 *
 * Cleanup: afterAll deleta lead criado por id (belt-and-suspenders alem
 * do tag-based cleanup).
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

test.afterAll(async () => {
  if (!HAS_TEST_ENVS) return
  if (leadId) {
    const sb = await getAuthedSupabase()
    await sb.from('leads').delete().eq('id', leadId)
  }
})

test.describe('CRM · criar lead via wizard 3-step', () => {
  test('preenche 3 steps · submit · redirect pra detalhe', async ({ page }) => {
    const ts = Date.now()
    const leadName = `E2E Test Lead ${ts}`
    // Phone unico · 10 digitos validos BR (DDD 44 + numero local)
    // Suffix do timestamp pra dedup-safe entre runs paralelas
    const phoneSuffix = String(ts).slice(-7)
    const phoneDigits = `4498${phoneSuffix}`.slice(0, 11)

    // 1. Navega pra listagem CRM de leads
    await page.goto('/crm/leads')
    await expect(page.getByRole('heading', { name: /leads/i }).first()).toBeVisible()

    // 2. Abrir modal "Novo lead"
    await page.getByRole('button', { name: /novo lead/i }).click()

    // Modal renderiza .b2b-modal · scope tudo dentro pra evitar match com
    // search box da pagina (input.b2b-input fora do modal capturava
    // nameInput.first() e quebrava step1Valid). Placeholder unico tambem
    // serve de fallback semantico.
    const modal = page.locator('.b2b-modal')
    await expect(modal.getByRole('heading', { name: /novo lead/i })).toBeVisible({
      timeout: 5_000,
    })

    // 3. Step 1 · nome + telefone via placeholder (mais robusto que .first())
    await modal.getByPlaceholder(/maria da silva/i).fill(leadName)
    // Phone usa pressSequentially pra simular keypress · controlled input
    // formata em tempo real · fill() pode confundir onChange/state em React 19
    const phoneField = modal.getByPlaceholder(/\(44\)/).first()
    await phoneField.click()
    await phoneField.pressSequentially(phoneDigits, { delay: 20 })

    // Avancar pra step 2 · botao só fica enabled quando step1Valid=true
    // (name>=2 chars + phone 10-13 digits). Esperar explicitamente evita
    // timeout silencioso se React ainda nao processou os onChange.
    const avancarBtn = modal.getByRole('button', { name: /avan[çc]ar/i })
    await expect(avancarBtn).toBeEnabled({ timeout: 5_000 })
    await avancarBtn.click()

    // Step 2 unique markers · "Origem & qualificação" tambem aparece na
    // stepper · precisa esperar um marker exclusivo do FORM de step 2.
    await expect(modal.getByText(/origem\s*\(source\)/i).first()).toBeVisible({
      timeout: 5_000,
    })

    // 4. Step 2 · source + source_type + funnel + temperature
    const selects = modal.locator('select.b2b-input')
    await selects.nth(0).selectOption('manual')
    await selects.nth(1).selectOption('whatsapp')
    await selects.nth(2).selectOption('fullface')
    await selects.nth(3).selectOption('hot')

    // Avancar pra step 3
    const avancarBtn2 = modal.getByRole('button', { name: /avan[çc]ar/i })
    await expect(avancarBtn2).toBeEnabled({ timeout: 5_000 })
    await avancarBtn2.click()

    // Step 3 unique marker · textarea de notas (operação só aparece no titulo)
    const notesTextarea = modal.locator('textarea.b2b-input').first()
    await expect(notesTextarea).toBeVisible({ timeout: 5_000 })

    // 5. Step 3 · notes com tag e2e
    await notesTextarea.fill(`[E2E_TEST] auto-created by e2e suite ts=${ts}`)

    // 6. Submit "Criar lead" · espera redirect pra /leads/[uuid]
    const criarBtn = modal.getByRole('button', { name: /criar lead/i })
    await expect(criarBtn).toBeEnabled({ timeout: 5_000 })
    await Promise.all([
      page.waitForURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 15_000 }),
      criarBtn.click(),
    ])

    // 7. Captura leadId via URL pra cleanup
    const url = new URL(page.url())
    const idFromUrl = url.pathname.split('/').pop()
    expect(idFromUrl).toMatch(/^[0-9a-f-]{36}$/)
    leadId = idFromUrl!

    // 8. Assert: detalhe carregou · nome do lead aparece
    await expect(page.getByText(leadName).first()).toBeVisible({ timeout: 10_000 })

    // 9. Tag metadata pra cleanup defensivo (UI nao expoe metadata)
    const sb = await getAuthedSupabase()
    await sb
      .from('leads')
      .update({ metadata: { [E2E_TAG]: true, e2e_spec: 'lead-create' } })
      .eq('id', leadId)
  })
})
