/**
 * TimelineSection · sec 18 do modal admin legacy.
 *
 * Mirror de `b2b-timeline.ui.js`. Historico cronologico de eventos auditados:
 *   - status_change, health_change
 *   - voucher_issued/redeemed/cancelled
 *   - playbook_applied, exposure_logged
 *   - lgpd_anonymize/export/consent_*
 *
 * Server Component · 1 RPC b2b_partnership_audit_timeline.
 */

import { loadMiraServerContext } from '@/lib/server-context'

const ACTION_META: Record<string, { glyph: string; color: string; label: string }> = {
  created: { glyph: '●', color: '#C9A96E', label: 'Criada' },
  status_change: { glyph: '→', color: '#C9A96E', label: 'Status' },
  health_change: { glyph: '○', color: '#8A9E88', label: 'Saude' },
  playbook_applied: { glyph: '✓', color: '#8A9E88', label: 'Playbook aplicado' },
  voucher_issued: { glyph: '+', color: '#C4937A', label: 'Voucher emitido' },
  voucher_redeemed: { glyph: '✓', color: '#10B981', label: 'Voucher resgatado' },
  voucher_cancelled: { glyph: '×', color: '#EF4444', label: 'Voucher cancelado' },
  exposure_logged: { glyph: '◆', color: '#C9A96E', label: 'Exposicao' },
  closure_suggested: { glyph: '!', color: '#F59E0B', label: 'Sugerido encerramento' },
  closure_approved: { glyph: '×', color: '#EF4444', label: 'Encerrada' },
  closure_dismissed: { glyph: '↩', color: '#8A9E88', label: 'Mantida ativa' },
  edited: { glyph: '✎', color: '#B5A894', label: 'Editada' },
  comment: { glyph: '✉', color: '#C9A96E', label: 'Comentario' },
  lgpd_anonymize: { glyph: '⌥', color: '#EF4444', label: 'LGPD anonimizada' },
  lgpd_export: { glyph: '⤓', color: '#C9A96E', label: 'LGPD export' },
  lgpd_consent_grant: { glyph: '✓', color: '#10B981', label: 'Consent concedido' },
  lgpd_consent_revoke: { glyph: '×', color: '#F59E0B', label: 'Consent revogado' },
}

const HEALTH_LABELS: Record<string, string> = {
  green: 'Verde',
  yellow: 'Amarelo',
  red: 'Vermelho',
  unknown: 'Sem dado',
}

const STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  dna_check: 'DNA check',
  contract: 'Contrato',
  active: 'Ativa',
  review: 'Em revisao',
  paused: 'Pausada',
  closed: 'Encerrada',
}

function fmtRelative(iso: string): string {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min atras`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}h atras`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d atras`
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

function fmtAbs(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

function describe(action: string, from: string | null, to: string | null): string {
  if (action === 'status_change') {
    const f = STATUS_LABELS[from || ''] || from || '—'
    const t = STATUS_LABELS[to || ''] || to || '—'
    return `${f} → ${t}`
  }
  if (action === 'health_change') {
    const f = HEALTH_LABELS[from || ''] || from || '—'
    const t = HEALTH_LABELS[to || ''] || to || '—'
    return `${f} → ${t}`
  }
  if (action === 'voucher_issued' || action === 'voucher_redeemed' || action === 'voucher_cancelled') {
    return `token #${to || '—'}`
  }
  if (action === 'exposure_logged') return to || ''
  if (action === 'created') return `em ${to || '—'}`
  if (action === 'closure_suggested') return `motivo: ${to || '—'}`
  return ''
}

export async function TimelineSection({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const items = await repos.b2bAudit.timeline(partnershipId, 50)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="b2b-sec-title">
        Historico {items.length > 0 ? `(${items.length})` : ''}
      </h3>
      {items.length === 0 ? (
        <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
          Nenhuma acao registrada ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const meta = ACTION_META[item.action] || {
              glyph: '·',
              color: '#9CA3AF',
              label: item.action,
            }
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 p-2"
                style={{
                  borderLeft: `2px solid ${meta.color}`,
                  background: 'rgba(255,255,255,0.015)',
                  borderRadius: '0 4px 4px 0',
                }}
              >
                <div
                  className="text-[14px] flex-shrink-0 leading-none w-6 text-center"
                  style={{ color: meta.color }}
                >
                  {meta.glyph}
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className="text-[12px] font-semibold"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span
                      className="text-[12px]"
                      style={{ color: 'var(--b2b-text-dim)' }}
                    >
                      {describe(item.action, item.from_value, item.to_value)}
                    </span>
                    {item.author ? (
                      <span className="text-[11px] text-[var(--b2b-text-muted)]">
                        · {item.author}
                      </span>
                    ) : null}
                  </div>
                  {item.notes ? (
                    <div
                      className="text-[11.5px] mt-1"
                      style={{ color: 'var(--b2b-text-muted)' }}
                    >
                      {item.notes}
                    </div>
                  ) : null}
                  <div
                    className="text-[10px] uppercase tracking-[1px] font-mono mt-1"
                    style={{ color: 'var(--b2b-text-muted)' }}
                    title={fmtAbs(item.created_at)}
                  >
                    {fmtRelative(item.created_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
