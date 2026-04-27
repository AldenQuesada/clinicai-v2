/**
 * ClinicAI — B2B Playbook IA (WOW #4)
 *
 * Gera conteúdo (carrossel + ganchos) para uma parceria usando Claude Haiku,
 * respeitando a voz da Clínica Mirian de Paula.
 *
 * POST body: {
 *   partnership_id: "uuid",
 *   scope?: 'carrossel' | 'ganchos' | 'all'   (default: 'all')
 *   requested_by?: "nome"
 * }
 *
 * Grava runs em b2b_playbook_ia_runs. Popula b2b_partnership_content.
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
      'apikey': _SB_KEY,
      'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`[${name}] ${r.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

function extractJson(raw: string): unknown {
  // 1. parse direto
  try { return JSON.parse(raw) } catch { /* continua */ }
  // 2. remove fences ```json ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try { return JSON.parse(fence[1]) } catch { /* continua */ }
  }
  // 3. primeiro { até último }
  const i = raw.indexOf('{'); const j = raw.lastIndexOf('}')
  if (i >= 0 && j > i) {
    try { return JSON.parse(raw.slice(i, j + 1)) } catch { /* continua */ }
  }
  throw new Error('JSON inválido da IA — ' + raw.slice(0, 120))
}

// deno-lint-ignore no-explicit-any
function buildPrompt(p: any, scope: string): { system: string; user: string } {
  const system =
    'Você escreve para a Clínica Mirian de Paula, em Maringá, clínica de estética premium. ' +
    'Tom: sofisticado, caloroso, sem jargão técnico. Fuja de clichês ("venha se cuidar", "transforme"). ' +
    'Foque em sensação, cuidado, momentos emblemáticos. Português brasileiro, feminino. ' +
    'Responda SOMENTE JSON válido.'

  const partnership = {
    name: p.name,
    pillar: p.pillar,
    category: p.category,
    type: p.type,
    is_collective: p.is_collective || false,
    slogans: p.slogans || [],
    voucher_combo: p.voucher_combo,
    narrative_quote: p.narrative_quote,
    narrative_author: p.narrative_author,
    emotional_trigger: p.emotional_trigger,
    contrapartida: p.contrapartida || [],
  }

  const wantCarrossel = scope === 'all' || scope === 'carrossel'
  const wantGanchos   = scope === 'all' || scope === 'ganchos'

  const user =
`Parceria:
${JSON.stringify(partnership, null, 2)}

Gere conteúdo para divulgar essa parceria no Instagram da Clínica Mirian de Paula.

${wantCarrossel ? `1) CARROSSEL — 4 slides, cada um com título curto (até 45 caracteres) e corpo (3-4 linhas, 60-90 palavras). Sequência:
   slide 1 = "O que é essa união"
   slide 2 = "Como ganhar o presente" (mecânica do voucher)
   slide 3 = "O que está incluso" (combo)
   slide 4 = "Quem já viveu" (chamada para depoimentos)
` : ''}${wantGanchos ? `${wantCarrossel ? '2) ' : '1) '}GANCHOS — 3 ganchos curtos (até 280 caracteres cada) com ângulos: Curiosidade, Transformação, Emoção.
` : ''}
Formato exato da resposta:
{
  ${wantCarrossel ? `"carrossel": [{"title":"", "body":""}, {"title":"", "body":""}, {"title":"", "body":""}, {"title":"", "body":""}],` : ''}
  ${wantGanchos ? `"ganchos": [{"title":"Curiosidade","body":""}, {"title":"Transformação","body":""}, {"title":"Emoção","body":""}]` : ''}
}`

  return { system, user }
}

// deno-lint-ignore no-explicit-any
async function callClaude(system: string, user: string): Promise<{ content: any; inTok: number; outTok: number; cost: number }> {
  const body = {
    model: _MODEL,
    max_tokens: 2048,
    system,
    messages: [
      { role: 'user', content: user },
      { role: 'assistant', content: '{' },
    ],
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': _ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`Claude ${r.status}: ${text.slice(0, 200)}`)
  const data = JSON.parse(text)
  const raw = '{' + (data?.content?.[0]?.text || '')
  const inTok = data?.usage?.input_tokens || 0
  const outTok = data?.usage?.output_tokens || 0
  // Haiku: $1/MTok input, $5/MTok output (aproximado)
  const cost = (inTok / 1_000_000) * 1 + (outTok / 1_000_000) * 5
  return { content: extractJson(raw), inTok, outTok, cost }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)
  if (!_ANTHROPIC_KEY) return err('ANTHROPIC_API_KEY ausente', 500)

  let runId: string | null = null
  try {
    const body = await req.json()
    const partnershipId: string = body?.partnership_id
    const scope: string = body?.scope || 'all'
    const requestedBy: string | null = body?.requested_by || null
    if (!partnershipId) return err('partnership_id obrigatório')
    if (!['carrossel', 'ganchos', 'all'].includes(scope)) return err('scope inválido')

    // fetch parceria via PostgREST (não há RPC read-only específica, usamos tabela)
    const pRes = await fetch(`${_SB_URL}/rest/v1/b2b_partnerships?id=eq.${partnershipId}&select=*`, {
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` },
    })
    const pArr = await pRes.json()
    if (!Array.isArray(pArr) || !pArr.length) return err('partnership_not_found', 404)
    const p = pArr[0]

    // start run
    const runStart = await rpc('b2b_playbook_ia_run_start', {
      p_partnership_id: partnershipId, p_scope: scope, p_requested_by: requestedBy,
    })
    runId = runStart?.id || null

    // Claude
    const { system, user } = buildPrompt(p, scope)
    const { content, inTok, outTok, cost } = await callClaude(system, user)

    // Mapa -> items pra b2b_partnership_content
    // deno-lint-ignore no-explicit-any
    const items: any[] = []
    if (Array.isArray(content.carrossel)) {
      content.carrossel.forEach((s: { title?: string; body?: string }, i: number) => {
        items.push({
          kind: 'carrossel_slides',
          title: s.title || `Slide ${i + 1}`,
          body: s.body || '',
          sort_order: i + 1,
        })
      })
    }
    if (Array.isArray(content.ganchos)) {
      content.ganchos.forEach((g: { title?: string; body?: string }, i: number) => {
        items.push({
          kind: 'gancho',
          title: g.title || `Gancho ${i + 1}`,
          body: g.body || '',
          sort_order: i + 1,
        })
      })
    }

    if (!items.length) {
      await rpc('b2b_playbook_ia_run_finish', {
        p_run_id: runId, p_status: 'failed', p_items_created: 0,
        p_input_tokens: inTok, p_output_tokens: outTok, p_cost_usd: cost,
        p_error: 'nenhum item gerado',
      })
      return err('IA retornou vazio', 500)
    }

    const ins = await rpc('b2b_playbook_ia_bulk_insert_content', {
      p_partnership_id: partnershipId, p_items: items,
    })

    await rpc('b2b_playbook_ia_run_finish', {
      p_run_id: runId, p_status: 'done', p_items_created: ins?.inserted || 0,
      p_input_tokens: inTok, p_output_tokens: outTok, p_cost_usd: cost,
    })

    return ok({
      ok: true,
      run_id: runId,
      inserted: ins?.inserted || 0,
      scope,
      cost_usd: cost,
      tokens: { input: inTok, output: outTok },
      preview: content,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (runId) {
      try {
        await rpc('b2b_playbook_ia_run_finish', {
          p_run_id: runId, p_status: 'failed', p_items_created: 0, p_error: msg,
        })
      } catch { /* ignore */ }
    }
    return err(msg, 500)
  }
})
