'use client'

/**
 * MediaEditDrawer · organismo · drawer right-side pra editar foto da galeria.
 *
 * Mantem contexto da grid atras (overlay 60% + drawer 480px).
 * Acessibilidade: Esc fecha · click no overlay fecha · autofocus no caption.
 */

import { useEffect, useRef } from 'react'
import { X, Save } from 'lucide-react'
import { updateMediaAction } from '@/app/midia/actions'
import { FunnelChip } from '@/components/atoms/FunnelChip'
import { HelperText } from '@/components/atoms/HelperText'

export interface MediaEditData {
  id: string
  filename: string
  url: string
  funnel: string | null
  queixas: string[]
  caption: string | null
  phase: string | null
  sort_order: number
  is_active: boolean
}

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

export function MediaEditDrawer({
  media,
  onClose,
}: {
  media: MediaEditData | null
  onClose: () => void
}) {
  const captionRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (media && captionRef.current) {
      captionRef.current.focus()
      captionRef.current.select()
    }
  }, [media])

  useEffect(() => {
    if (!media) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [media, onClose])

  if (!media) return null

  const queixasStr = media.queixas.join(', ')

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Editar mídia">
      {/* Overlay */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="flex-1 bg-black/60 backdrop-blur-sm cursor-default"
      />

      {/* Drawer wrapper · form ocupa drawer inteiro pra Save funcionar nativamente */}
      <form
        action={updateMediaAction.bind(null, media.id)}
        onSubmit={() => onClose()}
        className="w-full sm:w-[480px] bg-[hsl(var(--chat-panel-bg))] border-l border-[hsl(var(--chat-border))] flex flex-col shadow-luxury-lg"
      >
        {/* Header */}
        <header className="flex items-start justify-between p-5 border-b border-[hsl(var(--chat-border))]">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-light leading-tight">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">
                Editar mídia
              </span>
            </h3>
            <p className="text-[11px] font-mono text-[hsl(var(--muted-foreground))] mt-1 truncate">
              {media.filename}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] -m-2"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Imagem preview */}
        <div className="p-5 border-b border-[hsl(var(--chat-border))]">
          <div className="aspect-[4/5] max-h-[280px] mx-auto rounded-card overflow-hidden bg-[hsl(var(--muted))] relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media.url}
              alt={media.caption || media.filename}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-pill bg-black/40 backdrop-blur-sm">
              <FunnelChip funnel={media.funnel} />
            </div>
          </div>
        </div>

        {/* Form fields · scrollavel */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
          {/* Caption */}
          <div className="space-y-2">
            <label
              htmlFor="drawer-caption"
              className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
            >
              Caption
            </label>
            <input
              ref={captionRef}
              id="drawer-caption"
              name="caption"
              defaultValue={media.caption ?? ''}
              placeholder='ex: "Miriam Poppi, 52 anos · Resultado real Dra. Mirian de Paula"'
              className="w-full px-3 py-2.5 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
            />
            <HelperText>
              Vai como legenda da foto pro paciente · padrão: <em>nome + idade + assinatura</em>.
            </HelperText>
          </div>

          {/* Funnel + Phase + Sort */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label
                htmlFor="drawer-funnel"
                className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
              >
                Funnel
              </label>
              <select
                id="drawer-funnel"
                name="funnel"
                defaultValue={media.funnel ?? ''}
                className="w-full px-2 py-2 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer"
              >
                <option value="">—</option>
                <option value="olheiras">olheiras</option>
                <option value="fullface">fullface</option>
              </select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="drawer-phase"
                className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
              >
                Fase
              </label>
              <input
                id="drawer-phase"
                name="phase"
                defaultValue={media.phase ?? ''}
                placeholder="opcional"
                className="w-full px-2 py-2 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="drawer-sort"
                className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
              >
                Ordem
              </label>
              <input
                id="drawer-sort"
                type="number"
                name="sort_order"
                defaultValue={media.sort_order}
                className="w-full px-2 py-2 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs tabular-nums focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>
          </div>

          {/* Queixas */}
          <div className="space-y-2">
            <label
              htmlFor="drawer-queixas"
              className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
            >
              Queixas
            </label>
            <input
              id="drawer-queixas"
              name="queixas"
              defaultValue={queixasStr}
              placeholder="olheiras, sulcos, flacidez..."
              className="w-full px-3 py-2.5 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
            />
            <HelperText>
              Separadas por vírgula · só entram tags válidas: {VALID_QUEIXAS.join(', ')}.
            </HelperText>
          </div>
        </div>

        {/* Footer · acoes */}
        <footer className="p-5 border-t border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))]/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-xs uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-pill text-xs uppercase tracking-widest font-display-uppercase bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 shadow-luxury-sm"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar
          </button>
        </footer>
      </form>
    </div>
  )
}
