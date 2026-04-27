/**
 * ClinicAI — B2B Scout Scan Edge Function
 *
 * Orquestra a varredura de candidatos:
 *   1) Valida via RPC b2b_scout_can_scan (toggle + budget + rate limit)
 *   2) Chama Apify Google Maps Scraper pra categoria+cidade
 *   3) Para cada resultado (top N): envia payload pro Claude que gera:
 *      { dna_score, dna_justification, fit_reasons[], risk_flags[], approach_message }
 *   4) Registra candidato (b2b_candidate_register) + custo (b2b_scout_usage_log)
 *   5) Retorna { ok, created, costs }
 *
 * Env vars (configurar via `supabase secrets set`):
 *   APIFY_TOKEN         — https://console.apify.com/account/integrations
 *   ANTHROPIC_API_KEY   — console.anthropic.com
 *   ANTHROPIC_MODEL     — (opcional) default claude-haiku-4-5-20251001
 *   SUPABASE_URL        — auto
 *   SUPABASE_SERVICE_ROLE_KEY — auto
 *
 * POST body:
 *   { category: "salao_premium", city?: "Maringá, PR", tier_target?: 1, limit?: 15 }
 */

// deno-lint-ignore no-explicit-any
const _APIFY_TOKEN = Deno.env.get('APIFY_TOKEN') || ''
const _ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const _MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001'
const _SB_URL = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
// Shared secret para autorizar invocacao. Defina via:
//   supabase secrets set B2B_SCOUT_SECRET=<valor-longo-random>
const _SCOUT_SECRET = Deno.env.get('B2B_SCOUT_SECRET') || ''

// Origins permitidos em CORS (restrito, nao '*')
const _ALLOWED_ORIGINS = [
  'https://painel.miriandpaula.com.br',
  'https://painel.miriandpaula.com.br',
  'https://lp.miriandpaula.com.br',
  'https://quiz.miriandpaula.com.br',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
]

// Comparacao timing-safe para shared secrets
function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Apify actor: compass/crawler-google-places (Google Maps Scraper)
const APIFY_ACTOR = 'compass~crawler-google-places'

// Custos referência (alinhados com comentário na tabela b2b_scout_usage)
const COSTS = {
  google_maps_scan: 0.40,
  instagram_enrich: 0.15,
  claude_dna:       0.08,
  claude_approach:  0.05,
}

const CATEGORY_TO_QUERY: Record<string, string> = {
  salao_premium:        'salão de beleza premium',
  endocrino_menopausa:  'endocrinologista menopausa',
  acim_confraria:       'associação comercial mulheres empreendedoras',
  fotografo_casamento:  'fotógrafo de casamento',
  joalheria:            'joalheria alta joalheria',
  perfumaria_nicho:     'perfumaria importados nicho',
  psicologia_40plus:    'psicologia feminina coaching',
  ortomolecular:        'medicina ortomolecular integrativa',
  nutri_funcional:      'nutricionista funcional',
  otica_premium:        'ótica premium grifes',
  vet_boutique:         'veterinário boutique',
  fotografo_familia:    'fotógrafo família retrato',
  atelier_noiva:        'atelier vestido de noiva',
  farmacia_manipulacao: 'farmácia de manipulação dermatológica',
  floricultura_assinatura: 'floricultura boutique',
  personal_stylist:     'personal stylist',
  spa_wellness:         'spa day wellness',
}

