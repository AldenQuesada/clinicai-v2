/**
 * POST /api/cron/copilot-commercial-smoke · P7.1 B.2A · 2026-05-10.
 *
 * Smoke harness do Copilot comercial · permite testar conteudo curado via
 * RPC `clinic_procedimentos_comercial` SEM depender de DevTools, cookies
 * de sessao, ou ativacao da feature flag global em producao.
 *
 * SEGURANCA · fail-CLOSED:
 *   - POST only
 *   - secret dedicado COPILOT_SMOKE_SECRET (NAO compartilha com outros crons)
 *   - allowlist hardcoded de 5 conversation_ids · qualquer outro 403
 *   - service_role direto · NAO usa cookies/JWT user
 *   - read-only · NUNCA escreve cache · NUNCA envia mensagem · NUNCA toca
 *     wa_messages, wa_conversations, ou qualquer write
 *   - guardrail scan heuristico · sinaliza preco/promessa-absoluta/diagnostico
 *
 * USO:
 *   curl -sS -X POST https://lara.miriandpaula.com.br/api/cron/copilot-commercial-smoke \
 *     -H "x-copilot-smoke-secret: <secret>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"conversation_id":"c89b02da-...","scope":"full","commercial":"on"}'
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { makeRepos } from '@/lib/repos'
import { validateCronSecret } from '@clinicai/utils'
import { createLogger } from '@clinicai/logger'
import {
  generateCopilot,
  pickRelevantCommercialProcedures,
  type CopilotCommercialProcedure,
  type CopilotInput,
} from '@clinicai/ai'

const log = createLogger({ app: 'lara' })

export const dynamic = 'force-dynamic'

// ─── Allowlist de conversation_ids (P7.1 B.2A) ────────────────────────
// Hardcoded · qualquer outro id retorna 403. Nao aceita id arbitrario
// porque endpoint dispara LLM call (custo + risco de exposicao indevida
// de conteudo de paciente fora do escopo do smoke).
const ALLOWED_CONVERSATION_IDS = new Set<string>([
  'c89b02da-79e8-4d16-9f73-3cbfa5c66b05',
  'da926b5c-3551-4dc1-8f61-d1d7a2498c70',
  'fbe66630-f206-4fec-b36f-8e1b7679e4e7',
  '96df2c13-f666-4946-97b5-9267a25d813b',
  '143d47ad-6518-4281-bb12-97ade958fb38',
])

// Tema de cada conv · usado no response pra Alden saber qual proc esperar.
const ID_THEME: Record<string, string> = {
  'c89b02da-79e8-4d16-9f73-3cbfa5c66b05': 'Lifting 5D',
  'da926b5c-3551-4dc1-8f61-d1d7a2498c70': 'Olheiras / SmoothEye',
  'fbe66630-f206-4fec-b36f-8e1b7679e4e7': 'Fotona 4D / parceria',
  '96df2c13-f666-4946-97b5-9267a25d813b': 'Botox + Lifting',
  '143d47ad-6518-4281-bb12-97ade958fb38': 'Fio de PDO + Preenchimento Olheiras',
}

// ─── Guardrail scan (heuristico · case-insensitive) ───────────────────
const PRICE_TERMS = [
  'r$',
  'reais',
  'valor',
  'preço',
  'preco',
  'promo',
  'promoção',
  'promocao',
  'desconto',
  'parcel',
]
const ABSOLUTE_PROMISE_TERMS = [
  'garante',
  'garantido',
  '100%',
  'resultado certo',
  'vai resolver',
  'fica perfeito',
  'sempre funciona',
  'nunca falha',
]

/**
 * P7.1 B.2C · termos absolutos contextuais.
 * Detecta "garantir" + segurança/resultado/naturalidade/eficácia em
 * qualquer ordem na mesma resposta. Janela de 80 chars entre os tokens
 * pra cobrir frases tipo "garantir que voce fica 100% segura" sem dar
 * falso positivo em "garantir o agendamento" (pra agenda essa palavra
 * tambem nao e ideal mas nao e violacao do guardrail clinico).
 */
const GARANTIR_PAIRS: Array<[string, string[]]> = [
  ['garantir', ['segura', 'seguro', 'segurança', 'seguranca']],
  ['garantia', ['segura', 'seguro', 'segurança', 'seguranca']],
  ['garantir', ['resultado', 'natural', 'naturalidade']],
  ['garantia', ['resultado', 'natural', 'naturalidade']],
  ['garantir', ['eficácia', 'eficacia', 'funciona']],
  ['garantir', ['melhora', 'tranquilidade']],
]

