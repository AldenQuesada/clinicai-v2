/**
 * POST /api/conversations/[id]/upload · upload de midia pelo atendente.
 *
 * P-07 · upload de imagem/audio/PDF inline · pacote 1/2 (storage).
 * O envio pra WhatsApp acontece em /messages (pacote 2/2) via mediaPath
 * retornado aqui.
 *
 * Fluxo:
 *   1. Recebe FormData com `file` (multipart)
 *   2. Valida MIME type + tamanho (limites Meta)
 *   3. Upload pro bucket `media` em `wa-uploads/{clinic_id}/{conversation_id}/{uuid}.{ext}`
 *   4. Retorna { path, mediaType, mimeType, fileName, fileSize }
 *
 * Multi-tenant ADR-028: clinic_id resolvido via JWT.
 * Storage: bucket `media` (publico) · path-based RLS implicita pelo prefix
 * com clinic_id (mesmo padrao usado pelo flipbook/lp).
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { loadServerReposContext } from '@/lib/repos';

export const dynamic = 'force-dynamic';

// Limites Meta (bytes)
const MAX_IMAGE = 5 * 1024 * 1024; //   5MB
const MAX_AUDIO = 16 * 1024 * 1024; // 16MB
const MAX_VIDEO = 16 * 1024 * 1024; // 16MB
const MAX_DOC = 100 * 1024 * 1024; // 100MB

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_AUDIO = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/webm'];
const ALLOWED_VIDEO = ['video/mp4', 'video/3gpp'];
const ALLOWED_DOC = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

/** Strip params do MIME · 'audio/webm;codecs=opus' → 'audio/webm' */
function baseMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

function classify(mime: string): {
  type: 'image' | 'audio' | 'video' | 'document';
  maxSize: number;
} | null {
  const base = baseMime(mime);
  if (ALLOWED_IMAGE.includes(base)) return { type: 'image', maxSize: MAX_IMAGE };
  if (ALLOWED_AUDIO.includes(base)) return { type: 'audio', maxSize: MAX_AUDIO };
  if (ALLOWED_VIDEO.includes(base)) return { type: 'video', maxSize: MAX_VIDEO };
  if (ALLOWED_DOC.includes(base)) return { type: 'document', maxSize: MAX_DOC };
  return null;
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
  };
  return map[baseMime(mime)] ?? 'bin';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params;
    const { ctx, supabase, repos } = await loadServerReposContext();

    // Valida que a conversa pertence a clinic do caller
    const conv = await repos.conversations.getById(conversationId);
    if (!conv || conv.clinicId !== ctx.clinic_id) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'file ausente' }, { status: 400 });
    }

    const mime = file.type || 'application/octet-stream';
    const cls = classify(mime);
    if (!cls) {
      return NextResponse.json(
        { error: `Tipo nao suportado: ${mime}` },
        { status: 415 },
      );
    }
    if (file.size > cls.maxSize) {
      const maxMB = Math.round(cls.maxSize / (1024 * 1024));
      return NextResponse.json(
        { error: `Arquivo muito grande · max ${maxMB}MB pra ${cls.type}` },
        { status: 413 },
      );
    }

    const ext = extFromMime(mime);
    const fileId = uuidv4();
    const path = `wa-uploads/${ctx.clinic_id}/${conversationId}/${fileId}.${ext}`;

    // Upload binario pro bucket `media`
    const arrayBuffer = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from('media')
      .upload(path, new Uint8Array(arrayBuffer), {
        contentType: mime,
        upsert: false,
      });

    if (upErr) {
      console.error('[API] Upload storage error:', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // Public URL (bucket publico) · usado pra preview no client + render no chat
    const { data: pub } = supabase.storage.from('media').getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      path,
      mediaType: cls.type,
      mimeType: mime,
      fileName: file.name || `${fileId}.${ext}`,
      fileSize: file.size,
      publicUrl: pub.publicUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[API] Upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
