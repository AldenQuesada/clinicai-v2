/**
 * SecretariaKpiBar · ZONA CENTRAL da topbar da Secretaria · 6 KPIs canônicos.
 *
 * P2 refactor (2026-06-03) · extraído de secretaria/page.tsx (bloco JSX
 * gigante) pra reduzir a concentração de responsabilidades. SEM mudança
 * visual: labels (Todos · Secretaria · Mirian · Alden · Aguardando · Urgente),
 * grupos (escopo/dono/fila), divisores, ícones e o realce permanente do
 * Urgente foram preservados 1:1.
 *
 * Os counts são recebidos por prop (a computação server/fallback-local
 * continua no page.tsx, que precisa dos helpers de filtro também usados na
 * lista). `kpisError` (de useSecretariaKpis) mostra um indicador discreto de
 * "fallback local" — sem popup, sem quebrar layout (P2 auditoria 2026-06-03).
 */

import { Inbox, CircleDot, Stethoscope, Clock, AlertCircle } from 'lucide-react';

export type KpiId = 'todos' | 'secretaria' | 'mirian' | 'alden' | 'aguardando' | 'urgente';

export interface SecretariaKpiCounts {
  todos: number;
  secretaria: number;
  mirian: number;
  alden: number;
  aguardando: number;
  urgente: number;
}

interface SecretariaKpiBarProps {
  activeKpi: KpiId;
  setActiveKpi: (id: KpiId) => void;
  counts: SecretariaKpiCounts;
  /** isError de useSecretariaKpis · counts caíram pro fallback local. */
  kpisError?: boolean;
  className?: string;
}

export function SecretariaKpiBar({
  activeKpi,
  setActiveKpi,
  counts,
  kpisError = false,
  className,
}: SecretariaKpiBarProps) {
  return (
    <div
      className={`relative flex-1 border-b border-white/[0.06] flex items-center justify-center px-6 min-w-0 ${className ?? ''}`}
    >
      <div className="flex items-center gap-1.5">
        {([
          // ── Grupo ESCOPO (cinza/discreto) ──
          {
            id: 'todos' as const,
            icon: Inbox,
            label: 'Todos',
            value: counts.todos,
            color: 'foreground',
            title: 'Todas as conversas operacionais (Secretaria + Mirian)',
            group: 'escopo' as const,
          },
          // ── Grupo DONO (canônico · KPI B 2026-05-07 rename visual ·
          //    Mig 147 2026-05-08 normalizou: id 'secretaria' agora · view
          //    retorna operational_owner='secretaria' direto · NUNCA mais
          //    'luciana' como alias · Luciana so se atribuida real).
          {
            id: 'secretaria' as const,
            icon: CircleDot,
            label: 'Secretaria',
            value: counts.secretaria,
            color: 'primary',
            title: 'Conversas operacionais da Secretaria (default · não atribuídas)',
            group: 'dono' as const,
          },
          {
            id: 'mirian' as const,
            icon: Stethoscope,
            label: 'Mirian',
            value: counts.mirian,
            color: 'accent',
            title: 'Conversas transferidas pra Dra Mirian (assigned_to)',
            group: 'dono' as const,
          },
          // Onda 3 (2026-05-08) · Dr Alden como dono operacional separado.
          // operational_owner='alden' via UUID na view (mig 146) · is_dra
          // continua Mirian-only por decisao de produto.
          {
            id: 'alden' as const,
            icon: Stethoscope,
            label: 'Alden',
            value: counts.alden,
            color: 'primary',
            title: 'Conversas transferidas pra Dr Alden (assigned_to)',
            group: 'dono' as const,
          },
          // ── Grupo FILA (colorido) ──
          {
            id: 'aguardando' as const,
            icon: Clock,
            label: 'Aguardando',
            value: counts.aguardando,
            color: 'warning',
            title: 'Paciente esperando resposta humana · view canônica',
            group: 'fila' as const,
          },
          // KPI Urgente · usa token --danger (mesmo da tag urgente nas
          // conversas) · realce permanente + pulso leve no icone quando
          // count > 0 · "atencao operacional", nao alarme.
          {
            id: 'urgente' as const,
            icon: AlertCircle,
            label: 'Urgente',
            value: counts.urgente,
            color: 'danger',
            title: 'Alerta crítico · is_urgente da view (>5min sem resposta humana)',
            group: 'fila' as const,
          },
        ]).map((k, idx, arr) => {
          const Icon = k.icon;
          const colorVar = `hsl(var(--${k.color}))`;
          const isActive = activeKpi === k.id;
          const prev = arr[idx - 1];
          const showDivider = !!prev && prev.group !== k.group;
          // Realce permanente do KPI Urgente · alinhado com a tag urgente
          // existente nas conversas (--danger token canonico). Sempre
          // mostra bg + border vermelho suave mesmo inativo · pulso leve
          // no icone quando ha conversa(s) urgente(s) · zero animacao
          // quando count==0 (estado calmo).
          const isUrgentKpi = k.id === 'urgente';
          const urgentHighlight = isUrgentKpi && k.value > 0;
          return (
            <div key={k.id} className="flex items-center gap-1.5">
              {showDivider && (
                <div className="w-px h-8 bg-white/[0.08] mx-1" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => setActiveKpi(k.id)}
                title={k.title}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 ease-out cursor-pointer ${
                  isActive
                    ? '-translate-y-[1px]'
                    : 'hover:-translate-y-[2px] hover:bg-white/[0.03]'
                }`}
                style={{
                  // KPI Urgente sempre traz seu bg/border tenue mesmo
                  // inativo · isActive empilha intensidade.
                  background: isActive
                    ? colorVar.replace(')', ' / 0.10)')
                    : isUrgentKpi
                      ? colorVar.replace(')', ' / 0.06)')
                      : undefined,
                  boxShadow: isActive
                    ? `inset 0 0 0 1px ${colorVar.replace(')', ' / 0.35)')}`
                    : isUrgentKpi
                      ? `inset 0 0 0 1px ${colorVar.replace(')', ' / 0.20)')}`
                      : undefined,
                }}
              >
                <div
                  className={`p-1 rounded-md transition-colors shrink-0 ${
                    urgentHighlight ? 'animate-pulse' : ''
                  }`}
                  style={{
                    background: colorVar.replace(')', ' / 0.10)'),
                    color: colorVar,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                </div>
                <div className="text-left">
                  <p
                    className="font-meta text-[8.5px] uppercase whitespace-nowrap transition-colors"
                    style={{
                      color: isActive ? colorVar : undefined,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {k.label}
                  </p>
                  <p
                    className="font-display text-xl leading-none mt-0.5 tabular-nums"
                    style={{
                      color: k.value > 0 ? colorVar : 'hsl(var(--foreground))',
                    }}
                  >
                    {k.value}
                  </p>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* P2 · indicador discreto de fallback local quando o endpoint de KPIs
          falha (useSecretariaKpis.isError). Sem popup · só um micro-dot âmbar
          com tooltip · não desloca os KPIs (absolute). */}
      {kpisError && (
        <span
          title="KPIs em fallback local · contagem pode estar parcial até o servidor responder"
          aria-label="KPIs em fallback local"
          className="absolute right-3 top-1.5 flex items-center"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))]/70" />
        </span>
      )}
    </div>
  );
}
