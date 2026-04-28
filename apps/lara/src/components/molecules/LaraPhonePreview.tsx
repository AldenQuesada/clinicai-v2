'use client'

/**
 * LaraPhonePreview · molecula · WhatsApp phone preview da Lara.
 *
 * REUSO: classes .bcomm-phone/.bcomm-wa-* do b2b-comm.css (mesmo Mira/disparos).
 * Renderiza bubble outgoing tipo "Lara enviando pra paciente" · interpola
 * placeholders comuns ({firstName}, {primeiraQueixa}) com sample data.
 *
 * Variantes de visualizacao:
 *   - mode='message'     · bubble unica (msg fixa, cold-open, template)
 *   - mode='instruction' · documento monospace formatado (prompts pra IA)
 */

import { useMemo } from 'react'

const SAMPLE_VARS: Record<string, string> = {
  firstName: 'Mariana',
  primeiraQueixa: 'olheiras',
  ageBucket: '35-45',
  funnel: 'olheiras',
  data: 'sábado, 14/04 às 14:30',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Formato WhatsApp · *bold*, _italic_, ~strike~, links http(s)
 */
function waFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>',
    )
    .replace(/\n/g, '<br>')
}

function renderPlaceholders(text: string): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => SAMPLE_VARS[key] ?? `{${key}}`)
}

function currentTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export type PreviewMode = 'message' | 'instruction'

export function LaraPhonePreview({
  text,
  mode,
  meta,
}: {
  text: string
  mode: PreviewMode
  meta?: string
}) {
  const time = currentTime()
  const rendered = useMemo(() => renderPlaceholders(text || ''), [text])

  if (mode === 'instruction') {
    // Prompts pra IA · NAO sao mandados como mensagem · documento legivel
    return (
      <div className="bcomm-preview-wrap">
        <div className="bcomm-preview-banner">
          <span className="bcomm-badge bcomm-badge-event">prompt da IA</span>
          <span className="bcomm-preview-meta">
            {meta || 'system prompt · injetado em toda conversa'}
          </span>
        </div>
        <div
          className="luxury-card custom-scrollbar"
          style={{
            padding: 16,
            maxHeight: 480,
            overflowY: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.7,
            color: 'var(--b2b-text-dim)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {rendered || (
            <span style={{ fontStyle: 'italic', color: 'var(--b2b-text-muted)' }}>
              (vazio · cai no padrão do filesystem)
            </span>
          )}
        </div>
        <p
          style={{
            marginTop: 10,
            fontSize: 11,
            color: 'var(--b2b-text-muted)',
            fontStyle: 'italic',
          }}
        >
          Esse texto não é enviado direto. Ele molda como a IA RESPONDE
          (identidade, regras, tom). A mensagem que chega no paciente é
          gerada pela IA usando isso como base.
        </p>
      </div>
    )
  }

  // mode === 'message' · bubble outgoing real
  return (
    <div className="bcomm-preview-wrap">
      <div className="bcomm-preview-banner">
        <span className="bcomm-badge bcomm-badge-event">mensagem real</span>
        <span className="bcomm-badge bcomm-badge-live">enviada</span>
        <span className="bcomm-preview-meta">{meta || 'paciente recebe assim'}</span>
      </div>

      <div className="bcomm-phone">
        <div className="bcomm-phone-frame">
          <div className="bcomm-phone-notch" />
          <div className="bcomm-phone-screen">
            <div className="bcomm-wa-hdr">
              <span className="bcomm-wa-back">‹</span>
              <div className="bcomm-wa-avatar">L</div>
              <div className="bcomm-wa-ident">
                <span className="bcomm-wa-name">Lara</span>
                <span className="bcomm-wa-sub">online</span>
              </div>
              <span className="bcomm-wa-icons">📹 📞 ⋮</span>
            </div>

            <div className="bcomm-wa-chat">
              {rendered ? (
                <div className="bcomm-wa-bubble bcomm-wa-bubble-out">
                  <div
                    className="bcomm-wa-text"
                    dangerouslySetInnerHTML={{ __html: waFormat(rendered) }}
                  />
                  <div className="bcomm-wa-time">
                    {time} <span className="bcomm-wa-ticks">✓✓</span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: 16,
                    fontStyle: 'italic',
                    color: '#888',
                    fontSize: 12,
                  }}
                >
                  (sem texto definido)
                </div>
              )}
            </div>

            <div className="bcomm-wa-input">
              <span>😊</span>
              <span className="bcomm-wa-input-ph">Digite uma mensagem</span>
              <span>📎</span>
              <span>🎤</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Decide qual mode aplicar com base na key do layer:
 *   - lara_fixed_msg_*           → message (fica como WhatsApp bubble)
 *   - lara_prompt_cold_open_*    → message (texto enviado direto pelo cold-open)
 *   - lara_prompt_base/compact/* → instruction (system prompt pra IA)
 *   - lara_prompt_persona_*      → instruction
 *   - lara_prompt_olheiras/etc   → instruction (flow injetado no system)
 */
export function getPreviewMode(layerKey: string): PreviewMode {
  if (layerKey.startsWith('lara_fixed_msg_')) return 'message'
  if (layerKey.startsWith('lara_prompt_cold_open_')) return 'message'
  return 'instruction'
}
