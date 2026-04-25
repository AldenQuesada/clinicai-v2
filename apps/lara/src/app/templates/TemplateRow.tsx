'use client'

/**
 * TemplateRow · client component pra interatividade (copy-to-clipboard).
 */

import { useState } from 'react'
import { Copy, Check, Trash2 } from 'lucide-react'
import { deleteTemplateAction } from './actions'

interface Template {
  id: string
  name: string
  message: string | null
  content: string | null
  category: string | null
  trigger_phase: string | null
  active: boolean
  is_active: boolean
  sort_order: number | null
}

export function TemplateRow({
  template,
  canManage,
}: {
  template: Template
  canManage: boolean
}) {
  const [copied, setCopied] = useState(false)
  const text = template.content || template.message || ''

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore · clipboard pode falhar em http (não-https local)
    }
  }

  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-4 hover:border-[hsl(var(--primary))]/40 transition-colors group">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-display-uppercase text-xs tracking-widest text-[hsl(var(--foreground))]">
              {template.name}
            </span>
            {template.category && (
              <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                {template.category}
              </span>
            )}
            {template.trigger_phase && (
              <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                {template.trigger_phase}
              </span>
            )}
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] whitespace-pre-wrap">{text}</p>
        </div>

        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copyToClipboard}
            title={copied ? 'Copiado' : 'Copiar pro clipboard'}
            className="p-2 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          {canManage && (
            <form
              action={deleteTemplateAction.bind(null, template.id)}
              onSubmit={(e) => {
                if (!confirm(`Excluir template "${template.name}"?`)) e.preventDefault()
              }}
            >
              <button
                type="submit"
                title="Excluir"
                className="p-2 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
