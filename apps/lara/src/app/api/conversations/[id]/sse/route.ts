import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const supabase = createServerClient();
      
      // Send initial connection heartbeat
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Subscribe to Supabase Realtime for this conversation's messages
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
            const newMsg = payload.new;
            // Format for client
            const formatted = {
              id: newMsg.id,
              content: newMsg.content,
              sender: newMsg.sender === 'user' ? 'user' : 'assistant', // 'human' goes to 'assistant' styling too
              createdAt: newMsg.sent_at,
              type: newMsg.content_type || 'text',
              mediaUrl: newMsg.media_url,
              isManual: newMsg.sender === 'humano'
            };
            
            const eventPayload = `data: ${JSON.stringify(formatted)}\n\n`;
            controller.enqueue(encoder.encode(eventPayload));
          }
        )
        .subscribe();

      // Send a heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (e) {
          clearInterval(heartbeat);
          supabase.removeChannel(channel);
        }
      }, 15000);

      // Handle stream end
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
