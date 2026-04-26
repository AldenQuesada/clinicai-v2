'use client'

/**
 * ConversionMonthlyView · Sprint 4 do #2.
 *
 * Layout 2-col mesma altura:
 *   ESQ (40%) · Tabela ranking · click numa linha seleciona parceira
 *   DIR (60%) · Detalhes da parceira (KPIs + funnel + delta)
 *
 * MonthPicker com botoes < mes > pra navegar · "Hoje" volta pro mes atual.
 */

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type {
  MonthlyConversion,
  MonthlyConversionRow,
} from '@clinicai/repositories'

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function fmtYearMonthPt(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  return `${PT_MONTHS[Math.max(0, Math.min(11, Number(m) - 1))]}/${y}`
}

function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y, m - 1 + deltaMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function defaultYearMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ConversionMonthlyView({
  yearMonth,
  rows,
  selectedPartner,
  detail,
}: {
  yearMonth: string
  rows: MonthlyConversionRow[]
  selectedPartner: string | null
  detail: MonthlyConversion | null
}) {
  const router = useRouter()
  const pathname = usePathname() || ''
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()

  function navigate(nextYm: string, nextPartner: string | null) {
    const next = new URLSearchParams(sp?.toString() || '')
    next.set('ym', nextYm)
    if (nextPartner) next.set('partner', nextPartner)
    else next.delete('partner')
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`)
      router.refresh()
    })
  }

  function selectPartner(id: string) {
    navigate(yearMonth, id)
  }

  function shiftMonth(delta: number) {
    navigate(shiftYearMonth(yearMonth, delta), null)
  }

  function goToCurrentMinusOne() {
    navigate(defaultYearMonth(), null)
  }

  return (
    <>
      <header className="b2bm2-header">
        <div>
          <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
          <h1 className="b2bm2-title">Conversão por parceiro</h1>
          <p className="b2bm2-sub">
            Funil de voucher mês a mês · cada parceria com stats agregadas e
            comparação vs mês anterior. Cron mensal envia esse resumo
            automaticamente pra cada parceira (dia 1 às 9h).
          </p>
        </div>
        <div className="b2bm2-header-ctrl">
          <div className="b2bm2-trange-presets">
            <button
              type="button"
              className="b2b-tab"
              onClick={() => shiftMonth(-1)}
              disabled={pending}
              title="Mês anterior"
            >
              ←
            </button>
            <button
              type="button"
              className="b2b-tab active"
              onClick={goToCurrentMinusOne}
              title="Voltar pro mês anterior (default)"
            >
              {fmtYearMonthPt(yearMonth)}
            </button>
            <button
              type="button"
              className="b2b-tab"
              onClick={() => shiftMonth(1)}
              disabled={pending}
              title="Próximo mês"
            >
              →
            </button>
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="b2bm2-card b2bm2-empty">
          <strong>Nenhuma parceria emitiu voucher em {fmtYearMonthPt(yearMonth)}.</strong>
          <p>Tente outro mês ou verifique se há parcerias ativas.</p>
        </div>
      ) : (
        <div className="b2bm2-row b2bm2-conversao-grid">
          {/* ESQUERDA · Tabela ranking */}
          <div className="b2bm2-card">
            <div className="b2bm2-card-hdr">
              <h3>Ranking · {rows.length} parcerias com voucher</h3>
              <div className="b2bm2-card-sub">
                Click numa parceira pra ver detalhes ao lado.
              </div>
            </div>
            <div className="b2bm2-rk-scroll">
              <table className="b2bm2-rk">
                <thead>
                  <tr>
                    <th>Parceria</th>
                    <th>Vouchers</th>
                    <th>Conv.</th>
                    <th>vs anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <RankingRow
                      key={r.partnership_id}
                      r={r}
                      active={r.partnership_id === selectedPartner}
                      onClick={() => selectPartner(r.partnership_id)}
                      busy={pending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DIREITA · Detalhes da parceria selecionada */}
          <div className="b2bm2-card">
            {detail && detail.ok ? (
              <PartnerDetail detail={detail} />
            ) : (
              <div className="b2bm2-empty">
                Selecione uma parceria à esquerda pra ver detalhes.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function RankingRow({
  r,
  active,
  onClick,
  busy,
}: {
  r: MonthlyConversionRow
  active: boolean
  onClick: () => void
  busy: boolean
}) {
  const deltaPct = r.delta_issued_pct
  const deltaPp = r.delta_conv_pp

  return (
    <tr
      onClick={onClick}
      style={{
        cursor: busy ? 'default' : 'pointer',
        background: active
          ? 'rgba(201,169,110,0.12)'
          : undefined,
        borderLeft: active ? '3px solid var(--m2-gold, #C9A96E)' : '3px solid transparent',
      }}
    >
      <td>
        {r.is_image_partner ? (
          <span className="b2bm2-img-pill" title="Parceria de imagem">
            💎
          </span>
        ) : null}
        {r.partnership_name}
        <div className="b2bm2-rk-sub">{r.pillar || '—'}</div>
      </td>
      <td className="b2bm2-rk-n">
        {r.vouchers_issued}
        {r.vouchers_purchased > 0 ? (
          <small> / {r.vouchers_purchased}</small>
        ) : null}
      </td>
      <td className="b2bm2-rk-n b2bm2-rk-conv">{r.conv_total_pct.toFixed(1)}%</td>
      <td
        className="b2bm2-rk-n"
        style={{
          color:
            deltaPp > 0
              ? '#10B981'
              : deltaPp < 0
              ? '#EF4444'
              : 'var(--m2-text-mut, #9CA3AF)',
        }}
      >
        {deltaPct == null
          ? '—'
          : deltaPp > 0
          ? `↑ +${deltaPp.toFixed(1)}pp`
          : deltaPp < 0
          ? `↓ ${deltaPp.toFixed(1)}pp`
          : '·'}
      </td>
    </tr>
  )
}

function PartnerDetail({ detail }: { detail: MonthlyConversion }) {
  const c = detail.current
  const p = detail.previous
  const d = detail.delta

  return (
    <>
      <div className="b2bm2-card-hdr">
        <h3>
          {detail.is_image_partner ? '💎 ' : ''}
          {detail.partnership_name}
          <small> · {fmtYearMonthPt(detail.year_month)}</small>
        </h3>
        <div className="b2bm2-card-sub">
          Comparado a {fmtYearMonthPt(detail.prev_year_month)} (
          {p.vouchers_issued} emitidos, {p.conv_total_pct.toFixed(1)}% conv).
        </div>
      </div>

      {/* KPIs principais */}
      <div className="b2bm-kpi-grid">
        <div className="b2bm-kpi">
          <div className="b2bm-kpi-val">{c.vouchers_issued}</div>
          <div className="b2bm-kpi-lbl">Emitidos</div>
          {d.issued_pct != null ? (
            <div
              className="b2bm-kpi-sub"
              style={{
                color:
                  d.issued_pct > 0
                    ? '#10B981'
                    : d.issued_pct < 0
                    ? '#EF4444'
                    : undefined,
              }}
            >
              {d.issued_pct > 0 ? '+' : ''}
              {d.issued_pct.toFixed(0)}% vs anterior
            </div>
          ) : (
            <div className="b2bm-kpi-sub">primeiro mês</div>
          )}
        </div>

        <div className="b2bm-kpi">
          <div
            className="b2bm-kpi-val"
            style={{
              color: c.conv_total_pct > 0 ? 'var(--m2-gold, #C9A96E)' : undefined,
            }}
          >
            {c.conv_total_pct.toFixed(1)}%
          </div>
          <div className="b2bm-kpi-lbl">Conv. total</div>
          <div
            className="b2bm-kpi-sub"
            style={{
              color:
                d.conv_pp > 0
                  ? '#10B981'
                  : d.conv_pp < 0
                  ? '#EF4444'
                  : undefined,
            }}
          >
            {d.conv_pp > 0 ? '+' : ''}
            {d.conv_pp.toFixed(1)} pp vs anterior
          </div>
        </div>

        <div className="b2bm-kpi">
          <div className="b2bm-kpi-val">{c.vouchers_purchased}</div>
          <div className="b2bm-kpi-lbl">Pagaram</div>
          <div className="b2bm-kpi-sub">
            de {c.vouchers_issued} emitidos
          </div>
        </div>
      </div>

      {/* Funnel detalhado */}
      <div className="b2bm2-card-hdr" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13 }}>Funil completo</h3>
      </div>
      <div className="b2b-journey">
        <Step label="Emitidos" n={c.vouchers_issued} pct={100} color="#64748B" />
        <Step
          label="Entregues"
          n={c.vouchers_delivered}
          pct={c.vouchers_issued > 0 ? Math.round((c.vouchers_delivered / c.vouchers_issued) * 100) : 0}
          color="#60A5FA"
        />
        <Step
          label="Abertos"
          n={c.vouchers_opened}
          pct={c.vouchers_issued > 0 ? Math.round((c.vouchers_opened / c.vouchers_issued) * 100) : 0}
          color="#A78BFA"
        />
        <Step
          label="Agendaram"
          n={c.vouchers_scheduled}
          pct={c.conv_issued_to_scheduled_pct}
          color="#F59E0B"
        />
        <Step
          label="Compareceram"
          n={c.vouchers_redeemed}
          pct={c.vouchers_issued > 0 ? Math.round((c.vouchers_redeemed / c.vouchers_issued) * 100) : 0}
          color="#10B981"
        />
        <Step
          label="Pagaram"
          n={c.vouchers_purchased}
          pct={c.conv_total_pct}
          color="var(--m2-gold, #C9A96E)"
        />
      </div>

      {/* Conv inter-stage (segunda derivada) */}
      <div className="b2bm2-card-hdr" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13 }}>Conversão entre stages</h3>
        <div className="b2bm2-card-sub">
          Onde a parceria perde mais? Stage com menor % é o gargalo.
        </div>
      </div>
      <div className="b2bm-kpi-grid">
        <div className="b2bm-kpi">
          <div className="b2bm-kpi-val">
            {c.conv_issued_to_scheduled_pct.toFixed(1)}%
          </div>
          <div className="b2bm-kpi-lbl">Emitido → Agendou</div>
        </div>
        <div className="b2bm-kpi">
          <div className="b2bm-kpi-val">
            {c.conv_scheduled_to_redeemed_pct.toFixed(1)}%
          </div>
          <div className="b2bm-kpi-lbl">Agendou → Compareceu</div>
        </div>
        <div className="b2bm-kpi">
          <div className="b2bm-kpi-val">
            {c.conv_redeemed_to_purchased_pct.toFixed(1)}%
          </div>
          <div className="b2bm-kpi-lbl">Compareceu → Pagou</div>
        </div>
      </div>
    </>
  )
}

function Step({
  label,
  n,
  pct,
  color,
}: {
  label: string
  n: number
  pct: number
  color: string
}) {
  return (
    <div className="b2b-journey-step">
      <div className="b2b-journey-lbl">{label}</div>
      <div className="b2b-journey-n" style={{ color }}>
        {n}
      </div>
      <div className="b2b-journey-pct">{pct.toFixed(0)}%</div>
      <div className="b2b-journey-bar">
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
