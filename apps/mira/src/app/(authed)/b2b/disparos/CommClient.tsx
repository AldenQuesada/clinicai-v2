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
  useEffect,
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
  listSequencesAction,
  reorderTemplateAction,
  assignToSequenceAction,
  renameSequenceAction,
  upsertEventKeyAction,
} from './actions'
import { useRouter } from 'next/navigation'
import type {
  B2BCommTemplateRaw,
  B2BCommTemplateDTO,
  B2BCommTemplateSequenceGroup,
  B2BCommEventCatalog,
  B2BCommStats,
  B2BCommHistoryEntry,
} from '@clinicai/repositories'
import { EmptyState } from '@clinicai/ui'

// Mig cleanup 2026-04-26: Eventos + Templates mergeados em "Catálogo".
// Mig cleanup 2026-04-27: tab Metricas (KPIs antes na sidebar lateral).
type TabId = 'catalog' | 'metrics' | 'sequences' | 'history' | 'config'

const TABS: { id: TabId; label: string }[] = [
  { id: 'catalog', label: 'Catálogo' },
  { id: 'metrics', label: 'Métricas' },
  { id: 'sequences', label: 'Sequências' },
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
  initialSequences,
}: {
  initialTemplates: B2BCommTemplateRaw[]
  catalog: B2BCommEventCatalog
  stats: B2BCommStats | null
  initialHistory: B2BCommHistoryEntry[]
  initialSequences: B2BCommTemplateSequenceGroup[]
}) {
  const [templates, setTemplates] = useState<B2BCommTemplateRaw[]>(initialTemplates)
  const [stats, setStats] = useState<B2BCommStats | null>(initialStats)
  const [history, setHistory] = useState<B2BCommHistoryEntry[]>(initialHistory)
  const [historyLoaded, setHistoryLoaded] = useState<boolean>(initialHistory.length > 0)
  const [sequences, setSequences] = useState<B2BCommTemplateSequenceGroup[]>(initialSequences)
  const [sequencesLoaded, setSequencesLoaded] = useState<boolean>(initialSequences.length > 0)

  const [activeTab, setActiveTab] = useState<TabId>('catalog')
  const [filterEventKey, setFilterEventKey] = useState<string | null>(null)
  // Mig 800-41 · bucket filter ('all' = sem filtro)
  // Default 'parceiros' · bucket mais usado · evita estado vazio inicial
  const [bucketFilter, setBucketFilter] = useState<string>('parceiros')
  // Mig 800-41 · modal de criar event_key custom
  const [showNewEvent, setShowNewEvent] = useState<boolean>(false)
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditorDraft | null>(null)
  const [previewHistory, setPreviewHistory] = useState<B2BCommHistoryEntry | null>(null)

  // Mapa event_key -> bucket (computed do catalog) · usado pra filtrar
  // listas em todas as tabs.
  const eventKeyToBucket = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of catalog) {
      const groupBucket = g.bucket || 'parceiros'
      for (const ev of g.events) {
        m.set(ev.key, ev.bucket || groupBucket)
      }
    }
    return m
  }, [catalog])

  // Catalog filtrado por bucket · alimenta tabs Events/Templates
  const filteredCatalog = useMemo(() => {
    return catalog
      .map((g) => ({
        ...g,
        events: g.events.filter((ev) => (ev.bucket || g.bucket || 'parceiros') === bucketFilter),
      }))
      .filter((g) => g.events.length > 0)
  }, [catalog, bucketFilter])

  // Counts por bucket · alimenta os chips do rail
  const bucketCounts = useMemo(() => {
    const counts: Record<string, number> = { parceiros: 0, convidadas: 0, admin: 0 }
    for (const t of templates) {
      const bucket = eventKeyToBucket.get(t.event_key) || 'parceiros'
      counts[bucket] = (counts[bucket] || 0) + 1
    }
    return counts
  }, [templates, eventKeyToBucket])

  // Templates filtrados por bucket · alimenta tab Templates
  const filteredTemplates = useMemo(() => {
    return templates.filter(
      (t) => (eventKeyToBucket.get(t.event_key) || 'parceiros') === bucketFilter,
    )
  }, [templates, bucketFilter, eventKeyToBucket])

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

  const reloadSequences = useCallback(async () => {
    try {
      const s = await listSequencesAction()
      setSequences(s)
      setSequencesLoaded(true)
    } catch {
      setSequences([])
      setSequencesLoaded(true)
    }
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
      if (tab === 'sequences' && !sequencesLoaded) {
        void reloadSequences()
      }
    },
    [editing, historyLoaded, sequencesLoaded, reloadSequences],
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
      if (sequencesLoaded) void reloadSequences()
    },
    [refreshStats, sequencesLoaded, reloadSequences],
  )

  const handleDeleted = useCallback(
    (id: string) => {
      setTemplates((prev) => prev.filter((x) => x.id !== id))
      setSelectedId((cur) => (cur === id ? null : cur))
      setEditing(null)
      void refreshStats()
      if (sequencesLoaded) void reloadSequences()
    },
    [refreshStats, sequencesLoaded, reloadSequences],
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
    <div className="bcomm-wrap" style={{ display: 'flex', gap: 0 }}>
      {/* Stats sidebar removida (Alden 2026-04-27 · KPIs viraram tab Metricas).
          Bucket rail desceu pra dentro do CatalogTab · top fica 1 linha so. */}
      <section
        className="bcomm-col bcomm-col-center"
        style={{ flex: '1 1 50%', minWidth: 0 }}
      >
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

      <aside
        className="bcomm-col bcomm-col-panel"
        style={{ flex: '1 1 50%', minWidth: 0 }}
      >
        {/* Top bar · 1 linha so · Tabs + botoes de acao */}
        <div
          className="bcomm-tabs-bar"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <nav className="bcomm-tabs" role="tablist" style={{ flex: 1 }}>
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
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                className="bcomm-btn bcomm-btn-xs"
                title="Criar novo evento (event_key) custom"
                onClick={() => setShowNewEvent(true)}
              >
                + Evento
              </button>
              <button
                type="button"
                className="bcomm-btn bcomm-btn-primary bcomm-btn-xs"
                title="Criar novo template"
                onClick={() => handleNew()}
              >
                + Template
              </button>
            </div>
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
          ) : activeTab === 'catalog' ? (
            <>
              {/* BucketRail dentro da tab Catalogo · vira sub-filtro local */}
              <BucketRail
                value={bucketFilter}
                counts={bucketCounts}
                onChange={(b) => {
                  setBucketFilter(b)
                  setFilterEventKey(null)
                }}
              />
              <CatalogTab
                catalog={filteredCatalog}
                templates={filteredTemplates}
                filterEventKey={filterEventKey}
                selectedId={selectedId}
                onSelectEvent={setFilterEventKey}
                onSelect={handleSelect}
                onEdit={handleEdit}
                onNew={handleNew}
              />
            </>
          ) : activeTab === 'metrics' ? (
            <MetricsTab stats={stats} bucketCounts={bucketCounts} templates={templates} />
          ) : activeTab === 'sequences' ? (
            <SequencesTab
              sequences={sequences}
              loaded={sequencesLoaded}
              templates={templates}
              catalog={catalog}
              selectedId={selectedId}
              bucketFilter={bucketFilter}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onReload={reloadSequences}
              onCreateNamed={(name) => {
                // Pre-cria sequencia com nome sugerido · usuario adiciona templates depois
                handleNew(name === 'voucher_followup' ? 'voucher_validity_reminder' : undefined)
              }}
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
      {showNewEvent ? (
        <NewEventModal
          defaultBucket={bucketFilter}
          onClose={() => setShowNewEvent(false)}
          onSaved={async () => {
            setShowNewEvent(false)
            // Reload server props · catalog atualiza com event novo
            router.refresh()
          }}
        />
      ) : null}
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
// MetricsTab · KPIs movidos da sidebar lateral (Alden 2026-04-27 · op A)
// ═══════════════════════════════════════════════════════════════════════
function MetricsTab({
  stats,
  bucketCounts,
  templates,
}: {
  stats: B2BCommStats | null
  bucketCounts: Record<string, number>
  templates: B2BCommTemplateRaw[]
}) {
  const st = stats || ({} as B2BCommStats)
  const rate = st.delivery_rate_30d
  const rateLabel = rate == null ? '—' : Number(rate).toFixed(1) + '%'
  const rateSub =
    st.sent_30d == null
      ? ''
      : (st.sent_30d || 0) + ' envios · ' + (st.delivered_ok_30d || 0) + ' ok'

  // Eventos sem template · gaps visiveis (calculo client-side)
  const eventsWithTemplate = new Set<string>()
  for (const t of templates) {
    if (t.is_active) eventsWithTemplate.add(t.event_key)
  }
  const totalEvents = Number(st.events_configured ?? 0)
  const gaps = Math.max(0, totalEvents - eventsWithTemplate.size)

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Section · Programa */}
      <Section title="Templates do programa">
        <div className="bcomm-stats-grid">
          <StatCard
            value={String(st.active_templates || 0)}
            label="Templates ativos"
            sub={`${totalEvents} eventos cobertos${gaps > 0 ? ` · ⚠️ ${gaps} sem template` : ''}`}
            accent
          />
          <StatCard
            value={String(st.events_configured || 0)}
            label="Eventos catalogados"
            sub="b2b_comm_event_keys"
          />
        </div>
      </Section>

      {/* Section · Volume */}
      <Section title="Volume · 30 dias">
        <div className="bcomm-stats-grid">
          <StatCard
            value={String(st.sent_30d || 0)}
            label="Enviados"
            sub={`${st.attempted_30d ?? 0} tentativas · ${st.failed_30d ?? 0} falhas`}
          />
          <StatCard value={rateLabel} label="Taxa de envio" sub={rateSub} />
          <StatCard
            value={String(st.partners_with_send_30d || 0)}
            label="Parceiras tocadas"
            sub="ao menos 1 dispatch 30d"
          />
        </div>
      </Section>

      {/* Section · Por bucket */}
      <Section title="Templates por bucket">
        <div className="bcomm-stats-grid">
          <StatCard
            value={String(bucketCounts.parceiros ?? 0)}
            label="📦 Parceiros"
            sub="recipient_role partner"
          />
          <StatCard
            value={String(bucketCounts.convidadas ?? 0)}
            label="👥 Convidadas"
            sub="recipient_role beneficiary"
          />
          <StatCard
            value={String(bucketCounts.admin ?? 0)}
            label="👨‍⚕️ Admin"
            sub="Mira → Mirian"
          />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: 'var(--b2b-text-muted, #9CA3AF)',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
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
/**
 * CatalogTab · merge de Eventos + Templates (Alden 2026-04-26 · cleanup).
 * Lista hierarquica plana · 1 nivel de tag (bucket rail) · zero chips
 * de event_key (eram o 2o nivel confuso).
 *
 * Estrutura:
 *   ▾ Group label · N eventos · M templates ativos
 *      ┃ Evento label                         · 1 template / sem template
 *      ┃   └ template row inline (quando event expandido)
 *
 * Click no evento expande inline mostrando os templates daquele event.
 * Click no template seleciona pra preview/edit.
 */
function CatalogTab({
  catalog,
  templates,
  filterEventKey,
  selectedId,
  onSelectEvent,
  onSelect,
  onEdit,
  onNew,
}: {
  catalog: B2BCommEventCatalog
  templates: B2BCommTemplateRaw[]
  filterEventKey: string | null
  selectedId: string | null
  onSelectEvent: (key: string | null) => void
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onNew: (eventKey?: string) => void
}) {
  // Counts por event_key (globais sem partnership_id)
  const counts: Record<string, number> = {}
  templates.forEach((t) => {
    if (!t.partnership_id) counts[t.event_key] = (counts[t.event_key] || 0) + 1
  })

  // Templates indexados por event_key pra render inline
  const tplByEvent: Record<string, B2BCommTemplateRaw[]> = {}
  templates.forEach((t) => {
    if (!t.partnership_id) {
      tplByEvent[t.event_key] = tplByEvent[t.event_key] || []
      tplByEvent[t.event_key].push(t)
    }
  })

  if (catalog.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--b2b-fg-2)' }}>
        Nenhum evento neste bucket.
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {catalog.map((g) => {
        const groupTplCount = g.events.reduce((acc, ev) => acc + (counts[ev.key] || 0), 0)
        const groupGapCount = g.events.filter((ev) => !counts[ev.key]).length
        return (
          <CatalogSection
            key={g.group}
            groupLabel={g.group}
            eventCount={g.events.length}
            tplCount={groupTplCount}
            gapCount={groupGapCount}
          >
            {g.events.map((ev) => {
              const evTpls = tplByEvent[ev.key] || []
              const expanded = filterEventKey === ev.key
              return (
                <CatalogEventRow
                  key={ev.key}
                  ev={ev}
                  templates={evTpls}
                  expanded={expanded}
                  selectedId={selectedId}
                  onToggle={() => onSelectEvent(expanded ? null : ev.key)}
                  onTemplateClick={onSelect}
                  onTemplateEdit={onEdit}
                  onCreateTemplate={() => onNew(ev.key)}
                />
              )
            })}
          </CatalogSection>
        )
      })}
    </div>
  )
}

