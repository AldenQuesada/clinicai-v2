'use client'

/**
 * PromptEditor · organismo · pane de edicao do prompt selecionado.
 *
 * Header:
 *   - emoji do grupo
 *   - label do layer
 *   - description longa
 *   - meta: tamanho atual (KB), diff badge, status badge
 *
 * Body: textarea monospace.
 *
 * Footer: [Restaurar padrão] (so se hasOverride) + [Salvar].
 *
 * Estado dirty:
 *   - true quando textarea conteudo difere de original
 *   - mostra dot pulsante no Salvar
 *   - confirm browser-level antes de trocar de layer
 */

import { useEffect, useRef, useState } from 'react'
import { savePromptAction } from '@/app/prompts/actions'
import { DiffBadge } from '@/components/atoms/DiffBadge'
import { DotIndicator } from '@/components/atoms/DotIndicator'

export interface EditorPrompt {
  key: string
  label: string
  description: string
  groupEmoji: string
  groupTitle: string
  filesystem_default: string
  override: string | null
  hasOverride: boolean
}

export function PromptEditor({ prompt, onSaved }: { prompt: EditorPrompt; onSaved: () => void }) {
  const initialContent = prompt.override ?? prompt.filesystem_default
  const [content, setContent] = useState(initialContent)
  const [pending, setPending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync local state quando troca de prompt (key muda)
  useEffect(() => {
    setContent(prompt.override ?? prompt.filesystem_default)
  }, [prompt.key, prompt.override, prompt.filesystem_default])

  const dirty = content !== initialContent
  const charCount = content.length
  const kbCount = (charCount / 1024).toFixed(1)
  const lineCount = content.split('\n').length

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    // submitter carrega name/value do botao clicado (save/reset) · sem isso o
    // server action nunca recebe action=reset porque FormData(form) ignora botoes
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const formData = new FormData(form)
    if (submitter?.name && submitter?.value) {
      formData.append(submitter.name, submitter.value)
    }
    setPending(true)
    try {
      await savePromptAction(prompt.key, formData)
      onSaved()
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex-1 flex flex-col overflow-hidden bg-[hsl(var(--chat-bg))]">
      {/* Header */}
      <header className="px-6 py-5 border-b border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-2xl select-none leading-none mt-0.5">
            {prompt.groupEmoji}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]">
                {prompt.groupTitle}
              </span>
            </div>
            <h2 className="text-xl font-light leading-tight text-[hsl(var(--foreground))]">
              {prompt.label}
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 leading-relaxed">
              {prompt.description}
            </p>
          </div>

          {/* Meta */}
          <div className="shrink-0 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] uppercase tracking-widest font-display-uppercase ${
                prompt.hasOverride
                  ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
              }`}
            >
              <DotIndicator state={prompt.hasOverride ? 'override' : 'default'} size="xs" />
              {prompt.hasOverride ? 'Override' : 'Padrão'}
            </span>
            {prompt.hasOverride && (
              <DiffBadge
                overrideLength={prompt.override?.length ?? 0}
                defaultLength={prompt.filesystem_default.length}
              />
            )}
          </div>
        </div>
      </header>

      {/* Body · textarea */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden p-6 pb-3">
          <textarea
            ref={textareaRef}
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="w-full h-full px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))] text-xs font-mono leading-relaxed focus:outline-none focus:border-[hsl(var(--primary))] resize-none custom-scrollbar transition-colors"
          />
        </div>

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] flex items-center justify-between gap-4">
          {/* Stats */}
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))] tabular-nums">
            <span>{kbCount} KB</span>
            <span className="opacity-50">·</span>
            <span>{charCount} chars</span>
            <span className="opacity-50">·</span>
            <span>{lineCount} linhas</span>
            {dirty && (
              <span className="inline-flex items-center gap-1.5 text-[hsl(var(--warning))]">
                <DotIndicator state="active" size="xs" className="!bg-[hsl(var(--warning))]" />
                não salvo
              </span>
            )}
          </div>

          {/* Acoes */}
          <div className="flex items-center gap-2">
            {prompt.hasOverride && (
              <button
                type="submit"
                name="action"
                value="reset"
                disabled={pending}
                className="px-4 py-2 rounded-md text-xs uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/10 transition-colors disabled:opacity-50"
                title="Remove o override · volta pro filesystem default"
              >
                Restaurar padrão
              </button>
            )}
            <button
              type="submit"
              name="action"
              value="save"
              disabled={pending || !dirty}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-pill text-xs uppercase tracking-widest font-display-uppercase bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 shadow-luxury-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {pending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </footer>
      </form>
    </section>
  )
}
