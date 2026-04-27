/**
 * SSE per-conversation · stream de novas mensagens em uma conversation.
 *
 * Audit fix N22 (2026-04-27): auth via sessão + valida que conversation
 * pertence ao clinic_id do user. Antes, qualquer browser podia subscrever
 * em qualquer ID de conversation (vazamento cross-tenant via SSE).
 */

import { NextRequest } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { createLogger } from '@clinicai/logger';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Audit fix N22: auth obrigatória
  let ctx;
  let supabase;
  try {
    const result = await loadServerContext();
    ctx = result.ctx;
    supabase = result.supabase;
  } catch (err) {
    log.warn({ err: (err as Error)?.message, conversationId: id }, 'sse.conv.unauthorized');
    return new Response('Unauthorized', { status: 401 });
  }

  // Audit fix N22: valida que conversation pertence à clínica do user
  const { data: conv } = await supabase
    .from('wa_conversations')
    .select('clinic_id')
    .eq('id', id)
    .maybeSingle();

  if (!conv) {
    return new Response('Not found', { status: 404 });
  }
  if (conv.clinic_id !== ctx.clinic_id) {
    log.warn(
      { user_clinic: ctx.clinic_id, conv_clinic: conv.clinic_id, conversationId: id },
      'sse.conv.cross_tenant_blocked',
    );
    return new Response('Forbidden', { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      const channel = supabase
        .channel(`chat_${id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'wa_messages',
            filter: `conversation_id=eq.${id}`,
          },
          (payload) => {
            const newMsg = payload.new as Record<string, unknown>;
            const formatted = {
              id: newMsg.id,
              content: newMsg.content,
              sender: newMsg.sender === 'user' ? 'user' : 'assistant',
              createdAt: newMsg.sent_at,
              type: newMsg.content_type || 'text',
              mediaUrl: newMsg.media_url,
              isManual: newMsg.sender === 'humano',
            };
            const eventPayload = `data: ${JSON.stringify(formatted)}\n\n`;
            controller.enqueue(encoder.encode(eventPayload));
          }
        )
        .subscribe();

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (e) {
          clearInterval(heartbeat);
          supabase.removeChannel(channel);
        }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        supabase.removeChannel(channel);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
