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
import { generateCopilot, type CopilotOutput } from '@clinicai/ai'

export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 min

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
        return NextResponse.json({
          cached: true,
          generated_at: cached.aiCopilotAt,
          ...(cached.aiCopilot as CopilotOutput),
        })
      }
    }

    // 3. Coleta contexto · lead, clinic, msgs em paralelo
    const [lead, clinic, messages] = await Promise.all([
      conv.leadId ? repos.leads.findByPhones(ctx.clinic_id, [conv.phone]) : null,
      repos.clinic.getById(ctx.clinic_id),
      repos.messages.listByConversation(id, { ascending: true }),
    ])

    // findByPhones retorna Map<phone, LeadDTO> · pega o lead se houver
    const leadDto = lead ? lead.get(conv.phone) ?? null : null

    // 4. Build input + chama Anthropic
    const output = await generateCopilot({
      clinicId: ctx.clinic_id,
      userId: ctx.user_id ?? undefined,
      clinicName: clinic?.name ?? 'Clínica',
      responsibleLabel: clinic?.responsibleName ?? undefined,
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

    // 5. Persiste cache (best-effort · nao bloqueia retorno se falhar)
    repos.conversations.updateCopilot(id, output).catch(() => {
      /* swallow · proxima request re-gera */
    })

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
