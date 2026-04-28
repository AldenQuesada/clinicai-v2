'use client'

/**
 * MediaUploadDrawer · organismo · drawer right-side pra subir nova foto.
 *
 * Dropzone grande no topo (visual feedback) + form de metadata abaixo.
 * Preview da imagem antes do upload.
 */

import { useEffect, useRef, useState } from 'react'
import { X, Upload, Image as ImageIcon, AlertCircle } from 'lucide-react'
import { uploadMediaAction } from '@/app/midia/actions'
import { HelperText } from '@/components/atoms/HelperText'

const VALID_QUEIXAS = [
  'geral',
  'olheiras',
  'sulcos',
  'flacidez',
  'contorno',
  'papada',
  'textura',
  'rugas',
  'rejuvenescimento',
  'fullface',
  'firmeza',
  'manchas',
  'mandibula',
  'perfil',
  'bigode_chines',
]

export function MediaUploadDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [error, setError] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFileName('')
    setError('')
    onClose()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setError('')
    if (!file) {
      setPreviewUrl(null)
      setFileName('')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Arquivo maior que 5MB · comprima antes')
      e.target.value = ''
      return
    }
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setError('Apenas JPG, PNG ou WebP')
      e.target.value = ''
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
    setFileName(file.name)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Subir nova foto"
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Fechar"
        className="flex-1 bg-black/60 backdrop-blur-sm cursor-default"
      />

      <form
        action={uploadMediaAction}
        encType="multipart/form-data"
        onSubmit={() => handleClose()}
        className="w-full sm:w-[480px] bg-[hsl(var(--chat-panel-bg))] border-l border-[hsl(var(--chat-border))] flex flex-col shadow-luxury-lg"
      >
        {/* Header */}
        <header className="flex items-start justify-between p-5 border-b border-[hsl(var(--chat-border))]">
          <div>
            <h3 className="text-lg font-light leading-tight">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">
                Subir nova foto
              </span>
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Antes/depois categorizada · vai pro banco da Lara
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="p-2 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] -m-2"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
          {/* Dropzone */}
          <div
            className={`relative rounded-card border-2 border-dashed transition-colors ${
              previewUrl
                ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/5'
                : 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] hover:border-[hsl(var(--primary))]/40'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />

            {previewUrl ? (
              <div className="aspect-[4/5] max-h-[280px] mx-auto rounded-card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="py-12 px-6 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-pill bg-[hsl(var(--primary))]/10 flex items-center justify-center text-[hsl(var(--primary))]">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-[hsl(var(--foreground))] font-medium">
                    Clique ou arraste a imagem aqui
                  </p>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    JPG, PNG ou WebP · max 5MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {fileName && (
            <p className="text-[11px] font-mono text-[hsl(var(--muted-foreground))] truncate -mt-2">
              {fileName}
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-card border border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/5">
              <AlertCircle className="w-4 h-4 text-[hsl(var(--danger))] shrink-0 mt-0.5" />
              <p className="text-xs text-[hsl(var(--danger))]">{error}</p>
            </div>
          )}

          {/* Caption */}
          <div className="space-y-2">
            <label
              htmlFor="up-caption"
              className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
            >
              Caption
            </label>
            <input
              id="up-caption"
              name="caption"
              placeholder='ex: "Miriam Poppi, 52 anos · Resultado real Dra. Mirian de Paula"'
              className="w-full px-3 py-2.5 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))]"
            />
            <HelperText>Vai como legenda da foto pro paciente.</HelperText>
          </div>

          {/* Funnel + Sort */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label
                htmlFor="up-funnel"
                className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
              >
                Funnel <span className="text-[hsl(var(--danger))]">*</span>
              </label>
              <select
                id="up-funnel"
                name="funnel"
                required
                defaultValue=""
                className="w-full px-3 py-2 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer"
              >
                <option value="" disabled>
                  selecionar...
                </option>
                <option value="olheiras">olheiras</option>
                <option value="fullface">fullface</option>
              </select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="up-sort"
                className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
              >
                Ordem
              </label>
              <input
                id="up-sort"
                type="number"
                name="sort_order"
                defaultValue={0}
                className="w-full px-3 py-2 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm tabular-nums focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>
          </div>

          {/* Queixas */}
          <div className="space-y-2">
            <label
              htmlFor="up-queixas"
              className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
            >
              Queixas
            </label>
            <input
              id="up-queixas"
              name="queixas"
              placeholder="olheiras, sulcos, flacidez..."
              className="w-full px-3 py-2.5 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]"
            />
            <HelperText>
              Separadas por vírgula · válidas: {VALID_QUEIXAS.join(', ')}.
            </HelperText>
          </div>

          {/* Phase */}
          <div className="space-y-2">
            <label
              htmlFor="up-phase"
              className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
            >
              Fase (opcional)
            </label>
            <input
              id="up-phase"
              name="phase"
              placeholder="agendamento, fechamento..."
              className="w-full px-3 py-2.5 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))]"
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="p-5 border-t border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))]/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-md text-xs uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!previewUrl}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-pill text-xs uppercase tracking-widest font-display-uppercase bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 shadow-luxury-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir foto
          </button>
        </footer>
      </form>
    </div>
  )
}