// ─── CORS ───────────────────────────────────────────────────
// Security 2026-04-20: origin restrito a dashboard + dev local. Rejeita '*'.
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const allowed = _ALLOWED_ORIGINS.includes(origin) ? origin : _ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-scout-secret',
  }
}
function ok(body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
function err(message: string, status = 400, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// ─── Supabase RPC via REST ──────────────────────────────────
async function rpc(name: string, args: Record<string, unknown>) {
  const resp = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': _SB_KEY,
      'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`[${name}] ${resp.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

// ─── Retry com backoff exponencial (500ms · 1.5s · 4.5s) ────
async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  let lastErr: Error | null = null
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn() }
    catch (e) {
      lastErr = e as Error
      const msg = lastErr.message || ''
      // Não retry em erros definitivos (auth, validation)
      if (msg.includes('401') || msg.includes('403') || msg.includes('ausente')) throw lastErr
      if (i < maxAttempts - 1) {
        const delay = 500 * Math.pow(3, i)
        console.log(`[retry ${label}] tentativa ${i+1} falhou (${msg.slice(0,80)}); aguardando ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastErr || new Error(`${label} falhou após ${maxAttempts} tentativas`)
}

// ─── Apify: run actor sync and get items ────────────────────
// deno-lint-ignore no-explicit-any
async function apifyRunSync(query: string, limit: number): Promise<any[]> {
  if (!_APIFY_TOKEN) throw new Error('APIFY_TOKEN ausente')

  return withRetry(async () => {
    const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${_APIFY_TOKEN}`
    const body = {
      searchStringsArray: [query],
      locationQuery: 'Maringá, PR, Brazil',
      maxCrawledPlacesPerSearch: limit,
      language: 'pt-BR',
      countryCode: 'br',
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const t = await resp.text()
      throw new Error(`Apify falhou ${resp.status}: ${t.slice(0, 200)}`)
    }
    return await resp.json()
  }, 'apify')
}

// ─── Claude: score DNA + fit + risks ────────────────────────
// deno-lint-ignore no-explicit-any
async function claudeScore(candidate: any, category: string) {
  if (!_ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY ausente')

  const system = `Você é um estrategista de growth avaliando parceiros B2B pra uma clínica premium de estética feminina em Maringá-PR (Clínica Mirian de Paula). Avalie o fit com o DNA do programa:

DNA obrigatório:
- Excelência (qualidade técnica e reputação)
- Estética (identidade visual, branding, apresentação)
- Propósito (alinhamento com cuidado feminino integrativo premium)

Público-alvo comum: mulheres 40-55, classe A/B, que cuidam da imagem e bem-estar.

Responda ESTRITAMENTE em JSON válido com:
{
  "dna_score": 1-10 (média subjetiva, use 7 como piso pra aceitação),
  "dna_justification": "1 frase curta (<140 chars)",
  "fit_reasons": ["até 3 razões pelas quais faz sentido"],
  "risk_flags": ["até 3 riscos/alertas"],
  "approach_message": "mensagem de abordagem WhatsApp (max 280 chars), tom elegante, propondo uma conversa"
}

Nada fora do JSON. Sem preâmbulo.`

  const userMsg = `Categoria buscada: ${category}

Candidato:
- Nome: ${candidate.title || candidate.name || '?'}
- Endereço: ${candidate.address || '?'}
- Categoria Google: ${candidate.categoryName || candidate.category || '?'}
- Rating: ${candidate.totalScore || '?'} (${candidate.reviewsCount || 0} reviews)
- Site: ${candidate.website || '—'}
- Telefone: ${candidate.phone || '—'}
- Descrição: ${(candidate.description || '').slice(0, 300)}`

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
        { role: 'assistant', content: '{' },
      ],
    }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`Claude falhou ${resp.status}: ${t.slice(0, 200)}`)
  }
  const data = await resp.json()
  const rawText = (data?.content?.[0]?.text || '').trim()
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

// deno-lint-ignore no-explicit-any
function _extractJson(text: string): any | null {
  try { return JSON.parse(text) } catch (_) {}
  const md = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (md) { try { return JSON.parse(md[1].trim()) } catch (_) {} }
  const first = text.indexOf('{')
  const last  = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)) } catch (_) {}
  }
  return null
}

