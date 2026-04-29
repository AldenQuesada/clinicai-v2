'use client'

/**
 * BroadcastFormClient · editor de broadcast (criar / editar / clonar).
 *
 * Espelho 1:1 de:
 *  · _renderBroadcastFormBody (broadcast.ui.js linhas 481–619)
 *  · save handler (broadcast-events.ui.js linhas 553–668)
 *
 * Features portadas:
 *  · Auto-save de rascunho em localStorage (DRAFT_KEY · 7d TTL)
 *  · Char counter (0/4096 · warning em 3500+, erro em 4096+)
 *  · Tag insert ([nome], [queixa])
 *  · Format buttons (negrito, italico, riscado, mono)
 *  · Emoji picker (36 emojis)
 *  · Preview WhatsApp dinamico (texto + imagem · acima/abaixo)
 *  · Upload de imagem ou URL externa
 *  · Throttle (batch_size + batch_interval_min)
 *  · Schedule (radio "agora" vs "agendar para")
 *  · Validacao: nome+content obrigatorios, max 4096 chars, [queixa] exige
 *    target_queixa, pelo menos 1 filtro ou lead manual.
 *  · Botao "Salvar rascunho" → status=draft (NAO inicia)
 *  · Botao "Enviar agora" → cria + start em sequencia (com confirm modal)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  Bold,
  Italic,
  Image as ImageIcon,
  Loader2,
  Send,
  Save,
  ShieldCheck,
  Smile,
  Strikethrough,
  Tag,
  X,
} from 'lucide-react'
import type { BroadcastUpsertInput } from '@clinicai/repositories'
import {
  BATCH_INTERVAL_OPTIONS,
  BATCH_SIZE_OPTIONS,
  DRAFT_KEY,
  DRAFT_TTL_MS,
  WHATSAPP_MAX_LENGTH,
  WHATSAPP_WARN_LENGTH,
  buildTargetFilter,
  escapeHtml,
  interpolatePreview,
  whatsappFormatToHtml,
} from '../lib/filters'
import {
  createAndStartBroadcastAction,
  createBroadcastAction,
  rescheduleBroadcastAction,
  updateBroadcastAction,
  uploadBroadcastMediaAction,
} from '../actions'
import { SegmentPicker, type SegmentState } from './SegmentPicker'

interface FormState {
  name: string
  content: string
  media_url: string
  media_caption: string
  media_position: 'above' | 'below'
  filter_phase: string
  filter_temperature: string
  filter_funnel: string
  filter_source_type: string
  selected_leads: Array<{ id: string; nome: string; phone: string }>
  target_queixa: string
  batch_size: number
  batch_interval_min: number
  schedule_mode: 'now' | 'scheduled'
  scheduled_at: string // local ISO (YYYY-MM-DDTHH:MM)
}

const EMPTY_FORM: FormState = {
  name: '',
  content: '',
  media_url: '',
  media_caption: '',
  media_position: 'above',
  filter_phase: '',
  filter_temperature: '',
  filter_funnel: '',
  filter_source_type: '',
  selected_leads: [],
  target_queixa: '',
  batch_size: 10,
  batch_interval_min: 10,
  schedule_mode: 'now',
  scheduled_at: '',
}

const EMOJIS = [
  '😊', '😍', '🔥', '✨', '💜', '🌟', '❤️', '👏', '🎉', '💪',
  '👋', '🙏', '💋', '😉', '🥰', '💎', '🌸', '⭐', '📍', '📅',
  '⏰', '📞', '💰', '🎁', '✅', '❌', '⚡', '🏆', '💡', '🤝',
  '👨‍⚕️', '💆', '🪞', '💄', '🌺', '💫',
]

interface BroadcastFormClientProps {
  initialState?: Partial<FormState>
  editingId?: string | null
}

export function BroadcastFormClient({
  initialState,
  editingId = null,
}: BroadcastFormClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    ...initialState,
  }))
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitMode, setSubmitMode] = useState<'draft' | 'now' | null>(null)
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const draftLoadedRef = useRef(false)

  // ── Auto-save rascunho (debounced 500ms) ─────────────────────────
  // So salva rascunho se nao esta editando (espelha _bcDraftSave)
  useEffect(() => {
    if (editingId) return
    const t = setTimeout(() => {
      const hasContent =
        form.name.trim() ||
        form.content.trim() ||
        form.media_url ||
        form.selected_leads.length > 0
      if (!hasContent) {
        try {
          localStorage.removeItem(DRAFT_KEY)
        } catch {
          /* quota */
        }
        return
      }
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ _savedAt: Date.now(), form }),
        )
      } catch {
        /* quota */
      }
    }, 500)
    return () => clearTimeout(t)
  }, [form, editingId])

  // ── Restaurar rascunho na primeira renderizacao se nao tem initialState ──
  useEffect(() => {
    if (draftLoadedRef.current) return
    if (editingId) return
    if (initialState) return
    draftLoadedRef.current = true
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const obj = JSON.parse(raw)
      if (
        !obj ||
        !obj.form ||
        Date.now() - (obj._savedAt || 0) > DRAFT_TTL_MS
      ) {
        localStorage.removeItem(DRAFT_KEY)
        return
      }
      setForm({ ...EMPTY_FORM, ...obj.form })
      showToast('Rascunho recuperado — continue de onde parou', 'ok')
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showToast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3500)
  }

  function patchForm(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  // ── Tag/format/emoji handlers (manipulam textarea direto pra preservar caret) ──
  function insertAtCaret(insert: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = ta.value
    const next = text.substring(0, start) + insert + text.substring(end)
    ta.value = next
    ta.selectionStart = ta.selectionEnd = start + insert.length
    ta.focus()
    patchForm({ content: next })
  }

  function wrapSelection(wrap: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = ta.value
    const selected = text.substring(start, end)
    if (selected) {
      const wrapped = `${wrap}${selected}${wrap}`
      const next = text.substring(0, start) + wrapped + text.substring(end)
      ta.value = next
      ta.selectionStart = start
      ta.selectionEnd = end + wrap.length * 2
      patchForm({ content: next })
    } else {
      const next =
        text.substring(0, start) + wrap + wrap + text.substring(end)
      ta.value = next
      ta.selectionStart = ta.selectionEnd = start + wrap.length
      patchForm({ content: next })
    }
    ta.focus()
  }

  // ── Upload ──────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadBroadcastMediaAction(fd)
      if (!res.ok || !res.data) {
        showToast(res.error || 'Erro no upload', 'err')
        return
      }
      patchForm({ media_url: res.data.url })
      showToast('Imagem enviada com sucesso')
    } catch (e) {
      showToast(`Erro no upload: ${(e as Error).message}`, 'err')
    } finally {
      setUploading(false)
    }
  }

  // ── Submit ──────────────────────────────────────────────────────
  function buildInput(): BroadcastUpsertInput {
    const targetFilter = buildTargetFilter({
      phase: form.filter_phase,
      temperature: form.filter_temperature,
      funnel: form.filter_funnel,
      source_type: form.filter_source_type,
      queixa: form.target_queixa || null,
    })
    const scheduledIso =
      form.schedule_mode === 'scheduled' && form.scheduled_at
        ? new Date(form.scheduled_at).toISOString()
        : null

    return {
      name: form.name.trim(),
      content: form.content.trim(),
      media_url: form.media_url.trim() || null,
      media_caption: form.media_caption.trim() || null,
      media_position: form.media_position,
      target_filter: targetFilter,
      scheduled_at: scheduledIso,
      batch_size: form.batch_size,
      batch_interval_min: form.batch_interval_min,
      selected_lead_ids:
        form.selected_leads.length > 0 ? form.selected_leads.map((l) => l.id) : null,
    }
  }

  async function handleSaveDraft() {
    if (saving) return
    setSubmitMode('draft')
    setSaving(true)
    try {
      const input = buildInput()
      let newId: string | null = editingId
      if (editingId) {
        const upd = await updateBroadcastAction(editingId, input)
        if (!upd.ok) {
          showToast(upd.error || 'Falha ao salvar', 'err')
          return
        }
      } else {
        const created = await createBroadcastAction(input)
        if (!created.ok || !created.data) {
          showToast(created.error || 'Falha ao salvar', 'err')
          return
        }
        newId = created.data.id
      }
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* */
      }
      showToast(editingId ? 'Disparo atualizado' : 'Rascunho salvo')
      if (newId) {
        startTransition(() => router.push(`/campanhas/${newId}`))
      } else {
        startTransition(() => router.push('/campanhas'))
      }
    } finally {
      setSaving(false)
      setSubmitMode(null)
    }
  }

  async function handleSendNow() {
    if (saving) return
    setSubmitMode('now')
    setSaving(true)
    try {
      const input = buildInput()
      // Quando agendado para futuro, usa create + reschedule + start
      // (espelha o save handler linhas 633–648 do clinic-dashboard)
      const isScheduled = !!input.scheduled_at
      let result: { ok: boolean; error?: string; data?: { id: string } }
      if (editingId && isScheduled) {
        const rs = await rescheduleBroadcastAction(editingId, input)
        result = { ok: rs.ok, error: rs.error, data: { id: editingId } }
      } else if (editingId) {
        const up = await updateBroadcastAction(editingId, input)
        if (up.ok) {
          // start direto
          const { startBroadcastAction } = await import('../actions')
          const sr = await startBroadcastAction(editingId)
          result = { ok: sr.ok, error: sr.error, data: { id: editingId } }
        } else {
          result = { ok: false, error: up.error }
        }
      } else {
        const res = await createAndStartBroadcastAction(input)
        result = { ok: res.ok, error: res.error, data: res.data }
      }

      if (!result.ok || !result.data) {
        showToast(result.error || 'Falha ao iniciar disparo', 'err')
        return
      }
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* */
      }
      showToast(
        isScheduled
          ? `Programado para ${new Date(input.scheduled_at!).toLocaleString('pt-BR')}`
          : 'Disparo iniciado',
      )
      startTransition(() => router.push(`/campanhas/${result.data!.id}`))
    } finally {
      setSaving(false)
      setSubmitMode(null)
      setConfirmSendOpen(false)
    }
  }

  // ── Validacao client-side antes de abrir o modal de confirmacao ──
  const charLength = form.content.length
  const charColor =
    charLength > WHATSAPP_MAX_LENGTH
      ? '#EF4444'
      : charLength > WHATSAPP_WARN_LENGTH
        ? '#F59E0B'
        : 'var(--b2b-text-muted)'

  const previewHtml = useMemo(() => {
    const interp = interpolatePreview(form.content)
    return whatsappFormatToHtml(escapeHtml(interp))
      .replace(/\n/g, '<br/>')
      .replace(
        /\[(nome|queixa|queixa_principal)\]/gi,
        '<span style="background:rgba(201,169,110,0.20);padding:1px 4px;border-radius:3px;color:var(--b2b-champagne)">[$1]</span>',
      )
  }, [form.content])

  const segmentState: SegmentState = {
    filter_phase: form.filter_phase,
    filter_temperature: form.filter_temperature,
    filter_funnel: form.filter_funnel,
    filter_source_type: form.filter_source_type,
    selected_leads: form.selected_leads,
    target_queixa: form.target_queixa,
  }

  const onSegmentChange = useCallback((next: Partial<SegmentState>) => {
    setForm((f) => ({
      ...f,
      ...next,
    }))
  }, [])

  const targetCount = form.selected_leads.length
  const filterCount = [
    form.filter_phase,
    form.filter_temperature,
    form.filter_funnel,
    form.filter_source_type,
  ].filter(Boolean).length
  const hasTarget = targetCount > 0 || filterCount > 0
  const overLimit = charLength > WHATSAPP_MAX_LENGTH
  const canSubmit =
    form.name.trim().length > 0 &&
    form.content.trim().length > 0 &&
    hasTarget &&
    !overLimit

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 24 }}>
      {/* ── COLUNA ESQUERDA · FORM ──────────────────────────────── */}
      <div className="luxury-card" style={{ padding: 18 }}>
        <div className="b2b-form-sec">Identificação</div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">
            Nome do disparo <em>*</em>
          </label>
          <input
            className="b2b-input"
            placeholder="Ex: Promo Lifting 5D Abril"
            value={form.name}
            onChange={(e) => patchForm({ name: e.target.value })}
            maxLength={120}
          />
        </div>

        <div className="b2b-form-sec" style={{ marginTop: 18 }}>
          Mensagem
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">
            Texto WhatsApp <em>*</em>
          </label>
          <textarea
            ref={textareaRef}
            className="b2b-input"
            rows={8}
            maxLength={WHATSAPP_MAX_LENGTH}
            placeholder={`Digite a mensagem aqui...

Use [nome] para personalizar.
Quebras de linha são mantidas.`}
            value={form.content}
            onChange={(e) => patchForm({ content: e.target.value })}
          />
          <div
            style={{
              fontSize: 11,
              textAlign: 'right',
              marginTop: 4,
              color: charColor,
              fontWeight: charLength > WHATSAPP_WARN_LENGTH ? 600 : 400,
            }}
          >
            {charLength} / {WHATSAPP_MAX_LENGTH}
          </div>

          {/* Tag bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--b2b-text-muted)', marginRight: 4 }}>
              Inserir:
            </span>
            <ToolbarButton onClick={() => insertAtCaret('[nome]')} label="[nome]" />
            <ToolbarButton onClick={() => insertAtCaret('[queixa]')} label="[queixa]" />
            <Sep />
            <ToolbarButton onClick={() => wrapSelection('*')} icon={<Bold className="w-3.5 h-3.5" />} title="Negrito" />
            <ToolbarButton onClick={() => wrapSelection('_')} icon={<Italic className="w-3.5 h-3.5" />} title="Itálico" />
            <ToolbarButton onClick={() => wrapSelection('~')} icon={<Strikethrough className="w-3.5 h-3.5" />} title="Riscado" />
            <ToolbarButton onClick={() => wrapSelection('```')} label="{ }" title="Monoespaço" />
            <Sep />
            <div style={{ position: 'relative' }}>
              <ToolbarButton
                onClick={() => setShowEmoji((v) => !v)}
                icon={<Smile className="w-3.5 h-3.5" />}
                title="Emojis"
              />
              {showEmoji && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    background: 'var(--b2b-bg-1, #1a1a1a)',
                    border: '1px solid var(--b2b-border)',
                    borderRadius: 6,
                    padding: 8,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(9, 1fr)',
                    gap: 4,
                    zIndex: 30,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    width: 240,
                  }}
                >
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        insertAtCaret(e)
                        setShowEmoji(false)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 16,
                        padding: 4,
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="b2b-form-sec" style={{ marginTop: 18 }}>
          Imagem ou link
        </div>
        <div className="b2b-field">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="b2b-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5" />
              )}
              {uploading ? 'Enviando...' : 'Enviar imagem'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ''
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>ou</span>
            <input
              className="b2b-input"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="https://... (URL da imagem ou link)"
              value={form.media_url}
              onChange={(e) => patchForm({ media_url: e.target.value })}
            />
          </div>

          {form.media_url && (
            <>
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 6,
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 4,
                  border: '1px solid var(--b2b-border)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.media_url}
                  alt="preview"
                  style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4 }}
                />
                <button
                  type="button"
                  onClick={() => patchForm({ media_url: '', media_caption: '' })}
                  className="b2b-btn"
                  style={{ padding: '4px 8px' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                className="b2b-input"
                style={{ marginTop: 6 }}
                placeholder="Legenda da imagem (opcional)"
                value={form.media_caption}
                onChange={(e) => patchForm({ media_caption: e.target.value })}
              />
              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="bcMediaPos"
                    value="above"
                    checked={form.media_position !== 'below'}
                    onChange={() => patchForm({ media_position: 'above' })}
                  />
                  Acima do texto
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="bcMediaPos"
                    value="below"
                    checked={form.media_position === 'below'}
                    onChange={() => patchForm({ media_position: 'below' })}
                  />
                  Abaixo do texto
                </label>
              </div>
            </>
          )}
        </div>

        <div className="b2b-form-sec" style={{ marginTop: 18 }}>
          Segmentação dos destinatários
        </div>
        <SegmentPicker state={segmentState} onChange={onSegmentChange} />

        <div className="b2b-form-sec" style={{ marginTop: 18 }}>
          <ShieldCheck
            className="w-3.5 h-3.5 inline"
            style={{ marginRight: 6, verticalAlign: '-2px' }}
          />
          Controle de envio (proteção contra bloqueio do WhatsApp)
        </div>
        <div className="b2b-grid-2">
          <div className="b2b-field">
            <label className="b2b-field-lbl">Pessoas por lote</label>
            <select
              className="b2b-input"
              value={form.batch_size}
              onChange={(e) => patchForm({ batch_size: Number(e.target.value) })}
            >
              {BATCH_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} pessoas
                </option>
              ))}
            </select>
          </div>
          <div className="b2b-field">
            <label className="b2b-field-lbl">Intervalo entre lotes</label>
            <select
              className="b2b-input"
              value={form.batch_interval_min}
              onChange={(e) =>
                patchForm({ batch_interval_min: Number(e.target.value) })
              }
            >
              {BATCH_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <small
          style={{
            display: 'block',
            fontSize: 10,
            color: 'var(--b2b-text-muted)',
            marginTop: 4,
          }}
        >
          Padrão (10 a cada 10 min) envia ~60 msgs/h · seguro pra WhatsApp.
          Nunca exceda 200/h pra evitar bloqueio temporário.
        </small>

        <div className="b2b-form-sec" style={{ marginTop: 18 }}>
          Agendamento
        </div>
        <div className="b2b-field">
          <div style={{ display: 'flex', gap: 14, fontSize: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="bcScheduleMode"
                value="now"
                checked={form.schedule_mode === 'now'}
                onChange={() =>
                  patchForm({ schedule_mode: 'now', scheduled_at: '' })
                }
              />
              Enviar agora
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="bcScheduleMode"
                value="scheduled"
                checked={form.schedule_mode === 'scheduled'}
                onChange={() => patchForm({ schedule_mode: 'scheduled' })}
              />
              Agendar para
            </label>
            <input
              type="datetime-local"
              className="b2b-input"
              style={{ flex: 1, minWidth: 200 }}
              disabled={form.schedule_mode === 'now'}
              value={form.scheduled_at}
              onChange={(e) => patchForm({ scheduled_at: e.target.value })}
            />
          </div>
        </div>

        <div
          className="b2b-form-actions"
          style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24, flexWrap: 'wrap' }}
        >
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || form.name.trim().length === 0 || form.content.trim().length === 0}
            className="b2b-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {saving && submitMode === 'draft' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Salvar rascunho
          </button>
          <button
            type="button"
            onClick={() => setConfirmSendOpen(true)}
            disabled={saving || !canSubmit}
            className="b2b-btn b2b-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Send className="w-3.5 h-3.5" />
            {form.schedule_mode === 'scheduled' ? 'Agendar e enfileirar' : 'Enviar agora'}
          </button>
        </div>
      </div>

      {/* ── COLUNA DIREITA · PREVIEW ──────────────────────────────── */}
      <PhonePreview html={previewHtml} mediaUrl={form.media_url} mediaPosition={form.media_position} />

      {confirmSendOpen && (
        <ConfirmSendModal
          form={form}
          targetCount={targetCount}
          filterCount={filterCount}
          saving={saving}
          onConfirm={handleSendNow}
          onCancel={() => setConfirmSendOpen(false)}
        />
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 50,
            padding: '12px 16px',
            background:
              toast.tone === 'err' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
            color: '#fff',
            borderRadius: 6,
            fontSize: 13,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Sub components ─────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  label,
  icon,
  title,
}: {
  onClick: () => void
  label?: string
  icon?: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: '4px 8px',
        fontSize: 11,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--b2b-border)',
        borderRadius: 4,
        color: 'var(--b2b-text-dim)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function Sep() {
  return (
    <span
      style={{
        width: 1,
        height: 18,
        background: 'var(--b2b-border)',
        display: 'inline-block',
      }}
    />
  )
}

