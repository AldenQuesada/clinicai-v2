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
    <div className="luxury-card group" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span
              className="font-display"
              style={{ fontSize: 16, color: 'var(--b2b-ivory)' }}
            >
              {template.name}
            </span>
            {template.category && <span className="b2b-pill">{template.category}</span>}
            {template.trigger_phase && (
              <span className="b2b-pill b2b-pill-tier">{template.trigger_phase}</span>
            )}
          </div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--b2b-text-dim)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {text}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 4, opacity: 0.6, flexShrink: 0 }} className="group-hover:opacity-100 transition-opacity">
          <button
            onClick={copyToClipboard}
            title={copied ? 'Copiado' : 'Copiar pro clipboard'}
            style={{
              padding: 6,
              background: 'transparent',
              border: 'none',
              color: 'var(--b2b-text-muted)',
              cursor: 'pointer',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--b2b-champagne)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--b2b-text-muted)')}
          >
            {copied ? <Check className="w-4 h-4" style={{ color: 'var(--b2b-sage)' }} /> : <Copy className="w-4 h-4" />}
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
                style={{
                  padding: 6,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--b2b-text-muted)',
                  cursor: 'pointer',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--b2b-red)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--b2b-text-muted)')}
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
