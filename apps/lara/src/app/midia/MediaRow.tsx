'use client'

/**
 * Linha do banco de midias · client component pra inline edit.
 *
 * Server Action recebe (id, formData) · usamos .bind(null, id) pra fixar o id
 * e passar formData como segundo arg do action.
 */

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Pencil, Save, X } from 'lucide-react'
import { updateMediaAction, toggleMediaActiveAction } from './actions'

export interface MediaRowData {
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

export function MediaRow({
  media,
  canManage,
}: {
  media: MediaRowData
  canManage: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const queixasStr = media.queixas.join(', ')

  const handleToggle = () => {
    startTransition(async () => {
      await toggleMediaActiveAction(media.id, !media.is_active)
    })
  }

  return (
    <div
      className={`rounded-card border p-4 transition-opacity ${
        media.is_active
          ? 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]'
          : 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] opacity-50'
      }`}
    >
      <div className="flex gap-4">
        <div className="shrink-0 w-24 h-24 rounded-md overflow-hidden bg-[hsl(var(--muted))] relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.url}
            alt={media.caption || media.filename}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>

        <div className="flex-1 min-w-0">
          {!editing ? (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-mono text-[hsl(var(--muted-foreground))] truncate">
                  {media.filename}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      media.is_active
                        ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                    }`}
                  >
                    {media.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                  {media.funnel && (
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                      {media.funnel}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm text-[hsl(var(--foreground))]">
                {media.caption || (
                  <span className="italic text-[hsl(var(--muted-foreground))]">
                    sem caption
                  </span>
                )}
              </p>

              {media.queixas.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {media.queixas.map((q) => (
                    <span
                      key={q}
                      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 text-[10px] text-[hsl(var(--muted-foreground))] pt-1">
                <span>ordem · {media.sort_order}</span>
                {media.phase && <span>fase · {media.phase}</span>}
              </div>

              {canManage && (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] uppercase tracking-widest border border-[hsl(var(--chat-border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))] transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={handleToggle}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] uppercase tracking-widest border border-[hsl(var(--chat-border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors disabled:opacity-50"
                  >
                    {media.is_active ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        Desativar
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        Ativar
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form
              action={updateMediaAction.bind(null, media.id)}
              onSubmit={() => setEditing(false)}
              className="space-y-2"
            >
              <p className="text-xs font-mono text-[hsl(var(--muted-foreground))] truncate">
                {media.filename}
              </p>

              <div>
                <label className="block text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
                  Caption (nome + idade · ex: &quot;Miriam Poppi, 52 anos&quot;)
                </label>
                <input
                  name="caption"
                  defaultValue={media.caption ?? ''}
                  className="w-full px-2 py-1 rounded border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
                    Funnel
                  </label>
                  <select
                    name="funnel"
                    defaultValue={media.funnel ?? ''}
                    className="w-full px-2 py-1 rounded border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs focus:outline-none focus:border-[hsl(var(--primary))]"
                  >
                    <option value="">—</option>
                    <option value="olheiras">olheiras</option>
                    <option value="fullface">fullface</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
                    Fase
                  </label>
                  <input
                    name="phase"
                    defaultValue={media.phase ?? ''}
                    placeholder="opcional"
                    className="w-full px-2 py-1 rounded border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs focus:outline-none focus:border-[hsl(var(--primary))]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
                    Ordem
                  </label>
                  <input
                    type="number"
                    name="sort_order"
                    defaultValue={media.sort_order}
                    className="w-full px-2 py-1 rounded border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs focus:outline-none focus:border-[hsl(var(--primary))]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
                  Queixas (separadas por vírgula · só tags válidas vão entrar)
                </label>
                <input
                  name="queixas"
                  defaultValue={queixasStr}
                  placeholder="olheiras, sulcos, flacidez, contorno..."
                  className="w-full px-2 py-1 rounded border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs font-mono focus:outline-none focus:border-[hsl(var(--primary))]"
                />
                <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">
                  válidas: geral, olheiras, sulcos, flacidez, contorno, papada, textura,
                  rugas, rejuvenescimento, fullface, firmeza, manchas, mandibula, perfil,
                  bigode_chines
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] uppercase tracking-widest hover:opacity-90"
                >
                  <Save className="w-3 h-3" />
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))]"
                >
                  <X className="w-3 h-3" />
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
