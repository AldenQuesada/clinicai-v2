'use client'

/**
 * TemplateEditor · cliente · UX de editor WA com toolbar + placeholders +
 * preview live em bolha mock do WhatsApp.
 *
 * Mirror estrutural do `b2b-comm-editor.ui.js` antigo, mas em React. Os 2
 * campos (textTemplate, audioScript) sao renderizados dentro do form ja
 * existente · nomes preservados pra Server Actions continuarem funcionando
 * sem mudanca.
 *
 * Toolbar WhatsApp: bold (*texto*), italic (_texto_), strike (~texto~),
 * mono (```texto```), bullet (- ), newline. Operacoes inseridas no cursor
 * da textarea ativa (text ou audio).
 *
 * Placeholders clicaveis: insere `{nome}` no cursor. Lista canonica espelha
 * o editor antigo + cobre os 13 templates seed em prod.
 *
 * Preview: renderiza o textTemplate substituindo placeholders por SAMPLE
 * VALUES + aplicando formatacao WA (bold/italic/strike/mono → HTML span).
 * Bolha verde-clara de balao recebido como o WhatsApp Cloud renderiza.
 */

import { useRef, useState } from 'react'
import { Bold, Italic, Strikethrough, Code, List, Link2, CornerDownLeft } from 'lucide-react'

const PLACEHOLDERS = [
  { key: 'parceira_first', sample: 'Ana' },
  { key: 'parceira_full', sample: 'Ana Beatriz Souza' },
  { key: 'pillar', sample: 'Yoga' },
  { key: 'cap', sample: 'R$ 200' },
  { key: 'combo', sample: 'Limpeza de pele + Olheiras' },
  { key: 'convidada', sample: 'Maria' },
  { key: 'link', sample: 'https://miriandpaula.com.br/voucher/abc123' },
  { key: 'token', sample: 'ABC123' },
  { key: 'expira_em', sample: '15/05/2026' },
  { key: 'painel_parceira', sample: 'https://miriandpaula.com.br/p/ana' },
  { key: 'mes', sample: 'maio' },
  { key: 'vouchers_mes', sample: '8' },
  { key: 'vouchers_abertos', sample: '3' },
]

type FieldKey = 'text' | 'audio'

interface Props {
  defaultText: string
  defaultAudio: string
  /** name dos textareas pro Server Action capturar via FormData */
  textName?: string
  audioName?: string
  /** prefixo no id pra evitar conflito quando varios editors no mesmo form */
  idPrefix?: string
  disabled?: boolean
}