/** Section header colapsavel · 1 por group_label do catalog. */
function CatalogSection({
  groupLabel,
  eventCount,
  tplCount,
  gapCount,
  children,
}: {
  groupLabel: string
  eventCount: number
  tplCount: number
  gapCount: number
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ borderTop: '1px solid var(--b2b-border)' }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          color: 'var(--b2b-fg-1)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, opacity: 0.6 }}>{collapsed ? '▸' : '▾'}</span>
          <span style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{groupLabel}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--b2b-fg-2)', fontWeight: 400 }}>
          {eventCount} eventos · {tplCount} templates
          {gapCount > 0 ? ` · ⚠️ ${gapCount} sem template` : ''}
        </span>
      </button>
      {!collapsed ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
      ) : null}
    </div>
  )
}

/** Linha de 1 evento · expande mostrando templates inline. */
function CatalogEventRow({
  ev,
  templates,
  expanded,
  selectedId,
  onToggle,
  onTemplateClick,
  onTemplateEdit,
  onCreateTemplate,
}: {
  ev: { key: string; label: string; recipient?: string }
  templates: B2BCommTemplateRaw[]
  expanded: boolean
  selectedId: string | null
  onToggle: () => void
  onTemplateClick: (id: string) => void
  onTemplateEdit: (id: string) => void
  onCreateTemplate: () => void
}) {
  const m = metaFor(ev.key)
  const tplCount = templates.length
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 14px 8px 30px',
          background: expanded ? 'rgba(201, 169, 110, 0.08)' : 'transparent',
          border: 'none',
          borderLeft: expanded ? '2px solid var(--b2b-gold)' : '2px solid transparent',
          color: 'var(--b2b-fg-0)',
          cursor: 'pointer',
          fontSize: 13,
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: m.color, fontSize: 14 }} aria-hidden>
            {m.icon}
          </span>
          <span>{ev.label || m.short}</span>
        </span>
        <span
          style={{
            fontSize: 11,
            color: tplCount > 0 ? 'var(--b2b-fg-2)' : '#dc2626',
            fontWeight: tplCount > 0 ? 400 : 500,
          }}
        >
          {tplCount > 0 ? `${tplCount} template${tplCount > 1 ? 's' : ''}` : 'sem template'}
        </span>
      </button>
      {expanded ? (
        <div
          style={{
            padding: '4px 14px 10px 50px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {templates.length > 0 ? (
            templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTemplateClick(t.id)}
                onDoubleClick={() => onTemplateEdit(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: selectedId === t.id ? 'rgba(201, 169, 110, 0.15)' : 'transparent',
                  border: '1px solid ' + (selectedId === t.id ? 'var(--b2b-gold)' : 'var(--b2b-border)'),
                  borderRadius: 4,
                  color: 'var(--b2b-fg-1)',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden>{channelIcon(t.channel)}</span>
                  <span>{t.partnership_id ? 'override' : 'global'}</span>
                  {t.is_active ? null : (
                    <span style={{ color: '#dc2626', fontSize: 10 }}>· inativo</span>
                  )}
                </span>
                <span style={{ fontSize: 10, color: 'var(--b2b-fg-2)' }}>editar →</span>
              </button>
            ))
          ) : null}
          <button
            type="button"
            onClick={onCreateTemplate}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: '1px dashed var(--b2b-gold)',
              borderRadius: 4,
              color: 'var(--b2b-gold)',
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            + Criar template para este evento
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Lista agrupada por GRUPO do catalogo (jornada parceria / voucher /
 * conversao / recorrente). Substitui o GroupedList antigo (que agrupava
 * so por event_key, sem hierarquia visual).
 */
function CatalogGroupedList({
  catalog,
  templates,
  selectedId,
  onSelect,
  onEdit,
  onNew,
}: {
  catalog: B2BCommEventCatalog
  templates: B2BCommTemplateRaw[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onNew: (eventKey: string) => void
}) {
  return (
    <>
      {catalog.map((g) => {
        // Conta total no grupo (todos eventos somados)
        const groupTotal = g.events.reduce((sum, ev) => {
          return sum + templates.filter((t) => t.event_key === ev.key && !t.partnership_id).length
        }, 0)
        return (
          <div key={g.group} className="bcomm-cat-group">
            <div className="bcomm-cat-group-hdr">
              <span className="bcomm-cat-group-name">{g.group}</span>
              <span className="bcomm-cat-group-count">
                {groupTotal} template{groupTotal === 1 ? '' : 's'}
              </span>
            </div>
            {g.events.map((ev) => {
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
          <EmptyState
            variant="comm"
            title="Nenhum template"
            message="Crie o primeiro disparo pra este evento."
          />
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
// Aba Templates · lista plana com filtros (texto, canal, escopo, GRUPO)
// ═══════════════════════════════════════════════════════════════════════
function TemplatesTab({
  templates,
  catalog,
  selectedId,
  onSelect,
  onEdit,
  onNew,
}: {
  templates: B2BCommTemplateRaw[]
  catalog: B2BCommEventCatalog
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onNew: () => void
}) {
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState<'all' | 'text' | 'audio' | 'both'>('all')
  const [scope, setScope] = useState<'all' | 'global' | 'override'>('all')
  const [group, setGroup] = useState<string>('all')

  // Mapa event_key → group (pra filtrar por grupo)
  const eventToGroup = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of catalog) for (const ev of g.events) m.set(ev.key, g.group)
    return m
  }, [catalog])

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return templates
      .filter((t) => {
        if (channel !== 'all' && t.channel !== channel) return false
        if (scope === 'global' && t.partnership_id) return false
        if (scope === 'override' && !t.partnership_id) return false
        if (group !== 'all' && eventToGroup.get(t.event_key) !== group) return false
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
  }, [templates, q, channel, scope, group, eventToGroup])

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
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          title="Grupo do catálogo"
        >
          <option value="all">Qualquer grupo</option>
          {catalog.map((g) => (
            <option key={g.group} value={g.group}>
              {g.group}
            </option>
          ))}
        </select>
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
            <EmptyState
              variant="comm"
              title="Nenhum template"
              message="Ajuste os filtros ou crie um novo."
            />
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
            <EmptyState
              variant="history"
              title="Sem envios ainda"
              message="Histórico aparece aqui conforme a Mira dispara mensagens pelos triggers B2B."
            />
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
  stats: _stats,
  onReload: _onReload,
}: {
  stats: B2BCommStats | null
  onReload: () => Promise<void>
}) {
  // stats/onReload mantidos na interface pra nao quebrar caller · usados
  // antes pelo bloco "Saude do sistema" que migrou pra tab Metricas (Alden 2026-04-27).
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

      {/* "Saúde do sistema" removida 2026-04-27 · KPIs vivem na tab Métricas
          agora. Botão recalcular vai pro footer da tab Config. */}

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
  const [linkOpen, setLinkOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
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
    setConfirmDeleteOpen(true)
  }

  function onDeleteConfirmed() {
    if (!draft.id) return
    startSaving(async () => {
      const r = await deleteCommTemplateAction(draft.id!)
      if (!r.ok) {
        setErrors({ _global: r.error || 'Falha ao excluir' })
        setConfirmDeleteOpen(false)
        return
      }
      setConfirmDeleteOpen(false)
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
        setLinkOpen(true)
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

      {linkOpen ? (
        <PromptModal
          eyebrow="Editor · inserir link"
          titleStart="Inserir"
          titleEm="link"
          subtitle="A URL será inserida na posição do cursor (texto/áudio · qual estiver focado)"
          fieldLabel="URL *"
          placeholder="https://"
          initialValue="https://"
          submitLabel="Inserir"
          onCancel={() => setLinkOpen(false)}
          onSubmit={(url) => {
            const trimmed = url.trim()
            if (trimmed && trimmed !== 'https://') insertAtCaret(trimmed)
            setLinkOpen(false)
          }}
        />
      ) : null}

      {confirmDeleteOpen ? (
        <ConfirmModal
          eyebrow="Editor · excluir"
          titleStart="Excluir"
          titleEm="disparo"
          subtitle="Essa ação não pode ser desfeita. Templates removidos param de ser disparados imediatamente."
          confirmLabel={saving ? 'Excluindo…' : 'Excluir definitivamente'}
          danger
          disabled={saving}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={onDeleteConfirmed}
        />
      ) : null}
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

// ═══════════════════════════════════════════════════════════════════════
// Aba Sequências · Mig 800-24 · agrupamento + drag-drop manual
// ═══════════════════════════════════════════════════════════════════════
function SequencesTab({
  sequences,
  loaded,
  templates,
  catalog,
  selectedId,
  bucketFilter,
  onSelect,
  onEdit,
  onReload,
  onCreateNamed,
}: {
  sequences: B2BCommTemplateSequenceGroup[]
  loaded: boolean
  templates: B2BCommTemplateRaw[]
  catalog: B2BCommEventCatalog
  selectedId: string | null
  bucketFilter: string
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onReload: () => Promise<void>
  onCreateNamed: (name: string) => void
}) {
  const [busyMsg, setBusyMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [localDrafts, setLocalDrafts] = useState<string[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)

  // Templates "soltos" no estado local (templates sem sequence_name no
  // listAll · podem nao estar em `sequences` se page.tsx nao re-fetched).
  // Preferimos `sequences` (server-fresh) quando carregado.
  const groups: B2BCommTemplateSequenceGroup[] = useMemo(() => {
    if (loaded) return sequences
    // Fallback: agrupa pelo `templates` (raw · sem sequence_name vs com)
    const named = new Map<string, B2BCommTemplateRaw[]>()
    const loose: B2BCommTemplateRaw[] = []
    for (const t of templates) {
      if (t.partnership_id) continue // sequencias so global · skip overrides
      const seq = (t.sequence_name ?? '').trim()
      if (seq) {
        const arr = named.get(seq) ?? []
        arr.push(t)
        named.set(seq, arr)
      } else {
        loose.push(t)
      }
    }
    const out: B2BCommTemplateSequenceGroup[] = []
    for (const [name, arr] of named.entries()) {
      arr.sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
      out.push({ name, templates: arr.map(rawToDtoLite) })
    }
    out.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    if (loose.length) out.push({ name: null, templates: loose.map(rawToDtoLite) })
    return out
  }, [loaded, sequences, templates])

  function handleCreateSequenceConfirm(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (groups.some((g) => g.name === trimmed)) {
      setErrorMsg('Já existe uma sequência com esse nome.')
      return
    }
    // Sequência sem template ainda · pra "materializar" no backend, o
    // usuario precisa atribuir pelo menos 1 template. Mostramos como grupo
    // virtual local na UI.
    setBusyMsg(`Sequência "${trimmed}" criada · arraste templates pra cá pra ativá-la.`)
    setTimeout(() => setBusyMsg(null), 4000)
    // Adiciona placeholder visual local
    setLocalDrafts((prev) => (prev.includes(trimmed) ? prev : prev.concat([trimmed])))
    setCreateOpen(false)
  }

  async function handleAssign(templateId: string, target: string | null) {
    setErrorMsg(null)
    const r = await assignToSequenceAction(templateId, target)
    if (!r.ok) {
      setErrorMsg(r.error || 'Falha ao atribuir')
      return
    }
    if (target) {
      setLocalDrafts((prev) => prev.filter((n) => n !== target))
    }
    await onReload()
  }

  async function handleReorder(templateId: string, newOrder: number) {
    setErrorMsg(null)
    const r = await reorderTemplateAction(templateId, newOrder)
    if (!r.ok) {
      setErrorMsg(r.error || 'Falha ao reordenar')
      return
    }
    await onReload()
  }

  async function handleRenameConfirm(oldName: string, newName: string) {
    if (!newName.trim()) return
    setErrorMsg(null)
    const r = await renameSequenceAction(oldName, newName)
    if (!r.ok) {
      setErrorMsg(
        r.error === 'name_already_exists'
          ? 'Já existe uma sequência com esse nome.'
          : r.error || 'Falha ao renomear',
      )
      return
    }
    setRenameTarget(null)
    await onReload()
  }

  const namedGroups = groups.filter((g) => g.name !== null)
  const looseGroup = groups.find((g) => g.name === null) ?? { name: null, templates: [] as B2BCommTemplateDTO[] }

  // Combina drafts locais (sem templates ainda) com namedGroups
  const draftGroups: B2BCommTemplateSequenceGroup[] = localDrafts
    .filter((n) => !namedGroups.some((g) => g.name === n))
    .map((n) => ({ name: n, templates: [] }))
  const allNamed = namedGroups.concat(draftGroups)

  // Funil pos-voucher (convidadas) · banner destaque (Alden 2026-04-26)
  const showVoucherFunnelBanner =
    bucketFilter === 'convidadas' &&
    !allNamed.some((g) => g.name === 'voucher_followup')

  return (
    <>
      {showVoucherFunnelBanner ? (
        <div
          style={{
            margin: '8px 0 12px',
            padding: '14px 16px',
            background: 'linear-gradient(180deg, rgba(201,169,110,0.08), rgba(201,169,110,0.02))',
            border: '1px solid var(--b2b-gold)',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'var(--b2b-gold)',
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Sugestão · funil pós-voucher
          </div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--b2b-fg-1)',
              margin: '0 0 10px',
              lineHeight: 1.5,
            }}
          >
            Convidada recebeu voucher mas <em>ainda não agendou</em>? A Mira pode reaquecer
            com lembretes (D+1 carinho · D+3 prova social · D+7 urgência · D-3 validade).
            Quando ela agenda, a Lara assume o atendimento.
          </p>
          <button
            type="button"
            className="bcomm-btn bcomm-btn-primary bcomm-btn-xs"
            onClick={() => onCreateNamed('voucher_followup')}
          >
            + Criar funil pós-voucher
          </button>
        </div>
      ) : null}

      <div className="bcomm-toolbar">
        <button
          type="button"
          className="bcomm-btn bcomm-btn-primary bcomm-btn-xs"
          onClick={() => setCreateOpen(true)}
        >
          + Nova sequência
        </button>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-ghost bcomm-btn-xs"
          title="Recarregar"
          onClick={() => void onReload()}
        >
          ⟳
        </button>
      </div>

      {busyMsg ? <div className="bcomm-inline-err" style={{ background: '#10B98115', color: '#065F46' }}>{busyMsg}</div> : null}
      {errorMsg ? <div className="bcomm-inline-err">{errorMsg}</div> : null}

      <div className="bcomm-list">
        {!loaded ? (
          <div className="bcomm-empty">Carregando sequências…</div>
        ) : allNamed.length === 0 && looseGroup.templates.length === 0 ? (
          <div className="bcomm-empty-lg">
            <EmptyState
              variant="comm"
              title="Nenhum template ainda"
              message="Crie templates na aba Catálogo e depois atribua a uma sequência."
            />
          </div>
        ) : (
          <>
            {allNamed.map((g) => (
              <SequenceBlock
                key={g.name ?? '__null__'}
                group={g}
                catalog={catalog}
                selectedId={selectedId}
                otherSequences={allNamed
                  .map((x) => x.name)
                  .filter((n): n is string => !!n && n !== g.name)}
                onSelect={onSelect}
                onEdit={onEdit}
                onAssign={handleAssign}
                onReorder={handleReorder}
                onRename={() => g.name && setRenameTarget(g.name)}
              />
            ))}

            {looseGroup.templates.length ? (
              <SequenceBlock
                key="__loose__"
                group={looseGroup}
                catalog={catalog}
                selectedId={selectedId}
                otherSequences={allNamed
                  .map((x) => x.name)
                  .filter((n): n is string => !!n)}
                onSelect={onSelect}
                onEdit={onEdit}
                onAssign={handleAssign}
                onReorder={handleReorder}
                onRename={null}
              />
            ) : null}
          </>
        )}
      </div>

      {createOpen ? (
        <PromptModal
          eyebrow="Sequência · nova"
          titleStart="Criar nova"
          titleEm="sequência"
          subtitle='Ex.: "Onboarding · 5 mensagens" · agrupa templates pra Mira disparar em ordem'
          fieldLabel="Nome da sequência *"
          placeholder="Onboarding · 5 mensagens"
          submitLabel="Criar sequência"
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreateSequenceConfirm}
        />
      ) : null}

      {renameTarget ? (
        <PromptModal
          eyebrow="Sequência · renomear"
          titleStart="Renomear"
          titleEm={`"${renameTarget}"`}
          subtitle="Templates atribuídos a essa sequência migram automaticamente pro novo nome"
          fieldLabel="Novo nome *"
          initialValue={renameTarget}
          submitLabel="Renomear"
          onCancel={() => setRenameTarget(null)}
          onSubmit={(v) => handleRenameConfirm(renameTarget, v)}
        />
      ) : null}
    </>
  )
}

// Converte raw → DTO-lite mínimo só pros campos usados no rendering local
function rawToDtoLite(t: B2BCommTemplateRaw): B2BCommTemplateDTO {
  return {
    id: t.id,
    clinicId: t.clinic_id,
    partnershipId: t.partnership_id,
    eventKey: t.event_key,
    channel: t.channel,
    recipientRole: t.recipient_role,
    senderInstance: t.sender_instance,
    delayMinutes: t.delay_minutes,
    cronExpr: t.cron_expr,
    textTemplate: t.text_template,
    audioScript: t.audio_script,
    ttsVoice: t.tts_voice,
    ttsInstructions: t.tts_instructions,
    isActive: t.is_active,
    priority: t.priority,
    notes: t.notes,
    sequenceName: t.sequence_name ?? null,
    sequenceOrder: t.sequence_order ?? 0,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }
}

function SequenceBlock({
  group,
  catalog,
  selectedId,
  otherSequences,
  onSelect,
  onEdit,
  onAssign,
  onReorder,
  onRename,
}: {
  group: B2BCommTemplateSequenceGroup
  catalog: B2BCommEventCatalog
  selectedId: string | null
  otherSequences: string[]
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onAssign: (id: string, target: string | null) => Promise<void>
  onReorder: (id: string, newOrder: number) => Promise<void>
  onRename: (() => void) | null
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const isLoose = group.name === null

  function onDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    setDragId(id)
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    } catch {
      // noop
    }
  }

  function onDragOverItem(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overIdx !== idx) setOverIdx(idx)
  }

  async function onDropItem(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault()
    const droppedId = dragId || e.dataTransfer.getData('text/plain')
    setDragId(null)
    setOverIdx(null)
    if (!droppedId) return

    // Se item arrastado eh externo a este grupo, vira atribuição
    const inGroup = group.templates.some((t: B2BCommTemplateDTO) => t.id === droppedId)
    if (!inGroup) {
      if (!isLoose && group.name) await onAssign(droppedId, group.name)
      return
    }
    // Reorder dentro do mesmo grupo (so faz sentido se nomeado)
    if (isLoose) return
    await onReorder(droppedId, idx)
  }

  async function onDropOnHeader(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const droppedId = dragId || e.dataTransfer.getData('text/plain')
    setDragId(null)
    setOverIdx(null)
    if (!droppedId) return
    const inGroup = group.templates.some((t: B2BCommTemplateDTO) => t.id === droppedId)
    if (inGroup) return
    if (isLoose) {
      // Drop no header do grupo "Sem sequencia" = desatribuir
      await onAssign(droppedId, null)
    } else if (group.name) {
      await onAssign(droppedId, group.name)
    }
  }

  return (
    <div
      className="bcomm-cat-group"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnHeader}
    >
      <div className="bcomm-cat-group-hdr" style={{ alignItems: 'center' }}>
        <span className="bcomm-cat-group-name">
          {isLoose ? '— Sem sequência —' : group.name}
        </span>
        <span className="bcomm-cat-group-count">
          {group.templates.length} template{group.templates.length === 1 ? '' : 's'}
        </span>
        {onRename ? (
          <button
            type="button"
            className="bcomm-btn bcomm-btn-ghost bcomm-btn-xs"
            title="Renomear sequência"
            onClick={onRename}
            style={{ marginLeft: 8 }}
          >
            ✎
          </button>
        ) : null}
      </div>

      {group.templates.length === 0 ? (
        <div className="bcomm-item-empty">
          {isLoose
            ? 'Todos os templates estão atribuídos a alguma sequência.'
            : 'Arraste templates aqui pra incluir nesta sequência.'}
        </div>
      ) : (
        group.templates.map((t: B2BCommTemplateDTO, idx: number) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => onDragStart(e, t.id)}
            onDragOver={(e) => onDragOverItem(e, idx)}
            onDrop={(e) => onDropItem(e, idx)}
            onDragEnd={() => {
              setDragId(null)
              setOverIdx(null)
            }}
            style={{
              opacity: dragId === t.id ? 0.4 : 1,
              borderTop: overIdx === idx && dragId !== t.id
                ? '2px solid var(--bcomm-accent, #C9A96E)'
                : '2px solid transparent',
              cursor: 'grab',
            }}
          >
            <SequenceItemRow
              t={t}
              idx={idx}
              isLoose={isLoose}
              active={selectedId === t.id}
              catalog={catalog}
              otherSequences={otherSequences}
              onSelect={() => onSelect(t.id)}
              onEdit={() => onEdit(t.id)}
              onAssign={(target) => onAssign(t.id, target)}
            />
          </div>
        ))
      )}
    </div>
  )
}

function SequenceItemRow({
  t,
  idx,
  isLoose,
  active,
  catalog,
  otherSequences,
  onSelect,
  onEdit,
  onAssign,
}: {
  t: B2BCommTemplateDTO
  idx: number
  isLoose: boolean
  active: boolean
  catalog: B2BCommEventCatalog
  otherSequences: string[]
  onSelect: () => void
  onEdit: () => void
  onAssign: (target: string | null) => void | Promise<void>
}) {
  const m = metaFor(t.eventKey)
  const evLbl = eventLabel(catalog, t.eventKey) || m.short
  const raw = (t.textTemplate || t.audioScript || '').toString()
  const snippet = raw.slice(0, 80)
  const hasMore = raw.length > 80

  return (
    <button
      type="button"
      className={'bcomm-item' + (active ? ' bcomm-item-active' : '')}
      onClick={onSelect}
    >
      <span
        className="bcomm-item-dot"
        style={{ background: m.color }}
        title="Arraste pra reordenar"
      >
        {!isLoose ? <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{idx + 1}</span> : null}
      </span>
      <span className="bcomm-item-body">
        <span className="bcomm-item-top">
          ⠿ {evLbl} · {senderShort(t.senderInstance)} · {delayLabel(t.delayMinutes)}
          {t.isActive ? null : <em> · pausado</em>}
        </span>
        <span className="bcomm-item-sub">
          {snippet}
          {hasMore ? '…' : ''}
        </span>
      </span>
      <select
        className="bcomm-input"
        style={{ maxWidth: 130, fontSize: 11, padding: '4px 6px' }}
        value={t.sequenceName ?? ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation()
          const v = e.target.value
          void onAssign(v ? v : null)
        }}
        title="Mover pra outra sequência"
      >
        <option value="">— sem sequência —</option>
        {t.sequenceName ? (
          <option value={t.sequenceName}>{t.sequenceName}</option>
        ) : null}
        {otherSequences.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
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
// Modais luxury · padrao b2b-overlay/b2b-modal (Onda 3 UI polish · 2026-04-26).
// Substituem prompt()/confirm() nativos no fluxo de Sequencias e Editor.
// Usam classes ja existentes em globals.css (sec b2b-modal · linhas 261-).
// ═══════════════════════════════════════════════════════════════════════

function PromptModal({
  eyebrow,
  titleStart,
  titleEm,
  subtitle,
  fieldLabel,
  placeholder,
  initialValue,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  eyebrow: string
  titleStart: string
  titleEm: string
  subtitle?: string
  fieldLabel: string
  placeholder?: string
  initialValue?: string
  submitLabel: string
  onCancel: () => void
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue ?? '')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value)
  }

  return (
    <div
      className="b2b-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        className="b2b-modal"
        style={{ maxWidth: 540 }}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
      >
        <header
          className="b2b-modal-hdr"
          style={{ paddingBottom: 16, borderBottom: '1px solid var(--b2b-border)' }}
        >
          <div style={{ flex: 1 }}>
            <div className="b2b-eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
              {eyebrow}
            </div>
            <h2
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 28,
                fontWeight: 300,
                margin: 0,
                color: 'var(--b2b-ivory)',
                lineHeight: 1.1,
              }}
            >
              {titleStart}{' '}
              <em style={{ color: 'var(--b2b-champagne)', fontWeight: 400 }}>
                {titleEm}
              </em>
            </h2>
            {subtitle ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--b2b-text-muted)',
                  marginTop: 4,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="b2b-close"
            aria-label="Fechar"
            onClick={onCancel}
          >
            ×
          </button>
        </header>

        <div className="b2b-modal-body" style={{ paddingTop: 20 }}>
          <div className="b2b-field" style={{ marginBottom: 0 }}>
            <label className="b2b-field-lbl">{fieldLabel}</label>
            <input
              ref={inputRef}
              type="text"
              className="b2b-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
            />
          </div>

          <div
            className="b2b-form-actions"
            style={{
              marginTop: 28,
              paddingTop: 16,
              borderTop: '1px solid var(--b2b-border)',
            }}
          >
            <button type="button" className="b2b-btn" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="submit"
              className="b2b-btn b2b-btn-primary"
              disabled={!value.trim()}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function ConfirmModal({
  eyebrow,
  titleStart,
  titleEm,
  subtitle,
  confirmLabel,
  danger,
  disabled,
  onCancel,
  onConfirm,
}: {
  eyebrow: string
  titleStart: string
  titleEm: string
  subtitle?: string
  confirmLabel: string
  danger?: boolean
  disabled?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !disabled) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, disabled])

  return (
    <div
      className="b2b-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !disabled) onCancel()
      }}
    >
      <div
        className="b2b-modal"
        style={{ maxWidth: 480 }}
        role="alertdialog"
        aria-modal="true"
      >
        <header
          className="b2b-modal-hdr"
          style={{ paddingBottom: 16, borderBottom: '1px solid var(--b2b-border)' }}
        >
          <div style={{ flex: 1 }}>
            <div className="b2b-eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
              {eyebrow}
            </div>
            <h2
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 28,
                fontWeight: 300,
                margin: 0,
                color: 'var(--b2b-ivory)',
                lineHeight: 1.1,
              }}
            >
              {titleStart}{' '}
              <em
                style={{
                  color: danger ? '#EF4444' : 'var(--b2b-champagne)',
                  fontWeight: 400,
                }}
              >
                {titleEm}
              </em>
            </h2>
            {subtitle ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--b2b-text-muted)',
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="b2b-close"
            aria-label="Fechar"
            onClick={onCancel}
            disabled={disabled}
          >
            ×
          </button>
        </header>

        <div className="b2b-modal-body" style={{ paddingTop: 20 }}>
          <div
            className="b2b-form-actions"
            style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}
          >
            <button
              type="button"
              className="b2b-btn"
              onClick={onCancel}
              disabled={disabled}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="b2b-btn b2b-btn-primary"
              style={
                danger
                  ? { borderColor: 'rgba(239,68,68,0.4)', color: '#EF4444' }
                  : undefined
              }
              onClick={onConfirm}
              disabled={disabled}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// BucketRail · Mig 800-41 · 4 chips no topo (Todos · Parceiros · Convidadas · Admin)
