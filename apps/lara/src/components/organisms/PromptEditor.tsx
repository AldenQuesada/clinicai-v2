'use client'

/**
 * PromptEditor · pane de edicao do prompt · padrao Mira.
 * Header eyebrow + font-display · body textarea (b2b-input variation pra mono) ·
 * footer b2b-form-actions com b2b-btn b2b-btn-primary.
 */

import { useEffect, useRef, useState } from 'react'
import { savePromptAction } from '@/app/(authed)/prompts/actions'

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

export function PromptEditor({
  prompt,
  onSaved,
  onContentChange,
}: {
  prompt: EditorPrompt
  onSaved: () => void
  onContentChange?: (content: string) => void
}) {
  const initialContent = prompt.override ?? prompt.filesystem_default
  const [content, setContent] = useState(initialContent)
  const [pending, setPending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setContent(prompt.override ?? prompt.filesystem_default)
  }, [prompt.key, prompt.override, prompt.filesystem_default])

  // Live preview sync · cada keystroke avisa o pai
  useEffect(() => {
    onContentChange?.(content)
  }, [content, onContentChange])

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
    <section
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--b2b-bg-0)',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '24px 32px',
          borderBottom: '1px solid var(--b2b-border)',
          background: 'var(--b2b-bg-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              {prompt.groupTitle}
            </p>
            <h2
              className="font-display"
              style={{ fontSize: 26, color: 'var(--b2b-ivory)', lineHeight: 1.1, margin: 0 }}
            >
              {prompt.label}
            </h2>
            <p
              style={{
                fontSize: 12,
                color: 'var(--b2b-text-dim)',
                marginTop: 8,
                lineHeight: 1.6,
                fontStyle: 'italic',
              }}
            >
              {prompt.description}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 4 }}>
            <span
              className={prompt.hasOverride ? 'b2b-pill b2b-pill-tier' : 'b2b-pill'}
            >
              {prompt.hasOverride ? 'Override' : 'Padrão'}
            </span>
          </div>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ flex: 1, overflow: 'hidden', padding: '24px 32px 12px' }}>
          <textarea
            ref={textareaRef}
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="b2b-input custom-scrollbar"
            style={{
              width: '100%',
              height: '100%',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              lineHeight: 1.65,
              resize: 'none',
              padding: '14px 16px',
            }}
          />
        </div>

        <footer
          style={{
            padding: '14px 32px',
            borderTop: '1px solid var(--b2b-border)',
            background: 'var(--b2b-bg-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 16,
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'var(--b2b-text-muted)',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>{kbCount} KB</span>
            <span style={{ color: 'var(--b2b-border-strong)' }}>·</span>
            <span>{charCount} chars</span>
            <span style={{ color: 'var(--b2b-border-strong)' }}>·</span>
            <span>{lineCount} linhas</span>
            {dirty && (
              <>
                <span style={{ color: 'var(--b2b-border-strong)' }}>·</span>
                <span style={{ color: 'var(--b2b-amber)' }}>não salvo</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {prompt.hasOverride && (
              <button
                type="submit"
                name="action"
                value="reset"
                disabled={pending}
                className="b2b-btn"
                style={{ borderColor: 'rgba(217, 122, 122, 0.4)', color: 'var(--b2b-red)' }}
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
              className="b2b-btn b2b-btn-primary"
            >
              {pending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </footer>
      </form>
    </section>
  )
}
