/**
 * FinancialCard · 3 KPIs financeiros com PoP comparison.
 *
 *   - Revenue gerado por parceria (R$)
 *   - Ticket medio (R$)  · revenue / N conversoes
 *   - CAC                (R$ por conversao) · custo / N conversoes
 *
 * Decisao CAC (mig 800-29):
 *   custo_voucher = SUM(b2b_partnerships.voucher_unit_cost_brl) por voucher
 *                   redimido no periodo
 *   custo_imagem  = SUM(monthly_value_cap_brl) * meses para parcerias com
 *                   is_image_partner=true
 *   CAC = (custo_voucher + custo_imagem) / N conversoes
 *
 * Edge cases tratados:
 *   - conversions=0       · ticket_medio e CAC null · UI mostra '—'
 *   - previous=0          · delta_pct null · UI mostra '—' no chip
 *   - amostra prev < 10   · chip mostra dashed/cinza com aviso
 *   - revenue subestimado · signal interpretativo "X conversoes sem appt"
 *
 * Server Component-safe.
 */

import type {
  FinancialKpisBlob,
  FinancialSignal,
} from '@clinicai/repositories'
import { CountUp } from '@clinicai/ui'
import { PopChip } from './PopChip'
import { computePop, formatBRL, formatPopTooltip } from './popUtils'

export function FinancialCard({
  blob,
  days,
}: {
  blob: FinancialKpisBlob | null
  days: number
}) {
  if (!blob || !blob.ok) {
    return (
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(201, 169, 110, 0.15)',
          borderRadius: 8,
          padding: '12px 14px',
          marginTop: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            color: '#F5F0E8',
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>💰</span> Financeiro
        </h3>
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#7A7165',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Sem dados financeiros disponíveis no período.
        </div>
      </div>
    )
  }

  const cur = blob.current
  const prv = blob.previous
  const tooltipText = formatPopTooltip(
    blob.range_previous.from,
    blob.range_previous.to,
    days,
  )

  // Deltas dos 3 KPIs principais.
  // CAC: invertColors=true (subir CAC e ruim · vermelho)
  const dRevenue = computePop(cur.revenue, prv.revenue, prv.conversions)
  const dTicket = computePop(cur.ticket_medio, prv.ticket_medio, prv.conversions)
  const dCac = computePop(cur.cac, prv.cac, prv.conversions, true)

  // Cores dos signals · usadas no render abaixo
  const SIGNAL_TONES: Record<string, { fg: string; bg: string }> = {
    red: { fg: '#FCA5A5', bg: 'rgba(239,68,68,0.06)' },
    amber: { fg: '#FCD34D', bg: 'rgba(245,158,11,0.06)' },
    green: { fg: '#6EE7B7', bg: 'rgba(16,185,129,0.06)' },
    neutral: { fg: '#9CA3AF', bg: 'rgba(201,169,110,0.04)' },
  }

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(201, 169, 110, 0.15)',
        borderRadius: 8,
        padding: '12px 14px',
        marginTop: 8,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            color: '#F5F0E8',
            letterSpacing: '0.3px',
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>💰</span>
            Financeiro
          </span>
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 600,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: 999,
              background: 'rgba(201, 169, 110, 0.12)',
              color: '#C9A96E',
              border: '1px solid rgba(201, 169, 110, 0.3)',
            }}
            title="Receita atribuída a conversões B2B no período · vs período anterior."
          >
            PoP {days}d
          </span>
        </h3>
        <div
          style={{
            fontSize: 10.5,
            color: '#B5A894',
            marginTop: 2,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Revenue gerado · ticket médio · custo aquisição cliente (CAC)
        </div>
      </div>

      {/* 3 KPIs · grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <KpiBlock
          lbl="Revenue"
          val={formatBRL(cur.revenue)}
          numeric={cur.revenue ?? null}
          sub={`${cur.conversions} conversões`}
          chip={
            <PopChip
              delta={dRevenue}
              tooltip={tooltipText + ` · anterior: ${formatBRL(prv.revenue)}`}
            />
          }
        />
        <KpiBlock
          lbl="Ticket médio"
          val={formatBRL(cur.ticket_medio)}
          numeric={cur.ticket_medio}
          sub={
            cur.conversions > 0
              ? 'revenue / conversões'
              : 'sem conversões no período'
          }
          chip={
            <PopChip
              delta={dTicket}
              tooltip={
                tooltipText +
                ` · anterior: ${formatBRL(prv.ticket_medio)}`
              }
            />
          }
        />
        <KpiBlock
          lbl="CAC"
          val={formatBRL(cur.cac)}
          numeric={cur.cac}
          sub={`R$ ${cur.cost_total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ÷ ${cur.conversions || 0}`}
          chip={
            <PopChip
              delta={dCac}
              tooltip={
                tooltipText +
                ` · anterior: ${formatBRL(prv.cac)} · subir CAC = pior`
              }
            />
          }
        />
      </div>

      {/* Breakdown de custos · linha extra · so se tem custo */}
      {cur.cost_total > 0 ? (
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px dashed rgba(255,255,255,0.06)',
            fontSize: 10,
            color: '#9CA3AF',
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span title="Custo direto · voucher_unit_cost_brl × N redimidos">
            <span style={{ color: '#7A7165' }}>Custo voucher:</span>{' '}
            <span style={{ color: '#F5F0E8', fontWeight: 600 }}>
              {formatBRL(cur.cost_voucher)}
            </span>
          </span>
          <span title="monthly_value_cap_brl × meses · parcerias is_image_partner=true">
            <span style={{ color: '#7A7165' }}>Custo imagem:</span>{' '}
            <span style={{ color: '#F5F0E8', fontWeight: 600 }}>
              {formatBRL(cur.cost_image)}
            </span>
          </span>
          <span>
            <span style={{ color: '#7A7165' }}>{cur.partnerships_count} parcerias ativas</span>
          </span>
        </div>
      ) : null}

      {/* Signals interpretativos (max 2 mais severos) */}
      {blob.signals.length > 0 ? (
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px dashed rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {blob.signals.slice(0, 2).map((s: FinancialSignal, i: number) => {
            const c = SIGNAL_TONES[s.status] ?? SIGNAL_TONES.neutral
            return (
              <div
                key={`${s.kind}-${i}`}
                style={{
                  fontSize: 10.5,
                  color: c.fg,
                  background: c.bg,
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  lineHeight: 1.4,
                }}
              >
                {s.message}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function KpiBlock({
  lbl,
  val,
  numeric,
  sub,
  chip,
}: {
  lbl: string
  val: string
  /** Quando presente · usa CountUp animado e formata via formatBRL. null = '—' */
  numeric?: number | null
  sub: string
  chip: React.ReactNode
}) {
  const valueNode =
    typeof numeric === 'number' && Number.isFinite(numeric) ? (
      <CountUp value={numeric} format={(n) => formatBRL(n)} />
    ) : (
      val
    )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 24,
            fontWeight: 500,
            color: '#F5F0E8',
            lineHeight: 1,
          }}
        >
          {valueNode}
        </span>
        {chip}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: '#7A7165',
          fontFamily: 'Inter, system-ui, sans-serif',
          marginTop: 2,
        }}
      >
        {lbl}
      </div>
      <div
        style={{
          fontSize: 10,
          color: '#9CA3AF',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {sub}
      </div>
    </div>
  )
}