// Filtra todas as tabs simultaneamente. Counts vem dos templates ativos.
// ═══════════════════════════════════════════════════════════════════════
const BUCKETS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'parceiros', label: 'Parceiros', icon: '📦' },
  { id: 'convidadas', label: 'Convidadas', icon: '👥' },
  { id: 'admin', label: 'Admin', icon: '👨‍⚕️' },
]

function BucketRail({
  value,
  counts,
  onChange,
  actions,
}: {
  value: string
  counts: Record<string, number>
  onChange: (bucket: string) => void
  actions?: React.ReactNode
}) {
  return (
    <div
      className="bcomm-bucket-rail"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--b2b-border)',
        background: 'var(--b2b-bg-1)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {BUCKETS.map((b) => {
          const active = value === b.id
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange(b.id)}
              className={'bcomm-bucket-chip' + (active ? ' is-active' : '')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                // Cores explicitas (sem CSS var) · evita "preto invisivel" quando
                // var nao carrega em algum contexto (Alden 2026-04-27).
                border: '1px solid ' + (active ? '#C9A96E' : 'rgba(201,169,110,0.25)'),
                background: active ? '#C9A96E' : 'transparent',
                color: active ? '#0F0D0A' : '#F5F0E8',
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              title={`Filtrar por bucket · ${b.label}`}
              aria-pressed={active}
            >
              <span aria-hidden>{b.icon}</span>
              <span>{b.label}</span>
              <span
                style={{
                  opacity: 0.7,
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {counts[b.id] ?? 0}
              </span>
            </button>
          )
        })}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{actions}</div> : null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// NewEventModal · Mig 800-41 · cria event_key custom on-the-fly
