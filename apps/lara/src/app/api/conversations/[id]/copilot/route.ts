/**
 * GET /api/conversations/[id]/copilot · Sprint B (W-01 + W-02 + W-03)
 *
 * 1 chamada Anthropic Opus 4.7 retorna 3 saidas:
 *   - summary: TLDR do lead pro topo do chat
 *   - next_actions: 3 acoes sugeridas pro painel direito
 *   - smart_replies: 3 chips clicaveis acima do textarea
 *
 * Cache server-side em wa_conversations.ai_copilot (jsonb):
 *   - Reusa se ai_copilot_at >= max(now-10min, last_message_at)
 *   - ?refresh=1 forca re-geracao
 *
 * Multi-tenant ADR-028: clinic_id via JWT (loadServerReposContext).
 * Cost control: callAnthropic checa budget (BUDGET_EXCEEDED ate 402).
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'
import {
  generateCopilot,
  type CopilotOutput,
  type CopilotCommercialProcedure,
} from '@clinicai/ai'
import type { CommercialProcedureDTO } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 min

/**
 * P7.1 B.1 · Feature flag temporario · habilita uso de conteudo comercial
 * curado (clinic_procedimentos_comercial via RPC get_procedimentos_comercial)
 * no prompt do Copilot. Quando false/ausente, Copilot continua usando
 * `repos.procedures.getActiveByClinic` (comportamento atual). Quando true,
 * tenta buscar conteudo comercial em paralelo · fallback silencioso ao
 * comportamento atual em qualquer falha.
 */
const USE_COMMERCIAL_PROCEDURE_CONTENT =
  process.env.USE_COMMERCIAL_PROCEDURE_CONTENT === 'true'

/**
 * P7.1 B.1 · Converte DTO do repositorio pro shape esperado pelo CopilotInput.
 * Trivial mapping · evita dep cruzada packages/ai → packages/repositories.
 */
function toCopilotCommercial(
  d: CommercialProcedureDTO,
): CopilotCommercialProcedure {
  return {
    nome: d.nome,
    categoria: d.categoria,
    pitch_curto: d.pitch_curto,
    pitch_premium: d.pitch_premium,
    promessa_permitida: d.promessa_permitida,
    promessa_proibida: d.promessa_proibida,
    objecoes: d.objecoes,
    quando_indicar: d.quando_indicar,
    quando_nao_indicar: d.quando_nao_indicar,
    nivel_risco_comunicacao: d.nivel_risco_comunicacao,
  }
}

