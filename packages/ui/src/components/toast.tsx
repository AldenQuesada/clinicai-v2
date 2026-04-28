'use client'

/**
 * Toast · feedback visual leve no canto inferior-direito.
 *
 * Implementacao propria sem dep externa (sonner/react-hot-toast).
 * Provider+hook simples · armazena toasts em useState global via context.
 *
 * Uso:
 *   // 1. Wrap root layout (so 1x)
 *   <ToastProvider>...</ToastProvider>
 *
 *   // 2. Hook em qualquer client component
 *   const { toast } = useToast()
 *   toast.success('Lead criado')
 *   toast.error('Falha ao salvar')
 *   toast.fromResult(result, { successMsg: 'Lead criado' })
 *
 * Auto-dismiss apos 4s · click fecha imediato. Stack vertical.
 */

import * as React from 'react'
import { cn } from '../lib/cn'

// ── Types ───────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
  /** Auto-dismiss ms · 0 desliga · default 4000 */
  duration?: number
}

interface ToastApi {
  success: (message: string, opts?: { duration?: number }) => void
  error: (message: string, opts?: { duration?: number }) => void
  warning: (message: string, opts?: { duration?: number }) => void
  info: (message: string, opts?: { duration?: number }) => void
  /**
   * Helper pra Result<T,E> das Server Actions (Camada 5).
   * - r.ok=true  → toast.success(successMsg ?? 'Sucesso')
   * - r.ok=false → toast.error(errorMsgOverride[r.error] ?? r.error)
   */
  fromResult: (
    result: { ok: true } | { ok: false; error: string },
    opts?: {
      successMsg?: string
      /** Override de mensagens por error code (ex: 'invalid_input' → 'Dados inválidos') */
      errorMessages?: Record<string, string>
    },
  ) => void
}

// ── Context ─────────────────────────────────────────────────────────────────

const ToastContext = React.createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  }
  return ctx
}

// ── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = React.useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const duration = item.duration ?? 4000
      setToasts((prev) => [...prev, { ...item, id }])
      if (duration > 0) {
        setTimeout(() => remove(id), duration)
      }
    },
    [remove],
  )

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (message, opts) =>
        push({ kind: 'success', message, duration: opts?.duration }),
      error: (message, opts) =>
        push({ kind: 'error', message, duration: opts?.duration }),
      warning: (message, opts) =>
        push({ kind: 'warning', message, duration: opts?.duration }),
      info: (message, opts) =>
        push({ kind: 'info', message, duration: opts?.duration }),
      fromResult: (result, opts) => {
        if (result.ok) {
          push({
            kind: 'success',
            message: opts?.successMsg ?? 'Operação realizada com sucesso',
          })
        } else {
          const code = result.error
          const msg = opts?.errorMessages?.[code] ?? humanizeError(code)
          push({ kind: 'error', message: msg })
        }
      },
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  )
}

// ── Viewport · stack visual no canto inferior-direito ──────────────────────

function ToastViewport({
  toasts,
  onClose,
}: {
  toasts: ToastItem[]
  onClose: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div
      role="region"
      aria-label="Notificações"
      className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      role="alert"
      className={cn(
        'pointer-events-auto cursor-pointer rounded-md border px-4 py-3 text-left text-sm shadow-luxury-md transition-all',
        'animate-in slide-in-from-right-4 fade-in',
        item.kind === 'success' &&
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        item.kind === 'error' &&
          'border-rose-500/30 bg-rose-500/10 text-rose-300',
        item.kind === 'warning' &&
          'border-amber-500/30 bg-amber-500/10 text-amber-300',
        item.kind === 'info' &&
          'border-sky-500/30 bg-sky-500/10 text-sky-300',
      )}
    >
      {item.message}
    </button>
  )
}

// ── Mensagens default pra error codes comuns das Server Actions ────────────

function humanizeError(code: string): string {
  const MAP: Record<string, string> = {
    invalid_input: 'Dados inválidos · revise o formulário',
    forbidden: 'Você não tem permissão pra essa ação',
    no_clinic_in_jwt: 'Sessão sem clínica · faça login novamente',
    lead_not_found: 'Lead não encontrado',
    lead_not_found_or_deleted: 'Lead não encontrado ou já promovido',
    appointment_not_found: 'Consulta não encontrada',
    illegal_phase_transition: 'Transição de fase não permitida',
    illegal_transition: 'Transição não permitida',
    invalid_status_for_attend: 'Status atual não permite marcar chegada',
    invalid_status_for_finalize: 'Status atual não permite finalização',
    lost_reason_required: 'Motivo da perda obrigatório',
    reason_required: 'Motivo obrigatório',
    lead_softdeleted_exists: 'Já existe paciente/orçamento com este telefone',
    update_failed: 'Falha ao atualizar',
    insert_failed: 'Falha ao criar',
    cancel_failed: 'Falha ao cancelar',
    no_show_failed: 'Falha ao marcar não compareceu',
    soft_delete_failed: 'Falha ao remover',
    mark_sent_failed: 'Falha ao marcar como enviado',
    mark_approved_failed: 'Falha ao aprovar',
    mark_lost_failed: 'Falha ao marcar perdido',
    add_payment_failed: 'Falha ao adicionar pagamento',
    rpc_error: 'Erro de comunicação com o banco · tente novamente',
    rpc_returned_non_object: 'Resposta inválida do servidor',
  }
  return MAP[code] ?? `Erro: ${code}`
}
