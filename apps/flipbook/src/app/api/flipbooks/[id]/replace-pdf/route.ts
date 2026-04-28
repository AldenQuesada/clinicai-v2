import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

/**
 * POST /api/flipbooks/[id]/replace-pdf
 *
 * Substitui o PDF do flipbook preservando o original em archive/v{N}.pdf
 * e registrando metadata em flipbook_pdf_versions.
 *
 * Body: multipart/form-data com `file` (application/pdf, max 50MB)
 *       opcional `label` (text · etiqueta da versão antiga)
 *
 * Fluxo:
 *   1. valida auth + arquivo
 *   2. busca flipbook (pdf_url atual + page_count)
 *   3. calcula próxima version (max+1, ou 1 se primeira)
 *   4. storage.move pdf_url → archive/v{N}.pdf
 *   5. INSERT flipbook_pdf_versions
 *   6. upload novo arquivo no path original
 *   7. update flipbooks.pdf_url (mesmo path)
 *
 * Settings, capa e preview são preservados (regenerate é botão separado).
 */

const MAX_BYTES = 50 * 1024 * 1024 // 50MB
const ALLOWED_TYPES = new Set(['application/pdf'])

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }

  const allowlist = (process.env.FLIPBOOK_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allowlist.length > 0 && !allowlist.includes((user.email ?? '').toLowerCase())) {
    return { ok: false as const, status: 403 }
  }
  return { ok: true as const, supabase, user }
}

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  // Parse multipart
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid form' }, { status: 400 })
  }
  const file = form.get('file')
  const label = (form.get('label') as string | null)?.toString().slice(0, 200) ?? null
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file ausente' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'tipo inválido (esperado application/pdf)' }, { status: 400 })
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: `tamanho inválido (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 400 })
  }

  // Pega flipbook atual
  const { data: book, error: fetchErr } = await auth.supabase
    .from('flipbooks')
    .select('id, pdf_url, page_count')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Próxima versão (max + 1)
  const { data: lastVersion } = await auth.supabase
    .from('flipbook_pdf_versions')
    .select('version')
    .eq('flipbook_id', id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = (lastVersion?.version ?? 0) + 1

  const archivePath = `${id}/archive/v${nextVersion}.pdf`
  const currentPath = book.pdf_url

  // 1) move atual → archive
  const { error: moveErr } = await auth.supabase.storage
    .from('flipbook-pdfs')
    .move(currentPath, archivePath)
  if (moveErr) {
    return NextResponse.json({ error: `falha ao arquivar: ${moveErr.message}` }, { status: 500 })
  }

  // 2) insere row da versão antiga (best-effort · falha aqui não é fatal mas loga)
  const { error: insertErr } = await auth.supabase
    .from('flipbook_pdf_versions')
    .insert({
      flipbook_id: id,
      version: nextVersion,
      pdf_url: archivePath,
      page_count: book.page_count ?? null,
      label: label || null,
      replaced_by: auth.user.id,
    })
  if (insertErr) {
    console.warn('[replace-pdf] insert version row falhou:', insertErr.message)
    // Roll back o move pra não deixar storage inconsistente
    await auth.supabase.storage.from('flipbook-pdfs').move(archivePath, currentPath).catch(() => {})
    return NextResponse.json({ error: `falha ao registrar versão: ${insertErr.message}` }, { status: 500 })
  }

  // 3) upload novo no path original
  const buf = await file.arrayBuffer()
  const { error: uploadErr } = await auth.supabase.storage
    .from('flipbook-pdfs')
    .upload(currentPath, buf, { contentType: 'application/pdf', upsert: false })
  if (uploadErr) {
    // tenta restaurar versão anterior pra não deixar livro órfão
    try { await auth.supabase.storage.from('flipbook-pdfs').move(archivePath, currentPath) } catch {}
    try { await auth.supabase.from('flipbook_pdf_versions').delete().eq('flipbook_id', id).eq('version', nextVersion) } catch {}
    return NextResponse.json({ error: `falha no upload: ${uploadErr.message}` }, { status: 500 })
  }

  // 4) bump updated_at no flipbook (page_count nova vem depois via regenerate-cover)
  await auth.supabase
    .from('flipbooks')
    .update({ pdf_url: currentPath })
    .eq('id', id)

  return NextResponse.json({
    ok: true,
    archived_version: nextVersion,
    archived_path: archivePath,
    message: 'PDF substituído. Rode "Regenerar capa" e "Gerar preview" pra atualizar visuais.',
  })
}

/**
 * GET /api/flipbooks/[id]/replace-pdf
 * Lista versões arquivadas (ordem desc).
 */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('flipbook_pdf_versions')
    .select('id, version, pdf_url, pdf_size_bytes, page_count, label, replaced_at')
    .eq('flipbook_id', id)
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ versions: data ?? [] })
}
