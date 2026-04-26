/**
 * Partner public page · /parceiro/[token]
 *
 * Port do legacy clinic-dashboard/parceiro.html (274 linhas) pra Next.js.
 * Token na URL nao exige login · RPC b2b_partner_panel_get (SECURITY DEFINER)
 * valida token + rate limit interno.
 *
 * Tema light luxury (#F8F5F0 / champagne #B8956A / dark text #1A1A2E) ·
 * diferente do dark da admin · parceira abre no celular.
 *
 * Mig 800-36 (public_token em b2b_partnerships) ja foi aplicada em prod
 * pelo clinic-dashboard mig 707/738. RPC retorna estrutura rica ·
 * funnel + vouchers + events + targets.
 *
 * Mobile-first · max-width 780px · serif Cormorant Garamond pra titulos
 * + Montserrat pros eyebrows/uppercase.
 */

import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@clinicai/supabase'

export const dynamic = 'force-dynamic'

interface PartnerPanelData {
  ok: boolean
  error?: string
  partnership?: {
    id: string
    name: string
    pillar: string | null
    tier: number | null
    since: string | null
    status: string | null
    contact_name: string | null
    narrative_quote: string | null
    narrative_author: string | null
    monthly_cap: number | null
    default_combo: string | null
  }
  funnel?: {
    issued: number
    delivered: number
    opened: number
    redeemed: number
    expired: number
  }
  vouchers?: Array<{
    id: string
    combo: string | null
    recipient_name: string | null
    status: string
    issued_at: string | null
    opened_at: string | null
    redeemed_at: string | null
  }>
  events?: Array<{
    title: string
    next_occurrence: string | null
    status: string | null
  }>
  targets?: Array<{
    indicator: string
    target_value: string | number | null
    cadence: string | null
    benefit_label: string | null
  }>
}

const STATUS_LABEL: Record<string, string> = {
  issued: 'Emitido',
  delivered: 'Entregue',
  opened: 'Aberto',
  scheduled: 'Agendado',
  redeemed: 'Resgatado',
  purchased: 'Comprado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
}

