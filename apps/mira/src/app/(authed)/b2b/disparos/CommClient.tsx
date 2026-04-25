'use client'

/**
 * CommClient · espelho 1:1 de `b2b-comm.shell.ui.js` + 7 sub-arquivos
 * (clinic-dashboard/js/b2b/ui/comm/*).
 *
 * Layout 3-col (b2b-comm.css):
 *   ┌──────────┬────────────────┬──────────────────┐
 *   │ STATS    │ PHONE PREVIEW  │ TABBED PANEL     │
 *   │ (220px)  │ (central)      │ (Eventos/Templ./ │
 *   │          │                │  Histórico/Conf.)│
 *   └──────────┴────────────────┴──────────────────┘
 *
 * Eventos do shell vanilla (`bcomm:*`) viraram callbacks/setState aqui.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  upsertCommTemplateAction,
  deleteCommTemplateAction,
  reloadCommStatsAction,
  reloadCommHistoryAction,
} from './actions'
import type {
  B2BCommTemplateRaw,
  B2BCommEventCatalog,
  B2BCommStats,
  B2BCommHistoryEntry,
} from '@clinicai/repositories'

type TabId = 'events' | 'templates' | 'history' | 'config'

const TABS: { id: TabId; label: string }[] = [
  { id: 'events', label: 'Eventos' },
  { id: 'templates', label: 'Templates' },
  { id: 'history', label: 'Histórico' },
  { id: 'config', label: 'Config' },
]

const PLACEHOLDERS = [
  '{parceira_first}',
  '{parceira}',
  '{cap}',
  '{cap_extenso}',
  '{pillar}',
  '{combo}',
  '{convidada_first}',
  '{convidada}',
  '{link}',
  '{token}',
  '{expira_em}',
  '{painel_parceira}',
  '{mes}',
  '{vouchers_mes}',
  '{vouchers_abertos}',
]

// Metadados visuais dos eventos conhecidos (b2b-comm-events-tab.ui.js)
const EV_META: Record<string, { icon: string; color: string; short: string }> = {
  b2b_partnership_welcome: { icon: '🎁', color: '#C9A96E', short: 'Boas-vindas' },
  b2b_welcome_beneficiary: { icon: '👋', color: '#C9A96E', short: 'Convidada' },
  partnership_activated: { icon: '🎁', color: '#C9A96E', short: 'Parceria ativada' },
  partnership_paused: { icon: '⏸', color: '#9CA3AF', short: 'Pausada' },
  partnership_reactivated: { icon: '🔁', color: '#10B981', short: 'Reativada' },
  partnership_closed: { icon: '🔒', color: '#6B7280', short: 'Encerrada' },
  voucher_issued_beneficiary: { icon: '🎟', color: '#C9A96E', short: 'Voucher convidada' },
  voucher_issued_partner: { icon: '🎟', color: '#C9A96E', short: 'Voucher parceira' },
  voucher_opened: { icon: '👀', color: '#3B82F6', short: 'Aberto' },
  voucher_scheduled: { icon: '📅', color: '#3B82F6', short: 'Agendou' },
  voucher_redeemed: { icon: '✅', color: '#10B981', short: 'Compareceu' },
  voucher_purchased: { icon: '💰', color: '#EAB308', short: 'Comprou' },
  voucher_expiring_3d: { icon: '⏳', color: '#F59E0B', short: 'Expira 3d' },
  voucher_expired: { icon: '⌛', color: '#6B7280', short: 'Expirou' },
  voucher_cap_reached: { icon: '🚦', color: '#EF4444', short: 'Cap mensal' },
  lead_first_budget: { icon: '🤝', color: '#14B8A6', short: 'Virou paciente' },
  monthly_report: { icon: '📊', color: '#8B5CF6', short: 'Relatório mensal' },
  quarterly_checkin: { icon: '📆', color: '#8B5CF6', short: 'Check-in tri' },
}

const CFG_PLACEHOLDERS: { key: string; desc: string }[] = [
  { key: '{parceira}', desc: 'Nome da parceria' },
  { key: '{parceira_first}', desc: 'Primeiro nome da contato_name' },
  { key: '{cap}', desc: 'Cap mensal de vouchers' },
  { key: '{cap_extenso}', desc: 'Cap por extenso (dez, cinco…)' },
  { key: '{pillar}', desc: 'Pilar da parceria (imagem, propósito…)' },
  { key: '{combo}', desc: 'voucher_combo configurado' },
  { key: '{convidada}', desc: 'Nome da beneficiária' },
  { key: '{convidada_first}', desc: 'Primeiro nome da beneficiária' },
  { key: '{link}', desc: 'Link do voucher/OG' },
  { key: '{token}', desc: 'Token de 8 chars' },
  { key: '{expira_em}', desc: '"X dias" até validade' },
  { key: '{painel_parceira}', desc: 'URL do painel individual' },
  { key: '{mes}', desc: 'Mês de referência (relatório)' },
  { key: '{vouchers_mes}', desc: 'Total de vouchers no mês' },
  { key: '{vouchers_abertos}', desc: 'Vouchers em aberto' },
]

function metaFor(key: string) {
  return EV_META[key] || { icon: '💬', color: '#6B7280', short: key }
}

function delayLabel(min: number | null | undefined): string {
  if (!min || min === 0) return 'imediato'
  if (min % 1440 === 0) return '+' + min / 1440 + 'd'
  if (min % 60 === 0) return '+' + min / 60 + 'h'
  return '+' + min + 'min'
}

function senderShort(s: string | null | undefined): string {
  if (s === 'mira-mirian') return 'Mira'
  if (s === 'Mih') return 'Lara'
  return s || '—'
}

function senderLabel(s: string | null | undefined): string {
  if (s === 'mira-mirian') return 'Mira · Clínica Mirian de Paula'
  if (s === 'Mih') return 'Lara'
  return s || 'Mira'
}

function channelIcon(ch: string): string {
  if (ch === 'audio') return '🎤'
  if (ch === 'both') return '💬🎤'
  return '💬'
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const today = new Date().toDateString() === d.toDateString()
    if (today) return hh + ':' + mm
    const dd = String(d.getDate()).padStart(2, '0')
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    return dd + '/' + mo + ' ' + hh + ':' + mm
  } catch {
    return ''
  }
}

function currentTime(): string {
  const d = new Date()
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function sampleVars(): Record<string, string> {
  return {
    parceira: 'Cazza Flor',
    parceira_first: 'Cazza',
    cap: '10',
    cap_extenso: 'dez',
    pillar: 'imagem',
    combo: 'Véu de Noiva + Anovator A5',
    convidada: 'Maria Silva',
    convidada_first: 'Maria',
    link: 'og.miriandpaula.com.br/v/abc123',
    token: 'abc12345',
    expira_em: '29 dias',
    painel_parceira: 'painel.miriandpaula.com.br',
    mes: 'Abril',
    vouchers_mes: '7',
    vouchers_abertos: '5',
  }
}

function renderPlaceholders(text: string | null | undefined): string {
  if (!text) return ''
  const vars = sampleVars()
  let out = text
  for (const k of Object.keys(vars)) {
    out = out.split('{' + k + '}').join(vars[k])
  }
  return out
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  )
}

// WhatsApp-like inline formatting → safe HTML
function waFormat(text: string): string {
  let h = escapeHtml(text)
  h = h.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  h = h.replace(/_([^_\n]+)_/g, '<em>$1</em>')
  h = h.replace(/~([^~\n]+)~/g, '<s>$1</s>')
  h = h.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>',
  )
  h = h.replace(/\n/g, '<br>')
  return h
}

function eventLabel(catalog: B2BCommEventCatalog, key: string | null | undefined): string {
  if (!key) return ''
  let label: string = key
  for (const g of catalog) {
    for (const ev of g.events) {
      if (ev.key === key) label = ev.label
    }
  }
  return label
}

function flatEvents(catalog: B2BCommEventCatalog) {
  const out: { key: string; label: string; recipient?: string }[] = []
  for (const g of catalog) for (const ev of g.events) out.push(ev)
  return out
}

// ═══════════════════════════════════════════════════════════════════════
// Editor draft type (raw snake_case · espelha state.editing do shell vanilla)
// ═══════════════════════════════════════════════════════════════════════
type EditorDraft = {
  id?: string | null
  partnership_id?: string | null
  event_key: string
  channel: 'text' | 'audio' | 'both'
  recipient_role: 'partner' | 'beneficiary' | 'admin'
  sender_instance: string
  delay_minutes: number
  priority: number
  is_active: boolean
  text_template?: string | null
  audio_script?: string | null
  tts_voice?: string | null
  tts_instructions?: string | null
  notes?: string | null
}

function draftFromTemplate(t: B2BCommTemplateRaw): EditorDraft {
  return {
    id: t.id,
    partnership_id: t.partnership_id,
    event_key: t.event_key,
    channel: t.channel,
    recipient_role: t.recipient_role,
    sender_instance: t.sender_instance,
    delay_minutes: t.delay_minutes,
    priority: t.priority,
    is_active: t.is_active,
    text_template: t.text_template,
    audio_script: t.audio_script,
    tts_voice: t.tts_voice,
    tts_instructions: t.tts_instructions,
    notes: t.notes,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Componente principal
// ═══════════════════════════════════════════════════════════════════════

export function CommClient({
  initialTemplates,
  catalog,
  stats: initialStats,
  initialHistory,
}: {
  initialTemplates: B2BCommTemplateRaw[]
  catalog: B2BCommEventCatalog
  stats: B2BCommStats | null
  initialHistory: B2BCommHistoryEntry[]
}) {
  const [templates, setTemplates] = useState<B2BCommTemplateRaw[]>(initialTemplates)
  const [stats, setStats] = useState<B2BCommStats | null>(initialStats)
  const [history, setHistory] = useState<B2BCommHistoryEntry[]>(initialHistory)
  const [historyLoaded, setHistoryLoaded] = useState<boolean>(initialHistory.length > 0)

  const [activeTab, setActiveTab] = useState<TabId>('events')
  const [filterEventKey, setFilterEventKey] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditorDraft | null>(null)
  const [previewHistory, setPreviewHistory] = useState<B2BCommHistoryEntry | null>(null)

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) || null,
    [templates, selectedId],
  )

  // ─── Handlers compartilhados ──────────────────────────────────
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setPreviewHistory(null)
  }, [])

  const handleNew = useCallback(
    (eventKey?: string) => {
      let recipient: EditorDraft['recipient_role'] = 'partner'
      if (eventKey) {
        for (const g of catalog) {
          for (const ev of g.events) {
            if (ev.key === eventKey && ev.recipient) {
              recipient = ev.recipient as EditorDraft['recipient_role']
            }
          }
        }
      }
      setEditing({
        event_key: eventKey || '',
        channel: 'text',
        recipient_role: recipient,
        sender_instance: 'mira-mirian',
        is_active: true,
        priority: 100,
        delay_minutes: 0,
      })
    },
    [catalog],
  )

  const handleEdit = useCallback(
    (id: string) => {
      const t = templates.find((x) => x.id === id)
      if (!t) return
      setEditing(draftFromTemplate(t))
    },
    [templates],
  )

  const handleEditorClose = useCallback(() => {
    setEditing(null)
  }, [])

  const handleTabChange = useCallback(
    (tab: TabId) => {
      if (editing) setEditing(null)
      setActiveTab(tab)
      if (tab !== 'history') setPreviewHistory(null)
      if (tab === 'history' && !historyLoaded) {
        reloadCommHistoryAction({ limit: 50 })
          .then((h) => {
            setHistory(h)
            setHistoryLoaded(true)
          })
          .catch(() => {
            setHistory([])
            setHistoryLoaded(true)
          })
      }
    },
    [editing, historyLoaded],
  )

  const refreshStats = useCallback(async () => {
    try {
      const s = await reloadCommStatsAction()
      setStats(s)
    } catch {
      // noop
    }
  }, [])

  const handleSaved = useCallback(
    (saved: B2BCommTemplateRaw) => {
      setTemplates((prev) => {
        const idx = prev.findIndex((x) => x.id === saved.id)
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = saved
          return next
        }
        return prev.concat([saved])
      })
      setSelectedId(saved.id)
      setEditing(null)
      void refreshStats()
    },
    [refreshStats],
  )

  const handleDeleted = useCallback(
    (id: string) => {
      setTemplates((prev) => prev.filter((x) => x.id !== id))
      setSelectedId((cur) => (cur === id ? null : cur))
      setEditing(null)
      void refreshStats()
    },
    [refreshStats],
  )

  // Source pra preview central: history override > editing > selected
  const previewSource: PreviewSource = useMemo(() => {
    if (previewHistory) {
      return {
        kind: 'history',
        id: null,
        event_key: previewHistory.event_key,
        channel: previewHistory.channel || 'text',
        recipient_role: previewHistory.recipient_role || 'partner',
        sender_instance: previewHistory.sender_instance || 'mira-mirian',
        delay_minutes: 0,
        priority: 100,
        is_active: previewHistory.status === 'sent',
        text_template: previewHistory.text_content || '',
        audio_script: null,
      }
    }
    if (editing) return { kind: 'editing', ...editing }
    if (selectedTemplate) {
      return {
        kind: 'selected',
        id: selectedTemplate.id,
        partnership_id: selectedTemplate.partnership_id,
        event_key: selectedTemplate.event_key,
        channel: selectedTemplate.channel,
        recipient_role: selectedTemplate.recipient_role,
        sender_instance: selectedTemplate.sender_instance,
        delay_minutes: selectedTemplate.delay_minutes,
        priority: selectedTemplate.priority,
        is_active: selectedTemplate.is_active,
        text_template: selectedTemplate.text_template,
        audio_script: selectedTemplate.audio_script,
        tts_voice: selectedTemplate.tts_voice,
        tts_instructions: selectedTemplate.tts_instructions,
        notes: selectedTemplate.notes,
      }
    }
    return null
  }, [previewHistory, editing, selectedTemplate])

  return (
    <div className="bcomm-wrap">
      <aside className="bcomm-col bcomm-col-stats">
        <StatsPane stats={stats} />
      </aside>

      <section className="bcomm-col bcomm-col-center">
        <PreviewPane
          source={previewSource}
          catalog={catalog}
          inEditor={!!editing}
          onEditClick={() => {
            if (selectedId) handleEdit(selectedId)
          }}
          showEditButton={!!(selectedTemplate && !editing && !previewHistory)}
        />
      </section>

      <aside className="bcomm-col bcomm-col-panel">
        <div className="bcomm-tabs-bar">
          <nav className="bcomm-tabs" role="tablist">
            {TABS.map((t) => {
              const active = !editing && activeTab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  className={
                    'bcomm-tab' +
                    (active ? ' bcomm-tab-active' : '') +
                    (editing ? ' bcomm-tab-dim' : '')
                  }
                  role="tab"
                  onClick={() => handleTabChange(t.id)}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
          {editing ? (
            <span className="bcomm-tabs-editing">Editando…</span>
          ) : (
            <button
              type="button"
              className="bcomm-btn bcomm-btn-primary bcomm-btn-xs"
              title="Criar novo template"
              onClick={() => handleNew()}
            >
              + Novo
            </button>
          )}
        </div>

        <div className="bcomm-panel-body">
          {editing ? (
            <Editor
              draft={editing}
              catalog={catalog}
              onChange={setEditing}
              onClose={handleEditorClose}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          ) : activeTab === 'events' ? (
            <EventsTab
              catalog={catalog}
              templates={templates}
              filterEventKey={filterEventKey}
              selectedId={selectedId}
              onChipClick={setFilterEventKey}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onNew={handleNew}
            />
          ) : activeTab === 'templates' ? (
            <TemplatesTab
              templates={templates}
              selectedId={selectedId}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onNew={() => handleNew()}
            />
          ) : activeTab === 'history' ? (
            <HistoryTab
              catalog={catalog}
              history={history}
              loaded={historyLoaded}
              onSelect={(h) => setPreviewHistory(h)}
              onRefresh={async () => {
                const h = await reloadCommHistoryAction({ limit: 50 })
                setHistory(h)
                setHistoryLoaded(true)
              }}
            />
          ) : (
            <ConfigTab stats={stats} onReload={refreshStats} />
          )}
        </div>
      </aside>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Stats sidebar
// ═══════════════════════════════════════════════════════════════════════
function StatsPane({ stats }: { stats: B2BCommStats | null }) {
  const st = stats || ({} as B2BCommStats)
  const rate = st.delivery_rate_30d
  const rateLabel = rate == null ? '—' : Number(rate).toFixed(1) + '%'
  const rateSub =
    st.sent_30d == null
      ? ''
      : (st.sent_30d || 0) + ' envios · ' + (st.delivered_ok_30d || 0) + ' ok'

  return (
    <div className="bcomm-stats-pane">
      <div className="bcomm-stats-hdr">Resumo</div>
      <div className="bcomm-stats-grid">
        <StatCard
          value={String(st.active_templates || 0)}
          label="Templates ativos"
          sub={(st.events_configured || 0) + ' eventos cobertos'}
          accent
        />
        <StatCard
          value={String(st.sent_30d || 0)}
          label="Enviados"
          sub="últimos 30 dias"
        />
        <StatCard value={rateLabel} label="Taxa de envio" sub={rateSub} />
        <StatCard
          value={String(st.partners_with_send_30d || 0)}
          label="Parceiras ativas"
          sub="com envio 30d"
        />
      </div>
    </div>
  )
}

function StatCard({
  value,
  label,
  sub,
  accent,
}: {
  value: string
  label: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className={'bcomm-stat-card' + (accent ? ' bcomm-stat-card-accent' : '')}>
      <div className="bcomm-stat-value">{value}</div>
      <div className="bcomm-stat-label">{label}</div>
      {sub ? <div className="bcomm-stat-sub">{sub}</div> : null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Phone preview central
// ═══════════════════════════════════════════════════════════════════════
type PreviewSource =
  | null
  | (EditorDraft & { kind: 'editing' | 'selected' | 'history' })

function PreviewPane({
  source,
  catalog,
  inEditor,
  onEditClick,
  showEditButton,
}: {
  source: PreviewSource
  catalog: B2BCommEventCatalog
  inEditor: boolean
  onEditClick: () => void
  showEditButton: boolean
}) {
  if (!source) {
    return (
      <div className="bcomm-preview-wrap">
        <div className="bcomm-phone bcomm-phone-empty">
          <div className="bcomm-phone-frame">
            <div className="bcomm-phone-notch" />
            <div className="bcomm-phone-screen">
              <div className="bcomm-preview-hint">
                <strong>Selecione um template</strong>
                <span>
                  Clique em qualquer item na aba <em>Eventos</em> ou{' '}
                  <em>Templates</em> pra ver como a mensagem chega no WhatsApp da
                  parceira.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const evLbl = eventLabel(catalog, source.event_key)
  const previewText = renderPlaceholders(source.text_template || '')
  const previewAudio = renderPlaceholders(source.audio_script || '')
  const hasAudio =
    (source.channel === 'audio' || source.channel === 'both') && previewAudio
  const time = currentTime()
  const senderName = senderLabel(source.sender_instance).split(' · ')[0]

  return (
    <div className={'bcomm-preview-wrap' + (inEditor ? ' bcomm-preview-live' : '')}>
      <div className="bcomm-preview-banner">
        <span className="bcomm-badge bcomm-badge-event">
          {evLbl || source.event_key || 'sem evento'}
        </span>
        {source.is_active === false ? (
          <span className="bcomm-badge bcomm-badge-paused">pausado</span>
        ) : (
          <span className="bcomm-badge bcomm-badge-live">ativo</span>
        )}
        {inEditor ? (
          <span className="bcomm-badge bcomm-badge-editing">live</span>
        ) : null}
        <span className="bcomm-preview-meta">
          {senderName} · {source.recipient_role || 'partner'} · delay{' '}
          {source.delay_minutes == null ? 0 : source.delay_minutes}min
        </span>
      </div>

      <div className="bcomm-phone">
        <div className="bcomm-phone-frame">
          <div className="bcomm-phone-notch" />
          <div className="bcomm-phone-screen">
            <div className="bcomm-wa-hdr">
              <span className="bcomm-wa-back">‹</span>
              <div className="bcomm-wa-avatar">M</div>
              <div className="bcomm-wa-ident">
                <span className="bcomm-wa-name">{senderName}</span>
                <span className="bcomm-wa-sub">online</span>
              </div>
              <span className="bcomm-wa-icons">📹 📞 ⋮</span>
            </div>

            <div className="bcomm-wa-chat">
              {previewText ? (
                <div className="bcomm-wa-bubble bcomm-wa-bubble-out">
                  <div
                    className="bcomm-wa-text"
                    dangerouslySetInnerHTML={{ __html: waFormat(previewText) }}
                  />
                  <div className="bcomm-wa-time">
                    {time} <span className="bcomm-wa-ticks">✓✓</span>
                  </div>
                </div>
              ) : source.channel === 'audio' ? null : (
                <div className="bcomm-wa-empty">(sem texto definido)</div>
              )}

              {hasAudio ? (
                <div className="bcomm-wa-bubble bcomm-wa-bubble-out bcomm-wa-bubble-audio">
                  <div className="bcomm-wa-audio-row">
                    <span className="bcomm-wa-play">▶</span>
                    <div className="bcomm-wa-wave">
                      {Array.from({ length: 22 }).map((_, i) => (
                        <span key={i} />
                      ))}
                    </div>
                    <span className="bcomm-wa-dur">
                      0:{Math.min(99, Math.max(8, Math.ceil(previewAudio.length / 16)))}
                    </span>
                  </div>
                  <div className="bcomm-wa-audio-script">
                    <small>{previewAudio}</small>
                  </div>
                  <div className="bcomm-wa-time">
                    {time} <span className="bcomm-wa-ticks">✓✓</span>
                  </div>
                </div>
              ) : source.channel === 'audio' || source.channel === 'both' ? (
                <div className="bcomm-wa-hint">
                  🎤 Preencha o <em>Script do áudio</em> pra ver o preview do áudio aqui
                </div>
              ) : null}
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

      {showEditButton ? (
        <div className="bcomm-preview-actions">
          <button
            type="button"
            className="bcomm-btn bcomm-btn-primary"
            onClick={onEditClick}
          >
            Editar
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Aba Eventos · chips + lista agrupada / filtrada
// ═══════════════════════════════════════════════════════════════════════
function EventsTab({
  catalog,
  templates,
  filterEventKey,
  selectedId,
  onChipClick,
  onSelect,
  onEdit,
  onNew,
}: {
  catalog: B2BCommEventCatalog
  templates: B2BCommTemplateRaw[]
  filterEventKey: string | null
  selectedId: string | null
  onChipClick: (key: string | null) => void
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onNew: (eventKey?: string) => void
}) {
  const events = flatEvents(catalog)
  const counts: Record<string, number> = {}
  templates.forEach((t) => {
    if (!t.partnership_id) counts[t.event_key] = (counts[t.event_key] || 0) + 1
  })
  const total = templates.filter((t) => !t.partnership_id).length

  return (
    <>
      <div className="bcomm-chips-row">
        <button
          type="button"
          className={'bcomm-chip' + (!filterEventKey ? ' bcomm-chip-active' : '')}
          onClick={() => onChipClick(null)}
        >
          Todos <span className="bcomm-chip-count">{total}</span>
        </button>
        {events.map((ev) => {
          const m = metaFor(ev.key)
          const on = filterEventKey === ev.key
          return (
            <button
              key={ev.key}
              type="button"
              className={'bcomm-chip' + (on ? ' bcomm-chip-active' : '')}
              style={{ ['--chip-color' as never]: m.color } as React.CSSProperties}
              onClick={() => onChipClick(ev.key)}
            >
              <span className="bcomm-chip-icon">{m.icon}</span>
              <span>{ev.label || m.short}</span>
              <span className="bcomm-chip-count">{counts[ev.key] || 0}</span>
            </button>
          )
        })}
      </div>

      <div className="bcomm-list">
        {filterEventKey ? (
          <FilteredList
            evKey={filterEventKey}
            events={events}
            templates={templates}
            selectedId={selectedId}
            onSelect={onSelect}
            onEdit={onEdit}
            onNew={onNew}
          />
        ) : (
          <GroupedList
            events={events}
            templates={templates}
            selectedId={selectedId}
            onSelect={onSelect}
            onEdit={onEdit}
            onNew={onNew}
          />
        )}
      </div>
    </>
  )
}

function GroupedList({
  events,
  templates,
  selectedId,
  onSelect,
  onEdit,
  onNew,
}: {
  events: { key: string; label: string }[]
  templates: B2BCommTemplateRaw[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onNew: (eventKey: string) => void
}) {
  return (
    <>
      {events.map((ev) => {
        const m = metaFor(ev.key)
        const tpls = templates
          .filter((t) => t.event_key === ev.key && !t.partnership_id)
          .sort((a, b) => (a.priority || 100) - (b.priority || 100))
        return (
          <div key={ev.key} className="bcomm-group">
            <div className="bcomm-group-hdr">
              <span className="bcomm-group-ico">{m.icon}</span>
              <span className="bcomm-group-lbl">{ev.label}</span>
              <button
                type="button"
                className="bcomm-btn bcomm-btn-ghost bcomm-btn-xs"
                onClick={() => onNew(ev.key)}
              >
                + Novo
              </button>
            </div>
            {tpls.length ? (
              tpls.map((t) => (
                <ItemRow
                  key={t.id}
                  t={t}
                  active={selectedId === t.id}
                  onSelect={() => onSelect(t.id)}
                  onEdit={() => onEdit(t.id)}
                />
              ))
            ) : (
              <div className="bcomm-item-empty">Sem template configurado</div>
            )}
          </div>
        )
      })}
    </>
  )
}

function FilteredList({
  evKey,
  events,
  templates,
  selectedId,
  onSelect,
  onEdit,
  onNew,
}: {
  evKey: string
  events: { key: string; label: string }[]
  templates: B2BCommTemplateRaw[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onNew: (eventKey: string) => void
}) {
  const ev = events.find((e) => e.key === evKey) || { key: evKey, label: evKey }
  const m = metaFor(ev.key)
  const tpls = templates
    .filter((t) => t.event_key === ev.key && !t.partnership_id)
    .sort((a, b) => (a.priority || 100) - (b.priority || 100))

  return (
    <>
      <div
        className="bcomm-filter-hdr"
        style={{ ['--chip-color' as never]: m.color } as React.CSSProperties}
      >
        <span className="bcomm-filter-ico">{m.icon}</span>
        <span className="bcomm-filter-lbl">{ev.label}</span>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-primary bcomm-btn-xs"
          onClick={() => onNew(ev.key)}
        >
          + Novo pra este evento
        </button>
      </div>
      {tpls.length ? (
        tpls.map((t) => (
          <ItemRow
            key={t.id}
            t={t}
            active={selectedId === t.id}
            onSelect={() => onSelect(t.id)}
            onEdit={() => onEdit(t.id)}
          />
        ))
      ) : (
        <div className="bcomm-empty-lg">
          <strong>Nenhum template</strong>
          <span>Crie o primeiro disparo pra este evento.</span>
        </div>
      )}
    </>
  )
}

function ItemRow({
  t,
  active,
  onSelect,
  onEdit,
}: {
  t: B2BCommTemplateRaw
  active: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const m = metaFor(t.event_key)
  const raw = (t.text_template || t.audio_script || '').toString()
  const snippet = raw.slice(0, 80)
  const hasMore = raw.length > 80

  return (
    <button
      type="button"
      className={'bcomm-item' + (active ? ' bcomm-item-active' : '')}
      onClick={onSelect}
    >
      <span className="bcomm-item-dot" style={{ background: m.color }} />
      <span className="bcomm-item-body">
        <span className="bcomm-item-top">
          {m.short} · {senderShort(t.sender_instance)} · {delayLabel(t.delay_minutes)}
          {t.is_active ? '' : ' · '}
          {t.is_active ? null : <em>pausado</em>}
        </span>
        <span className="bcomm-item-sub">
          {snippet}
          {hasMore ? '…' : ''}
        </span>
      </span>
      <span
        className="bcomm-item-edit"
        title="Editar"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
      >
        ✎
      </span>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Aba Templates · lista plana com filtros (texto, canal, escopo)
// ═══════════════════════════════════════════════════════════════════════
function TemplatesTab({
  templates,
  selectedId,
  onSelect,
  onEdit,
  onNew,
}: {
  templates: B2BCommTemplateRaw[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onNew: () => void
}) {
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState<'all' | 'text' | 'audio' | 'both'>('all')
  const [scope, setScope] = useState<'all' | 'global' | 'override'>('all')

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return templates
      .filter((t) => {
        if (channel !== 'all' && t.channel !== channel) return false
        if (scope === 'global' && t.partnership_id) return false
        if (scope === 'override' && !t.partnership_id) return false
        if (!ql) return true
        const hay = (
          (t.text_template || '') +
          ' ' +
          (t.audio_script || '') +
          ' ' +
          t.event_key
        ).toLowerCase()
        return hay.indexOf(ql) >= 0
      })
      .sort((a, b) => {
        const aKey = (a.event_key || '') + ' ' + (a.priority || 100)
        const bKey = (b.event_key || '') + ' ' + (b.priority || 100)
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
      })
  }, [templates, q, channel, scope])

  return (
    <>
      <div className="bcomm-toolbar">
        <input
          type="text"
          className="bcomm-input bcomm-search"
          placeholder="Buscar texto, evento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="bcomm-input"
          value={channel}
          onChange={(e) => setChannel(e.target.value as typeof channel)}
        >
          <option value="all">Qualquer canal</option>
          <option value="text">Só texto</option>
          <option value="audio">Só áudio</option>
          <option value="both">Texto + áudio</option>
        </select>
        <select
          className="bcomm-input"
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
        >
          <option value="all">Todos</option>
          <option value="global">Globais</option>
          <option value="override">Overrides</option>
        </select>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-primary bcomm-btn-xs"
          onClick={onNew}
        >
          + Novo
        </button>
      </div>

      <div className="bcomm-list">
        {rows.length ? (
          rows.map((t) => (
            <FlatItem
              key={t.id}
              t={t}
              active={selectedId === t.id}
              onSelect={() => onSelect(t.id)}
              onEdit={() => onEdit(t.id)}
            />
          ))
        ) : (
          <div className="bcomm-empty-lg">
            <strong>Nenhum template</strong>
            <span>Ajuste os filtros ou crie um novo.</span>
          </div>
        )}
      </div>

      <div className="bcomm-list-foot">
        {rows.length} de {templates.length} templates
      </div>
    </>
  )
}

function FlatItem({
  t,
  active,
  onSelect,
  onEdit,
}: {
  t: B2BCommTemplateRaw
  active: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const raw = (t.text_template || t.audio_script || '').toString()
  const snippet = raw.slice(0, 90)
  const hasMore = raw.length > 90

  return (
    <button
      type="button"
      className={'bcomm-item' + (active ? ' bcomm-item-active' : '')}
      onClick={onSelect}
    >
      <span className="bcomm-item-ico">{channelIcon(t.channel)}</span>
      <span className="bcomm-item-body">
        <span className="bcomm-item-top">
          {t.event_key}
          {t.partnership_id ? (
            <em className="bcomm-badge-override"> override</em>
          ) : null}{' '}
          · {senderShort(t.sender_instance)} · {delayLabel(t.delay_minutes)}
          {t.is_active ? null : <em> · pausado</em>}
        </span>
        <span className="bcomm-item-sub">
          {snippet}
          {hasMore ? '…' : ''}
        </span>
      </span>
      <span
        className="bcomm-item-edit"
        title="Editar"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
      >
        ✎
      </span>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Aba Histórico · lista de envios + filtro por evento
// ═══════════════════════════════════════════════════════════════════════
function HistoryTab({
  catalog,
  history,
  loaded,
  onSelect,
  onRefresh,
}: {
  catalog: B2BCommEventCatalog
  history: B2BCommHistoryEntry[]
  loaded: boolean
  onSelect: (h: B2BCommHistoryEntry | null) => void
  onRefresh: () => Promise<void>
}) {
  const [filterEvent, setFilterEvent] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const labels: Record<string, string> = {}
  for (const g of catalog) for (const ev of g.events) labels[ev.key] = ev.label
  const events = flatEvents(catalog)

  const rows = filterEvent ? history.filter((h) => h.event_key === filterEvent) : history

  return (
    <>
      <div className="bcomm-toolbar">
        <select
          className="bcomm-input"
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value)}
        >
          <option value="">Todos eventos</option>
          {events.map((ev) => (
            <option key={ev.key} value={ev.key}>
              {ev.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-ghost bcomm-btn-xs"
          title="Recarregar"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true)
            try {
              await onRefresh()
            } finally {
              setRefreshing(false)
            }
          }}
        >
          ⟳
        </button>
      </div>

      <div className="bcomm-hst-list">
        {!loaded ? (
          <div className="bcomm-empty">Carregando…</div>
        ) : rows.length ? (
          rows.map((h) => (
            <HistoryRow
              key={h.id}
              h={h}
              label={labels[h.event_key] || h.event_key}
              active={selectedId === h.id}
              onClick={() => {
                setSelectedId(h.id)
                onSelect(h)
              }}
            />
          ))
        ) : (
          <div className="bcomm-empty-lg">
            <strong>Sem envios ainda</strong>
            <span>
              Histórico aparece aqui conforme a Mira dispara mensagens pelos
              triggers B2B.
            </span>
          </div>
        )}
      </div>

      {rows.length ? (
        <div className="bcomm-list-foot">{rows.length} envios</div>
      ) : null}
    </>
  )
}

function HistoryRow({
  h,
  label,
  active,
  onClick,
}: {
  h: B2BCommHistoryEntry
  label: string
  active: boolean
  onClick: () => void
}) {
  const map: Record<string, { color: string; label: string }> = {
    sent: { color: '#10B981', label: 'Enviado' },
    failed: { color: '#EF4444', label: 'Falhou' },
    skipped: { color: '#9CA3AF', label: 'Pulado' },
  }
  const m = map[h.status] || { color: '#6B7280', label: h.status }

  return (
    <button
      type="button"
      className={'bcomm-hst-row' + (active ? ' bcomm-hst-row-active' : '')}
      onClick={onClick}
    >
      <span
        className="bcomm-hst-dot"
        style={{ background: m.color }}
        title={m.label}
      />
      <div className="bcomm-hst-body">
        <div className="bcomm-hst-top">
          <strong>{label}</strong>
          <span className="bcomm-hst-time">{fmtTime(h.created_at)}</span>
        </div>
        <div className="bcomm-hst-sub">
          {h.partnership_name || '—'}
          {h.recipient_phone ? ' · ' + h.recipient_phone : ''}
        </div>
        {h.status === 'failed' && h.error_message ? (
          <div className="bcomm-hst-err">{h.error_message.slice(0, 120)}</div>
        ) : null}
      </div>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Aba Config · info read-only + variáveis + formatação
// ═══════════════════════════════════════════════════════════════════════
function ConfigTab({
  stats,
  onReload,
}: {
  stats: B2BCommStats | null
  onReload: () => Promise<void>
}) {
  const st = stats || ({} as B2BCommStats)
  const [busy, setBusy] = useState(false)

  return (
    <div className="bcomm-cfg">
      <div className="bcomm-cfg-section">
        <h4>Origem dos disparos</h4>
        <div className="bcomm-cfg-row">
          <span>Instância Evolution</span>
          <strong>mira-mirian</strong>
        </div>
        <div className="bcomm-cfg-row">
          <span>Edge function</span>
          <strong>b2b-comm-dispatch</strong>
        </div>
        <div className="bcomm-cfg-row">
          <span>Logs em</span>
          <strong>b2b_comm_dispatch_log</strong>
        </div>
      </div>

      <div className="bcomm-cfg-section">
        <h4>Saúde do sistema</h4>
        <div className="bcomm-cfg-row">
          <span>Templates ativos</span>
          <strong>{st.active_templates || 0}</strong>
        </div>
        <div className="bcomm-cfg-row">
          <span>Eventos cobertos</span>
          <strong>{st.events_configured || 0}</strong>
        </div>
        <div className="bcomm-cfg-row">
          <span>Enviados (30d)</span>
          <strong>{st.sent_30d || 0}</strong>
        </div>
        <div className="bcomm-cfg-row">
          <span>Taxa entrega (30d)</span>
          <strong>
            {st.delivery_rate_30d == null ? '—' : st.delivery_rate_30d + '%'}
          </strong>
        </div>
        <div className="bcomm-cfg-row">
          <button
            type="button"
            className="bcomm-btn bcomm-btn-ghost bcomm-btn-xs"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onReload()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? '…' : 'Recalcular'}
          </button>
        </div>
      </div>

      <div className="bcomm-cfg-section">
        <h4>Variáveis disponíveis</h4>
        <div className="bcomm-cfg-vars">
          {CFG_PLACEHOLDERS.map((p) => (
            <div key={p.key} className="bcomm-cfg-var">
              <code>{p.key}</code>
              <span>{p.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bcomm-cfg-section">
        <h4>Formatação WhatsApp</h4>
        <div className="bcomm-cfg-fmt">
          <div>
            <code>*negrito*</code> → <strong>negrito</strong>
          </div>
          <div>
            <code>_itálico_</code> → <em>itálico</em>
          </div>
          <div>
            <code>~tachado~</code> → <s>tachado</s>
          </div>
          <div>
            <code>https://…</code> → clicável
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Editor inline · substitui aba ativa quando state.editing != null
// ═══════════════════════════════════════════════════════════════════════
function Editor({
  draft,
  catalog,
  onChange,
  onClose,
  onSaved,
  onDeleted,
}: {
  draft: EditorDraft
  catalog: B2BCommEventCatalog
  onChange: (d: EditorDraft) => void
  onClose: () => void
  onSaved: (saved: B2BCommTemplateRaw) => void
  onDeleted: (id: string) => void
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, startSaving] = useTransition()
  const [lastFocused, setLastFocused] = useState<'text_template' | 'audio_script'>(
    'text_template',
  )
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const audioRef = useRef<HTMLTextAreaElement | null>(null)

  const isNew = !draft.id
  const showAudio = draft.channel === 'audio' || draft.channel === 'both'

  function patch<K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) {
    onChange({ ...draft, [key]: value })
  }

  function validate(payload: EditorDraft): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!payload.event_key) errs.event_key = 'Escolha um evento da lista'
    if (payload.channel !== 'audio' && !payload.text_template) {
      errs.text_template = 'Texto obrigatório pra este canal'
    }
    if (
      (payload.channel === 'audio' || payload.channel === 'both') &&
      !payload.audio_script
    ) {
      if (payload.channel === 'audio') {
        errs.audio_script = 'Script obrigatório pra canal só áudio'
      }
    }
    return errs
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate(draft)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    startSaving(async () => {
      const payload = { ...draft, id: draft.id ?? null }
      const r = await upsertCommTemplateAction(payload)
      if (!r.ok) {
        setErrors({ _global: r.error || 'Falha ao salvar' })
        return
      }
      const savedId = r.id || draft.id || crypto.randomUUID()
      const saved: B2BCommTemplateRaw = {
        id: savedId,
        clinic_id: '',
        partnership_id: draft.partnership_id ?? null,
        event_key: draft.event_key,
        channel: draft.channel,
        recipient_role: draft.recipient_role,
        sender_instance: draft.sender_instance,
        delay_minutes: draft.delay_minutes,
        cron_expr: null,
        text_template: draft.text_template ?? null,
        audio_script: draft.audio_script ?? null,
        tts_voice: draft.tts_voice ?? null,
        tts_instructions: draft.tts_instructions ?? null,
        is_active: draft.is_active,
        priority: draft.priority,
        notes: draft.notes ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      onSaved(saved)
    })
  }

  function onDelete() {
    if (!draft.id) return
    if (!confirm('Excluir esse disparo?')) return
    startSaving(async () => {
      const r = await deleteCommTemplateAction(draft.id!)
      if (!r.ok) {
        setErrors({ _global: r.error || 'Falha ao excluir' })
        return
      }
      onDeleted(draft.id!)
    })
  }

  function getActiveTextarea(): HTMLTextAreaElement | null {
    return lastFocused === 'audio_script' ? audioRef.current : textRef.current
  }

  function wrap(prefix: string, suffix?: string) {
    const ta = getActiveTextarea()
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = ta.value.slice(start, end)
    const placeholder = sel || 'texto'
    const v = ta.value
    const sfx = suffix == null ? prefix : suffix
    const next = v.slice(0, start) + prefix + placeholder + sfx + v.slice(end)
    if (lastFocused === 'audio_script') patch('audio_script', next)
    else patch('text_template', next)
    requestAnimationFrame(() => {
      ta.focus()
      if (!sel) {
        ta.selectionStart = start + prefix.length
        ta.selectionEnd = start + prefix.length + placeholder.length
      } else {
        ta.selectionStart = ta.selectionEnd = start + prefix.length + sel.length + sfx.length
      }
    })
  }

  function insertAtCaret(text: string) {
    const ta = getActiveTextarea()
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const v = ta.value
    const next = v.slice(0, start) + text + v.slice(end)
    if (lastFocused === 'audio_script') patch('audio_script', next)
    else patch('text_template', next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + text.length
    })
  }

  function applyFormat(action: string) {
    switch (action) {
      case 'bold':
        wrap('*')
        break
      case 'italic':
        wrap('_')
        break
      case 'strike':
        wrap('~')
        break
      case 'mono':
        wrap('```')
        break
      case 'link': {
        const url = prompt('URL:', 'https://')
        if (url) insertAtCaret(url)
        break
      }
      case 'newline':
        insertAtCaret('\n')
        break
      case 'bullet':
        insertAtCaret('\n• ')
        break
    }
  }

  return (
    <form className="bcomm-editor" onSubmit={onSubmit} autoComplete="off" noValidate>
      <div className="bcomm-editor-hdr">
        <strong>{isNew ? 'Novo disparo' : 'Editando disparo'}</strong>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-ghost bcomm-btn-xs"
          onClick={onClose}
        >
          ← Voltar
        </button>
      </div>

      {errors._global ? (
        <div className="bcomm-inline-err">{errors._global}</div>
      ) : null}

      <label className="bcomm-field">
        <span className="bcomm-field-lbl">
          Evento <span className="bcomm-req">*</span>
        </span>
        <select
          name="event_key"
          className={'bcomm-input' + (errors.event_key ? ' bcomm-input-err' : '')}
          required
          value={draft.event_key || ''}
          onChange={(e) => patch('event_key', e.target.value)}
        >
          <option value="">— Escolha um evento —</option>
          {catalog.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.events.map((ev) => (
                <option key={ev.key} value={ev.key}>
                  {ev.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {errors.event_key ? (
          <div className="bcomm-inline-err">{errors.event_key}</div>
        ) : null}
      </label>

      <div className="bcomm-grid-2">
        <label className="bcomm-field">
          <span className="bcomm-field-lbl">Canal</span>
          <select
            className="bcomm-input"
            value={draft.channel}
            onChange={(e) => patch('channel', e.target.value as EditorDraft['channel'])}
          >
            <option value="text">Só texto</option>
            <option value="audio">Só áudio</option>
            <option value="both">Texto + áudio</option>
          </select>
        </label>
        <label className="bcomm-field">
          <span className="bcomm-field-lbl">Destinatária</span>
          <select
            className="bcomm-input"
            value={draft.recipient_role}
            onChange={(e) =>
              patch('recipient_role', e.target.value as EditorDraft['recipient_role'])
            }
          >
            <option value="partner">Parceira</option>
            <option value="beneficiary">Convidada</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>

      <div className="bcomm-grid-2">
        <label className="bcomm-field">
          <span className="bcomm-field-lbl">Enviar por</span>
          <select
            className="bcomm-input"
            value={draft.sender_instance}
            onChange={(e) => patch('sender_instance', e.target.value)}
          >
            <option value="mira-mirian">Mira</option>
            <option value="Mih">Lara</option>
          </select>
        </label>
        <label className="bcomm-field">
          <span className="bcomm-field-lbl">Delay (minutos)</span>
          <input
            type="number"
            className="bcomm-input"
            min={0}
            value={draft.delay_minutes ?? 0}
            onChange={(e) => patch('delay_minutes', Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="bcomm-grid-2">
        <label className="bcomm-field">
          <span className="bcomm-field-lbl">Prioridade</span>
          <input
            type="number"
            className="bcomm-input"
            min={1}
            value={draft.priority || 100}
            onChange={(e) => patch('priority', Number(e.target.value) || 100)}
          />
        </label>
        <label className="bcomm-field bcomm-field-toggle">
          <input
            type="checkbox"
            checked={draft.is_active !== false}
            onChange={(e) => patch('is_active', e.target.checked)}
          />
          <span>Ativo (desmarque pra pausar esse disparo)</span>
        </label>
      </div>

      <div className="bcomm-placeholders">
        <span className="bcomm-field-lbl">
          Variáveis <small>(clique pra inserir no campo de texto ativo)</small>
        </span>
        <div className="bcomm-pl-row">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p}
              type="button"
              className="bcomm-pl"
              onClick={() => insertAtCaret(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="bcomm-field">
        <span className="bcomm-field-lbl">
          Texto da mensagem{' '}
          {draft.channel === 'audio' ? (
            <small>(opcional — canal é só áudio)</small>
          ) : (
            <span className="bcomm-req">*</span>
          )}
        </span>
        <FormatBar onAction={applyFormat} />
        <textarea
          ref={textRef}
          name="text_template"
          className={
            'bcomm-input bcomm-textarea' +
            (errors.text_template ? ' bcomm-input-err' : '')
          }
          rows={7}
          placeholder="Ex: Oi *{parceira_first}*, gerei seu voucher de cortesia pra essa semana 💛"
          value={draft.text_template || ''}
          onFocus={() => setLastFocused('text_template')}
          onChange={(e) => patch('text_template', e.target.value)}
        />
        {errors.text_template ? (
          <div className="bcomm-inline-err">{errors.text_template}</div>
        ) : null}
      </div>

      {showAudio ? (
        <div className="bcomm-field">
          <span className="bcomm-field-lbl">
            Script do áudio{' '}
            {draft.channel === 'audio' ? (
              <span className="bcomm-req">*</span>
            ) : (
              <small>(opcional)</small>
            )}
          </span>
          <FormatBar onAction={applyFormat} />
          <textarea
            ref={audioRef}
            name="audio_script"
            className={
              'bcomm-input bcomm-textarea' +
              (errors.audio_script ? ' bcomm-input-err' : '')
            }
            rows={5}
            placeholder="Script pra TTS converter em áudio natural"
            value={draft.audio_script || ''}
            onFocus={() => setLastFocused('audio_script')}
            onChange={(e) => patch('audio_script', e.target.value)}
          />
          {errors.audio_script ? (
            <div className="bcomm-inline-err">{errors.audio_script}</div>
          ) : null}
        </div>
      ) : null}

      {showAudio ? (
        <div className="bcomm-grid-2">
          <label className="bcomm-field">
            <span className="bcomm-field-lbl">Voz TTS</span>
            <select
              className="bcomm-input"
              value={draft.tts_voice || 'nova'}
              onChange={(e) => patch('tts_voice', e.target.value)}
            >
              {['nova', 'shimmer', 'alloy', 'onyx', 'fable', 'echo'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="bcomm-field">
            <span className="bcomm-field-lbl">Instruções TTS</span>
            <input
              type="text"
              className="bcomm-input"
              placeholder="Tom, ritmo, emoção"
              value={draft.tts_instructions || ''}
              onChange={(e) => patch('tts_instructions', e.target.value)}
            />
          </label>
        </div>
      ) : null}

      <label className="bcomm-field">
        <span className="bcomm-field-lbl">
          Notas internas <small>(não aparece pra parceira)</small>
        </span>
        <input
          type="text"
          className="bcomm-input"
          value={draft.notes || ''}
          onChange={(e) => patch('notes', e.target.value)}
        />
      </label>

      <div className="bcomm-editor-actions">
        <button
          type="button"
          className="bcomm-btn bcomm-btn-ghost"
          onClick={onClose}
          disabled={saving}
        >
          Cancelar
        </button>
        {!isNew ? (
          <button
            type="button"
            className="bcomm-btn bcomm-btn-danger"
            onClick={onDelete}
            disabled={saving}
          >
            Excluir
          </button>
        ) : null}
        <div style={{ flex: 1 }} />
        <button
          type="submit"
          className="bcomm-btn bcomm-btn-primary"
          disabled={saving}
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

function FormatBar({ onAction }: { onAction: (action: string) => void }) {
  const btn = (action: string, title: string, label: React.ReactNode) => (
    <button
      type="button"
      className="bcomm-fmt-btn"
      title={title}
      onClick={() => onAction(action)}
    >
      {label}
    </button>
  )
  return (
    <div className="bcomm-fmt-bar">
      {btn('bold', 'Negrito (*texto*)', <strong>B</strong>)}
      {btn('italic', 'Itálico (_texto_)', <em>I</em>)}
      {btn('strike', 'Tachado (~texto~)', <s>S</s>)}
      {btn('mono', 'Monoespaçado (```texto```)', '`')}
      <span className="bcomm-fmt-sep" />
      {btn('link', 'Inserir link', '🔗')}
      {btn('newline', 'Quebra de linha', '↵')}
      {btn('bullet', 'Lista com marcadores', '•')}
    </div>
  )
}