// "Zero estrutura rigida" · usuario adiciona events sem mig.
// ═══════════════════════════════════════════════════════════════════════
function NewEventModal({
  defaultBucket,
  onClose,
  onSaved,
}: {
  defaultBucket: string
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [bucket, setBucket] = useState<string>(defaultBucket || 'parceiros')
  const [groupLabel, setGroupLabel] = useState<string>('Outros')
  const [recipientRole, setRecipientRole] = useState<string>(
    defaultBucket === 'convidadas' ? 'beneficiary' : defaultBucket === 'admin' ? 'admin' : 'partner',
  )
  const [triggerDesc, setTriggerDesc] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const KEY_RX = /^[a-z][a-z0-9_]*$/
  const keyValid = KEY_RX.test(key)
  const canSubmit = keyValid && label.trim().length > 0 && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await upsertEventKeyAction({
        key: key.trim(),
        label: label.trim(),
        bucket,
        groupLabel: groupLabel.trim() || 'Outros',
        recipientRole,
        triggerDesc: triggerDesc.trim() || null,
      })
      if (!r.ok) {
        setError(r.error || 'Falha ao criar evento')
        setSubmitting(false)
        return
      }
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
  const lblStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--b2b-fg-1)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }
  const hintStyle: React.CSSProperties = { fontSize: 10, color: 'var(--b2b-fg-2)' }

  return (
    <div
      className="b2b-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ alignItems: 'center' }}
    >
      <div className="b2b-modal" style={{ maxWidth: 540, width: 'calc(100vw - 40px)' }}>
        <div style={{ padding: '24px 28px 12px' }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'var(--b2b-gold)',
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Catálogo · novo evento
          </div>
          <h2
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: 28,
              fontWeight: 500,
              color: 'var(--b2b-fg-0)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Adicionar <em style={{ color: 'var(--b2b-gold)', fontStyle: 'italic' }}>event_key</em> custom
          </h2>
          <p style={{ fontSize: 12, color: 'var(--b2b-fg-2)', margin: '6px 0 0' }}>
            Cria evento novo no catálogo · permite testes sem mig de DB.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '0 28px 24px' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={fieldStyle}>
              <span style={lblStyle}>
                Chave <span style={{ color: 'var(--b2b-gold)' }}>*</span>
              </span>
              <input
                type="text"
                className="b2b-input"
                placeholder="ex: voucher_test_a"
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                style={key && !keyValid ? { borderColor: '#dc2626' } : undefined}
                autoFocus
              />
              <span style={hintStyle}>snake_case · só [a-z0-9_] · começa com letra</span>
            </label>

            <label style={fieldStyle}>
              <span style={lblStyle}>
                Label <span style={{ color: 'var(--b2b-gold)' }}>*</span>
              </span>
              <input
                type="text"
                className="b2b-input"
                placeholder="ex: Voucher · variante A/B"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={fieldStyle}>
                <span style={lblStyle}>Bucket</span>
                <select
                  className="b2b-input"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                >
                  <option value="parceiros">Parceiros</option>
                  <option value="convidadas">Convidadas</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span style={lblStyle}>Recipient role</span>
                <select
                  className="b2b-input"
                  value={recipientRole}
                  onChange={(e) => setRecipientRole(e.target.value)}
                >
                  <option value="partner">partner</option>
                  <option value="beneficiary">beneficiary</option>
                  <option value="admin">admin</option>
                </select>
              </label>
            </div>

            <label style={fieldStyle}>
              <span style={lblStyle}>Group · subcategoria visual</span>
              <input
                type="text"
                className="b2b-input"
                placeholder="ex: Voucher · ciclo"
                value={groupLabel}
                onChange={(e) => setGroupLabel(e.target.value)}
              />
            </label>

            <label style={fieldStyle}>
              <span style={lblStyle}>Quando dispara (opcional)</span>
              <textarea
                className="b2b-input"
                rows={2}
                placeholder="ex: A/B test · 50% das parcerias ativas após D+30"
                value={triggerDesc}
                onChange={(e) => setTriggerDesc(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </label>
          </div>

          {error ? (
            <div
              role="alert"
              style={{
                marginTop: 14,
                padding: '8px 12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid var(--b2b-border)',
            }}
          >
            <button type="button" className="b2b-btn" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="b2b-btn b2b-btn-primary" disabled={!canSubmit}>
              {submitting ? 'Salvando…' : 'Criar evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
