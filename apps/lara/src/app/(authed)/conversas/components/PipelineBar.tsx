/**
 * PipelineBar (SA-06 / W-04) · barra horizontal compacta com 5 etapas da
 * jornada do lead: Quiz → Contato → Orcamento → Consulta → Procedimento.
 *
 * Visual luxo: 5 dots conectados por uma linha · etapas concluidas em
 * champagne solido · etapa atual com ring + glow · futuras esmaecidas.
 *
 * Tolerante a `phase` desconhecida · default = step 0 (Quiz). Sem CTAs ·
 * apenas indicacao visual (Alden pediu pipeline puramente informativo).
 */

import type { JSX } from 'react';

const STEPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'quiz', label: 'Quiz' },
  { key: 'contato', label: 'Contato' },
  { key: 'orcamento', label: 'Orçamento' },
  { key: 'consulta', label: 'Consulta' },
  { key: 'procedimento', label: 'Procedimento' },
];

/**
 * Resolve o step ativo (0..4) a partir do `phase` cru do lead.
 * Heuristica baseada em substring · case-insensitive · fallback step 0.
 */
function phaseToStep(phase: string | null | undefined): number {
  if (!phase) return 0;
  const p = phase.toLowerCase().trim();

  // Procedimento / fechado / convertido
  if (p.includes('procedimento') || p.includes('convertido') || p.includes('fechado')) return 4;
  // Consulta / agendado
  if (p.includes('consulta') || p.includes('agendado') || p.includes('agenda')) return 3;
  // Orcamento
  if (p.includes('orcamento') || p.includes('orçamento') || p.includes('budget')) return 2;
  // Contato / atendimento (humano em conversa)
  if (p.includes('contato') || p.includes('atendimento')) return 1;
  // Quiz / qualificado · ja fez algum filtro
  if (p.includes('quiz') || p.includes('qualificado')) return 1;
  // Lead / novo / neutro / vazio · inicio
  if (p.includes('lead') || p.includes('novo') || p.includes('neutro')) return 0;

  return 0;
}

interface PipelineBarProps {
  phase: string | null | undefined;
  /** Funil do lead (olheiras/fullface/procedimento) · usado pra label
      embaixo dos dots · funde a info "Etapa atual" no PipelineBar. */
  funnel?: string | null | undefined;
}

function funnelLabel(funnel: string | null | undefined): string | null {
  if (!funnel) return null;
  const f = funnel.toLowerCase();
  if (f.includes('olheira')) return 'Smooth Eyes (olheiras)';
  if (f.includes('full')) return 'Lifting 5D (full face)';
  if (f.includes('procedimento')) return 'Procedimentos gerais';
  return funnel;
}

export function PipelineBar({ phase, funnel }: PipelineBarProps): JSX.Element {
  const activeStep = phaseToStep(phase);
  const currentLabel = STEPS[activeStep]?.label ?? '—';
  const fLabel = funnelLabel(funnel);

  return (
    <div className="px-5 py-4 border-b border-white/[0.06]">
      {/* Header com etapa atual em destaque */}
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <span className="font-meta uppercase text-[8.5px] tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
          Jornada
        </span>
        <span className="text-[12px] text-[hsl(var(--foreground))]">
          <em className="text-[hsl(var(--primary))] not-italic font-display italic font-medium">
            {currentLabel}
          </em>
          {fLabel && (
            <span className="text-[hsl(var(--muted-foreground))] opacity-60 ml-1.5 text-[10.5px]">
              · {fLabel}
            </span>
          )}
        </span>
      </div>

      {/* Dots SEM labels embaixo · cleaner. Tooltip nativo em cada dot. */}
      <div className="relative px-1">
        {/* Linha conectora · base esmaecida */}
        <div
          className="absolute top-1/2 left-2 right-2 h-px bg-white/[0.08] -translate-y-1/2"
          aria-hidden
        />
        {/* Linha conectora · progresso champagne */}
        {activeStep > 0 && (
          <div
            className="absolute top-1/2 left-2 h-px bg-[hsl(var(--primary))] transition-all -translate-y-1/2"
            style={{ width: `calc((100% - 16px) * ${activeStep / (STEPS.length - 1)})` }}
            aria-hidden
          />
        )}

        {/* Dots */}
        <div className="relative flex justify-between items-center">
          {STEPS.map((step, i) => {
            const isDone = i < activeStep;
            const isCurrent = i === activeStep;
            const dotClass = isDone
              ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]'
              : isCurrent
                ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]/40'
                : 'bg-[hsl(var(--chat-panel-bg))] border-white/[0.12]';

            return (
              <div
                key={step.key}
                className={`w-3 h-3 rounded-full border transition-all ${dotClass}`}
                title={`${step.label}${isCurrent ? ' (atual)' : isDone ? ' (concluído)' : ' (futuro)'}`}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={step.label}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
