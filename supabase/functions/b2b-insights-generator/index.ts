/**
 * ClinicAI — B2B Insights Generator (Claude Haiku)
 *
 * Gera 1 insight estratégico por parceria ativa usando dados dos últimos
 * 30 dias + contexto da parceria. Salva em b2b_insights (dedup automático
 * por unique key partnership_id + date).
 *
 * Invocação:
 *   - Cron diário 08:15 BRT via pg_cron → _b2b_invoke_edge
 *   - Manual via admin UI (botão "Gerar insights agora")
 *
 * Input:
 *   { mode: 'all' | 'single', partnership_id?: uuid }
 *
 * Output:
 *   { ok, generated: n, errors: [...], insights: [...] }
 */

const _ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const _SB_URL  = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const _MODEL   = 'claude-haiku-4-5-20251001'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

function err(msg: string, status = 400, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: false, error: msg, ...(extra || {}) }),
    { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function sbFetch(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(_SB_URL + path, {
    ...init,
    headers: {
      'apikey': _SB_KEY,
      'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
      ...((init?.headers) || {}),
    },
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`sb ${r.status}: ${t.slice(0, 200)}`)
  }
  return r.json()
}

async function fetchActivePartnerships(specificId?: string): Promise<any[]> {
  let url = `/rest/v1/b2b_partnerships?status=eq.active&select=id,clinic_id,name,contact_name,pillar,voucher_monthly_cap,voucher_combo`
  if (specificId) url += `&id=eq.${specificId}`
  return sbFetch(url)
}

async function fetchPartnershipContext(partnershipId: string): Promise<any> {
  const [vouchers, attributions] = await Promise.all([
    sbFetch(`/rest/v1/b2b_vouchers?partnership_id=eq.${partnershipId}&issued_at=gte.${new Date(Date.now() - 30*864e5).toISOString()}&select=id,status,issued_at,opened_at,redeemed_at`),
    sbFetch(`/rest/v1/b2b_attributions?partnership_id=eq.${partnershipId}&select=status,scheduled_at,attended_at,converted_at,converted_amount_brl,lead_name&order=created_at.desc&limit=20`),
  ])
  return { vouchers, attributions }
}

async function generateInsight(partnership: any, context: any): Promise<{ type: string; content: string; score: number } | null> {
  if (!_ANTHROPIC_KEY) return null

  const vouchersLast30 = context.vouchers.length
  const attrLast30 = context.attributions.slice(0, 30)
  const conversions = attrLast30.filter((a: any) => a.converted_at).length
  const attendances = attrLast30.filter((a: any) => a.attended_at).length

  const prompt = `Você é Mira, assistente estratégica da Clínica Mirian de Paula. Analise o desempenho desta parceira B2B e me dê UMA única recomendação estratégica curta (máx 2 frases) pra Alden agir hoje.

Parceira: ${partnership.name} (${partnership.pillar || 'sem pilar'})
Responsável: ${partnership.contact_name || 'sem nome'}
Cap mensal: ${partnership.voucher_monthly_cap || 5} vouchers

Últimos 30 dias:
- Vouchers emitidos: ${vouchersLast30}
- Conversões (compras): ${conversions}
- Compareceram à consulta: ${attendances}
- Relações recentes: ${attrLast30.slice(0, 3).map((a: any) => `${a.lead_name} (${a.status})`).join('; ') || 'nenhuma'}

Responda APENAS em JSON com este formato exato:
{"type": "opportunity|risk|celebration|suggestion|alert", "content": "texto 1-2 frases", "score": 0-10}

Score = relevância pra o Alden agir (10 = crítico, 5 = relevante, 0 = ignorável).`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': _ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: _MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) {
      console.warn('anthropic error:', r.status, await r.text())
      return null
    }
    const data = await r.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    if (!parsed.type || !parsed.content) return null
    return {
      type: String(parsed.type),
      content: String(parsed.content).slice(0, 500),
      score: Math.max(0, Math.min(10, Number(parsed.score) || 5)),
    }
  } catch (e) {
    console.warn('insight gen error:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// Deriva headline curta a partir do texto do Claude — primeira sentenca
// ate ~100 chars. Necessaria pra UI que exibe cards com headline + detalhe.
// Bug 2026-04-24: edge gravava apenas `content`, deixando headline/detail NULL
// e a UI renderizava cards em branco. Fix: popular os 3 campos sempre.
function deriveHeadline(partnershipName: string, text: string): string {
  const clean = String(text || '').trim()
  // Pega primeira frase que tenha conteúdo (antes de ponto final, exclamação, ?, ou quebra)
  const firstSentence = clean.split(/[.!?\n]/).map(s => s.trim()).find(s => s.length > 0) || clean
  const trimmed = firstSentence.slice(0, 100)
  const suffix = firstSentence.length > 100 ? '…' : ''
  // Prefixa nome da parceira se nao estiver no começo — ajuda scanning
  const nameInStart = clean.toLowerCase().slice(0, 40).includes(partnershipName.toLowerCase().split(' ')[0])
  return nameInStart ? (trimmed + suffix) : (`${partnershipName.split(' ')[0]}: ${trimmed}${suffix}`)
}

// Severity derivada do score: aligna com o resto do B2B (critical/warning/info)
function severityFromScore(score: number): string {
  if (score >= 8) return 'critical'
  if (score >= 5) return 'warning'
  return 'info'
}

async function saveInsight(partnership: any, insight: { type: string; content: string; score: number }): Promise<void> {
  // Dedup: não gerar 2 insights do mesmo type pra mesma parceria no mesmo dia
  const today = new Date().toISOString().slice(0, 10)
  const existing = await sbFetch(
    `/rest/v1/b2b_insights?partnership_id=eq.${partnership.id}&insight_type=eq.${insight.type}&created_at=gte.${today}T00:00:00Z&select=id&limit=1`,
  )
  if (existing.length > 0) return  // já existe um hoje

  if (!partnership.clinic_id) {
    console.warn('saveInsight: partnership missing clinic_id, skipping', partnership.id)
    return
  }

  const headline = deriveHeadline(partnership.name || '', insight.content)
  const severity = severityFromScore(insight.score)

  await sbFetch('/rest/v1/b2b_insights', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      clinic_id:      partnership.clinic_id,
      partnership_id: partnership.id,
      insight_type:   insight.type,
      headline:       headline,            // NOVO: card title na UI
      detail:         insight.content,     // NOVO: corpo completo
      content:        insight.content,     // retrocompat com consumidores antigos
      severity:       severity,            // NOVO: alinha com cor do card
      score:          insight.score,
      model_used:     _MODEL,
    }),
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  let body: any = {}
  try { body = await req.json() } catch { /* optional body */ }
  const mode = String(body?.mode || 'all')
  const specificId = body?.partnership_id ? String(body.partnership_id) : undefined

  try {
    const partnerships = await fetchActivePartnerships(specificId)
    let generated = 0
    const errors: string[] = []
    const insights: any[] = []

    for (const p of partnerships) {
      try {
        const ctx = await fetchPartnershipContext(p.id)
        // Skip parceria sem atividade (nada pra analisar)
        if (ctx.vouchers.length === 0 && ctx.attributions.length === 0) continue

        const insight = await generateInsight(p, ctx)
        if (insight) {
          await saveInsight(p, insight)
          generated++
          insights.push({ partnership_id: p.id, partnership_name: p.name, ...insight })
        }
      } catch (e) {
        errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return ok({ ok: true, mode, examined: partnerships.length, generated, errors, insights })
  } catch (e) {
    return err('generator_failed', 500, { message: e instanceof Error ? e.message : String(e) })
  }
})
