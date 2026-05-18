/**
 * E2E · CRM_FUNCTIONALITY_MULTI_AGENT · Lote 4 Agente G (testes).
 *
 * Cenario: Bulk mark sent + export CSV de orcamentos · Camada 10/Lote 2.
 *
 * Fluxo coberto:
 *   1. Login owner
 *   2. Pre-condicao: cria 1 lead seed + 3 orcamentos status='draft' via SQL
 *      (com tag e2e em notes)
 *   3. Navegar /crm/orcamentos
 *   4. Filtrar por status=draft (URL param) pra isolar os seeds
 *   5. Selecionar 2 orcamentos via checkbox (bulk-select)
 *   6. Click "Marcar como Enviado" → modal confirmacao
 *   7. Confirm → 2 orcamentos com status='sent'
 *   8. Click "Exportar CSV" → captura download via page.waitForEvent
 *   9. Validar filename pattern orcamentos-YYYY-MM-DD.csv
 *  10. Validar CSV header (10 colunas conforme _actions.ts:428)
 *
 * Cleanup: afterAll deleta orcamentos + lead seed.
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
const orcamentoIds: string[] = []

// Header esperado · alinhado com apps/lara/src/app/crm/orcamentos/_actions.ts:428
const EXPECTED_CSV_HEADER_COLUMNS = [
  'ID',
  'Criado em',
  'Lead',
  'Paciente',
  'Telefone',
  'Status',
  'Valor total',
  'Valor aprovado',
  'Vendedor',
  'Link público',
]

test.beforeAll(async () => {
  if (!HAS_TEST_ENVS) return
  const sb = await getAuthedSupabase()
  const ts = Date.now()
  // Lead seed
  const phone = `0000${String(ts).slice(-9)}`
  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .insert({
      phone,
      name: `E2E Bulk Export Lead ${ts}`,
      source: 'manual',
      source_type: 'manual',
      funnel: 'procedimentos',
      metadata: { [E2E_TAG]: true, e2e_spec: 'orcamento-bulk-export' },
    })
    .select('id')
    .single()
  if (leadErr || !lead) {
    throw new Error(`Setup failed · seed lead · ${leadErr?.message}`)
  }
  leadId = lead.id

  // 3 orcamentos draft
  // CRM_E2E_FIX_ORCAMENTO_FIXTURES (2026-05-17): respeita CHECK constraint
  // chk_orc_total_consistency em mig 63: abs(total - (subtotal - discount)) < 0.01
  // Schema (mig 63): subtotal/discount/total numeric(12,2) NOT NULL DEFAULT 0.
  // Antes setava só total e quebrava (subtotal=0 default → 0-0 != total).
  for (let i = 0; i < 3; i++) {
    const valor = 100 * (i + 1)
    const { data: orc, error: orcErr } = await sb
      .from('orcamentos')
      .insert({
        lead_id: leadId,
        title: `E2E Bulk Orc ${ts}-${i}`,
        subtotal: valor,
        discount: 0,
        total: valor,
        status: 'draft',
        notes: `[E2E_TEST] auto-cleanup spec=orcamento-bulk-export idx=${i}`,
      })
      .select('id')
      .single()
    if (orcErr || !orc) {
      throw new Error(`Setup failed · seed orcamento ${i} · ${orcErr?.message}`)
    }
    orcamentoIds.push(orc.id)
  }
})

test.afterAll(async () => {
  if (!HAS_TEST_ENVS) return
  const sb = await getAuthedSupabase()
  if (orcamentoIds.length) {
    await sb.from('orcamentos').delete().in('id', orcamentoIds)
  }
  if (leadId) {
    await sb.from('leads').delete().eq('id', leadId)
  }
})

test.describe('Orcamentos · bulk mark sent + export CSV', () => {
  test('bulk · marca 2 como enviado · valida SQL', async ({ page }) => {
    if (orcamentoIds.length < 3) throw new Error('Setup nao criou orcamentos')

    // 1. Navega listagem com filtro status=draft
    await page.goto('/crm/orcamentos?status=draft')
    await expect(page.getByRole('heading', { name: /or[çc]amentos/i }).first()).toBeVisible({
      timeout: 10_000,
    })

    // 2. Aguarda tabela renderizar com pelo menos os seeds
    // Usa testid se disponivel · fallback pra texto
    const tableRow = page.locator(`text=E2E Bulk Orc`).first()
    await expect(tableRow).toBeVisible({ timeout: 10_000 })

    // 3. Seleciona 2 orcamentos via checkbox
    // DataTable.bulkSelect renderiza checkboxes em cada linha · primeiro
    // checkbox eh o "select all" header · pulamos
    const checkboxes = page.locator('input[type="checkbox"]')
    const checkboxCount = await checkboxes.count()
    if (checkboxCount < 3) {
      throw new Error(`Esperado >=3 checkboxes · achei ${checkboxCount}`)
    }
    // nth(1) e nth(2) sao os primeiros 2 de linha (nth(0) = select-all)
    await checkboxes.nth(1).check()
    await checkboxes.nth(2).check()

    // 4. Click "Marcar como Enviado" · banner bulk
    await page.getByRole('button', { name: /marcar como enviado/i }).click()

    // 5. Modal confirmacao
    await expect(page.getByText(/marcar como enviado/i).first()).toBeVisible({
      timeout: 5_000,
    })

    // 6. Confirm · click no botao "Marcar como Enviado" do modal (ultimo)
    await page.getByRole('button', { name: /^marcar como enviado$/i }).last().click()

    // 7. Toast sucesso
    await expect(page.getByText(/enviado|sucesso/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // 8. Valida SQL · 2 orcamentos status='sent' (os outros remain 'draft')
    const sb = await getAuthedSupabase()
    const { data: updated } = await sb
      .from('orcamentos')
      .select('id, status')
      .in('id', orcamentoIds)

    const sentCount = updated?.filter((o) => o.status === 'sent').length ?? 0
    expect(sentCount).toBeGreaterThanOrEqual(2)
  })

  test('export CSV · download + header valido', async ({ page }) => {
    await page.goto('/crm/orcamentos')
    await expect(page.getByRole('heading', { name: /or[çc]amentos/i }).first()).toBeVisible({
      timeout: 10_000,
    })

    // exportOrcamentosCsvAction retorna CSV via server action · client cria
    // Blob + URL.createObjectURL + <a download>.click(). Playwright capta
    // via page.waitForEvent('download').
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: /exportar csv/i }).first().click(),
    ])

    // 9. Valida filename pattern orcamentos-YYYY-MM-DD.csv
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^orcamentos-\d{4}-\d{2}-\d{2}\.csv$/)

    // 10. Le conteudo do CSV · valida header (10 colunas · separador ';')
    const stream = await download.createReadStream()
    if (!stream) throw new Error('download stream null')
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const csv = Buffer.concat(chunks).toString('utf-8')

    // BOM UTF-8 + header (sep=';')
    const firstLine = csv.replace(/^﻿/, '').split('\n')[0]
    const cells = firstLine.split(';')
    expect(cells.length).toBe(10)
    // Confirma colunas esperadas (csvEscape pode envolver em aspas se tiver
    // virgula/quote · "Link público" tem caracter especial mas nao trigger
    // escape · valida case-insensitive sem aspas)
    for (const col of EXPECTED_CSV_HEADER_COLUMNS) {
      expect(firstLine.toLowerCase()).toContain(col.toLowerCase())
    }
  })
})
