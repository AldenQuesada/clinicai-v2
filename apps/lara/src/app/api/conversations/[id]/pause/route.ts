/**
 * POST   /api/conversations/[id]/pause — Pause agent for N minutes
 * DELETE /api/conversations/[id]/pause — Reactivate agent
 * GET    /api/conversations/[id]/pause — Get pause status
 */

import { NextRequest, NextResponse } from 'next/server';
import { pauseAgent, reactivateAgent, getPauseStatus } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const status = await getPauseStatus(id);
  return NextResponse.json(status);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const duration = body.duration || 30; // default 30 min

  try {
    const result = await pauseAgent(id, duration);
    return NextResponse.json({ success: true, pauseStatus: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log(`[PAUSE_API] Solicitando REATIVAÇÃO para id: ${id}`);

  try {
    const result = await reactivateAgent(id);
    console.log(`[PAUSE_API] Sucesso ao reativar: ${id}`);
    return NextResponse.json({ success: true, pauseStatus: result });
  } catch (err: any) {
    console.error(`[PAUSE_API] ERRO ao reativar: ${id}`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
