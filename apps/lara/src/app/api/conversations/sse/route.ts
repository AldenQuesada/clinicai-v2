/**
 * SSE global · stream de updates de conversations/messages/leads.
 *
 * Audit fix N22 (2026-04-27): auth via sessão Supabase + scoping por clinic_id.
 * Antes: usava service role + filtro vazio · vazamento cross-tenant em
 * multi-tenant. Channel name 'global_conversations' transmitia mudanças
 * de TODAS as clínicas pra todo browser conectado.
 *
 * Agora: requer user logado · clinic_id vem do JWT claim · Realtime filtra
 * por clinic_id em ambos canais.
 */

import { NextRequest } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { createLogger } from '@clinicai/logger';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Audit fix N22: auth + clinic_id por JWT (não query param)
  let ctx;
  let supabase;
  try {
    const result = await loadServerContext();
    ctx = result.ctx;
    supabase = result.supabase;
  } catch (err) {
    log.warn({ err: (err as Error)?.message }, 'sse.global.unauthorized');
    return new Response('Unauthorized', { status: 401 });
  }

  const clinicId = ctx.clinic_id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Realtime channel scoped por clinic_id · multi-tenant safe
      const channel = supabase
        .channel(`clinic_${clinicId}_lara`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wa_conversations',
            filter: `clinic_id=eq.${clinicId}`,
          },
          () => {
            controller.enqueue(encoder.encode(`data: "update"\n\n`));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wa_messages',
            filter: `clinic_id=eq.${clinicId}`,
          },
          () => {
            controller.enqueue(encoder.encode(`data: "update"\n\n`));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'leads',
            filter: `clinic_id=eq.${clinicId}`,
          },
          () => {
            controller.enqueue(encoder.encode(`data: "update"\n\n`));
          }
        )
        .subscribe();

      // Heartbeat 15s pra não fechar via NGINX idle
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
