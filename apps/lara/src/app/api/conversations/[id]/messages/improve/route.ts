/**
 * POST /api/conversations/[id]/messages/improve
 *
 * IMPROVE A (2026-05-07) · Atendente clica "Corrigir" no composer · texto
 * é revisado por Claude (ortografia, gramática, clareza, pontuação, fluidez)
 * mantendo sentido, tom acolhedor e ZERO mudanças em preço/data/promessa.
 *
 * Body:
 *   { text: 'rascunho da atendente' }
 *
 * Response sucesso:
 *   { ok: true, improvedText: 'texto revisado' }
 *
 * Response erro:
 *   { ok: false, error: 'empty_text' | 'text_too_long' | 'ai_error' | ... }
 *
 * Validações:
 *   1. text é string
 *   2. trim → não-vazio (422 empty_text)
 *   3. length ≤ 2000 chars (422 text_too_long)
 *   4. conversation existe e pertence à clinic_id (404/403)
 *
 * NÃO envia mensagem · só retorna texto melhorado pra UI substituir o composer.
 * NÃO loga texto completo · só length + clinic_id (LGPD · conteúdo do paciente
 * pode aparecer no rascunho).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { callAnthropic, MODELS } from '@clinicai/ai';
import { createLogger } from '@clinicai/logger';
import { makeRepos } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 2000;

const SYSTEM_PROMPT = `Você é um revisor de mensagens de WhatsApp para uma clínica premium de estética, saúde e rejuvenescimento.

Sua tarefa é melhorar o texto da atendente sem mudar o sentido.

Regras:
- Corrija ortografia, gramática, pontuação e fluidez.
- Mantenha tom humano, acolhedor, claro, elegante e profissional.
- Linguagem natural de WhatsApp · não pareça robô · não fique formal demais.
- NÃO invente informações.
- NÃO altere preços, datas, horários, nomes próprios, condições comerciais ou promessas.
- NÃO prometa resultado médico/estético.
- NÃO adicione emojis se eles não estiverem no texto original.
- NÃO adicione chamadas comerciais (CTAs) novas se a atendente não escreveu.
- NÃO adicione saudações ou despedidas que não estavam no texto.

Retorne APENAS o texto final revisado · sem explicações · sem aspas · sem markdown · sem prefixo "Versão revisada:" ou similar.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Body parse + validação
  const body = await request.json().catch(() => ({}));
  const rawText = body?.text;
  if (typeof rawText !== 'string') {
    return NextResponse.json({ ok: false, error: 'empty_text' }, { status: 422 });
  }
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ ok: false, error: 'empty_text' }, { status: 422 });
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ ok: false, error: 'text_too_long' }, { status: 422 });
  }

  // 2. Auth + multi-tenant guard · mesmo padrão do POST /messages.
  const { ctx } = await loadServerContext();
  const supabase = createServerClient();
  const repos = makeRepos(supabase);

  const conv = await repos.conversations.getById(id);
  if (!conv) {
    return NextResponse.json({ ok: false, error: 'conversation_not_found' }, { status: 404 });
  }
  if (conv.clinicId !== ctx.clinic_id) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  // 3. Chamada IA · helper canônico (budget check + retry + fallback embutidos).
  // Modelo Haiku 4.5 · barato + rápido pra revisão de 1-200 palavras.
  // Temperature 0.2 · resposta determinística · evita reescritas criativas.
  // max_tokens 800 · cobre rascunho até ~600 palavras com folga.
  // NÃO logamos o texto · só metadata pra audit (LGPD · pode haver dados de
  // paciente no rascunho · conteúdo nunca vai pra log estruturado).
  try {
    const improvedText = await callAnthropic({
      clinic_id: ctx.clinic_id,
      source: 'lara.improve_message',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Revise esta mensagem de WhatsApp mantendo o sentido original:\n\n${trimmed}`,
        },
      ],
      model: MODELS.HAIKU,
      temperature: 0.2,
      max_tokens: 800,
    });

    const cleaned = (improvedText ?? '').trim();
    if (!cleaned) {
      log.warn(
        { clinic_id: ctx.clinic_id, conv_id: id.slice(0, 8), input_length: trimmed.length },
        'improve_message.empty_response',
      );
      return NextResponse.json({ ok: false, error: 'ai_empty_response' }, { status: 502 });
    }

    log.info(
      {
        clinic_id: ctx.clinic_id,
        conv_id: id.slice(0, 8),
        input_length: trimmed.length,
        output_length: cleaned.length,
      },
      'improve_message.ok',
    );
    return NextResponse.json({ ok: true, improvedText: cleaned });
  } catch (err) {
    const message = (err as Error)?.message ?? 'unknown_error';
    // Budget excedido vira erro próprio · UI pode mostrar msg específica.
    if (message.startsWith('BUDGET_EXCEEDED')) {
      log.warn(
        { clinic_id: ctx.clinic_id, conv_id: id.slice(0, 8) },
        'improve_message.budget_exceeded',
      );
      return NextResponse.json({ ok: false, error: 'budget_exceeded' }, { status: 429 });
    }
    log.error(
      { clinic_id: ctx.clinic_id, conv_id: id.slice(0, 8), err: message.slice(0, 200) },
      'improve_message.ai_error',
    );
    return NextResponse.json({ ok: false, error: 'ai_error' }, { status: 502 });
  }
}
