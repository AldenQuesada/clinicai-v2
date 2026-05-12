'use client'

/**
 * AnamnesisTemplatesAdminClient · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER.
 *
 * - KPI cards (total · ativos · inativos · perguntas configuradas)
 * - Filtros via searchParams (busca · status · categoria)
 * - Tabela com nome, categoria, flags (default / pré-consulta), atualização
 * - Modal Create/Edit · campos cosméticos top-level
 * - Toggle ativo/inativo direto na linha
 * - Link "Ver / preview" → /configuracoes/anamneses/[id]
 *
 * Sem mutação em sessions/fields/options aqui · admin avançado vive na
 * próxima fase.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  FormField,
  Input,
  Select,
  Textarea,
  useToast,
} from '@clinicai/ui'
import { Plus, Pencil, Power, Eye } from 'lucide-react'
import type {
  AnamnesisTemplateDTO,
  AnamnesisTemplateCountsDTO,
  AnamnesisTemplateCategory,
} from '@clinicai/repositories'
import {
  createAnamnesisTemplateAction,
  updateAnamnesisTemplateAction,
  setAnamnesisTemplateActiveAction,
} from './_actions'

interface Props {
  items: AnamnesisTemplateDTO[]
  counts: AnamnesisTemplateCountsDTO
  currentFilter: {
    search: string
    status: 'active' | 'inactive' | 'all'
    category: AnamnesisTemplateCategory | 'all'
  }
  canEdit: boolean
}

const CATEGORY_OPTIONS: ReadonlyArray<{
  value: AnamnesisTemplateCategory
  label: string
}> = [
  { value: 'general', label: 'Geral' },
  { value: 'facial', label: 'Facial' },
  { value: 'body', label: 'Corporal' },
  { value: 'capillary', label: 'Capilar' },
  { value: 'epilation', label: 'Depilação' },
  { value: 'custom', label: 'Customizado' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
] as const

function labelForCategory(c: AnamnesisTemplateCategory): string {
  return CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

export function AnamnesisTemplatesAdminClient({
  items,
  counts,
  currentFilter,
  canEdit,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { fromResult, success, error: toastError } = useToast()
  const [editing, setEditing] = useState<AnamnesisTemplateDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [pending, startTransition] = useTransition()

  function setParam(key: 'q' | 'status' | 'category', value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '' || value === 'all') params.delete(key)
    else params.set(key, value)
    router.push(`/configuracoes/anamneses?${params.toString()}`)
  }

  function close() {
    setEditing(null)
    setCreating(false)
  }

  function refresh() {
    router.refresh()
  }

  async function toggleActive(item: AnamnesisTemplateDTO) {
    if (!canEdit) return
    startTransition(async () => {
      const r = await setAnamnesisTemplateActiveAction({
        id: item.id,
        active: !item.isActive,
      })
      if (!r.ok) toastError('Falha ao alternar status')
      else success(item.isActive ? 'Desativado' : 'Ativado')
      refresh()
    })
  }

  return (
    <div className="mt-4 space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Modelos" value={counts.total} />
        <KpiCard label="Ativos" value={counts.active} tone="ok" />
        <KpiCard label="Inativos" value={counts.inactive} tone="muted" />
        <KpiCard label="Perguntas configuradas" value={counts.totalFields} />
      </div>

      {/* Filtros + create */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <FilterInput
          label="Busca"
          value={currentFilter.search}
          onChange={(v) => setParam('q', v.length > 0 ? v : null)}
        />
        <FilterSelect
          label="Status"
          value={currentFilter.status}
          onChange={(v) => setParam('status', v === 'all' ? null : v)}
          options={STATUS_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />
        <FilterSelect
          label="Categoria"
          value={currentFilter.category}
          onChange={(v) => setParam('category', v === 'all' ? null : v)}
          options={[
            { value: 'all', label: 'Todas' },
            ...CATEGORY_OPTIONS.map((c) => ({
              value: c.value,
              label: c.label,
            })),
          ]}
        />
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            disabled={!canEdit}
            title={!canEdit ? 'Somente admin/owner' : 'Criar modelo'}
          >
            <Plus className="h-4 w-4" /> Novo modelo
          </Button>
        </div>
      </div>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle>
            {items.length} {items.length === 1 ? 'modelo' : 'modelos'} no filtro
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--border)] px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
              Nenhum modelo encontrado.{' '}
              {canEdit && 'Clique em "Novo modelo" para começar.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 text-left">Nome</th>
                  <th className="py-2 text-left">Categoria</th>
                  <th className="py-2 text-left">Sinalizadores</th>
                  <th className="py-2 text-left">Versão</th>
                  <th className="py-2 text-left">Atualizado</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--border)]/60"
                  >
                    <td className="py-2.5">
                      <div className="font-medium">{item.name}</div>
                      {item.description && (
                        <div className="text-[11px] text-[var(--muted-foreground)] line-clamp-1">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-[12px]">
                      {labelForCategory(item.category)}
                    </td>
                    <td className="py-2.5 text-[11px] text-[var(--muted-foreground)]">
                      {[
                        item.isDefault ? 'Padrão' : null,
                        item.isPreAppointmentForm ? 'Pré-consulta' : null,
                        item.hasGeneralSession ? 'Geral incluída' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="py-2.5 text-[12px]">v{item.version}</td>
                    <td className="py-2.5 text-[11px] text-[var(--muted-foreground)]">
                      {fmtDate(item.updatedAt)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                          item.isActive
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {item.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={`/configuracoes/anamneses/${item.id}`}
                          title="Preview"
                        >
                          <Button size="sm" variant="ghost">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(item)}
                          disabled={!canEdit}
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive(item)}
                          disabled={!canEdit || pending}
                          title={item.isActive ? 'Desativar' : 'Ativar'}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <TemplateDialog
          item={editing}
          onClose={close}
          onSaved={(msg) => {
            success(msg)
            close()
            refresh()
          }}
          onFailed={(err) => {
            fromResult({ ok: false, error: err })
          }}
        />
      )}
    </div>
  )
}

