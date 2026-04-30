/**
 * MediaPreviewBar · preview da mídia staged ANTES do envio.
 *
 * P-07 · imagem: thumb 80x80; áudio: tag <audio> compacto; documento: card
 * com ícone PDF + nome + tamanho. Botão X descarta.
 */

'use client'

import { X, FileText, Image as ImageIcon, Mic, Loader, Film } from 'lucide-react'
import type { StagedMedia } from '../hooks/useMediaUpload'
import { formatFileSize } from '../hooks/useMediaUpload'

interface MediaPreviewBarProps {
  staged: StagedMedia
  isSending: boolean
  progress: 'idle' | 'uploading' | 'sending'
  onClear: () => void
}

export function MediaPreviewBar({ staged, isSending, progress, onClear }: MediaPreviewBarProps) {
  return (
    <div className="mb-2.5 flex items-center gap-3 px-3 py-2.5 rounded-md bg-white/[0.02] border border-white/[0.08] relative">
      {/* Thumb / icone */}
      <div className="shrink-0">
        {staged.mediaType === 'image' && (
          <img
            src={staged.previewUrl}
            alt={staged.fileName}
            className="w-12 h-12 rounded object-cover border border-white/[0.06]"
          />
        )}
        {staged.mediaType === 'audio' && (
          <div className="w-12 h-12 rounded bg-[hsl(var(--primary))]/[0.08] border border-[hsl(var(--primary))]/[0.2] flex items-center justify-center">
            <Mic className="w-5 h-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
          </div>
        )}
        {staged.mediaType === 'video' && (
          <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
            <Film className="w-5 h-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
          </div>
        )}
        {staged.mediaType === 'document' && (
          <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
            <FileText className="w-5 h-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
          </div>
        )}
        {staged.mediaType === 'unsupported' && (
          <div className="w-12 h-12 rounded bg-[hsl(var(--danger))]/[0.08] border border-[hsl(var(--danger))]/[0.2] flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-[hsl(var(--danger))]" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Nome + tamanho + audio player se for audio */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-[hsl(var(--foreground))] truncate font-medium">
          {staged.fileName}
        </p>
        <p className="font-meta text-[8.5px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))] mt-0.5">
          {staged.mediaType} · {formatFileSize(staged.fileSize)}
          {progress !== 'idle' && (
            <span className="ml-2 text-[hsl(var(--primary))]">
              {progress === 'uploading' ? '· enviando pro storage...' : '· enviando pro WhatsApp...'}
            </span>
          )}
        </p>
        {staged.mediaType === 'audio' && (
          <audio
            src={staged.previewUrl}
            controls
            className="mt-1.5 w-full max-w-[280px]"
            style={{ height: 28 }}
          />
        )}
      </div>

      {/* Cancelar */}
      <button
        type="button"
        onClick={onClear}
        disabled={isSending}
        title="Descartar arquivo"
        className="shrink-0 w-7 h-7 rounded-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/[0.08] flex items-center justify-center transition-colors disabled:opacity-50"
      >
        {isSending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" strokeWidth={2} />}
      </button>
    </div>
  )
}
