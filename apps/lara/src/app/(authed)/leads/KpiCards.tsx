/**
 * KpiCards · Server Component · KPIs do topo da pagina /leads.
 *
 * Calcula 5 metricas independentes em paralelo:
 *   1. Total ativos (deleted_at IS NULL)
 *   2. Novos hoje (created_at >= start of today)
 *   3. Sem resposta ha 24h (last_response_at < now-24h OU NULL)
 *   4. Em orcamento aberto (orcamentos.status nao terminal · associado a leads)
 *   5. Transbordados pendentes (tag = 'transbordo_humano')
 *
 * Defensive load · cada metrica tem fallback 0 se a query falhar.
 */

import { AlertCircle, MessageSquareWarning, Sparkles, FileText, UserPlus2 } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'

interface KpiData {
  totalAtivos: number
  novosHoje: number
  semResposta24h: number
  orcamentoAberto: number
  transbordados: number
}

async function loadKpis(): Promise<KpiData> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const now = new Date()
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const cut24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    const [total, novos, semResp, orcAberto, transb] = await Promise.all([
      repos.leads.count(ctx.clinic_id).catch(() => 0),
      repos.leads.count(ctx.clinic_id, { createdSince: startToday }).catch(() => 0),
      repos.leads.countNoResponseSince(ctx.clinic_id, cut24h).catch(() => 0),
      // Soma de status nao-terminais. Conta open aproxima como soma de
      // sent+viewed+followup+negotiation+draft (todos abertos).
      Promise.all([
        repos.orcamentos.countByStatus(ctx.clinic_id, 'draft'),
        repos.orcamentos.countByStatus(ctx.clinic_id, 'sent'),
        repos.orcamentos.countByStatus(ctx.clinic_id, 'viewed'),
        repos.orcamentos.countByStatus(ctx.clinic_id, 'followup'),
        repos.orcamentos.countByStatus(ctx.clinic_id, 'negotiation'),
      ])
        .then((arr) => arr.reduce((s, n) => s + n, 0))
        .catch(() => 0),
      // Transbordados · usa list com tags=['transbordo_humano']
      repos.leads
        .list(ctx.clinic_id, { tags: ['transbordo_humano'] }, { limit: 1, offset: 0 })
        .then((r) => r.total)
        .catch(() => 0),
    ])

    return {
      totalAtivos: total,
      novosHoje: novos,
      semResposta24h: semResp,
      orcamentoAberto: orcAberto,
      transbordados: transb,
    }
  } catch (e) {
    console.error('[/leads] loadKpis failed:', (e as Error).message)
    return {
      totalAtivos: 0,
      novosHoje: 0,
      semResposta24h: 0,
      orcamentoAberto: 0,
      transbordados: 0,
    }
  }
}

export async function KpiCards() {
  const k = await loadKpis()
  return (
    <div className="b2b-kpi-grid" style={{ marginBottom: 18 }}>
      <KpiCell
        label="Ativos"
        value={k.totalAtivos}
        Icon={Sparkles}
        tone="champagne"
      />
      <KpiCell
        label="Novos hoje"
        value={k.novosHoje}
        Icon={UserPlus2}
        tone="sage"
      />
      <KpiCell
        label="Sem resposta 24h"
        value={k.semResposta24h}
        Icon={MessageSquareWarning}
        tone={k.semResposta24h > 0 ? 'warn' : 'muted'}
      />
      <KpiCell
        label="Orçamentos abertos"
        value={k.orcamentoAberto}
        Icon={FileText}
        tone="champagne"
      />
      <KpiCell
        label="Transbordados pendentes"
        value={k.transbordados}
        Icon={AlertCircle}
        tone={k.transbordados > 0 ? 'danger' : 'muted'}
      />
    </div>
  )
}

function KpiCell({
  label,
  value,
  Icon,
  tone,
}: {
  label: string
  value: number
  Icon: React.ComponentType<{
    size?: number
    className?: string
    style?: React.CSSProperties
  }>
  tone: 'champagne' | 'sage' | 'warn' | 'danger' | 'muted'
}) {
  const colorByTone: Record<string, string> = {
    champagne: 'var(--b2b-champagne)',
    sage: 'var(--b2b-sage)',
    warn: 'var(--b2b-amber, #f59e0b)',
    danger: 'var(--b2b-red, #ef4444)',
    muted: 'var(--b2b-text-muted)',
  }
  const color = colorByTone[tone] ?? colorByTone.muted
  return (
    <div className="b2b-kpi" style={{ position: 'relative' }}>
      <Icon size={14} className="absolute" />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div>
          <div className="b2b-kpi-num" style={{ color }}>
            {value}
          </div>
          <div className="b2b-kpi-lbl">{label}</div>
        </div>
        <Icon size={18} style={{ color, opacity: 0.7 }} />
      </div>
    </div>
  )
}
