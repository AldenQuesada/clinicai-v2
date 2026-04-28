'use client'

/**
 * PromptEditor · organismo · pane de edicao do prompt selecionado.
 * Brandbook-aligned · sem emoji, eyebrow Montserrat tracking 4px gold,
 * radius 8px (cards) / 4px (inputs) / 2px (botoes).
 */

import { useEffect, useRef, useState } from 'react'
import { savePromptAction } from '@/app/prompts/actions'
import { DiffBadge } from '@/components/atoms/DiffBadge'
import { DotIndicator } from '@/components/atoms/DotIndicator'
import { Button } from '@/components/atoms/Button'

export interface EditorPrompt {
  key: string
  label: string
  description: string
  groupEmoji: string  // mantido por backwards-compat · nao renderizado
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
      {/* Header · eyebrow tracking 4px gold + cormorant 300 */}
      <header className="px-8 lg:px-10 py-7 border-b border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
        <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0">
            <p className="font-display-uppercase text-[10px] tracking-[0.4em] text-[hsl(var(--primary))]/80 mb-2.5">
              {prompt.groupTitle}
            </p>
            <h2 className="font-[family-name:var(--font-cursive)] text-3xl font-light leading-[1.08] tracking-[-0.01em] text-[hsl(var(--foreground))]">
              {prompt.label}
            </h2>
            <p className="text-[13px] text-[hsl(var(--muted-foreground))] mt-3 leading-[1.7] max-w-3xl">
              {prompt.description}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] font-display-uppercase text-[9px] tracking-[0.25em] ${
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

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden p-8 lg:p-10 pb-4">
          <textarea
            ref={textareaRef}
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="w-full h-full px-5 py-4 rounded-[4px] border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))] text-[13px] font-mono leading-[1.7] focus:outline-none focus:border-[hsl(var(--primary))] resize-none custom-scrollbar transition-colors"
          />
        </div>

        <footer className="px-8 lg:px-10 py-5 border-t border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 text-[10px] font-display-uppercase tracking-[0.25em] text-[hsl(var(--muted-foreground))] tabular-nums">
            <span>{kbCount} KB</span>
            <span className="opacity-40">·</span>
            <span>{charCount} chars</span>
            <span className="opacity-40">·</span>
            <span>{lineCount} linhas</span>
            {dirty && (
              <span className="inline-flex items-center gap-2 text-[hsl(var(--warning))]">
                <DotIndicator state="active" size="xs" className="!bg-[hsl(var(--warning))]" />
                não salvo
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {prompt.hasOverride && (
              <Button
                type="submit"
                name="action"
                value="reset"
                disabled={pending}
                variant="danger"
                size="sm"
                title="Remove o override · volta pro filesystem default"
              >
                Restaurar padrão
              </Button>
            )}
            <Button
              type="submit"
              name="action"
              value="save"
              disabled={pending || !dirty}
              variant="gold"
              size="sm"
            >
              {pending ? 'Salvando' : 'Salvar'}
            </Button>
          </div>
        </footer>
      </form>
    </section>
  )
}
