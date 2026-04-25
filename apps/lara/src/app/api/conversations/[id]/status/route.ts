import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = await request.json();

  if (!status || !['active', 'paused', 'resolved', 'archived', 'dra'].includes(status)) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from('wa_conversations')
    .update({ status })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