function findGarantirContextHits(text: string): string[] {
  const lower = text.toLowerCase()
  const hits: string[] = []
  for (const [anchor, partners] of GARANTIR_PAIRS) {
    let from = 0
    while (true) {
      const idx = lower.indexOf(anchor, from)
      if (idx < 0) break
      const window = lower.slice(idx, idx + anchor.length + 80)
      const matched = partners.find((p) => window.includes(p))
      if (matched) hits.push(`${anchor}+${matched}`)
      from = idx + anchor.length
    }
  }
  return hits
}
const DIAGNOSTIC_TERMS = [
  'você tem',
  'voce tem',
  'você sofre',
  'voce sofre',
  'diagnóstico',
  'diagnostico',
  'isso é',
  'isso e',
]

function scanGuardrails(rawText: string) {
  const lower = rawText.toLowerCase()
  const hits = (terms: string[]) => terms.filter((t) => lower.includes(t))
  const price_terms = hits(PRICE_TERMS)
  const absolute_promise_terms = hits(ABSOLUTE_PROMISE_TERMS)
  const diagnostic_terms = hits(DIAGNOSTIC_TERMS)
  // P7.1 B.2C · detecta "garantir + segurança/resultado/naturalidade".
  const garantir_context_hits = findGarantirContextHits(rawText)
  return {
    price_terms,
    absolute_promise_terms,
    garantir_context_hits,
    diagnostic_terms,
    has_price_violation: price_terms.length > 0,
    has_absolute_promise_violation:
      absolute_promise_terms.length > 0 || garantir_context_hits.length > 0,
    has_diagnostic_violation: diagnostic_terms.length > 0,
  }
}

// ─── Body parse defensivo ──────────────────────────────────────────────
interface SmokeBody {
  conversation_id: string
  scope: 'full' | 'smart_replies'
  commercial: 'on' | 'off'
  refresh: boolean
}

function parseBody(raw: unknown): SmokeBody | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'invalid_body' }
  const o = raw as Record<string, unknown>
  const conversation_id = typeof o.conversation_id === 'string' ? o.conversation_id : ''
  if (!conversation_id) return { error: 'missing_conversation_id' }
  const scope: 'full' | 'smart_replies' =
    o.scope === 'smart_replies' ? 'smart_replies' : 'full'
  const commercial: 'on' | 'off' = o.commercial === 'on' ? 'on' : 'off'
  const refresh = o.refresh !== false
  return { conversation_id, scope, commercial, refresh }
}

// ─── Fetch comercial via service_role (RPC depende de JWT app_clinic_id) ──
// A RPC get_procedimentos_comercial filtra por app_clinic_id() do JWT ·
// service_role nao tem JWT claim por default. Workaround: query direta na
// tabela (FK 1:1 cobre 100% das procedures · ja validado em P7.1 A.0).
async function fetchCommercialProcedures(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clinicId: string,
): Promise<CopilotCommercialProcedure[]> {
  try {
    const { data, error } = await supabase
      .from('clinic_procedimentos')
      .select(
        `id, nome, categoria, tipo, ativo,
         clinic_procedimentos_comercial(
           pitch_curto, pitch_premium, promessa_permitida, promessa_proibida,
           objecoes, quando_indicar, quando_nao_indicar,
           nivel_risco_comunicacao, revisado_em
         )`,
      )
      .eq('clinic_id', clinicId)
      .eq('ativo', true)
    if (error || !Array.isArray(data)) return []
    return data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: any) => {
        const c = row?.clinic_procedimentos_comercial
        if (!c || !c.revisado_em) return null
        return {
          nome: String(row.nome ?? ''),
          categoria: typeof row.categoria === 'string' ? row.categoria : null,
          pitch_curto: typeof c.pitch_curto === 'string' ? c.pitch_curto : null,
          pitch_premium:
            typeof c.pitch_premium === 'string' ? c.pitch_premium : null,
          promessa_permitida:
            typeof c.promessa_permitida === 'string'
              ? c.promessa_permitida
              : null,
          promessa_proibida:
            typeof c.promessa_proibida === 'string'
              ? c.promessa_proibida
              : null,
          objecoes: Array.isArray(c.objecoes)
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              c.objecoes
                .map((o: any) => {
                  const objection =
                    typeof o?.objection === 'string' ? o.objection.trim() : ''
                  const answer =
                    typeof o?.answer === 'string' ? o.answer.trim() : ''
                  return objection && answer
                    ? { objection, answer }
                    : null
                })
                .filter((x: { objection: string; answer: string } | null) => x !== null)
            : [],
          quando_indicar:
            typeof c.quando_indicar === 'string' ? c.quando_indicar : null,
          quando_nao_indicar:
            typeof c.quando_nao_indicar === 'string'
              ? c.quando_nao_indicar
              : null,
          nivel_risco_comunicacao:
            typeof c.nivel_risco_comunicacao === 'string'
              ? c.nivel_risco_comunicacao
              : 'medio',
        } as CopilotCommercialProcedure
      })
      .filter((x): x is CopilotCommercialProcedure => x !== null)
  } catch {
    return []
  }
}

