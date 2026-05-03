/**
 * GET /api/conversations/[id]/summary?force=true
 *
 * Resumo IA da conv pra secretaria entender contexto em 2s sem ler tudo.
 * Roadmap A1.
 *
 * Cache em wa_conversations.ai_secretaria_summary · re-gera quando:
 *   - nunca foi gerado, OU
 *   - >30min desde último (?force=true bypassa)
 *   - implícito: força regeneração se conv tem 5+ msgs sem cache
 *
 * Modelo: Anthropic Haiku 4.5 (barato, rápido). ~$0.0005 por chamada.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { loadServerReposContext } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SUMMARY_TTL_MIN = 30;

const SYSTEM_PROMPT = `Você gera resumos ULTRA curtos (máximo 2 linhas, 180 chars) de conversas WhatsApp entre paciente e secretaria de clínica de medicina estética.

Foco: o que a secretaria precisa SABER PRA RESPONDER agora.

Formato esperado:
"[Nome (1ª palavra)] · [contexto principal em 1 frase]. [Próxima ação esperada da secretaria, se houver]."

Exemplos bons:
- "Maria · pergunta valor de Smooth Eyes. Aguarda resposta."
- "Carlos · cancelou consulta de amanhã, pediu reagendamento. Sugerir 3 horários."
- "Ana · enviou foto de olheiras pedindo avaliação. Confirmar consulta."

Exemplos ruins:
- "Conversa entre paciente e clínica sobre procedimentos." (vago)
- "Maria iniciou conversa às 10h, depois mandou foto..." (cronológico, longo)

Português BR · português coloquial · sem markdown · sem emojis.`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const force = new URL(request.url).searchParams.get('force') === 'true';

    const { repos } = await loadServerReposContext();
    const supabase = createServerClient();

    const conv = await repos.conversations.getById(id);
    if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // Cache hit · retorna direto se < 30min
    const { data: row } = await supabase
      .from('wa_conversations')
      .select('ai_secretaria_summary, ai_secretaria_summary_at, lead_id')
      .eq('id', id)
      .maybeSingle();

    const cachedSummary = (row as { ai_secretaria_summary?: string | null })?.ai_secretaria_summary ?? null;
    const cachedAt = (row as { ai_secretaria_summary_at?: string | null })?.ai_secretaria_summary_at ?? null;
    const ageMin = cachedAt
      ? (Date.now() - new Date(cachedAt).getTime()) / 60000
      : Infinity;

    if (!force && cachedSummary && ageMin < SUMMARY_TTL_MIN) {
      return NextResponse.json({
        summary: cachedSummary,
        cached: true,
        age_minutes: Math.round(ageMin),
      });
    }

    // Cache miss · gera novo via IA
    const messages = await repos.messages.getHistoryForAI(id, 20);
    if (messages.length === 0) {
      return NextResponse.json({ summary: '', cached: false, age_minutes: 0 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    // Lead context inline (nome, idade, queixas) pra summary mais rico
    const leadId = (row as { lead_id?: string | null })?.lead_id;
    let leadCtx = '';
    if (leadId) {
      const lead = await repos.leads.getById(leadId);
      if (lead) {
        const queixas = (lead.queixasFaciais || []).join(', ');
        leadCtx = `[Lead: ${lead.name || 'sem nome'}${lead.idade ? `, ${lead.idade}a` : ''}${queixas ? `. Queixas: ${queixas}` : ''}]\n\n`;
      }
    }

    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'Paciente' : 'Clínica'}: ${m.content}`)
      .join('\n');

    const completion = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${leadCtx}Conversa:\n${transcript}\n\nResuma em 1-2 linhas (max 180 chars).`,
        },
      ],
    });

    const summary = completion.content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any) => c?.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => String(c.text || ''))
      .join('')
      .trim()
      .slice(0, 220);

    // Salva em cache · cast pra any porque types do Supabase nao foram regenerados
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('wa_conversations')
      .update({
        ai_secretaria_summary: summary,
        ai_secretaria_summary_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ summary, cached: false, age_minutes: 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[API] Conv summary error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