const PILLAR_LABEL: Record<string, string> = {
  imagem: 'Imagem',
  evento: 'Evento',
  institucional: 'Institucional',
  fitness: 'Fitness',
  alimentacao: 'Alimentação',
  saude: 'Saúde',
  status: 'Status',
  rede: 'Rede',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function statusLabel(s: string): string {
  return STATUS_LABEL[s] || s
}

function pillarLabel(p: string | null | undefined): string {
  if (!p) return '—'
  return PILLAR_LABEL[p] || p
}

async function loadPanel(token: string): Promise<PartnerPanelData> {
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc('b2b_partner_panel_get', {
      p_token: token,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'empty_response' }
    }
    return data as PartnerPanelData
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'rpc_failed' }
  }
}

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function PartnerPublicPage({ params }: PageProps) {
  const { token } = await params
  if (!token) notFound()

  const data = await loadPanel(token)

  if (!data.ok || !data.partnership) {
    return <PanelError message={data.error || 'Link inválido ou expirado.'} />
  }

  const p = data.partnership
  const funnel = data.funnel || {
    issued: 0,
    delivered: 0,
    opened: 0,
    redeemed: 0,
    expired: 0,
  }
  const vouchers = data.vouchers || []
  const events = data.events || []
  const targets = data.targets || []

  const redeemRate =
    funnel.issued > 0
      ? `${Math.round((funnel.redeemed / funnel.issued) * 100)}%`
      : '—'

  return (
    <div style={panelStyles.body}>
      <div style={panelStyles.wrap}>
        <div style={panelStyles.card}>
          <div style={panelStyles.eyebrow}>
            Círculo Mirian de Paula · Painel do Parceiro
          </div>
          <h1 style={panelStyles.title}>{p.name}</h1>
          <p style={panelStyles.subtitle}>
            {pillarLabel(p.pillar)}
            {p.tier ? ` · Tier ${p.tier}` : ''}
          </p>

          <div style={panelStyles.meta}>
            <span>
              Desde · <strong style={panelStyles.metaStrong}>{fmtDate(p.since)}</strong>
            </span>
            {p.status ? (
              <span>
                Status · <strong style={panelStyles.metaStrong}>{p.status}</strong>
              </span>
            ) : null}
          </div>

          {p.narrative_quote ? (
            <div style={panelStyles.quote}>
              “{p.narrative_quote}”
              {p.narrative_author ? (
                <div style={panelStyles.quoteAuthor}>— {p.narrative_author}</div>
              ) : null}
            </div>
          ) : null}

          <div style={panelStyles.sec}>Vouchers</div>
          <div style={panelStyles.kpis}>
            <Kpi label="Emitidos" value={funnel.issued} />
            <Kpi label="Entregues" value={funnel.delivered} />
            <Kpi label="Resgatados" value={funnel.redeemed} />
            <Kpi label="Taxa resgate" value={redeemRate} />
          </div>

          {vouchers.length > 0 ? (
            <table style={panelStyles.table}>
              <thead>
                <tr>
                  <th style={panelStyles.th}>Combo</th>
                  <th style={panelStyles.th}>Status</th>
                  <th style={panelStyles.th}>Emitido</th>
                  <th style={panelStyles.th}>Resgatado</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td style={panelStyles.td}>{v.combo || '—'}</td>
                    <td style={panelStyles.td}>{statusLabel(v.status)}</td>
                    <td style={panelStyles.td}>{fmtDate(v.issued_at)}</td>
                    <td style={panelStyles.td}>{fmtDate(v.redeemed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={panelStyles.muted}>Nenhum voucher emitido ainda.</p>
          )}

          <div style={panelStyles.sec}>Metas pactuadas</div>
          {targets.length > 0 ? (
            <table style={panelStyles.table}>
              <thead>
                <tr>
                  <th style={panelStyles.th}>Indicador</th>
                  <th style={panelStyles.th}>Meta</th>
                  <th style={panelStyles.th}>Cadência</th>
                  <th style={panelStyles.th}>Benefício</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t, i) => (
                  <tr key={`${t.indicator}-${i}`}>
                    <td style={panelStyles.td}>{t.indicator}</td>
                    <td style={panelStyles.td}>{String(t.target_value ?? '—')}</td>
                    <td style={panelStyles.td}>{t.cadence || '—'}</td>
                    <td style={panelStyles.td}>{t.benefit_label || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={panelStyles.muted}>Metas sendo definidas.</p>
          )}

          <div style={panelStyles.sec}>Próximos eventos</div>
          {events.length > 0 ? (
            <ul style={panelStyles.list}>
              {events.map((e, i) => (
                <li key={`${e.title}-${i}`} style={panelStyles.listItem}>
                  <strong style={panelStyles.listStrong}>{e.title}</strong>
                  {e.next_occurrence ? (
                    <span style={panelStyles.listMuted}>
                      {' '}
                      · {fmtDate(e.next_occurrence)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p style={panelStyles.muted}>Sem eventos agendados.</p>
          )}

          <div style={panelStyles.footer}>
            Clínica Mirian de Paula · Maringá · {fmtDate(new Date().toISOString())}
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={panelStyles.kpi}>
      <strong style={panelStyles.kpiValue}>{value}</strong>
      <span style={panelStyles.kpiLabel}>{label}</span>
    </div>
  )
}

function PanelError({ message }: { message: string }) {
  return (
    <div style={panelStyles.body}>
      <div style={panelStyles.wrap}>
        <div style={panelStyles.errorCard}>
          <h1 style={panelStyles.errorTitle}>Link inválido ou expirado</h1>
          <p style={panelStyles.errorText}>
            {message
              ? `Detalhe: ${message}`
              : 'Peça à clínica um novo link do painel.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Styles · luxury light tema · port direto do legacy parceiro.html ───────
const FONT_SERIF = `'Cormorant Garamond', Georgia, serif`
const FONT_SANS = `'Montserrat', sans-serif`
const COLOR_BG_GRAD = 'linear-gradient(135deg, #F8F5F0 0%, #EFE8DB 100%)'
const COLOR_GOLD = '#B8956A'
const COLOR_GOLD_DARK = '#8B7355'
const COLOR_TEXT = '#1A1A2E'
const COLOR_TEXT_MUTED = '#6B6B7D'
const COLOR_BORDER = '#E5DDD1'
const COLOR_CARD = '#FFFFFF'
const COLOR_TINT = '#FAF7F2'

const panelStyles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    background: COLOR_BG_GRAD,
    fontFamily: FONT_SERIF,
    color: COLOR_TEXT,
    minHeight: '100vh',
  },
  wrap: {
    maxWidth: 780,
    margin: '0 auto',
    padding: '48px 24px 80px',
  },
  card: {
    background: COLOR_CARD,
    borderRadius: 14,
    padding: 'clamp(32px, 6vw, 48px) clamp(24px, 5vw, 56px)',
    boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
  },
  eyebrow: {
    fontFamily: FONT_SANS,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: COLOR_GOLD,
    fontWeight: 500,
    marginBottom: 6,
  },
  title: {
    fontSize: 'clamp(32px, 8vw, 44px)',
    fontWeight: 400,
    margin: '0 0 6px',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 18,
    color: COLOR_TEXT_MUTED,
    fontStyle: 'italic',
    margin: '0 0 28px',
  },
  meta: {
    display: 'flex',
    gap: 20,
    flexWrap: 'wrap',
    margin: '0 0 32px',
    padding: '14px 20px',
    background: COLOR_TINT,
    borderRadius: 8,
    fontFamily: FONT_SANS,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLOR_TEXT_MUTED,
  },
  metaStrong: {
    color: COLOR_TEXT,
    fontWeight: 600,
  },
  quote: {
    fontSize: 22,
    fontStyle: 'italic',
    padding: '24px 32px',
    borderLeft: `3px solid ${COLOR_GOLD}`,
    background: COLOR_TINT,
    color: '#3A3A4C',
    margin: '28px 0',
    borderRadius: '0 6px 6px 0',
  },
  quoteAuthor: {
    fontSize: 12,
    fontStyle: 'normal',
    color: COLOR_GOLD_DARK,
    marginTop: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: FONT_SANS,
  },
  sec: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: COLOR_GOLD,
    margin: '36px 0 14px',
    paddingBottom: 8,
    borderBottom: `1px solid ${COLOR_BORDER}`,
  },
  kpis: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    margin: '12px 0',
  },
  kpi: {
    background: COLOR_TINT,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 10,
    padding: '18px 16px',
    textAlign: 'center',
  },
  kpiValue: {
    display: 'block',
    fontSize: 34,
    lineHeight: 1,
    fontWeight: 500,
    color: COLOR_TEXT,
    marginBottom: 4,
  },
  kpiLabel: {
    fontFamily: FONT_SANS,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: COLOR_GOLD_DARK,
  },
  list: {
    margin: '10px 0',
    padding: 0,
    listStyle: 'none',
  },
  listItem: {
    padding: '12px 18px',
    background: COLOR_TINT,
    borderLeft: `3px solid ${COLOR_GOLD}`,
    marginBottom: 8,
    borderRadius: '0 6px 6px 0',
    fontSize: 15,
    color: '#3A3A4C',
  },
  listStrong: {
    color: COLOR_TEXT,
  },
  listMuted: {
    fontFamily: FONT_SANS,
    fontSize: 11,
    color: COLOR_GOLD_DARK,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    margin: '10px 0',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: COLOR_TEXT,
    color: '#FFFFFF',
    fontFamily: FONT_SANS,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: 500,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${COLOR_BORDER}`,
  },
  muted: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    color: COLOR_GOLD_DARK,
    fontStyle: 'italic',
    margin: '10px 0',
  },
  footer: {
    marginTop: 48,
    paddingTop: 20,
    borderTop: `1px solid ${COLOR_BORDER}`,
    fontFamily: FONT_SANS,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLOR_GOLD_DARK,
    textAlign: 'center',
  },
  errorCard: {
    background: COLOR_CARD,
    borderRadius: 14,
    padding: '48px 32px',
    textAlign: 'center',
    boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
  },
  errorTitle: {
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    margin: '0 0 12px',
  },
  errorText: {
    color: COLOR_TEXT_MUTED,
    fontSize: 16,
    margin: 0,
  },
}
