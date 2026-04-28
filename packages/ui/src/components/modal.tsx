'use client'

/**
 * Modal · overlay com painel central, focus trap minimo (ESC fecha,
 * outside click fecha quando dismissable=true).
 *
 * Pattern controlado: caller mantem `open` state · onOpenChange callback.
 *
 * Uso:
 *   const [open, setOpen] = useState(false)
 *   <Modal open={open} onOpenChange={setOpen} title="Editar paciente">
 *     <p>Conteudo aqui</p>
 *   </Modal>
 *
 * ConfirmDialog (helper): wrapper com Sim/Nao buttons + onConfirm callback.
 */

import * as React from 'react'
import { cn } from '../lib/cn'
import { Button } from './button'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  /** Quando false, ESC e click fora nao fecham (forca acao explicita) */
  dismissable?: boolean
  className?: string
  children: React.ReactNode
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  dismissable = true,
  className,
  children,
}: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null)

  // ESC pra fechar (so se dismissable)
  React.useEffect(() => {
    if (!open || !dismissable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissable, onOpenChange])

  // Bloqueia scroll do body enquanto aberto
  React.useEffect(() => {
    if (!open) return
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = orig
    }
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (!dismissable) return
        // outside click · so se clicou no backdrop, nao no painel
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Painel */}
      <div
        ref={dialogRef}
        className={cn(
          'relative w-full max-w-lg rounded-md border border-[var(--border)] bg-[var(--card)] shadow-luxury-md',
          className,
        )}
      >
        {(title || description) && (
          <div className="border-b border-[var(--border)] px-6 py-4">
            {title && (
              <h2
                id="modal-title"
                className="font-display-italic text-lg text-[var(--foreground)]"
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {description}
              </p>
            )}
          </div>
        )}

        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── ConfirmDialog · helper pra confirmacoes destrutivas ────────────────────

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Variant do botao confirmar · default 'destructive' (uso comum: deletar) */
  confirmVariant?: 'default' | 'destructive'
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'destructive',
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      description={description}
      dismissable={!busy}
      className="max-w-md"
    >
      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={busy}
        >
          {cancelLabel}
        </Button>
        <Button variant={confirmVariant} onClick={handleConfirm} disabled={busy}>
          {busy ? 'Processando…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