// ── Dialog · create + edit (mesmo form) ─────────────────────────────────────

function TemplateDialog({
  item,
  onClose,
  onSaved,
  onFailed,
}: {
  item: AnamnesisTemplateDTO | null
  onClose: () => void
  onSaved: (msg: string) => void
  onFailed: (err: string) => void
}) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [category, setCategory] = useState<AnamnesisTemplateCategory>(
    item?.category ?? 'general',
  )
  const [isPreAppointmentForm, setIsPreAppointmentForm] = useState(
    item?.isPreAppointmentForm ?? false,
  )
  const [hasGeneralSession, setHasGeneralSession] = useState(
    item?.hasGeneralSession ?? true,
  )
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category,
        isPreAppointmentForm,
        hasGeneralSession,
      }
      const r = isEdit
        ? await updateAnamnesisTemplateAction({ id: item!.id, ...payload })
        : await createAnamnesisTemplateAction(payload)
      if (!r.ok) {
        onFailed(r.error ?? 'save_failed')
        return
      }
      onSaved(isEdit ? 'Modelo atualizado' : 'Modelo criado')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-semibold">
            {isEdit ? 'Editar modelo' : 'Novo modelo de anamnese'}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Define a categoria e os sinalizadores top-level. As seções e
            perguntas são gerenciadas em fase seguinte.
          </p>
        </div>

        <FormField label="Nome" htmlFor="name" required>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Ex.: Anamnese Estética Geral"
          />
        </FormField>

        <FormField label="Descrição" htmlFor="description">
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Para que serve, quando aplicar…"
          />
        </FormField>

        <FormField label="Categoria" htmlFor="category">
          <Select
            id="category"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as AnamnesisTemplateCategory)
            }
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={isPreAppointmentForm}
            onChange={(e) => setIsPreAppointmentForm(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong>Formulário pré-consulta</strong>
            <br />
            <span className="text-[var(--muted-foreground)]">
              Marca como modelo para envio antes do atendimento.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={hasGeneralSession}
            onChange={(e) => setHasGeneralSession(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong>Inclui seção "Dados gerais"</strong>
            <br />
            <span className="text-[var(--muted-foreground)]">
              Recomendado em modelos amplos.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 2}>
            {busy ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar modelo'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── primitivos visuais ──────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'muted' | 'alert'
}) {
  const accent =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-300'
      : tone === 'alert'
        ? 'text-amber-600 dark:text-amber-300'
        : tone === 'muted'
          ? 'text-[var(--muted-foreground)]'
          : 'text-[var(--foreground)]'
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function FilterInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nome do modelo…"
        className="w-[220px]"
      />
    </label>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  )
}
