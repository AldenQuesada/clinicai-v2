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
}

export function PipelineBar({ phase }: PipelineBarProps): JSX.Element {
  const activeStep = phaseToStep(phase);

  return (
    <div className="px-6 py-4 border-b border-[hsl(var(--chat-border))]">
      <h4 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
        Jornada
      </h4>
      <div className="relative">
        {/* Linha conectora · base esmaecida */}
        <div
          className="absolute top-[7px] left-[6px] right-[6px] h-px bg-[hsl(var(--chat-border))]"
          aria-hidden
        />
        {/* Linha conectora · progresso champagne */}
        {activeStep > 0 && (
          <div
            className="absolute top-[7px] left-[6px] h-px bg-[hsl(var(--primary))] transition-all"
            style={{ width: `calc((100% - 12px) * ${activeStep / (STEPS.length - 1)})` }}
            aria-hidden
          />
        )}

        {/* Dots */}
        <div className="relative flex justify-between">
          {STEPS.map((step, i) => {
            const isDone = i < activeStep;
            const isCurrent = i === activeStep;
            const dotClass = isDone
              ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]'
              : isCurrent
                ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]/40 shadow-[0_0_8px_hsl(var(--primary)/0.5)]'
                : 'bg-[hsl(var(--chat-panel-bg))] border-[hsl(var(--chat-border))]';

            const labelClass = isDone || isCurrent
              ? 'text-[hsl(var(--foreground))]'
              : 'text-[hsl(var(--muted-foreground))]';

            return (
              <div key={step.key} className="flex flex-col items-center" style={{ flex: '0 0 auto' }}>
                <div
                  className={`w-3 h-3 rounded-full border transition-all ${dotClass}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${step.label}${isCurrent ? ' (atual)' : isDone ? ' (concluido)' : ''}`}
                />
                <span className={`mt-1.5 text-[9px] tracking-wide uppercase font-medium ${labelClass}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