// ─── Handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Auth fail-CLOSED · secret dedicado · header dedicado
  const reject = validateCronSecret(
    req,
    'COPILOT_SMOKE_SECRET',
    'x-copilot-smoke-secret',
  )
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status })
  }

  // 2. Parse body
  let bodyRaw: unknown
  try {
    bodyRaw = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 },
    )
  }
  const parsed = parseBody(bodyRaw)
  if ('error' in parsed) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    )
  }
  const { conversation_id, scope, commercial } = parsed

  // 3. Allowlist · qualquer id fora retorna 403 (nao 404 · evita info leak)
  if (!ALLOWED_CONVERSATION_IDS.has(conversation_id)) {
    return NextResponse.json(
      { ok: false, error: 'conversation_id_not_in_allowlist' },
      { status: 403 },
    )
  }

  // 4. Service-role client + repos · service_role bypassa RLS · NAO escreve.
  const supabase = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repos = makeRepos(supabase as any)

  // 5. Conv + lead + clinic + msgs em paralelo
  const conv = await repos.conversations.getById(conversation_id)
  if (!conv) {
    return NextResponse.json(
      { ok: false, error: 'conversation_not_found' },
      { status: 404 },
    )
  }
  const clinicId = conv.clinicId

  const [lead, clinic, procedures, messages] = await Promise.all([
    conv.leadId ? repos.leads.findByPhones(clinicId, [conv.phone]) : null,
    repos.clinic.getById(clinicId),
    repos.procedures.getActiveByClinic(clinicId),
    repos.messages.listByConversation(conversation_id, { ascending: true }),
  ])
  const leadDto = lead ? lead.get(conv.phone) ?? null : null

  // 6. Comercial · so se commercial='on' · query direta (RPC depende de JWT)
  const commercialPool: CopilotCommercialProcedure[] =
    commercial === 'on' ? await fetchCommercialProcedures(sb, clinicId) : []

  // 7. Selecao real (via picker do packages/ai · espelha exatamente o que
  //    seria injetado no prompt em producao com flag on).
  const leadInput: CopilotInput['lead'] = {
    name: leadDto?.name ?? conv.displayName ?? null,
    phone: conv.phone,
    phase: leadDto?.phase ?? null,
    funnel: leadDto?.funnel ?? null,
    score: leadDto?.leadScore ?? 0,
    tags: leadDto?.tags ?? [],
    queixas: leadDto?.queixasFaciais ?? [],
  }
  const messagesInput: CopilotInput['messages'] = messages.map((m) => ({
    role:
      m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: m.content || '',
    isManual: m.sender === 'humano',
    sentAt: m.sentAt,
  }))
  const selectedCommercial: CopilotCommercialProcedure[] =
    commercialPool.length > 0
      ? pickRelevantCommercialProcedures(commercialPool, leadInput, messagesInput)
      : []

  // 8. Generate copilot · NUNCA escreve cache · NUNCA envia mensagem.
  log.info(
    {
      kind: 'copilot_commercial_smoke',
      conv_id: conversation_id,
      scope,
      commercial,
      pool: commercialPool.length,
      selected: selectedCommercial.length,
    },
    'smoke.started',
  )

  const output = await generateCopilot({
    clinicId,
    clinicName: clinic?.name ?? 'Clínica',
    responsibleLabel: clinic?.responsibleName ?? undefined,
    address: clinic?.address ?? null,
    procedures: procedures.map((p) => ({
      nome: p.nome,
      categoria: p.categoria,
      descricao: p.descricao,
      duracaoMin: p.duracaoMin,
      sessoes: p.sessoes,
      observacoes: p.observacoes,
    })),
    commercialProcedures:
      commercialPool.length > 0 ? commercialPool : undefined,
    inboxRole: conv.inboxRole ?? null,
    pixKey: clinic?.pixKey ?? null,
    mode: scope === 'smart_replies' ? 'smart_replies_only' : 'full',
    lead: leadInput,
    messages: messagesInput,
  })

  // 9. Guardrail scan · scaneia output INTEIRO (summary + actions + replies)
  const scanText = JSON.stringify(output)
  const guardrail_scan = scanGuardrails(scanText)

  // 10. Response · NAO inclui pitch curado completo (so nome+categoria+risco
  //     pra debug · evita poluir log do Alden com texto comercial volumoso)
  return NextResponse.json({
    ok: true,
    kind: 'copilot_commercial_smoke',
    conversation: {
      id: conversation_id,
      phone: conv.phone,
      display_name: conv.displayName ?? null,
      theme: ID_THEME[conversation_id] ?? null,
    },
    scope,
    commercial,
    commercial_enabled: commercial === 'on',
    commercial_procedure_count: commercialPool.length,
    selected_commercial_procedures: selectedCommercial.map((p) => ({
      nome: p.nome,
      categoria: p.categoria,
      nivel_risco_comunicacao: p.nivel_risco_comunicacao,
    })),
    output,
    counts: {
      summary_chars: output.summary?.length ?? 0,
      next_actions: output.next_actions?.length ?? 0,
      smart_replies: output.smart_replies?.length ?? 0,
    },
    guardrail_scan,
  })
}
