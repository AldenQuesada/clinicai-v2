/**
 * AssignmentHistoryPanel · seção compacta de historico de transferencias
 * dentro do painel da conversa. Consome /api/conversations/[id]/assignment
 * -events (Mig 148 view · getAssignmentEvents repo).
 *
 * Visual:
 *   - Lista DESC (mais recente primeiro · ordem da API)
 *   - Cada item: data formatada pt-BR · frase + actor_role discreto
 *   - Estados: loading skeleton · empty discreto · error gracioso
 *   - Nao expoe UUIDs · audit_id · ou JSON bruto
 *
 * NAO faz polling automatico · refetch ao trocar conversa via parent
 * (recriacao do hook por conversationId).
 */

'use client'

import { History, RefreshCw } from 'lucide-react'
import { useAssignmentEvents, type AssignmentEvent } from '../hooks/useAssignmentEvents'

interface Props {
  conversationId: string | null
  /** Limit · default 10 · cap server-side em 50. */
  limit?: number
}

const OWNER_LABELS: Record<string, string> = {
  secretaria: 'Secretaria',
  alden: 'Alden',
  mirian: 'Mirian',
  luciana: 'Luciana',
  responsavel: 'Responsável',
}

function ownerLabel(owner: string | null | undefined): string {
  if (!owner) return 'Responsável'
  return OWNER_LABELS[owner] ?? 'Responsável'
}

/** Formata audit_at UTC → "DD/MM/YYYY HH:mm" pt-BR no fuso local do browser. */
function formatAuditAt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Constroi a frase do evento. Usa from_assigned_to_name/to_assigned_to_name
 * quando disponivel para nomes especificos · fallback no label do owner.
 */
function describeEvent(e: AssignmentEvent): { text: string; technical?: boolean } {
  const fromOwner = ownerLabel(e.from_owner)
  const toOwner = ownerLabel(e.to_owner)
  const fromName = e.from_assigned_to_name?.trim() || fromOwner
  const toName = e.to_assigned_to_name?.trim() || toOwner

  switch (e.assignment_action) {
    case 'assigned':
      return { text: `${fromOwner} transferiu para ${toName}` }
    case 'returned':
      return { text: `${fromName} devolveu para ${toOwner}` }
    case 'reassigned':
      return { text: `Responsável alterado de ${fromName} para ${toName}` }
    case 'profile_changed':
      return {
        text: `Perfil técnico atualizado: ${fromName} → ${toName}`,
        technical: true,
      }
    case 'updated':
    default:
      return { text: 'Atualização de atribuição', technical: true }
  }
}

export function AssignmentHistoryPanel({ conversationId, limit = 10 }: Props) {
  const { items, isLoading, isError, hasFetched, refresh } = useAssignmentEvents(
    conversationId,
    limit,
  )

  if (!conversationId) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <History
          className="w-3 h-3 text-[hsl(var(--muted-foreground))] opacity-60"
          strokeWidth={1.5}
        />
        <span className="font-meta uppercase text-[9.5px] tracking-[0.16em] text-[hsl(var(--muted-foreground))] flex-1">
          Histórico de transferências
        </span>
        {hasFetched && !isLoading && (
          <button
            type="button"
            onClick={refresh}
            title="Atualizar histórico"
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors p-0.5 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Loading inicial · skeleton compacto */}
      {isLoading && !hasFetched && (
        <div className="space-y-1.5">
          <div className="h-9 rounded-md bg-white/[0.02] border border-white/[0.04] animate-pulse" />
          <div className="h-9 rounded-md bg-white/[0.02] border border-white/[0.04] animate-pulse" />
        </div>
      )}

      {/* Erro discreto · nao quebra a conversa */}
      {!isLoading && isError && (
        <div className="text-[11px] text-[hsl(var(--muted-foreground))] italic px-3 py-2 rounded-md bg-white/[0.02] border border-white/[0.04]">
          Não foi possível carregar o histórico agora.
        </div>
      )}

      {/* Empty state · so apos primeiro fetch terminar com sucesso */}
      {!isLoading && !isError && hasFetched && items.length === 0 && (
        <div className="text-[11px] text-[hsl(var(--muted-foreground))] italic opacity-70 px-3 py-2">
          Nenhuma transferência registrada.
        </div>
      )}

      {/* Lista de eventos */}
      {!isError && items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((e, idx) => {
            const { text, technical } = describeEvent(e)
            return (
              <div
                key={`${e.audit_at}-${idx}`}
                className={`px-3 py-2 rounded-md bg-white/[0.02] border ${
                  technical
                    ? 'border-white/[0.03] opacity-70'
                    : 'border-white/[0.05]'
                }`}
              >
                <div className="font-mono tabular-nums text-[10px] text-[hsl(var(--muted-foreground))] opacity-80">
                  {formatAuditAt(e.audit_at)}
                </div>
                <div className="text-[12px] text-[hsl(var(--foreground))] leading-snug mt-0.5">
                  {text}
                </div>
                {e.actor_role && (
                  <div className="font-meta uppercase text-[9px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] opacity-60 mt-1">
                    Ator: {e.actor_role}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