function PhonePreview({
  html,
  mediaUrl,
  mediaPosition,
}: {
  html: string
  mediaUrl: string
  mediaPosition: 'above' | 'below'
}) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const imgBubble = mediaUrl ? (
    <div
      style={{
        background: '#005c4b',
        padding: 4,
        borderRadius: 8,
        marginBottom: 6,
        maxWidth: '85%',
        alignSelf: 'flex-end',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl}
        alt="media"
        style={{
          width: '100%',
          maxHeight: 140,
          objectFit: 'cover',
          borderRadius: 6,
          display: 'block',
        }}
      />
    </div>
  ) : null
  const textBubble = html ? (
    <div
      style={{
        background: '#005c4b',
        color: '#e9edef',
        padding: '8px 10px',
        borderRadius: 8,
        maxWidth: '85%',
        alignSelf: 'flex-end',
        fontSize: 12,
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `${html}<div style="font-size:9px;color:#9CA3AF;text-align:right;margin-top:2px">${time}</div>`,
      }}
    />
  ) : null

  return (
    <div style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
      <div
        className="luxury-card"
        style={{
          padding: 14,
          borderRadius: 18,
          background: '#0b141a',
          width: 280,
        }}
      >
        <div
          style={{
            background: '#202c33',
            color: '#e9edef',
            padding: 10,
            borderRadius: 6,
            marginBottom: 8,
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>Clínica Mirian de Paula</div>
          <div style={{ fontSize: 10, color: '#8696a0' }}>online</div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minHeight: 200,
          }}
        >
          {!textBubble && !imgBubble && (
            <div style={{ color: '#8696a0', fontSize: 11, textAlign: 'center', padding: '40px 0' }}>
              Digite a mensagem ao lado para ver o preview
            </div>
          )}
          {mediaPosition === 'below' ? (
            <>
              {textBubble}
              {imgBubble}
            </>
          ) : (
            <>
              {imgBubble}
              {textBubble}
            </>
          )}
        </div>
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--b2b-text-muted)',
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        Preview com lead-exemplo: <i>Maria · rugas finais</i>
      </div>
    </div>
  )
}

