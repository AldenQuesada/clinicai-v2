/**
 * E2E · CRM_FUNCTIONALITY_MULTI_AGENT · Lote 4 Agente G (testes).
 *
 * Cenario: Arquivar + Desarquivar lead na Mesa Operacional · Lote 2 Agente C.
 *
 * Fluxo coberto:
 *   1. Login owner
 *   2. Pre-condicao: cria 1 lead seed via SQL direto (com tag e2e em metadata)
 *      · status='lead' · lifecycle='ativo'
 *   3. Navegar /crm/mesa-operacional
 *   4. Localizar card do lead seed · bucket "lead"
 *   5. Click "Arquivar" → modal motivo → preencher "[E2E_TEST] e2e archive"
 *   6. Submit → toast "Lead arquivado"
 *   7. Assert SQL: lifecycle_status='arquivado' + phase preservada
 *   8. Reabrir mesa · bucket "arquivado" · click "Desarquivar"
 *   9. Modal · motivo "[E2E_TEST] e2e unarchive"
 *  10. Assert SQL: lifecycle_status='ativo' + phase preservada
 *
 * Cleanup: afterAll deleta lead seed por id.
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
let leadName: string | null = null

test.beforeAll(async () => {
  if (!HAS_TEST_ENVS) return
  const sb = await getAuthedSupabase()
  const ts = Date.now()
  leadName = `E2E Mesa Archive ${ts}`
  // Phone unico · suffix do ts
  const phone = `0000${String(ts).slice(-9)}`
  const { data, error } = await sb
    .from('leads')
    .insert({
      phone,
      name: leadName,
      source: 'manual',
      source_type: 'manual',
      funnel: 'procedimentos',
      metadata: { [E2E_TAG]: true, e2e_spec: 'mesa-archive' },
    })
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`Setup failed · seed lead · ${error?.message}`)
  }
  leadId = data.id
})

test.afterAll(async () => {
  if (!HAS_TEST_ENVS) return
  if (leadId) {
    const sb = await getAuthedSupabase()
    await sb.from('leads').delete().eq('id', leadId)
  }
})

test.describe('Mesa Operacional · arquivar + desarquivar', () => {
  test('arquiva lead · valida SQL · desarquiva · valida SQL', async ({ page }) => {
    if (!leadId || !leadName) throw new Error('Setup nao rodou · leadId/name null')

    const sb = await getAuthedSupabase()

    // Phase inicial · capturada antes pra comparar pos-unarchive
    const { data: pre } = await sb
      .from('leads')
      .select('phase, lifecycle_status')
      .eq('id', leadId)
      .single()
    const originalPhase = pre?.phase ?? 'lead'

    // 1. Navega Mesa Operacional
    await page.goto('/crm/mesa-operacional')
    await expect(page.getByRole('heading', { name: /mesa.*operacional/i }).first()).toBeVisible(
      { timeout: 10_000 },
    )

    // 2. Localiza card do lead seed via texto do nome
    const leadCard = page.locator(`text=${leadName}`).first()
    await expect(leadCard).toBeVisible({ timeout: 10_000 })

    // 3. Click "Arquivar" no card · scope dentro do bucket "lead"
    // O botao Arquivar tem texto literal "Arquivar"
    // (CRM_FUNCTIONALITY_MULTI_AGENT Lote 2 · mesa-card-actions.tsx)
    // Filtro estrito por <article> (mesa-card root) · 'div' incluiria o
    // container da board e capturaria 12 cards de uma vez (strict mode err).
    const card = page.locator('article').filter({ hasText: leadName }).first()
    await card.getByRole('button', { name: /^arquivar$/i }).click()

    // 4. Modal motivo abre · titulo "Arquivar registro? · {name}"
    // (Patch D: microcopy "lead" -> "registro" pra abranger todas fases)
    await expect(page.getByText(/arquivar registro/i).first()).toBeVisible({
      timeout: 5_000,
    })

    // 5. Preenche motivo
    const reasonTextarea = page.locator('textarea#mesa-reason')
    await reasonTextarea.fill('[E2E_TEST] e2e test archive')

    // 6. Click confirmar
    await page.getByRole('button', { name: /^arquivar$/i }).last().click()

    // 7. Toast sucesso
    await expect(page.getByText(/lead arquivado|j[áa] estava arquivado/i)).toBeVisible({
      timeout: 10_000,
    })

    // 8. Valida via SQL · lifecycle='arquivado' + phase preservada
    const { data: archived } = await sb
      .from('leads')
      .select('phase, lifecycle_status')
      .eq('id', leadId)
      .single()
    expect(archived?.lifecycle_status).toBe('arquivado')
    expect(archived?.phase).toBe(originalPhase)

    // 9. Recarrega mesa · vai pro bucket arquivado
    // crm_operational_view roteia por lifecycle='arquivado' → bucket 'arquivado'
    await page.reload()

    // 10. Card ainda visivel (em outro bucket) · click "Desarquivar"
    // article only · vide nota acima sobre strict-mode com 'div'
    const archivedCard = page
      .locator('article')
      .filter({ hasText: leadName })
      .first()
    await expect(archivedCard).toBeVisible({ timeout: 10_000 })

    await archivedCard.getByRole('button', { name: /^desarquivar$/i }).click()

    // Modal "Reativar registro arquivado? · {name}" (Patch D microcopy)
    await expect(page.getByText(/reativar registro arquivado/i).first()).toBeVisible({
      timeout: 5_000,
    })

    // 11. Preenche motivo unarchive
    const unarchiveReason = page.locator('textarea#mesa-reason')
    await unarchiveReason.fill('[E2E_TEST] e2e test unarchive')

    // 12. Click confirmar · confirmLabel agora eh "Reativar" (Patch D)
    await page.getByRole('button', { name: /^reativar$/i }).last().click()

    await expect(page.getByText(/lead desarquivado|voltou.*mesa/i)).toBeVisible({
      timeout: 10_000,
    })

    // 13. Valida SQL · lifecycle='ativo' + phase preservada
    const { data: unarchived } = await sb
      .from('leads')
      .select('phase, lifecycle_status')
      .eq('id', leadId)
      .single()
    expect(unarchived?.lifecycle_status).toBe('ativo')
    expect(unarchived?.phase).toBe(originalPhase)
  })
})