export function TemplateEditor({
  defaultText,
  defaultAudio,
  textName = 'textTemplate',
  audioName = 'audioScript',
  idPrefix = 'tpl',
  disabled = false,
}: Props) {
  const [text, setText] = useState(defaultText)
  const [audio, setAudio] = useState(defaultAudio)
  const [activeField, setActiveField] = useState<FieldKey>('text')
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const audioRef = useRef<HTMLTextAreaElement | null>(null)

  function getActiveRef() {
    return activeField === 'text' ? textRef.current : audioRef.current
  }

  function setActiveValue(v: string) {
    if (activeField === 'text') setText(v)
    else setAudio(v)
  }

  function insertAtCursor(insert: string, wrapEnd?: string) {
    const ref = getActiveRef()
    if (!ref || disabled) return
    const start = ref.selectionStart ?? ref.value.length
    const end = ref.selectionEnd ?? ref.value.length
    const before = ref.value.slice(0, start)
    const selected = ref.value.slice(start, end)
    const after = ref.value.slice(end)
    const middle = wrapEnd ? `${insert}${selected}${wrapEnd}` : insert
    const next = before + middle + after
    setActiveValue(next)
    requestAnimationFrame(() => {
      const cursor = (before + middle).length - (wrapEnd?.length ?? 0)
      ref.focus()
      ref.setSelectionRange(cursor, cursor)
    })
  }

  function wrapSelection(wrap: string) {
    insertAtCursor(wrap, wrap)
  }

  function insertPlaceholder(key: string) {
    insertAtCursor(`{${key}}`)
  }

  function insertNewline() {
    insertAtCursor('\n')
  }

  function insertBullet() {
    insertAtCursor('\n- ')
  }

  function insertLink() {
    insertAtCursor('https://')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
      {/* === Coluna esquerda · toolbar + textareas === */}
      <div className="flex flex-col gap-2">
        {/* Toolbar */}
        <div className="flex items-center flex-wrap gap-1 px-2 py-1.5 rounded-md border border-white/10 bg-white/[0.02]">
          <ToolButton onClick={() => wrapSelection('*')} title="Negrito (*texto*)" disabled={disabled}>
            <Bold className="w-3.5 h-3.5" />
          </ToolButton>
          <ToolButton onClick={() => wrapSelection('_')} title="Itálico (_texto_)" disabled={disabled}>
            <Italic className="w-3.5 h-3.5" />
          </ToolButton>
          <ToolButton onClick={() => wrapSelection('~')} title="Tachado (~texto~)" disabled={disabled}>
            <Strikethrough className="w-3.5 h-3.5" />
          </ToolButton>
          <ToolButton onClick={() => wrapSelection('```')} title="Mono (```texto```)" disabled={disabled}>
            <Code className="w-3.5 h-3.5" />
          </ToolButton>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <ToolButton onClick={insertBullet} title="Bullet" disabled={disabled}>
            <List className="w-3.5 h-3.5" />
          </ToolButton>
          <ToolButton onClick={insertLink} title="Link" disabled={disabled}>
            <Link2 className="w-3.5 h-3.5" />
          </ToolButton>
          <ToolButton onClick={insertNewline} title="Nova linha" disabled={disabled}>
            <CornerDownLeft className="w-3.5 h-3.5" />
          </ToolButton>
          <span className="ml-auto eyebrow text-[#6B7280]">
            ativo: {activeField === 'text' ? 'Texto' : 'Áudio'}
          </span>
        </div>

        {/* Texto */}
        <div className="flex flex-col gap-1">
          <label className="eyebrow text-[#9CA3AF]" htmlFor={`${idPrefix}-text`}>
            Texto (text_template)
          </label>
          <textarea
            id={`${idPrefix}-text`}
            ref={textRef}
            name={textName}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setActiveField('text')}
            disabled={disabled}
            rows={6}
            className="w-full px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs font-mono resize-y focus:outline-none focus:border-[#C9A96E]/50 disabled:opacity-50"
          />
        </div>

        {/* Audio */}
        <div className="flex flex-col gap-1">
          <label className="eyebrow text-[#9CA3AF]" htmlFor={`${idPrefix}-audio`}>
            Audio Script (opcional)
          </label>
          <textarea
            id={`${idPrefix}-audio`}
            ref={audioRef}
            name={audioName}
            value={audio}
            onChange={(e) => setAudio(e.target.value)}
            onFocus={() => setActiveField('audio')}
            disabled={disabled}
            rows={3}
            className="w-full px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs font-mono resize-y focus:outline-none focus:border-[#C9A96E]/50 disabled:opacity-50"
          />
        </div>

        {/* Placeholders */}
        <div className="flex flex-col gap-1">
          <label className="eyebrow text-[#9CA3AF]">Placeholders (clique pra inserir)</label>
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => insertPlaceholder(p.key)}
                disabled={disabled}
                title={`Sample: ${p.sample}`}
                className="px-2 py-1 rounded text-[10px] font-mono text-[#C9A96E] border border-[#C9A96E]/25 bg-[#C9A96E]/[0.04] hover:bg-[#C9A96E]/12 transition-colors disabled:opacity-50"
              >
                {`{${p.key}}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* === Coluna direita · preview WhatsApp bolha === */}
      <div className="flex flex-col gap-1">
        <label className="eyebrow text-[#9CA3AF]">Preview no WhatsApp</label>
        <WhatsAppBubble text={text} />
        {audio.trim() && (
          <div className="mt-2">
            <span className="eyebrow text-[#9CA3AF]">Áudio (script)</span>
            <div className="mt-1 px-3 py-2 rounded-md border border-white/10 bg-white/[0.02] text-xs text-[#9CA3AF] italic font-mono whitespace-pre-wrap">
              {renderPlaceholders(audio)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void
  title: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 rounded text-[#9CA3AF] hover:text-[#C9A96E] hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

/**
 * Renderiza texto com placeholders substituidos por sample values e
 * aplica formatacao WhatsApp (bold/italic/strike/mono).
 */
function WhatsAppBubble({ text }: { text: string }) {
  const rendered = renderPlaceholders(text)
  const html = formatWhatsApp(rendered)
  return (
    <div className="rounded-lg p-3 bg-[#0a1f1a] border border-[#1f3a30]">
      <div className="text-[10px] uppercase tracking-[1px] text-[#5d8a7a] mb-2">
        Mira · WhatsApp
      </div>
      <div
        className="px-3 py-2 rounded-lg bg-[#005c4b] text-[#e9edef] text-[13px] leading-snug whitespace-pre-wrap break-words"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html || '<span class="opacity-50 italic">Mensagem vazia · digite ou clique num placeholder.</span>' }}
      />
      <div className="text-right text-[9px] text-[#7a8b85] mt-1.5">10:24 ✓✓</div>
    </div>
  )
}

function renderPlaceholders(text: string): string {
  return text.replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
    const ph = PLACEHOLDERS.find((p) => p.key === key)
    return ph ? ph.sample : `{${key}}`
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatWhatsApp(raw: string): string {
  let out = escapeHtml(raw)
  // Mono ```text```
  out = out.replace(/```([\s\S]+?)```/g, '<code class="font-mono text-[12px] bg-black/30 px-1 py-0.5 rounded">$1</code>')
  // Bold *text*
  out = out.replace(/(^|[^\w])\*([^*\n]+)\*(?=$|[^\w])/g, '$1<strong>$2</strong>')
  // Italic _text_
  out = out.replace(/(^|[^\w])_([^_\n]+)_(?=$|[^\w])/g, '$1<em>$2</em>')
  // Strike ~text~
  out = out.replace(/(^|[^\w])~([^~\n]+)~(?=$|[^\w])/g, '$1<s>$2</s>')
  return out
}