function ConfirmSendModal({
  form,
  targetCount,
  filterCount,
  saving,
  onConfirm,
  onCancel,
}: {
  form: FormState
  targetCount: number
  filterCount: number
  saving: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const filterTags: string[] = []
  if (form.filter_phase) filterTags.push(`Fase: ${form.filter_phase}`)
  if (form.filter_temperature) filterTags.push(`Temp: ${form.filter_temperature}`)
  if (form.filter_funnel) filterTags.push(`Funil: ${form.filter_funnel}`)
  if (form.filter_source_type) filterTags.push(`Origem: ${form.filter_source_type}`)
  if (form.target_queixa) filterTags.push(`Queixa: ${form.target_queixa}`)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        className="luxury-card"
        style={{ padding: 24, maxWidth: 480, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--b2b-champagne)',
          }}
        >
          <ShieldCheck className="w-4 h-4" />
          Confirmar envio
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          <div>
            <Tag className="w-3 h-3 inline mr-1" />
            Filtros:{' '}
            {filterTags.length > 0 ? filterTags.join(', ') : 'Sem filtros (leads manuais)'}
          </div>
          <div>
            Leads selecionados manualmente: <b>{targetCount}</b> · Filtros ativos:{' '}
            <b>{filterCount}</b>
          </div>
          <div>
            Mensagem ({form.content.length} chars):{' '}
            <i>{form.content.slice(0, 80)}{form.content.length > 80 ? '...' : ''}</i>
          </div>
          {form.media_url && (
            <div>
              Com mídia ({form.media_position === 'below' ? 'abaixo' : 'acima'} do texto)
            </div>
          )}
          <div>
            Lote: {form.batch_size} a cada {form.batch_interval_min} min
          </div>
          <div>
            {form.schedule_mode === 'scheduled' && form.scheduled_at
              ? `Agendado para ${new Date(form.scheduled_at).toLocaleString('pt-BR')}`
              : 'Envio imediato'}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 20,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="b2b-btn"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="b2b-btn b2b-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Confirmar envio
          </button>
        </div>
      </div>
    </div>
  )
}
