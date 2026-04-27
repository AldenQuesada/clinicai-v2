/**
 * ClinicAI — B2B Weekly Insight (WOW #9)
 *
 * Toda semana: olha as parcerias ativas, junta sinais (vouchers, health,
 * custo, exposições) e pede ao Claude Haiku pra destacar 1-3 coisas
 * NÃO-ÓBVIAS que merecem ação ou celebração.
 *
 * POST body: { force?: true }  (se true, gera mesmo que já tenha da semana)
 */

const _ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const _MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001'
const _SB_URL = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function ok(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }),
    { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`[${name}] ${r.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

// Multi-tenant aware (ADR-016): resolve via _default_clinic_id() RPC.
// Cache no boot — insight roda 1x/semana, mas dentro da mesma exec faz
// multiplas queries com clinic_id no filtro.
let _CLINIC_ID_CACHE: string | null = null
async function clinicId(): Promise<string> {
  if (_CLINIC_ID_CACHE) return _CLINIC_ID_CACHE
  try {
    _CLINIC_ID_CACHE = await rpc('_default_clinic_id', {}) as string
  } catch (_e) {
    _CLINIC_ID_CACHE = '00000000-0000-0000-0000-000000000001'
  }
  return _CLINIC_ID_CACHE
}

async function table(path: string) {
  const r = await fetch(`${_SB_URL}/rest/v1/${path}`, {
    headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` },
  })
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return await r.json()
}

function extractJson(raw: string): unknown {
  try { return JSON.parse(raw) } catch { /* continua */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { try { return JSON.parse(fence[1]) } catch { /* continua */ } }
  const i = raw.indexOf('['); const j = raw.lastIndexOf(']')
  if (i >= 0 && j > i) {
    try { return JSON.parse(raw.slice(i, j + 1)) } catch { /* continua */ }
  }
  const i2 = raw.indexOf('{'); const j2 = raw.lastIndexOf('}')
  if (i2 >= 0 && j2 > i2) {
    try { return JSON.parse(raw.slice(i2, j2 + 1)) } catch { /* continua */ }
  }
  throw new Error('JSON inválido — ' + raw.slice(0, 150))
}

// deno-lint-ignore no-explicit-any
async function buildSignals(): Promise<any[]> {
  // pega parcerias ativas + health + custo + funnel agregado
  const partnerships = await table('b2b_partnerships?clinic_id=eq.' + await clinicId() + '&status=eq.active&select=id,name,pillar,tier,health_color,dna_score,created_at,voucher_unit_cost_brl,monthly_value_cap_brl')
  if (!Array.isArray(partnerships) || !partnerships.length) return []

  // deno-lint-ignore no-explicit-any
  const out: any[] = []
  for (const p of partnerships) {
    // funnel
    const funnel = await rpc('b2b_voucher_funnel', { p_partnership_id: p.id }).catch(() => ({}))
    const cost = await rpc('b2b_partnership_cost', { p_partnership_id: p.id }).catch(() => ({}))
    const trend = await rpc('b2b_health_trend', { p_partnership_id: p.id, p_days: 30 }).catch(() => ({}))

    out.push({
      id: p.id, name: p.name, pillar: p.pillar, tier: p.tier,
      health: p.health_color, dna: Number(p.dna_score || 0),
      months_active: Math.max(1,
        Math.floor((Date.now() - new Date(p.created_at).getTime()) / (30 * 24 * 3600 * 1000))),
      voucher: funnel || {},
      cost: cost || {},
      trend_30d: trend ? { trend: trend.trend, changes: trend.changes } : {},
    })
  }
  return out
}

// deno-lint-ignore no-explicit-any
async function callClaude(signals: any[]) {
  const system =
    'Você é consultor sênior de parcerias estratégicas para a Clínica Mirian de Paula, clínica de estética premium em Maringá. ' +
    'Olha dados de ~5-20 parcerias B2B e destaca 1-3 insights NÃO-ÓBVIOS por semana. ' +
    'Evite observações triviais ("a parceria X resgatou N vouchers"). Busque: padrões cruzados, oportunidades de dobra, risco emergente, celebração merecida. ' +
    'Tom: direto, afetivo mas enxuto. Responda SOMENTE JSON array.'

  const user =
`Parcerias ativas esta semana:
${JSON.stringify(signals, null, 2)}

Retorne um array JSON com 1 a 3 insights nesse formato:
[
  {
    "partnership_id": "uuid ou null se o insight for geral",
    "severity": "info | opportunity | warning | critical",
    "headline": "título curto (≤70 chars)",
    "detail": "2-3 frases descrevendo o padrão/oportunidade",
    "suggested_action": "ação concreta em 1 frase"
  }
]
Se NÃO houver nada relevante, retorne []. Seja criterioso — qualidade > quantidade.`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': _ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: _MODEL, max_tokens: 2048, system,
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: '[' },
      ],
    }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`Claude ${r.status}: ${text.slice(0, 200)}`)
  const data = JSON.parse(text)
  const raw = '[' + (data?.content?.[0]?.text || '')
  const inTok = data?.usage?.input_tokens || 0
  const outTok = data?.usage?.output_tokens || 0
  const cost = (inTok / 1_000_000) * 1 + (outTok / 1_000_000) * 5
  return { insights: extractJson(raw), inTok, outTok, cost }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST' && req.method !== 'GET') return err('method_not_allowed', 405)
  if (!_ANTHROPIC_KEY) return err('ANTHROPIC_API_KEY ausente', 500)

  try {
    // Anti-dup: se já gerou essa semana e não forçou, pula
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const force: boolean = !!body?.force
    if (!force) {
      const existing = await table(
        'b2b_insights?clinic_id=eq.' + await clinicId() + '&week_ref=eq.' +
        new Date().toISOString().slice(0, 10) + '&select=id&limit=1')
      if (Array.isArray(existing) && existing.length) {
        return ok({ ok: true, skipped: true, reason: 'já gerado esta semana' })
      }
    }

    const signals = await buildSignals()
    if (!signals.length) {
      return ok({ ok: true, inserted: 0, reason: 'sem parcerias ativas' })
    }

    const { insights, inTok, outTok, cost } = await callClaude(signals)
    if (!Array.isArray(insights)) {
      return err('IA retornou formato inválido')
    }

    let inserted = 0
    for (const i of insights) {
      if (!i || typeof i !== 'object') continue
      await rpc('b2b_insight_add', {
        p_payload: {
          partnership_id: i.partnership_id || null,
          severity: i.severity || 'info',
          headline: i.headline || '',
          detail: i.detail || '',
          suggested_action: i.suggested_action || '',
          data: { tokens: { input: inTok, output: outTok }, cost_usd: cost },
        },
      })
      inserted++
    }

    return ok({ ok: true, inserted, cost_usd: cost, tokens: { input: inTok, output: outTok } })
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500)
  }
})
