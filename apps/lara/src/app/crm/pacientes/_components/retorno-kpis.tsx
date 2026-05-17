/**
 * RetornoKpis · 4 KPIs de Retorno em /crm/pacientes.
 *
 * Implementa as 2 metricas deferidas em `KpiCards` (Camada 8) + 2 extras
 * (sem retorno, próximos retornos) usando dados de
 * `appointments JOIN patients` retornados por
 * `appointment.repository.findUpcomingReturnsForActivePatients`.
 *
 * Pure RSC · server-rendered · zero state.
 *
 * Visual: reusa `.agenda-kpi-pill` (CSS literal · style.css L713-799) ·
 * mesmo padrão dos KPIs da Agenda pra consistência.
 */

interface UpcomingReturn {
  appointmentId: string
  patientId: string
  patientName: string
  patientLastProcedureAt: string | null
  scheduledDate: string
  startTime: string
  professionalName: string
}

interface RetornoKpisProps {
  activePatientCount: number
  upcomingReturns: readonly UpcomingReturn[]
}

const NUM = new Intl.NumberFormat('pt-BR')

function daysBetween(from: string, to: string): number {
  // YYYY-MM-DD parse como UTC midnight pra evitar offset · diferença em dias.
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00.000Z`)
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

function formatScheduleDateLabel(date: string): string {
  // date = YYYY-MM-DD · render como DD/MM em pt-BR.
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}

export function RetornoKpis({
  activePatientCount,
  upcomingReturns,
}: RetornoKpisProps) {
  // Pacientes únicos com pelo menos 1 retorno futuro agendado.
  const patientsWithReturn = new Set(
    upcomingReturns.map((r) => r.patientId),
  ).size

  // Pacientes ativos SEM nenhum retorno · não pode ser negativo.
  const patientsWithoutReturn = Math.max(
    activePatientCount - patientsWithReturn,
    0,
  )

  // Dias médios até retorno · só conta rows com lastProcedureAt conhecido.
  // Empty state se zero rows válidas.
  const diffs = upcomingReturns
    .filter((r) => r.patientLastProcedureAt)
    .map((r) =>
      daysBetween(r.patientLastProcedureAt as string, r.scheduledDate),
    )
    .filter((d) => Number.isFinite(d) && d >= 0)

  const avgDaysToReturn =
    diffs.length > 0
      ? Math.round(diffs.reduce((sum, d) => sum + d, 0) / diffs.length)
      : null

  // Top 10 próximos retornos · upcomingReturns já vem ordenado por
  // scheduled_date asc, start_time asc.
  const top10 = upcomingReturns.slice(0, 10)

  return (
    <div className="mt-4">
      <div className="agenda-kpi-row">
        <KpiPill
          label="Com retorno agendado"
          value={NUM.format(patientsWithReturn)}
          sub={`${NUM.format(activePatientCount)} ativos`}
          accent="emerald"
          subTone="muted"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <polyline points="9 16 11 18 15 14" />
            </svg>
          }
        />
        <KpiPill
          label="Sem retorno agendado"
          value={NUM.format(patientsWithoutReturn)}
          sub={
            activePatientCount > 0
              ? `${Math.round((patientsWithoutReturn / activePatientCount) * 100)}%`
              : '0%'
          }
          accent="warning"
          subTone="danger"
          pillTone={patientsWithoutReturn > 0 ? 'warning' : 'default'}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
        />
        <KpiPill
          label="Dias médios até retorno"
          value={avgDaysToReturn !== null ? `${avgDaysToReturn}d` : '—'}
          sub={
            avgDaysToReturn !== null
              ? `${NUM.format(diffs.length)} amostra`
              : 'sem dados'
          }
          accent="blue"
          subTone="muted"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
        <KpiPill
          label="Próximos 7 dias"
          value={NUM.format(
            upcomingReturns.filter((r) => {
              const today = new Date().toISOString().slice(0, 10)
              return daysBetween(today, r.scheduledDate) <= 7
            }).length,
          )}
          sub={`${NUM.format(upcomingReturns.length)} no horizonte`}
          accent="emerald"
          subTone="muted"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
      </div>

      {/* Lista Top 10 · KPI 4 do spec */}
      <div className="mt-4 rounded-[10px] border border-[#F3F4F6] bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[#1A1B2E]">
            Próximos retornos
          </h3>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
            Top {top10.length}
          </span>
        </div>

        {top10.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-[#9CA3AF]">
            Nenhum retorno agendado nos próximos dias.
          </p>
        ) : (
          <ul className="divide-y divide-[#F3F4F6]">
            {top10.map((r) => (
              <li
                key={r.appointmentId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[#1A1B2E]">
                    {r.patientName || 'Sem nome'}
                  </div>
                  <div className="truncate text-[11px] text-[#6B7280]">
                    {r.professionalName || 'Sem profissional'}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[13px] font-bold text-[#3B82F6]">
                    {formatScheduleDateLabel(r.scheduledDate)}
                  </div>
                  <div className="text-[10px] text-[#9CA3AF]">
                    {r.startTime.slice(0, 5)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

type KpiAccent = 'blue' | 'warning' | 'danger' | 'emerald'

interface KpiPillProps {
  label: string
  value: string
  sub?: string
  pillTone?: 'default' | 'warning' | 'danger'
  accent: KpiAccent
  subTone?: 'emerald' | 'danger' | 'muted'
  icon: React.ReactNode
}

/**
 * KpiPill · reusa estilo LITERAL `.agenda-kpi-pill` (mesma estrutura usada
 * em /crm/agenda · não duplicar CSS).
 */
function KpiPill({
  label,
  value,
  sub,
  pillTone = 'default',
  accent,
  subTone,
  icon,
}: KpiPillProps) {
  const pillClass =
    pillTone === 'warning'
      ? 'agenda-kpi-pill agenda-kpi-pill-warning'
      : pillTone === 'danger'
        ? 'agenda-kpi-pill agenda-kpi-pill-danger'
        : 'agenda-kpi-pill'

  return (
    <div className={pillClass}>
      <div className={`agenda-kpi-icon agenda-kpi-icon-${accent}`}>{icon}</div>
      <span className="agenda-kpi-label">{label}</span>
      <span className={`agenda-kpi-value agenda-kpi-value-${accent}`}>
        {value}
      </span>
      {sub && (
        <>
          <span className="agenda-kpi-sep" aria-hidden />
          <span className={`agenda-kpi-sub agenda-kpi-sub-${subTone ?? 'muted'}`}>
            {sub}
          </span>
        </>
      )}
    </div>
  )
}
