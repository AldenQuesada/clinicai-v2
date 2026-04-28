import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { getFlipbookBySlug, getSignedPdfUrl } from '@/lib/supabase/flipbooks'
import { readRedirectUrl } from '@/lib/editor/settings-shapes'
import { PasswordGate } from '@/components/reader/PasswordGate'
import { Reader } from './Reader'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ p?: string; t?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const { p } = await searchParams
  const targetPage = p ? Math.max(1, parseInt(p, 10) || 1) : 1
  try {
    const supabase = await createServerClient()
    const book = await getFlipbookBySlug(supabase, slug)
    if (!book || book.status !== 'published') return { title: 'Livro · Flipbook' }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3333'
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const url = targetPage > 1 ? `${baseUrl}/${book.slug}?p=${targetPage}` : `${baseUrl}/${book.slug}`

    // OG image dinâmica: se compartilhou ?p=N e temos preview JPEG dessa página,
    // mostra ela. Caso contrário, capa.
    const previewCount = book.preview_count ?? 0
    const hasPreviewForPage = supabaseUrl && targetPage > 1 && targetPage <= previewCount
    const ogImageUrl = hasPreviewForPage
      ? `${supabaseUrl}/storage/v1/object/public/flipbook-previews/${book.slug}/page-${targetPage}.jpg`
      : (book.cover_url ?? null)

    // Title/description dinâmicos por página
    const baseTitle = `${book.title} · ${book.author}`
    const title = targetPage > 1
      ? `Página ${targetPage}${book.page_count ? ` de ${book.page_count}` : ''} · ${book.title}`
      : baseTitle
    const desc = targetPage > 1
      ? `Trecho da página ${targetPage} de "${book.title}" — leia online em flipbook digital.`
      : (book.subtitle ?? `${book.title} · ${book.author} · leia online em flipbook digital`)

    return {
      title,
      description: desc,
      alternates: { canonical: url },
      openGraph: {
        type: 'book',
        url,
        title,
        description: desc,
        siteName: 'Flipbook',
        locale: book.language === 'en' ? 'en_US' : book.language === 'es' ? 'es_ES' : 'pt_BR',
        images: ogImageUrl ? [{ url: ogImageUrl, width: 600, height: 840, alt: title }] : [],
      },
      twitter: {
        card: ogImageUrl ? 'summary_large_image' : 'summary',
        title,
        description: desc,
        images: ogImageUrl ? [ogImageUrl] : [],
      },
    }
  } catch {
    return { title: 'Livro · Flipbook' }
  }
}

export default async function ReaderPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { p, t } = await searchParams
  const initialPage = p ? Math.max(1, parseInt(p, 10) || 1) : 1
  const supabase = await createServerClient()

  let book
  try {
    book = await getFlipbookBySlug(supabase, slug)
    if (!book) notFound()
    if (book.status !== 'published') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) notFound()
    }
  } catch {
    notFound()
  }

  // settings.redirect_url · pre-render redirect (server-side, antes de qualquer html)
  // Útil pra livros depreciados ou que viraram landing externa.
  const redirectUrl = readRedirectUrl(book.settings ?? null)
  if (redirectUrl) redirect(redirectUrl)

  // ─── Gating por access token (compra/assinatura) ───
  // Aceita ?t={token} (vindo do link Lara WhatsApp) OU cookie flipbook-grant:{slug}
  // (sessão lembrada por 90d). Validado via RPC SECURITY DEFINER que verifica:
  //   - token existe + não revogado + não expirado
  //   - flipbook_id casa
  //   - subscription ainda active (se for grant via sub)
  const cookieStore = await cookies()
  const grantCookieName = `flipbook-grant:${book.slug}`
  const cookieToken = cookieStore.get(grantCookieName)?.value
  const candidateToken = (t || cookieToken || '').trim()
  let hasGrantAccess = false

  if (candidateToken) {
    const { data: grantId } = await supabase.rpc('flipbook_resolve_access_token', {
      p_access_token: candidateToken,
      p_flipbook_id: book.id,
    })
    if (grantId) {
      hasGrantAccess = true
      // Persistir cookie 90d se veio via query param (primeira vez)
      if (t && t !== cookieToken) {
        cookieStore.set(grantCookieName, t, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 90, // 90 dias
        })
      }
    }
  }

  // Gating por senha · cookie value = hash atual; se hash mudou, gate de novo.
  // Token grant válido bypassa senha.
  if (book.access_password_hash && !hasGrantAccess) {
    const cookieHash = cookieStore.get(`flipbook-pwd:${book.slug}`)?.value
    if (cookieHash !== book.access_password_hash) {
      return (
        <PasswordGate
          slug={book.slug}
          flipbookId={book.id}
          title={book.title}
        />
      )
    }
  }

  let signedUrl
  try {
    signedUrl = await getSignedPdfUrl(supabase, book.pdf_url)
  } catch {
    notFound()
  }

  // Schema.org Book JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    inLanguage: book.language === 'en' ? 'en' : book.language === 'es' ? 'es' : 'pt-BR',
    bookFormat: 'EBook',
    image: book.cover_url ?? undefined,
    isbn: undefined,
    numberOfPages: book.page_count ?? undefined,
    description: book.subtitle ?? undefined,
    ...(book.amazon_asin ? { sameAs: `https://www.amazon.com/dp/${book.amazon_asin}` } : {}),
  }

  return (
    <main className="h-screen bg-bg overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Reader
        pdfUrl={signedUrl}
        pdfPath={book.pdf_url}
        flipbookId={book.id}
        pageCount={book.page_count}
        previewCount={book.preview_count}
        format={book.format}
        title={book.title}
        subtitle={book.subtitle}
        author={book.author}
        edition={book.edition}
        coverUrl={book.cover_url}
        slug={book.slug}
        initialPage={initialPage}
        amazonAsin={book.amazon_asin}
        settings={book.settings}
      />
    </main>
  )
}
