/**
 * KvSection · sec 6 do modal admin legacy.
 *
 * Mirror das colunas KV em b2b-detail.ui.js (linhas 146-188):
 *   COLUNA 1: Contato + Voucher + Vigencia
 *   COLUNA 2: Narrativa + Contrapartida + Equipe
 *
 * Visual b2b-detail-cols / b2b-kv canonico.
 */

import type { B2BPartnershipDTO } from '@clinicai/repositories'

function fmtBRL(v: number | null): string {
  if (v == null) return '—'
  try {
    return Number(v).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    })
  } catch {
    return `R$ ${v}`
  }
}

export function KvSection({ partnership: p }: { partnership: B2BPartnershipDTO }) {
  return (
    <div className="b2b-detail-cols">
      {/* COL 1 · Contato + Voucher + Vigencia */}
      <div>
        <div className="b2b-sec-title">Contato</div>
        <Kv label="Responsavel" value={p.contactName} />
        <Kv label="Telefone" value={p.contactPhone} mono />
        <Kv label="E-mail" value={p.contactEmail} />
        <Kv label="Instagram" value={p.contactInstagram} />
        <Kv label="Site" value={p.contactWebsite} />

        <div className="b2b-sec-title">Voucher</div>
        <Kv label="Combo" value={p.voucherCombo} />
        <Kv label="Validade" value={`${p.voucherValidityDays || '—'} dias`} />
        <Kv label="Antecedencia" value={`${p.voucherMinNoticeDays || '—'} dias`} />
        <Kv label="Cap mensal" value={p.voucherMonthlyCap ? `${p.voucherMonthlyCap} un.` : null} />
        <Kv label="Entrega" value={p.voucherDelivery.join(', ')} />
        <Kv
          label="Custo unitario"
          value={p.voucherUnitCostBrl != null ? fmtBRL(p.voucherUnitCostBrl) : null}
          mono
        />

        <div className="b2b-sec-title">Vigencia</div>
        <Kv label="Teto mensal" value={p.monthlyValueCapBrl != null ? fmtBRL(p.monthlyValueCapBrl) : null} mono />
        <Kv label="Duracao (meses)" value={p.contractDurationMonths != null ? String(p.contractDurationMonths) : null} />
        <Kv label="Revisao (meses)" value={p.reviewCadenceMonths != null ? String(p.reviewCadenceMonths) : null} />
        <Kv label="Sazonais" value={p.sazonais.join(', ')} />
      </div>

      {/* COL 2 · Narrativa + Contrapartida + Equipe */}
      <div>
        <div className="b2b-sec-title">Narrativa</div>
        {p.slogans.length > 0 ? (
          <ul
            style={{
              margin: '4px 0 12px',
              paddingLeft: 16,
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--b2b-ivory)',
            }}
          >
            {p.slogans.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : null}

        {p.narrativeQuote ? (
          <blockquote
            style={{
              margin: '8px 0 12px',
              padding: '10px 14px',
              borderLeft: '3px solid var(--b2b-champagne)',
              background: 'rgba(201,169,110,0.04)',
              fontStyle: 'italic',
              color: 'var(--b2b-ivory)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {p.narrativeQuote}
            {p.narrativeAuthor ? (
              <cite style={{ display: 'block', marginTop: 6, fontSize: 11, opacity: 0.7, fontStyle: 'normal' }}>
                — {p.narrativeAuthor}
              </cite>
            ) : null}
          </blockquote>
        ) : null}

        <Kv label="Gatilho emocional" value={p.emotionalTrigger} />

        <div className="b2b-sec-title">Contrapartida</div>
        <Kv
          label="O que o parceiro entrega"
          value={p.contrapartida.length > 0 ? p.contrapartida.join(', ') : null}
        />
        <Kv label="Cadencia" value={p.contrapartidaCadence} />

        <div className="b2b-sec-title">Equipe envolvida</div>
        <Kv
          label="Profissionais"
          value={p.involvedProfessionals.length > 0 ? p.involvedProfessionals.join(', ') : null}
        />

        {p.isCollective ? (
          <>
            <div className="b2b-sec-title">Grupo / coletivo</div>
            <Kv label="Membros estimados" value={p.memberCount != null ? String(p.memberCount) : null} />
            <Kv
              label="Alcance mensal"
              value={p.estimatedMonthlyReach != null ? `${p.estimatedMonthlyReach} pessoas/mes` : null}
            />
          </>
        ) : null}

        {p.notes ? (
          <>
            <div className="b2b-sec-title">Notas internas</div>
            <div
              className="text-[12.5px] whitespace-pre-wrap"
              style={{ color: 'var(--b2b-ivory)', lineHeight: 1.5 }}
            >
              {p.notes}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  if (value == null || value === '') return null
  return (
    <div className="b2b-kv">
      <span className="b2b-kv-lbl">{label}</span>
      <span className={`b2b-kv-val${mono ? ' is-mono' : ''}`}>{value}</span>
    </div>
  )
}
