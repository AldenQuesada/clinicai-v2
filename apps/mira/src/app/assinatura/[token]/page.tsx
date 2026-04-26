/**
 * Assinatura Digital Publica · /assinatura/[token]
 *
 * Port do legacy clinic-dashboard/legal-document.html (771 linhas vanilla)
 * pra Next.js 16 + React 19. Token formato `<slug>.<rawToken>` na URL ·
 * RPC legal_doc_validate_token (SECURITY DEFINER) valida e marca viewed.
 *
 * Lei 14.063/2020 · assinatura eletronica simples. Canvas + IP + user agent +
 * geolocation opcional armazenados em legal_doc_signatures (imutavel).
 *
 * Tema luxury dark (Cormorant Garamond + champagne #C9A96E + #1A1A2E navy)
 * mobile-first. Server Component faz a validacao · Client Component cuida
 * do canvas + form + submit.
 */

import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@clinicai/supabase'
import { LegalDocRequestRepository } from '@clinicai/repositories'
import { AssinaturaClient } from './AssinaturaClient'
import { AssinadoConfirmacao } from './AssinadoConfirmacao'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

/**
 * Decodifica o token da URL · formato `<slug>.<rawToken>`.
 * Ex: "ld-abc123def4.7f3a9b2c..." → { slug: "ld-abc123def4", token: "7f3a9b2c..." }
 *
 * Slug sempre comeca com "ld-" e tem 12 chars hex apos · raw token e' o resto.
 */
function decodeToken(combined: string): { slug: string; token: string } | null {
  if (!combined) return null
  const dot = combined.indexOf('.')
  if (dot < 4) return null
  const slug = combined.slice(0, dot)
  const token = combined.slice(dot + 1)
  if (!slug.startsWith('ld-') || !token) return null
  return { slug, token }
}

export default async function AssinaturaPage({ params }: PageProps) {
  const { token: combined } = await params
  if (!combined) notFound()

  const decoded = decodeToken(combined)
  if (!decoded) {
    return <ErrorScreen message="Link inválido. Solicite um novo link à clínica." />
  }

  // Valida via RPC (anon-friendly · SECURITY DEFINER)
  const supabase = createServiceRoleClient()
  const repo = new LegalDocRequestRepository(supabase)
  const r = await repo.validateToken(decoded.slug, decoded.token)

  if (!r.ok || !r.data) {
    if (r.code === 'ALREADY_SIGNED') {
      return <AssinadoConfirmacao message="Este documento já foi assinado." />
    }
    return <ErrorScreen message={r.error || 'Documento indisponível.'} />
  }

  const doc = r.data

  return (
    <div style={pageStyles.body}>
      <div style={pageStyles.wrap}>
        <div style={pageStyles.card}>
          <div style={pageStyles.eyebrow}>Assinatura Digital</div>
          <h1 style={pageStyles.title}>
            Consentimento <em style={pageStyles.titleAccent}>Digital</em>
          </h1>
          <p style={pageStyles.subtitle}>
            {doc.professionalName ? `Dr(a). ${doc.professionalName}` : 'Clínica Mirian de Paula'}
          </p>

          <AssinaturaClient
            slug={decoded.slug}
            token={decoded.token}
            initialName={doc.patientName}
            initialCpf={doc.patientCpf || ''}
            content={doc.content}
            professionalName={doc.professionalName}
            professionalReg={doc.professionalReg}
            documentHash={doc.documentHash || ''}
          />

          <div style={pageStyles.footer}>
            Lei 14.063/2020 · Assinatura eletrônica simples
            <br />
            Seus dados estão protegidos pela LGPD (Lei 13.709/2018)
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={pageStyles.body}>
      <div style={pageStyles.wrap}>
        <div style={pageStyles.card}>
          <div style={pageStyles.eyebrow}>Documento Indisponível</div>
          <h1 style={pageStyles.title}>
            Não foi possível <em style={pageStyles.titleAccent}>abrir</em>
          </h1>
          <p style={pageStyles.subtitle}>{message}</p>
          <p style={pageStyles.muted}>
            Entre em contato com a clínica que enviou este link para receber um novo
            documento. Cada link expira em 48 horas após a emissão.
          </p>
          <div style={pageStyles.footer}>
            Clínica Mirian de Paula · Maringá
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Estilos · luxury dark · espelho VouchersClient + parceiro page ─────────
const FONT_SERIF = `'Cormorant Garamond', Georgia, serif`
const FONT_SANS = `'Montserrat', sans-serif`
const COLOR_BG = '#0E0E18'
const COLOR_BG_GRAD = 'linear-gradient(135deg, #0E0E18 0%, #1A1A2E 100%)'
const COLOR_GOLD = '#C9A96E'
const COLOR_GOLD_LIGHT = '#D4B978'
const COLOR_IVORY = '#E8E4D9'
const COLOR_TEXT_MUTED = '#9C9788'
const COLOR_BORDER = 'rgba(201, 169, 110, 0.22)'
const COLOR_CARD = '#16162A'

const pageStyles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    background: COLOR_BG_GRAD,
    fontFamily: FONT_SERIF,
    color: COLOR_IVORY,
    minHeight: '100vh',
    backgroundColor: COLOR_BG,
  },
  wrap: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '32px 16px 64px',
  },
  card: {
    background: COLOR_CARD,
    borderRadius: 16,
    padding: 'clamp(24px, 5vw, 40px) clamp(20px, 5vw, 44px)',
    border: `1px solid ${COLOR_BORDER}`,
    boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
  },
  eyebrow: {
    fontFamily: FONT_SANS,
    fontSize: 10.5,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: COLOR_GOLD,
    fontWeight: 500,
    marginBottom: 8,
  },
  title: {
    fontSize: 'clamp(28px, 7vw, 38px)',
    fontWeight: 300,
    margin: '0 0 4px',
    letterSpacing: 0.5,
    lineHeight: 1.1,
  },
  titleAccent: {
    color: COLOR_GOLD,
    fontWeight: 400,
    fontStyle: 'italic',
  },
  subtitle: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    letterSpacing: 1.5,
    color: COLOR_GOLD_LIGHT,
    fontWeight: 500,
    margin: '0 0 24px',
  },
  muted: {
    fontFamily: FONT_SANS,
    fontSize: 13,
    color: COLOR_TEXT_MUTED,
    lineHeight: 1.6,
    margin: '12px 0 0',
  },
  footer: {
    marginTop: 36,
    paddingTop: 18,
    borderTop: `1px solid ${COLOR_BORDER}`,
    fontFamily: FONT_SANS,
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLOR_TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 1.7,
  },
}
