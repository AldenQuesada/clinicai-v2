import { X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity">
      <div className="relative w-full max-w-md rounded-xl bg-[hsl(var(--chat-panel-bg))] p-6 shadow-xl border border-[hsl(var(--chat-border))] animate-in fade-in zoom-in-95 duration-200">
        
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">{title}</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">{description}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--chat-bg))] transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))] hover:opacity-90 transition-opacity cursor-pointer shadow-luxury-sm"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
