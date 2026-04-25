import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const supabase = createServerClient();
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Assina o canal do banco para escutar alterações globais nas conversas
      const channel = supabase
        .channel('global_conversations')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wa_conversations' },
          () => {
            controller.enqueue(encoder.encode(`data: "update"\n\n`));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wa_messages' },
          () => {
            controller.enqueue(encoder.encode(`data: "update"\n\n`));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'leads' },
          () => {
            controller.enqueue(encoder.encode(`data: "update"\n\n`));
          }
        )
        .subscribe();

      // Envia um pulso a cada 15s para manter a porta aberta sem travar o NGINX
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
