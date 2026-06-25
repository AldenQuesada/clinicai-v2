'use client'

/**
 * Recovery Radar · painel da UI em /secretaria · Prompt 5.
 *
 * Read-only + IA dry-run-only. Lista oportunidades perdidas (findings open),
 * gera sugestões da IA (sem gravar), permite copiar a resposta e abrir a
 * conversa. NÃO envia WhatsApp, NÃO grava sugestão, NÃO muda status.
 */

import { Button } from '@clinicai/ui/components/button'
import { Badge } from '@clinicai/ui/components/badge'
import { Skeleton } from '@clinicai/ui/components/skeleton'
import { useToast } from '@clinicai/ui/components/toast'
import { Radar, RefreshCw, MessageSquare, Copy, AlertTriangle, ShieldAlert, Sparkles } from 'lucide-react'
import { useRecoveryRadar, type RadarFinding, type RadarSuggestion } from '../hooks/useRecoveryRadar'
import { failureTypeLabel, PRIORITY_BADGE, maskPhone, type Priority } from '../lib/recovery-labels'

const PRIORITY_FILTERS: Array<{ id: 'all' | 'P0' | 'P1' | 'P2'; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'P0', label: 'P0' },
  { id: 'P1', label: 'P1' },
  { id: 'P2', label: 'P2' },
]

function Kpi({ value, label, tone }: { value: number; label: string; tone?: 'danger' | 'warning' | 'muted' }) {
  const color =
    tone === 'danger' ? 'hsl(var(--danger))' : tone === 'warning' ? 'hsl(var(--warning))' : 'hsl(var(--foreground))'
  return (
    <div className="flex flex-col items-center px-4 py-2">
      <span className="text-[20px] font-display tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{label}</span>
    </div>
  )
}

