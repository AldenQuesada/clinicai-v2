/**
 * ClinicAI — B2B Candidate Evaluate (Claude isolado)
 *
 * Avalia UM candidato já existente no banco, gerando DNA score + fit + riscos
 * + mensagem de abordagem. Sem Apify — usa só ANTHROPIC_API_KEY.
 *
 * Usado quando admin cadastra candidato manualmente (por indicação) e quer
 * uma segunda opinião da IA.
 *
 * Env vars:
 *   ANTHROPIC_API_KEY      (obrigatória)
 *   ANTHROPIC_MODEL        (opcional — default claude-haiku-4-5-20251001)
 *   SUPABASE_URL           (auto)
 *   SUPABASE_SERVICE_ROLE_KEY (auto)
 *
 * POST body: { candidate_id: "uuid" }
 */

const _ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const _MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001'
const _SB_URL = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const CLAUDE_COST = 0.08

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
function err(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

// deno-lint-ignore no-explicit-any
async function claudeScore(candidate: any) {
  if (!_ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY ausente')

  const system = `Você é um estrategista de growth avaliando parceiros B2B pra uma clínica premium de estética feminina em Maringá-PR (Clínica Mirian de Paula). Avalie o fit com o DNA do programa:

DNA obrigatório:
- Excelência (qualidade técnica e reputação)
- Estética (identidade visual, branding, apresentação)
- Propósito (alinhamento com cuidado feminino integrativo premium)

Público-alvo comum: mulheres 40-55, classe A/B, que cuidam da imagem e bem-estar.

Responda ESTRITAMENTE em JSON válido com:
{
  "dna_score": 1-10 (use 7 como piso pra aceitação),
  "dna_justification": "1 frase curta (<140 chars)",
  "fit_reasons": ["até 3 razões pelas quais faz sentido"],
  "risk_flags": ["até 3 riscos/alertas"],
  "approach_message": "mensagem de abordagem WhatsApp (max 280 chars), tom elegante"
}

Nada fora do JSON. Sem preâmbulo.`

  const userMsg = `Categoria: ${candidate.category}

Candidato:
- Nome: ${candidate.name}
- Endereço: ${candidate.address || '—'}
- Instagram: ${candidate.instagram_handle || '—'}
- Site: ${candidate.website || '—'}
- Telefone: ${candidate.phone || '—'}
${candidate.referred_by ? `\nIndicado por: ${candidate.referred_by}` : ''}
${candidate.referred_by_reason ? `Contexto: ${candidate.referred_by_reason}` : ''}
${candidate.google_rating ? `\nGoogle: ${candidate.google_rating} (${candidate.google_reviews} reviews)` : ''}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': _ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: _MODEL,
      max_tokens: 800,
      system,
      messages: [
        { role: 'user', content: userMsg },
        // Prefill: força o modelo a continuar de '{' — garante JSON puro
        { role: 'assistant', content: '{' },
      ],
    }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`Claude ${resp.status}: ${t.slice(0, 200)}`)
  }
  const data = await resp.json()
  const rawText = (data?.content?.[0]?.text || '').trim()
  // Como prefilamos '{', a resposta vem SEM a chave inicial
  const text = '{' + rawText

  const json = _extractJson(text)
  if (!json) {
    return {
      dna_score: null,
      dna_justification: 'Resposta IA nao parseavel',
      fit_reasons: [],
      risk_flags: ['Parse falhou. Raw: ' + rawText.slice(0, 120)],
      approach_message: null,
    }
  }
  return {
    dna_score: Number(json.dna_score) || null,
    dna_justification: String(json.dna_justification || '').slice(0, 200),
    fit_reasons: Array.isArray(json.fit_reasons) ? json.fit_reasons.slice(0, 3) : [],
    risk_flags: Array.isArray(json.risk_flags) ? json.risk_flags.slice(0, 3) : [],
    approach_message: String(json.approach_message || '').slice(0, 500),
  }
}

// Extração robusta de JSON — aceita markdown, texto antes/depois, JSON direto
// deno-lint-ignore no-explicit-any
function _extractJson(text: string): any | null {
  // 1) Tenta direto
  try { return JSON.parse(text) } catch (_) {}

  // 2) Extrai de bloco markdown ```json ... ```
  const md = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (md) {
    try { return JSON.parse(md[1].trim()) } catch (_) {}
  }

  // 3) Do primeiro { ao ultimo }
  const first = text.indexOf('{')
  const last  = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)) } catch (_) {}
  }

  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders })
  if (req.method !== 'POST')    return err('Método inválido', 405)

  let body: { candidate_id?: string }
  try { body = await req.json() } catch { return err('JSON inválido') }

  const candidateId = body.candidate_id
  if (!candidateId) return err('candidate_id obrigatório')

  try {
    // 1) Busca candidato
    const payloadResp = await rpc('b2b_candidate_evaluate_payload', { p_id: candidateId })
    if (!payloadResp?.ok) return err(payloadResp?.error || 'not_found', 404)
    const candidate = payloadResp.candidate

    // 2) Avalia com Claude
    const evaluation = await claudeScore(candidate)

    // 3) Persiste no candidato
    await rpc('b2b_candidate_evaluate_apply', {
      p_id: candidateId,
      p_result: evaluation,
    })

    // 4) Log custo
    await rpc('b2b_scout_usage_log', {
      p_event_type: 'claude_dna',
      p_cost_brl:   CLAUDE_COST,
      p_category:   candidate.category || null,
      p_candidate_id: candidateId,
      p_meta:       { model: _MODEL, trigger: 'manual_evaluate' },
    })

    return ok({ ok: true, evaluation, cost_brl: CLAUDE_COST })
  } catch (e) {
    return err((e as Error).message, 500)
  }
})
