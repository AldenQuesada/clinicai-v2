/**
 * POST /api/secretaria/ask-doctor
 *  Body: { conversation_id, question }
 *  Cria pergunta pra Dra. com contexto IA-gerado + sugestão de resposta.
 *
 * GET /api/secretaria/ask-doctor?conversation_id=...
 *  Lista perguntas dessa conv (pra UI mostrar status / resposta da Dra).
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { loadServerReposContext } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SUGGEST_PROMPT = `Você assiste a Dra. Mirian de Paula (medicina estética) com sugestões de resposta pra perguntas de paciente que a secretaria não soube responder.

Sua tarefa: ler o contexto da conversa + pergunta da secretaria, e GERAR uma sugestão CURTA (max 4 linhas, 350 chars) de resposta que a Dra. pode aprovar/editar.

Regras:
- Tom: caloroso, profissional, em PT-BR coloquial · zero markdown · zero emojis
- Quando faltar info técnica específica (valor exato, agenda), responda com placeholder [VALOR/HORÁRIO] pra Dra. preencher
- NÃO invente informações que você não tem certeza
- Use o nome da paciente sempre que possível
- Se a pergunta for sobre procedimento, mencione que pode ter avaliação inicial

Retorne SOMENTE o texto da sugestão, sem prefixo "Sugestão:" nem aspas.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const conversationId = String(body?.conversation_id || '');
    const question = String(body?.question || '').trim();

    if (!conversationId || !question) {
      return NextResponse.json({ error: 'conversation_id e question obrigatorios' }, { status: 400 });
    }

    const { repos, ctx } = await loadServerReposContext();
    const supabase = createServerClient();

    const conv = await repos.conversations.getById(conversationId);
    if (!conv) return NextResponse.json({ error: 'conversation_not_found' }, { status: 404 });
    if (conv.clinicId !== ctx.clinic_id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Snapshot · ultimas 5 msgs + perfil do lead
    const messages = await repos.messages.getHistoryForAI(conversationId, 5);
    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'Paciente' : 'Clínica'}: ${m.content}`)
      .join('\n');

    let leadCtxLine = '';
    if (conv.leadId) {
      const lead = await repos.leads.getById(conv.leadId);
      if (lead) {
        const queixas = (lead.queixasFaciais || []).join(', ');
        leadCtxLine =
          `${lead.name || 'sem nome'}` +
          (lead.idade ? `, ${lead.idade}a` : '') +
          (queixas ? ` · queixas: ${queixas}` : '') +
          (lead.funnel ? ` · funil: ${lead.funnel}` : '') +
          (lead.leadScore != null ? ` · score: ${lead.leadScore}` : '');
      }
    }

    const contextSnapshot = `${leadCtxLine ? `Paciente: ${leadCtxLine}\n\n` : ''}Últimas mensagens:\n${transcript}`;

    // IA sugere resposta
    let suggestedAnswer = '';
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const client = new Anthropic({ apiKey });
        const completion = await client.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 250,
          system: SUGGEST_PROMPT,
          messages: [
            {
              role: 'user',
              content: `${contextSnapshot}\n\nPergunta da secretaria pra Dra.: "${question}"\n\nSugira a resposta pro paciente:`,
            },
          ],
        });
        suggestedAnswer = completion.content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((c: any) => c?.type === 'text')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((c: any) => String(c.text || ''))
          .join('')
          .trim();
      } catch (err) {
        console.warn('[ask-doctor] IA sugestão falhou:', (err as Error)?.message);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (supabase as any)
      .from('conversation_questions')
      .insert({
        clinic_id: ctx.clinic_id,
        conversation_id: conversationId,
        lead_id: conv.leadId,
        asked_by: ctx.user_id ?? null,
        question,
        context_snapshot: contextSnapshot,
        suggested_answer: suggestedAnswer || null,
        suggested_at: suggestedAnswer ? new Date().toISOString() : null,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !inserted) {
      return NextResponse.json({ error: error?.message || 'insert_failed' }, { status: 500 });
    }

    // Notify · sino da Dra. (todas profiles owner/admin recebem)
    try {
      await repos.inboxNotifications.create({
        clinicId: ctx.clinic_id,
        conversationId,
        source: 'system',
        reason: 'doctor_question_pending',
        payload: {
          kind: 'doctor_question_pending',
          question_id: inserted.id,
          question_preview: question.slice(0, 80),
        },
      });
    } catch {
      /* silencioso */
    }

    return NextResponse.json({
      ok: true,
      id: inserted.id,
      suggested_answer: suggestedAnswer || null,
      status: 'pending',
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'unknown' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const conversationId = new URL(request.url).searchParams.get('conversation_id') || '';
    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id obrigatorio' }, { status: 400 });
    }
    const supabase = createServerClient();
    const { ctx } = await loadServerReposContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('conversation_questions')
      .select('*')
      .eq('clinic_id', ctx.clinic_id)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'unknown' }, { status: 500 });
  }
}