function SuggestionBlock({ s }: { s: RadarSuggestion }) {
  const toast = useToast()
  const realFlags = (s.risk_flags || []).filter((f) => f && f !== 'none')
  const humanRequired = s.recommended_owner === 'humano_obrigatorio' || s.role === 'HumanoObrigatorio'

  const copy = async () => {
    if (!s.suggested_message) return
    try {
      await navigator.clipboard.writeText(s.suggested_message)
      toast.success('Resposta copiada · revise antes de enviar')
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/[0.04] p-3">
      {/* Guardrails visuais */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <Badge variant="info" size="sm">IA em modo teste · não gravado</Badge>
        <Badge variant="warning" size="sm">Revise antes de enviar</Badge>
        <Badge variant="neutral" size="sm">Sem envio automático</Badge>
        {realFlags.map((f) => (
          <Badge key={f} variant="destructive" size="sm">
            <AlertTriangle className="w-3 h-3 mr-1 inline" strokeWidth={2} />
            {f}
          </Badge>
        ))}
      </div>

      {humanRequired ? (
        <div className="flex items-start gap-2 mb-2 text-[12px] text-[hsl(var(--danger))]">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
          <span>Requer atendimento humano / encaminhamento. Não copie sem avaliar com a equipe.</span>
        </div>
      ) : null}

      <div className="text-[12px] text-[hsl(var(--muted-foreground))] mb-1">
        <strong className="text-[hsl(var(--foreground))]">Ação:</strong> {s.suggested_action || '—'}
      </div>

      {s.suggested_message ? (
        <div className="rounded-md bg-[hsl(var(--chat-bg))] border border-white/[0.06] p-2.5 text-[13px] text-[hsl(var(--foreground))] whitespace-pre-wrap">
          {s.suggested_message}
        </div>
      ) : (
        <div className="text-[12px] italic text-[hsl(var(--muted-foreground))]">
          Sem mensagem sugerida (should_contact=false). Motivo: {s.reason || '—'}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
          <span>Papel: {s.role}</span>
          <span>·</span>
          <span>Dono: {s.recommended_owner}</span>
          <span>·</span>
          <span>Confiança: {Math.round((s.confidence ?? 0) * 100)}%</span>
        </div>
        {s.suggested_message ? (
          <Button
            variant={humanRequired ? 'outline' : 'secondary'}
            size="sm"
            onClick={copy}
            title={humanRequired ? 'Atenção: requer avaliação humana' : 'Copiar resposta'}
          >
            <Copy className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
            Copiar resposta
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function FindingCard({
  f,
  suggestion,
  onOpenConversation,
}: {
  f: RadarFinding
  suggestion?: RadarSuggestion
  onOpenConversation: (conversationId: string) => void
}) {
  const pb = PRIORITY_BADGE[(f.priority as Priority)] ?? PRIORITY_BADGE.P3
  const lastEvidence = Array.isArray(f.evidence) && f.evidence.length > 0 ? f.evidence[0]?.excerpt : null

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[hsl(var(--chat-panel-bg))] p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <Badge variant={pb.variant} size="sm">{pb.label}</Badge>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))] tabular-nums">score {f.recovery_score}</span>
        <span className="ml-auto text-[12px] font-medium text-[hsl(var(--foreground))]">
          {failureTypeLabel(f.failure_type)}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[14px] font-display text-[hsl(var(--foreground))] truncate">
          {f.lead_name || 'Sem nome'}
        </span>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{maskPhone(f.phone)}</span>
      </div>

      {f.candidate_reason ? (
        <p className="text-[12px] text-[hsl(var(--muted-foreground))] mt-1">{f.candidate_reason}</p>
      ) : null}

      {lastEvidence ? (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1.5 italic truncate" title={lastEvidence}>
          “{lastEvidence}”
        </p>
      ) : null}

      <div className="flex items-center gap-2 mt-2.5">
        <Button variant="outline" size="sm" onClick={() => onOpenConversation(f.conversation_id)}>
          <MessageSquare className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
          Abrir conversa
        </Button>
      </div>

      {suggestion ? <SuggestionBlock s={suggestion} /> : null}
    </div>
  )
}

export function RecoveryRadarPanel({ onOpenConversation }: { onOpenConversation: (conversationId: string) => void }) {
  const {
    findings,
    isLoading,
    error,
    hasFetched,
    refresh,
    priorityFilter,
    setPriorityFilter,
    suggestionsByFindingId,
    generateP0,
    isGenerating,
    generateError,
    kpis,
  } = useRecoveryRadar()

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[hsl(var(--chat-bg))]">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Radar className="w-5 h-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
          <div>
            <h2 className="font-display text-[16px] text-[hsl(var(--foreground))] leading-tight">Radar de Recuperação</h2>
            <p className="text-[12px] text-[hsl(var(--muted-foreground))]">
              Oportunidades de WhatsApp que precisam de condução humana.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="default" size="sm" onClick={generateP0} disabled={isGenerating}>
              <Sparkles className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
              {isGenerating ? 'Gerando…' : 'Gerar sugestões (3 P0)'}
            </Button>
            <Button variant="ghost" size="icon" onClick={refresh} title="Atualizar">
              <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="flex items-center mt-2 divide-x divide-white/[0.06]">
          <Kpi value={kpis.p0} label="P0 abertas" tone="danger" />
          <Kpi value={kpis.p1} label="P1 abertas" tone="warning" />
          <Kpi value={kpis.open} label="Total abertas" />
          <Kpi value={kpis.generated} label="Sugestões (sessão)" tone="muted" />
        </div>

        {/* Filtros de prioridade */}
        <div className="flex items-center gap-1.5 mt-2">
          {PRIORITY_FILTERS.map((pf) => (
            <button
              key={pf.id}
              type="button"
              onClick={() => setPriorityFilter(pf.id)}
              className={`px-2.5 py-1 rounded-md text-[12px] transition-colors cursor-pointer ${
                priorityFilter === pf.id
                  ? 'bg-[hsl(var(--primary))]/[0.12] text-[hsl(var(--primary))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-white/[0.04]'
              }`}
            >
              {pf.label}
            </button>
          ))}
          <span className="ml-2 text-[11px] text-[hsl(var(--muted-foreground))]">status: aberto</span>
        </div>
      </div>

      {/* Alerta global */}
      <div className="px-5 py-1.5 bg-[hsl(var(--warning))]/[0.06] border-b border-white/[0.06] text-[11px] text-[hsl(var(--warning))] flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
        Revise antes de enviar. A IA não envia mensagens automaticamente.
      </div>

      {generateError ? (
        <div className="px-5 py-2 bg-[hsl(var(--danger))]/[0.08] text-[12px] text-[hsl(var(--danger))]">{generateError}</div>
      ) : null}

      {/* Lista */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {isLoading && !hasFetched ? (
          <Skeleton variant="card" count={4} />
        ) : error ? (
          <div className="text-center text-[13px] text-[hsl(var(--muted-foreground))] py-10">{error}</div>
        ) : findings.length === 0 ? (
          <div className="text-center text-[13px] text-[hsl(var(--muted-foreground))] py-10">
            Nenhuma oportunidade aberta neste filtro. 🎉
          </div>
        ) : (
          findings.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              suggestion={suggestionsByFindingId[f.id]}
              onOpenConversation={onOpenConversation}
            />
          ))
        )}
      </div>
    </div>
  )
}
