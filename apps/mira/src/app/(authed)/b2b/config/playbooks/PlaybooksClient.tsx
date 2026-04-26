'use client'

/**
 * PlaybooksClient · 3 cards editaveis (1 por kind: prospect_to_active /
 * retention / renewal) com tasks/contents/metas em sections expandiveis.
 *
 * Save por template · chama savePlaybookTemplateAction(payload) que upserta
 * + revalida /b2b/config/playbooks + /partnerships (apply usa template default).
 *
 * Espelho de TiersClient + FunnelClient · mesmo visual tom-em-tom (border-left
 * colorido por kind, bcomm-input, bcomm-btn, savedFlash, badge "nao salvo").
 *
 * UX:
 *   - Header explica que templates sao aplicados via "+ Aplicar Playbook" em
 *     /partnerships/[id] (botao vive na tab "Crescer").
 *   - 3 sections expandiveis (tasks/contents/metas) com add/remove inline.
 *   - is_default e mantido pelo backend (RPC zera demais defaults da kind).
 *   - Campos: title, days_offset (tasks), kind (contents/metas), schedule (contents),
 *     owner_role (tasks), target (metas).
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type {
  PlaybookKind,
  PlaybookTaskTemplate,
  PlaybookContentTemplate,
  PlaybookMetaTemplate,
} from '@clinicai/repositories'
import { savePlaybookTemplateAction } from './actions'

export interface PlaybookDraft {
  kind: PlaybookKind
  name: string
  description: string
  tasks: PlaybookTaskTemplate[]
  contents: PlaybookContentTemplate[]
  metas: PlaybookMetaTemplate[]
  isDefault: boolean
  persisted: boolean
}

const KIND_META: Record<
  PlaybookKind,
  { title: string; sub: string; color: string; iconLabel: string }
> = {
  prospect_to_active: {
    title: 'Onboarding · Prospect → Ativa',
    sub: 'Aplicado quando uma parceria recem cadastrada vira ativa · primeiros 30 dias.',
    color: '#10B981',
    iconLabel: '🌱',
  },
  retention: {
    title: 'Retenção · Resgate de risco',
    sub: 'Aplicado quando a saúde da parceria cai pra amarela/vermelha.',
    color: '#F59E0B',
    iconLabel: '🛟',
  },
  renewal: {
    title: 'Renovação · 12 meses',
    sub: 'Sequência 60d antes do fim do contrato pra renovar com upgrade.',
    color: '#C9A96E',
    iconLabel: '🔁',
  },
}

const CONTENT_KINDS: PlaybookContentTemplate['kind'][] = [
  'post',
  'story',
  'reels',
  'email',
  'wa_broadcast',
]

const META_KIND_META: Record<
  PlaybookMetaTemplate['kind'],
  { label: string; unit: string }
> = {
  vouchers_month: { label: 'Vouchers / mês', unit: 'un.' },
  conversion_pct: { label: 'Conversão', unit: '%' },
  nps_min: { label: 'NPS mínimo', unit: 'pts' },
  contents_month: { label: 'Conteúdos / mês', unit: 'un.' },
}

const OWNER_ROLES = ['owner', 'account_manager', 'social_media', 'recepcao']

export function PlaybooksClient({
  initialTemplates,
}: {
  initialTemplates: PlaybookDraft[]
}) {
  return (
    <div className="bcfg-body flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <p className="bcfg-hint" style={{ flex: 1, minWidth: 280 }}>
          Templates de playbook aplicados quando admin clica{' '}
          <strong style={{ color: '#C9A96E' }}>+ Aplicar Playbook</strong> em
          uma parceria (tab <em>Crescer</em>). Cada parceria pode receber 1 dos
          3 kinds: <strong>onboarding</strong>, <strong>retenção</strong> ou{' '}
          <strong>renovação</strong> · idempotente (skip de tasks/contents
          duplicados).
        </p>
        <Link
          href="/partnerships"
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            padding: '4px 8px',
            borderRadius: 999,
            background: 'rgba(201, 169, 110, 0.12)',
            color: '#C9A96E',
            border: '1px solid rgba(201, 169, 110, 0.3)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
          title="Apply vive em cada parceria · /partnerships/[id] tab Crescer"
        >
          aplicado em /partnerships →
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {initialTemplates.map((t) => (
          <PlaybookCard key={t.kind} initial={t} />
        ))}
      </div>

      <PlaybooksStyles />
    </div>
  )
}

function PlaybookCard({ initial }: { initial: PlaybookDraft }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<PlaybookDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [openSection, setOpenSection] = useState<
    null | 'tasks' | 'contents' | 'metas'
  >('tasks')

  const meta = KIND_META[draft.kind]

  function patch<K extends keyof PlaybookDraft>(
    key: K,
    value: PlaybookDraft[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function reset() {
    setDraft(initial)
    setError(null)
  }

  function save() {
    setError(null)
    if (!draft.name.trim() || draft.name.trim().length < 2) {
      setError('Nome do template obrigatorio (min 2 chars)')
      return
    }
    startTransition(async () => {
      try {
        const r = await savePlaybookTemplateAction({
          kind: draft.kind,
          name: draft.name.trim(),
          description: draft.description?.trim() || null,
          tasks: draft.tasks,
          contents: draft.contents,
          metas: draft.metas,
          isDefault: draft.isDefault,
        })
        if (!r.ok) {
          setError(r.error || 'Falha ao salvar')
          return
        }
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 1800)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const dirty =
    draft.name !== initial.name ||
    draft.description !== initial.description ||
    draft.isDefault !== initial.isDefault ||
    JSON.stringify(draft.tasks) !== JSON.stringify(initial.tasks) ||
    JSON.stringify(draft.contents) !== JSON.stringify(initial.contents) ||
    JSON.stringify(draft.metas) !== JSON.stringify(initial.metas)

  // ── Tasks helpers ────────────────────────────────────────────────────
  function addTask() {
    patch('tasks', [
      ...draft.tasks,
      { title: '', days_offset: 0, owner_role: 'account_manager' },
    ])
  }
  function patchTask(idx: number, partial: Partial<PlaybookTaskTemplate>) {
    const next = draft.tasks.map((t, i) => (i === idx ? { ...t, ...partial } : t))
    patch('tasks', next)
  }
  function removeTask(idx: number) {
    patch('tasks', draft.tasks.filter((_, i) => i !== idx))
  }

  // ── Contents helpers ─────────────────────────────────────────────────
  function addContent() {
    patch('contents', [
      ...draft.contents,
      { title: '', kind: 'post', schedule: 'D+0' },
    ])
  }
  function patchContent(
    idx: number,
    partial: Partial<PlaybookContentTemplate>,
  ) {
    const next = draft.contents.map((c, i) =>
      i === idx ? { ...c, ...partial } : c,
    )
    patch('contents', next)
  }
  function removeContent(idx: number) {
    patch('contents', draft.contents.filter((_, i) => i !== idx))
  }

  // ── Metas helpers ────────────────────────────────────────────────────
  function addMeta() {
    // Sugere o 1o kind ainda nao usado (UNIQUE clinic+partnership+kind)
    const usedKinds = new Set(draft.metas.map((m) => m.kind))
    const allMetaKinds: PlaybookMetaTemplate['kind'][] = [
      'vouchers_month',
      'conversion_pct',
      'nps_min',
      'contents_month',
    ]
    const next = allMetaKinds.find((k) => !usedKinds.has(k)) ?? 'vouchers_month'
    patch('metas', [...draft.metas, { kind: next, target: 0 }])
  }
  function patchMeta(idx: number, partial: Partial<PlaybookMetaTemplate>) {
    const next = draft.metas.map((m, i) =>
      i === idx ? { ...m, ...partial } : m,
    )
    patch('metas', next)
  }
  function removeMeta(idx: number) {
    patch('metas', draft.metas.filter((_, i) => i !== idx))
  }

  return (
    <div
      className="rounded-lg border border-white/10 bg-[#C9A96E]/[0.03] p-4 flex flex-col gap-3"
      style={{ borderLeftWidth: 4, borderLeftColor: meta.color }}
    >
      {/* Header: kind badge + name editavel + flash badges */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[14px]"
            style={{
              background: `${meta.color}20`,
              color: meta.color,
              border: `1px solid ${meta.color}55`,
            }}
            title={`Kind ${draft.kind}`}
          >
            {meta.iconLabel}
          </span>
          <div className="flex flex-col">
            <span
              className="text-[10px] uppercase tracking-[2px] font-bold"
              style={{ color: meta.color }}
            >
              {draft.kind}
            </span>
            <span className="text-[14px] text-[#F5F0E8] font-medium">
              {meta.title}
            </span>
            <span className="text-[10.5px] text-[#9CA3AF]">{meta.sub}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {draft.isDefault && (
            <span
              className="text-[9px] uppercase tracking-[1.4px] font-bold rounded px-1.5 py-0.5"
              style={{
                background: `${meta.color}15`,
                color: meta.color,
                border: `1px solid ${meta.color}55`,
              }}
              title="Template aplicado por padrao quando admin clica '+ Aplicar Playbook' nesse kind"
            >
              default
            </span>
          )}
          {!initial.persisted && (
            <span className="text-[9px] uppercase tracking-[1.4px] text-[#FCD34D] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded px-1.5 py-0.5">
              nao salvo
            </span>
          )}
          {savedFlash && (
            <span className="text-[9px] uppercase tracking-[1.4px] text-[#86EFAC] bg-[#16A34A]/10 border border-[#16A34A]/30 rounded px-1.5 py-0.5">
              salvo
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FieldLbl label="Nome do template" required>
          <input
            type="text"
            className="bcomm-input"
            value={draft.name}
            onChange={(e) => patch('name', e.target.value)}
            placeholder="Ex.: Onboarding parceira (estetica)"
          />
        </FieldLbl>
        <FieldLbl
          label="Default"
          hint="aplicado quando admin clica + Aplicar"
        >
          <label className="bcfg-toggle">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => patch('isDefault', e.target.checked)}
            />
            <span>{draft.isDefault ? 'sim' : 'não'}</span>
          </label>
        </FieldLbl>
        <FieldLbl label="Resumo" hint="apresentado na lista de aplicacao">
          <input
            type="text"
            className="bcomm-input"
            value={draft.description}
            onChange={(e) => patch('description', e.target.value)}
            placeholder="Ex.: Sequencia padrao pra ativar parceira nova nos primeiros 30 dias."
          />
        </FieldLbl>
      </div>

      {/* Sections expandiveis */}
      <div className="flex flex-col gap-2 mt-2">
        <SectionHeader
          color={meta.color}
          label="Tasks"
          count={draft.tasks.length}
          open={openSection === 'tasks'}
          onToggle={() =>
            setOpenSection(openSection === 'tasks' ? null : 'tasks')
          }
        />
        {openSection === 'tasks' && (
          <div className="flex flex-col gap-2 pb-2">
            {draft.tasks.length === 0 && (
              <EmptyHint>Nenhuma task ainda · adicione abaixo.</EmptyHint>
            )}
            {draft.tasks.map((t, i) => (
              <div
                key={`task-${i}`}
                className="grid grid-cols-12 gap-2 items-center bcfg-row"
              >
                <input
                  type="text"
                  className="bcomm-input col-span-6"
                  value={t.title}
                  onChange={(e) => patchTask(i, { title: e.target.value })}
                  placeholder="Ex.: Enviar contrato + brief de DNA"
                />
                <div className="col-span-2 flex items-center gap-1">
                  <span className="text-[9px] uppercase tracking-[1.2px] text-[#6B7280]">
                    D+
                  </span>
                  <input
                    type="number"
                    className="bcomm-input font-mono"
                    value={t.days_offset}
                    min={0}
                    max={365}
                    onChange={(e) =>
                      patchTask(i, {
                        days_offset: Number(e.target.value) || 0,
                      })
                    }
                    style={{ flex: 1 }}
                    title="days_offset · 0 = hoje"
                  />
                </div>
                <select
                  className="bcomm-input col-span-3"
                  value={t.owner_role ?? ''}
                  onChange={(e) =>
                    patchTask(i, { owner_role: e.target.value || null })
                  }
                  title="Quem executa essa task"
                >
                  <option value="">(sem dono)</option>
                  {OWNER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bcfg-x col-span-1"
                  onClick={() => removeTask(i)}
                  title="Remover task"
                  aria-label="Remover task"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="bcomm-btn bcfg-add" onClick={addTask}>
              + adicionar task
            </button>
          </div>
        )}

        <SectionHeader
          color={meta.color}
          label="Contents"
          count={draft.contents.length}
          open={openSection === 'contents'}
          onToggle={() =>
            setOpenSection(openSection === 'contents' ? null : 'contents')
          }
        />
        {openSection === 'contents' && (
          <div className="flex flex-col gap-2 pb-2">
            {draft.contents.length === 0 && (
              <EmptyHint>Nenhum content planejado.</EmptyHint>
            )}
            {draft.contents.map((c, i) => (
              <div
                key={`content-${i}`}
                className="grid grid-cols-12 gap-2 items-center bcfg-row"
              >
                <input
                  type="text"
                  className="bcomm-input col-span-6"
                  value={c.title}
                  onChange={(e) => patchContent(i, { title: e.target.value })}
                  placeholder="Ex.: Post de anuncio da parceria"
                />
                <select
                  className="bcomm-input col-span-2"
                  value={c.kind}
                  onChange={(e) =>
                    patchContent(i, {
                      kind: e.target.value as PlaybookContentTemplate['kind'],
                    })
                  }
                >
                  {CONTENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="bcomm-input font-mono col-span-3"
                  value={c.schedule ?? ''}
                  onChange={(e) =>
                    patchContent(i, { schedule: e.target.value || null })
                  }
                  placeholder="Ex.: D+3 ou monthly"
                  title="schedule · ex.: D+0, D+7, monthly"
                />
                <button
                  type="button"
                  className="bcfg-x col-span-1"
                  onClick={() => removeContent(i)}
                  title="Remover content"
                  aria-label="Remover content"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="bcomm-btn bcfg-add"
              onClick={addContent}
            >
              + adicionar content
            </button>
          </div>
        )}

        <SectionHeader
          color={meta.color}
          label="Metas"
          count={draft.metas.length}
          open={openSection === 'metas'}
          onToggle={() =>
            setOpenSection(openSection === 'metas' ? null : 'metas')
          }
        />
        {openSection === 'metas' && (
          <div className="flex flex-col gap-2 pb-2">
            {draft.metas.length === 0 && (
              <EmptyHint>Nenhuma meta definida.</EmptyHint>
            )}
            {draft.metas.map((m, i) => (
              <div
                key={`meta-${i}`}
                className="grid grid-cols-12 gap-2 items-center bcfg-row"
              >
                <select
                  className="bcomm-input col-span-6"
                  value={m.kind}
                  onChange={(e) =>
                    patchMeta(i, {
                      kind: e.target.value as PlaybookMetaTemplate['kind'],
                    })
                  }
                >
                  {(
                    Object.keys(META_KIND_META) as PlaybookMetaTemplate['kind'][]
                  ).map((k) => (
                    <option key={k} value={k}>
                      {META_KIND_META[k].label} ({k})
                    </option>
                  ))}
                </select>
                <div className="col-span-3 flex items-center gap-1">
                  <input
                    type="number"
                    className="bcomm-input font-mono"
                    value={m.target}
                    min={0}
                    step={1}
                    onChange={(e) =>
                      patchMeta(i, {
                        target: Number(e.target.value) || 0,
                      })
                    }
                    style={{ flex: 1 }}
                  />
                  <span className="text-[9px] uppercase tracking-[1.2px] text-[#6B7280]">
                    {META_KIND_META[m.kind]?.unit ?? ''}
                  </span>
                </div>
                <span className="col-span-2 text-[10px] text-[#6B7280] truncate">
                  meta da parceria
                </span>
                <button
                  type="button"
                  className="bcfg-x col-span-1"
                  onClick={() => removeMeta(i)}
                  title="Remover meta"
                  aria-label="Remover meta"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="bcomm-btn bcfg-add" onClick={addMeta}>
              + adicionar meta
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-[#FCA5A5]/30 bg-[#FCA5A5]/10 px-3 py-2 text-[11px] text-[#FCA5A5]">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <button
          type="button"
          className="bcomm-btn"
          onClick={reset}
          disabled={pending || !dirty}
        >
          Desfazer
        </button>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-primary ml-auto"
          onClick={save}
          disabled={pending || (!dirty && initial.persisted)}
          title={
            !initial.persisted
              ? 'Salvar primeira vez (cria template)'
              : 'Salvar alteracoes'
          }
        >
          {pending
            ? 'Salvando…'
            : initial.persisted
              ? 'Salvar template'
              : 'Criar template'}
        </button>
      </div>
    </div>
  )
}

function SectionHeader({
  color,
  label,
  count,
  open,
  onToggle,
}: {
  color: string
  label: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-md border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
    >
      <div className="flex items-center gap-2">
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: 999,
            background: color,
          }}
        />
        <span className="text-[11px] uppercase tracking-[1.6px] font-bold text-[#F5F0E8]">
          {label}
        </span>
        <span className="text-[10px] text-[#6B7280]">· {count}</span>
      </div>
      <span className="text-[10px] text-[#9CA3AF]">{open ? '▼' : '▶'}</span>
    </button>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] text-[#6B7280] italic px-2 py-1.5">
      {children}
    </div>
  )
}

function FieldLbl({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="bcfg-field flex flex-col gap-1">
      <span className="bcfg-field-lbl text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">
        {label} {required && <span className="text-[#FCA5A5]">*</span>}
        {hint && (
          <span className="ml-1 normal-case font-normal tracking-normal text-[#6B7280]">
            · {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}

function PlaybooksStyles() {
  return (
    <style jsx global>{`
      .bcfg-row {
        background: rgba(255, 255, 255, 0.015);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 6px 8px;
      }
      .bcfg-x {
        background: transparent;
        border: 1px solid rgba(252, 165, 165, 0.25);
        color: #fca5a5;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }
      .bcfg-x:hover {
        background: rgba(252, 165, 165, 0.1);
      }
      .bcfg-add {
        align-self: flex-start;
        font-size: 10.5px !important;
        padding: 4px 10px !important;
      }
      .bcfg-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 10px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        color: #f5f0e8;
        user-select: none;
      }
      .bcfg-toggle input[type='checkbox'] {
        accent-color: #c9a96e;
      }
    `}</style>
  )
}
