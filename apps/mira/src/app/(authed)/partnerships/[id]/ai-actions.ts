'use server'

/**
 * Server Actions · IA conteudo (Claude Haiku) pra WowActions.
 *
 * Pedido Alden 2026-04-26: tirar "Em breve" da acao "IA conteudo" no
 * WowActions tab Crescer. Gera conteudo curto (post/story/reels/email) usando
 * Claude Haiku · barato + rapido pro use case.
 *
 * Restrito a owner/admin · usa Anthropic SDK do package compartilhado
 * (@clinicai/ai/anthropic) com cost control + budget check.
 *
 * Contexto pro prompt: nome, pillar, slogan + funil de vouchers (last 90d).
 * Tom: copywriter B2B luxury, contemplativo, PT-BR, max 200 palavras.
 *
 * TODO: se ANTHROPIC_API_KEY nao tiver no env, callAnthropic vai throw ·
 * caller mostra erro amigavel.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { callAnthropic, MODELS } from '@clinicai/ai/anthropic'

export type AiContentKind = 'post' | 'story' | 'reels' | 'email'

const KIND_BRIEF: Record<AiContentKind, string> = {
  post: 'um POST de Instagram (1-2 paragrafos curtos · CTA suave · pode usar emoji minimo · max 150 palavras)',
  story:
    'um STORY de Instagram (1 frase forte de gancho + 1 frase de soft CTA · max 40 palavras · vibe instantanea)',
  reels:
    'um ROTEIRO de REELS (gancho 1 linha, 2-3 beats curtos pra falar em camera, CTA final · max 120 palavras)',
  email:
    'um EMAIL curto pra enviar pra parceira (saudacao calorosa, atualizacao pessoal sobre a parceria, proximo passo · max 200 palavras)',
}

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function generatePartnerContentAction(
  partnershipId: string,
  kind: AiContentKind,
): Promise<{ ok: boolean; content?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  if (!partnershipId) return { ok: false, error: 'partnership_id_required' }
  if (!KIND_BRIEF[kind]) return { ok: false, error: 'invalid_kind' }

  // 1. Carrega contexto · partnership + funnel + nps summary (best-effort)
  const partnership = await repos.b2bPartnerships.getById(partnershipId)
  if (!partnership || partnership.clinicId !== ctx.clinic_id) {
    return { ok: false, error: 'not_found' }
  }

  const [funnel, nps] = await Promise.all([
    repos.b2bVouchers.funnel(partnershipId).catch(() => null),
    repos.b2bNps.summary(partnershipId).catch(() => null),
  ])

  // 2. Monta system prompt · luxury, contemplativo, PT-BR
  const sloganLine = partnership.slogans.length
    ? `Slogan: "${partnership.slogans[0]}"`
    : 'Slogan: (nao definido · invente algo curto e elegante)'
  const narrativeLine = partnership.narrativeQuote
    ? `Narrativa: "${partnership.narrativeQuote}"`
    : ''
  const triggerLine = partnership.emotionalTrigger
    ? `Gatilho emocional: ${partnership.emotionalTrigger}`
    : ''

  const system = `Voce eh copywriter especialista em marketing de relacionamento B2B pra clinica de estetica de alto padrao.
Cliente: Clinica da Dra. Mirian de Paula.
Tom: luxury, contemplativo, PT-BR. NUNCA chama o leitor de "voce" no plural ou usa exclamacoes em excesso. Frases curtas. Vocabulario sensorial.
Sem hashtags. Sem #. Sem CTA agressivo.
Entregue APENAS o texto final · sem cabecalho, sem markdown, sem aspas envolvendo.`

  const stats: string[] = []
  if (funnel) {
    stats.push(
      `Vouchers emitidos lifetime: ${funnel.issued} · resgatados ${funnel.redeemed} (${funnel.redemption_rate_pct}%)`,
    )
  }
  if (nps?.responses_count) {
    stats.push(`NPS: ${nps.nps ?? '—'} (${nps.responses_count} respostas)`)
  }
  const statsBlock = stats.length ? `\nMetricas recentes: ${stats.join(' · ')}` : ''

  const user = `Parceira: ${partnership.name}
Pilar de imagem: ${partnership.pillar}
${sloganLine}
${narrativeLine}
${triggerLine}${statsBlock}

Tarefa: gere ${KIND_BRIEF[kind]}.
Foco: celebrar a parceria com a ${partnership.name} de forma autentica · evite jargao publicitario.`

  // 3. Chama Anthropic Haiku (barato + rapido pro use case)
  try {
    const text = await callAnthropic({
      clinic_id: ctx.clinic_id,
      user_id: ctx.user_id ?? undefined,
      source: `mira.ai_content.${kind}`,
      model: MODELS.HAIKU,
      system,
      messages: [{ role: 'user', content: user }],
      max_tokens: 600,
      temperature: 0.7,
    })
    if (!text || text.length < 8) {
      return { ok: false, error: 'empty_completion' }
    }
    return { ok: true, content: text.trim() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'anthropic_error'
    if (msg.includes('ANTHROPIC_API_KEY')) {
      return { ok: false, error: 'api_key_missing' }
    }
    if (msg.startsWith('BUDGET_EXCEEDED')) {
      return { ok: false, error: 'budget_exceeded' }
    }
    return { ok: false, error: msg }
  }
}
