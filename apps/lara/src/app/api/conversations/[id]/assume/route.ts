/**
 * POST /api/conversations/[id]/assume — Human assumes control
 * DELETE /api/conversations/[id]/assume — Release back to AI
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { pauseAgent } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    // Ao assumir a conversa, pausamos a IA por 30 minutos (mesmo comportamento do botão de pausa)
    const result = await pauseAgent(id, 30);
    return NextResponse.json({ ok: true, pauseStatus: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('wa_conversations')
    .update({
      ai_enabled: true,
      ai_paused_until: null,
      status: 'active'
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