// ─── Processa UMA categoria (extraído pra reuso) ────────────
// deno-lint-ignore no-explicit-any
async function processCategory(category: string, limit: number, tier_target: number | null) {
  const query = CATEGORY_TO_QUERY[category] || category.replace(/_/g, ' ')

  const canScan = await rpc('b2b_scout_can_scan', { p_category: category })
  if (!canScan?.ok) {
    return { ok: false, category, reason: canScan?.reason || 'unknown', created: 0, failed: 0, results: 0, cost: 0 }
  }

  let places: any[] = []
  try {
    places = await apifyRunSync(query, limit)
  } catch (e) {
    return { ok: false, category, reason: `apify:${(e as Error).message}`, created: 0, failed: 0, results: 0, cost: 0 }
  }

  try {
    await rpc('b2b_scout_usage_log', {
      p_event_type: 'google_maps_scan',
      p_cost_brl:   COSTS.google_maps_scan,
      p_category:   category,
      p_candidate_id: null,
      p_meta:       { query, results: places.length },
    })
  } catch (_) {}

  let created = 0
  let failed = 0
  let cost = COSTS.google_maps_scan
  const createdIds: string[] = []

  for (const place of places) {
    try {
      const enrichment = await claudeScore(place, category)
      cost += COSTS.claude_dna

      const payload = {
        category,
        tier_target: tier_target || null,
        name: place.title || place.name || 'Sem nome',
        address: place.address || null,
        phone: place.phone || null,
        website: place.website || null,
        google_rating: place.totalScore || null,
        google_reviews: place.reviewsCount || null,
        source: 'google_maps',
        raw_data: place,
        dna_score: enrichment.dna_score,
        dna_justification: enrichment.dna_justification,
        fit_reasons: enrichment.fit_reasons,
        risk_flags: enrichment.risk_flags,
        approach_message: enrichment.approach_message,
      }

      const r = await rpc('b2b_candidate_register', { p_payload: payload })
      if (r?.ok && r.id) {
        created++
        createdIds.push(r.id)
        await rpc('b2b_scout_usage_log', {
          p_event_type: 'claude_dna',
          p_cost_brl:   COSTS.claude_dna,
          p_category:   category,
          p_candidate_id: r.id,
          p_meta:       { model: _MODEL },
        })
      }
    } catch (_e) {
      failed++
    }
  }

  return { ok: true, category, results: places.length, created, failed, cost, candidate_ids: createdIds.slice(0, 10) }
}

// ─── Handler principal ──────────────────────────────────────
Deno.serve(async (req: Request) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('', { headers: cors })
  if (req.method !== 'POST')    return err('Método inválido', 405, cors)

  // Security 2026-04-20: exige shared secret para invocacao.
  // Antes era publico e anyone com URL drenava budget Apify+Claude.
  if (!_SCOUT_SECRET) {
    console.error('[b2b-scout-scan] B2B_SCOUT_SECRET nao configurado')
    return err('server_misconfigured', 500, cors)
  }
  const provided = req.headers.get('x-scout-secret') || req.headers.get('X-Scout-Secret') || ''
  if (!timingSafeEqual(provided, _SCOUT_SECRET)) {
    return err('unauthorized', 401, cors)
  }

  let body: { category?: string; categories?: string[]; tier_target?: number; limit?: number }
  try { body = await req.json() } catch { return err('JSON inválido', 400, cors) }

  // Suporta tanto single category (legacy) quanto array
  const categories = body.categories && body.categories.length
    ? body.categories.slice(0, 5)  // máx 5 em batch pra respeitar budget
    : body.category ? [body.category] : []

  if (!categories.length) return err('category ou categories obrigatório', 400, cors)

  const limit = Math.min(Math.max(body.limit || 15, 1), 30)
  const tier = body.tier_target || null

  // Processa cada categoria em sequência (não paralelo — respeita rate limit Apify)
  const perCategory = []
  let totalCreated = 0, totalFailed = 0, totalResults = 0, totalCost = 0

  for (const cat of categories) {
    const r = await processCategory(cat, limit, tier)
    perCategory.push(r)
    totalCreated += r.created || 0
    totalFailed  += r.failed  || 0
    totalResults += r.results || 0
    totalCost    += r.cost    || 0
  }

  // Se foi só 1 categoria, mantém formato legado pra compatibilidade
  if (categories.length === 1) {
    const r = perCategory[0]
    if (!r.ok) return err(`Bloqueado: ${r.reason}`, 403, cors)
    return ok({
      ok: true,
      category: r.category,
      results: r.results,
      created: r.created,
      failed: r.failed,
      total_cost_brl: r.cost.toFixed(2),
      candidate_ids: r.candidate_ids,
    }, cors)
  }

  // Batch: resultado agregado + detalhe por categoria
  return ok({
    ok: true,
    categories_processed: perCategory.length,
    total_created: totalCreated,
    total_failed: totalFailed,
    total_results: totalResults,
    total_cost_brl: totalCost.toFixed(2),
    per_category: perCategory,
  }, cors)
})