function isCacheFresh(cached: {
  aiCopilot: unknown | null
  aiCopilotAt: string | null
  lastMessageAt: string | null
}): boolean {
  if (!cached.aiCopilot || !cached.aiCopilotAt) return false
  const cachedAt = new Date(cached.aiCopilotAt).getTime()
  if (!Number.isFinite(cachedAt)) return false
  // Idade do cache
  if (Date.now() - cachedAt > CACHE_TTL_MS) return false
  // Mensagens novas desde o cache → invalida
  if (cached.lastMessageAt) {
    const lastMsgAt = new Date(cached.lastMessageAt).getTime()
    if (Number.isFinite(lastMsgAt) && lastMsgAt > cachedAt) return false
  }
  return true
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const forceRefresh = searchParams.get('refresh') === '1'
  // J3 opcao B (2026-05-08) · /secretaria pede ?scope=smart_replies pra
  // economizar output tokens · summary e next_actions descartados pela UI.
  // Cache full continua sendo lido (smart_replies do cache full sao validos)
  // mas NAO escreve cache no modo smart_replies_only (evita poluir o jsonb
  // monolitico ai_copilot com payload parcial · /conversas precisa do cache
  // intacto).
  const isSmartOnly = searchParams.get('scope') === 'smart_replies'

  try {
    const { ctx, repos } = await loadServerReposContext()

    // 1. Conversation + lead lookup
    const conv = await repos.conversations.getById(id)
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // 2. Cache check (skip se forceRefresh)
    if (!forceRefresh) {
      const cached = await repos.conversations.getCopilot(id)
      if (cached && isCacheFresh(cached)) {
        const cachedOutput = (cached.aiCopilot as CopilotOutput) ?? {
          summary: '',
          next_actions: [],
          smart_replies: [],
        }
        // J3 opcao B · scope=smart_replies retorna apenas smart_replies do
        // cache full · summary e next_actions zerados no body pra deixar o
        // contrato consistente com o modo de geracao smart_replies_only.
        return NextResponse.json({
          cached: true,
          generated_at: cached.aiCopilotAt,
          summary: isSmartOnly ? '' : cachedOutput.summary,
          next_actions: isSmartOnly ? [] : cachedOutput.next_actions,
          smart_replies: cachedOutput.smart_replies ?? [],
        })
      }
    }

    // 3. Coleta contexto · lead, clinic, procedimentos, msgs em paralelo
    // Copilot Context A (2026-05-07) · adicionado procedures pro Copilot
    // explicar "como funciona X" sem alucinar. Procedimentos vem SEM preco
    // (ProcedureRepository ja exclui no SELECT · guardrail commit 87a5610).
    // P7.1 B.1 (2026-05-10) · quando feature flag USE_COMMERCIAL_PROCEDURE_CONTENT,
    // busca conteudo comercial curado em paralelo · fallback silencioso pra
    // procedures simples se RPC falhar.
    const commercialPromise: Promise<CommercialProcedureDTO[]> =
      USE_COMMERCIAL_PROCEDURE_CONTENT
        ? repos.procedures.getCommercialContent(ctx.clinic_id).catch(() => [])
        : Promise.resolve([])

    const [lead, clinic, procedures, messages, commercial] = await Promise.all([
      conv.leadId ? repos.leads.findByPhones(ctx.clinic_id, [conv.phone]) : null,
      repos.clinic.getById(ctx.clinic_id),
      repos.procedures.getActiveByClinic(ctx.clinic_id),
      repos.messages.listByConversation(id, { ascending: true }),
      commercialPromise,
    ])

    // findByPhones retorna Map<phone, LeadDTO> · pega o lead se houver
    const leadDto = lead ? lead.get(conv.phone) ?? null : null

    // P7.1 B.1 · log seguro · count + flag · NUNCA conteudo (pitch tem texto comercial)
    if (USE_COMMERCIAL_PROCEDURE_CONTENT) {
      console.info(
        '[copilot] commercial_content',
        JSON.stringify({
          flag: true,
          conv_id: id,
          procs_simple: procedures.length,
          procs_commercial: commercial.length,
        }),
      )
    }

    // 4. Build input + chama Anthropic
    // Copilot Context A · address/inboxRole/procedures injetados como fonte
    // de verdade. Copilot Context B (2026-05-07) · pixKey agora resolvido
    // pelo ClinicRepository em cascata: settings.pix_key (admin · futuro) >
    // fiscal.bancos[].pix (estado atual prod · Mirian Sicredi). Null se nada
    // cadastrado · IA fallback "vou confirmar com a equipe".
    const output = await generateCopilot({
      clinicId: ctx.clinic_id,
      userId: ctx.user_id ?? undefined,
      clinicName: clinic?.name ?? 'Clínica',
      responsibleLabel: clinic?.responsibleName ?? undefined,
      address: clinic?.address ?? null,
      // P7.1 B.1 · procedures simples mantidos sempre como fallback ·
      // commercialProcedures vence quando presente E nao-vazio (cap inteligente
      // dentro de buildUserPrompt do packages/ai).
      procedures: procedures.map((p) => ({
        nome: p.nome,
        categoria: p.categoria,
        descricao: p.descricao,
        duracaoMin: p.duracaoMin,
        sessoes: p.sessoes,
        observacoes: p.observacoes,
      })),
      commercialProcedures: commercial.length > 0
        ? commercial.map(toCopilotCommercial)
        : undefined,
      inboxRole: conv.inboxRole ?? null,
      pixKey: clinic?.pixKey ?? null,
      mode: isSmartOnly ? 'smart_replies_only' : 'full',
      lead: {
        name: leadDto?.name ?? conv.displayName ?? null,
        phone: conv.phone,
        phase: leadDto?.phase ?? null,
        funnel: leadDto?.funnel ?? null,
        score: leadDto?.leadScore ?? 0,
        tags: leadDto?.tags ?? [],
        queixas: leadDto?.queixasFaciais ?? [],
      },
      messages: messages.map((m) => ({
        role: m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
        content: m.content || '',
        isManual: m.sender === 'humano',
        sentAt: m.sentAt,
      })),
    })

    // 5. Persiste cache (best-effort · nao bloqueia retorno se falhar).
    // J3 opcao B · scope=smart_replies NAO escreve cache pra evitar poluir o
    // jsonb monolitico ai_copilot com payload parcial. Cache full continua
    // sendo populado SO por chamadas /conversas (sem scope).
    if (!isSmartOnly) {
      repos.conversations.updateCopilot(id, output).catch(() => {
        /* swallow · proxima request re-gera */
      })
    }

    return NextResponse.json({
      cached: false,
      generated_at: new Date().toISOString(),
      ...output,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    if (message.startsWith('BUDGET_EXCEEDED')) {
      return NextResponse.json(
        { error: 'budget_exceeded', detail: message },
        { status: 402 },
      )
    }
    console.error('[API] Copilot error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
