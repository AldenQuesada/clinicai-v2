'use server'

/**
 * Server Action · "Resumo do dia" generativo (Claude Haiku) pro
 * dashboard B2B Analytics.
 *
 * Pedido Alden 2026-04-26: card luxury no topo de /b2b/analytics que
 * narra estado do programa em prosa Mirian de Paula (3-4 frases · tom
 * formal mas intimo · sem emoji · sem hype). 1 padrao notavel + 1
 * oportunidade + 1 atencao + sugestao acionavel discreta.
 *
 * Lifecycle:
 *   - Carrega insights global (top 5 por score), analytics 30d e top 3
 *     partnerships por volume.
 *   - Cache em memoria por clinic_id · TTL 1h. Botao regenerar zera.
 *   - Cost guard via callAnthropic (budget check ja embutido) +
 *     fallback pra last cached em caso de BUDGET_EXCEEDED.
 *   - Audit best-effort em wa_pro_audit_log (event_key=mira.ai_digest).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { callAnthropic, MODELS } from '@clinicai/ai/anthropic'

interface DigestCacheEntry {
  text: string
  generatedAt: string
  expiresAt: number
}

// Cache em memoria · serverless reset aceitavel (spec).
const DIGEST_CACHE = new Map<string, DigestCacheEntry>()
const TTL_MS = 60 * 60 * 1000 // 1h

const SYSTEM_PROMPT = `Você é a Mira, assistente da Clínica Mirian de Paula. Sua voz é luxury·formal·íntima — como uma confidente experiente que cuida do programa de parcerias B2B.

Receba os dados de 30 dias e gere um RESUMO DO DIA em prosa (3-4 frases curtas, no máximo 250 caracteres por frase).

Regras:
- Tom português culto · sem emojis · sem hype
- Foque em 1 padrão notável + 1 oportunidade + 1 ponto de atenção (se houver)
- Cite parcerias por nome quando relevante
- Termine com sugestão acionável discreta
- Nunca invente números · só use o que está nos dados`

export interface DailyDigestResult {
  ok: boolean
  text?: string
  error?: string
  cachedAt?: string
}

export async function generateDailyDigestAction(
  opts: { force?: boolean } = {},
): Promise<DailyDigestResult> {
  let ctxClinicId: string | null = null
  let ctxUserId: string | null = null
  try {
    const { ctx, repos } = await loadMiraServerContext()
    ctxClinicId = ctx.clinic_id
    ctxUserId = ctx.user_id ?? null

    const cacheKey = ctx.clinic_id
    const now = Date.now()

    // Cache hit (e nao for force regenerate) · retorna direto.
    if (!opts.force) {
      const cached = DIGEST_CACHE.get(cacheKey)
      if (cached && cached.expiresAt > now) {
        return {
          ok: true,
          text: cached.text,
          cachedAt: cached.generatedAt,
        }
      }
    } else {
      DIGEST_CACHE.delete(cacheKey)
    }

    // 1. Carrega contexto · 3 fontes em paralelo · best-effort
    const [insights, analytics, partnerships] = await Promise.all([
      repos.b2bInsights.global().catch(() => null),
      repos.b2bAnalytics.get(30).catch(() => null),
      repos.b2bPartnerships.topPerformers30d(ctx.clinic_id, 3).catch(() => []),
    ])

    if (!analytics?.ok) {
      return { ok: false, error: 'analytics_unavailable' }
    }

    // 2. Compacta payload pro modelo · so o que importa, JSON limpo.
    const topAlerts = (insights?.insights ?? []).slice(0, 5).map((i) => ({
      kind: i.kind,
      severity: i.severity,
      title: i.title,
      message: i.message,
      partnership: i.partnership_name,
    }))

    const a = analytics.applications ?? {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      conversion_rate: 0,
    }
    const v = analytics.vouchers ?? {
      total: 0,
      delivered: 0,
      opened: 0,
      scheduled: 0,
      redeemed: 0,
      purchased: 0,
      via_mira: 0,
      via_admin: 0,
      via_backfill: 0,
    }
    const t = analytics.timing ?? {
      avg_approval_hours: 0,
      max_approval_hours: 0,
      resolved_count: 0,
    }
    const h = analytics.health ?? {
      total: 0,
      green: 0,
      yellow: 0,
      red: 0,
      unknown: 0,
    }
    const m = analytics.mira ?? {
      wa_senders_active: 0,
      wa_senders_total: 0,
      nps_responses: 0,
      insights_active: 0,
      nps_summary: { responses: 0, nps_score: null },
    }

    const conversionPct =
      v.total > 0 ? Math.round((Number(v.purchased) / Number(v.total)) * 100) : 0

    const partnershipShares = partnerships.map((p) => {
      const total = partnerships.reduce((acc, x) => acc + x.count, 0)
      const share = total > 0 ? Math.round((p.count / total) * 100) : 0
      return {
        name: p.partnership.name,
        pillar: p.partnership.pillar,
        health: p.partnership.healthColor,
        attributions_30d: p.count,
        share_of_top3_pct: share,
      }
    })

    const userPayload = {
      window: 'últimos 30 dias',
      vouchers: {
        emitidos: v.total,
        entregues: v.delivered,
        abertos: v.opened,
        agendados: v.scheduled,
        compareceram: v.redeemed,
        pagaram: v.purchased,
        conversao_pct: conversionPct,
      },
      candidaturas: {
        total: a.total,
        pendentes: a.pending,
        aprovadas: a.approved,
        rejeitadas: a.rejected,
        tempo_medio_aprovacao_h: t.avg_approval_hours,
        tempo_max_aprovacao_h: t.max_approval_hours,
      },
      saude: {
        ativas: h.total,
        verde: h.green,
        amarela: h.yellow,
        vermelha: h.red,
        sem_dado: h.unknown,
      },
      mira: {
        telefones_ativos: m.wa_senders_active,
        telefones_total: m.wa_senders_total,
        nps_respostas: m.nps_responses,
        nps_score: m.nps_summary?.nps_score ?? null,
        insights_abertos: m.insights_active,
      },
      top_parcerias: partnershipShares,
      alertas_top: topAlerts,
    }

    const userMessage = `Dados do programa:\n\n${JSON.stringify(userPayload, null, 2)}\n\nGere agora o RESUMO DO DIA seguindo as regras do system prompt. Devolva APENAS a prosa final · sem cabeçalho, sem markdown, sem aspas envolvendo.`

    // 3. Chama Haiku · callAnthropic faz budget check + record usage.
    let text: string
    try {
      text = await callAnthropic({
        clinic_id: ctx.clinic_id,
        user_id: ctx.user_id ?? undefined,
        source: 'mira.ai_digest',
        model: MODELS.HAIKU,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 250,
        temperature: 0.7,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'anthropic_error'
      // Budget excedido · tenta servir last cached (mesmo expirado)
      if (msg.startsWith('BUDGET_EXCEEDED')) {
        const stale = DIGEST_CACHE.get(cacheKey)
        if (stale) {
          return {
            ok: true,
            text: stale.text,
            cachedAt: stale.generatedAt,
          }
        }
        return { ok: false, error: 'budget_exceeded' }
      }
      if (msg.includes('ANTHROPIC_API_KEY')) {
        return { ok: false, error: 'api_key_missing' }
      }
      return { ok: false, error: msg }
    }

    const cleaned = (text ?? '').trim()
    if (!cleaned || cleaned.length < 12) {
      return { ok: false, error: 'empty_completion' }
    }

    const generatedAt = new Date().toISOString()
    DIGEST_CACHE.set(cacheKey, {
      text: cleaned,
      generatedAt,
      expiresAt: now + TTL_MS,
    })

    // Audit best-effort · nao bloqueia resposta
    void repos.waProAudit
      .logQuery({
        msg: {
          clinicId: ctx.clinic_id,
          phone: 'mira.ai_digest',
          direction: 'outbound',
          content: cleaned.slice(0, 500),
          intent: 'mira.ai_digest',
        },
        audit: {
          clinicId: ctx.clinic_id,
          phone: 'mira.ai_digest',
          query: 'generateDailyDigestAction',
          intent: 'mira.ai_digest',
          rpcCalled: 'anthropic.haiku',
          success: true,
          resultSummary: `chars=${cleaned.length} · top3=${partnershipShares.length} · alerts=${topAlerts.length}`,
        },
      })
      .catch(() => {})

    return { ok: true, text: cleaned, cachedAt: generatedAt }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error'
    // Audit do erro best-effort (sem repos · usa supabase direto seria
    // overhead · skip se ctx falhou)
    if (ctxClinicId) {
      void (async () => {
        try {
          const { repos } = await loadMiraServerContext()
          await repos.waProAudit.logQuery({
            msg: {
              clinicId: ctxClinicId!,
              phone: 'mira.ai_digest',
              direction: 'outbound',
              content: '',
              intent: 'mira.ai_digest',
            },
            audit: {
              clinicId: ctxClinicId!,
              phone: 'mira.ai_digest',
              query: 'generateDailyDigestAction',
              intent: 'mira.ai_digest',
              rpcCalled: 'anthropic.haiku',
              success: false,
              errorMessage: msg.slice(0, 500),
            },
          })
        } catch {
          // ignored
        }
      })()
    }
    void ctxUserId // satisfaz lint sem usar
    return { ok: false, error: msg }
  }
}
