'use client'

/**
 * ProceduresAdminClient · client component da página de procedimentos.
 *
 * - KPI cards: total / ativos / inativos / preço a definir / com promoção
 * - 3 filtros (busca, status, categoria) via searchParams
 * - Tabela com nome, categoria, duração, preço, promo, status, ações
 * - Dialog Create + Edit (mesmo form · `editing` decide)
 * - Toggle ativo/inativo direto na linha
 *
 * Sem localStorage como fonte da verdade · filtros via URL.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
} from '@clinicai/ui'
import { Plus, Pencil, Power } from 'lucide-react'
import type {
  AdminProcedureDTO,
  ProcedureCountsDTO,
} from '@clinicai/repositories'
import {
  createProcedureAction,
  updateProcedureAction,
  setProcedureActiveAction,
} from './_actions'

interface Props {
  items: AdminProcedureDTO[]
  counts: ProcedureCountsDTO
  categorias: string[]
  currentFilter: {
    search: string
    status: 'active' | 'inactive' | 'all'
    categoria: string
  }
  canEdit: boolean
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
] as const

export function ProceduresAdminClient({
  items,
  counts,
  categorias,
  currentFilter,
  canEdit,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState<AdminProcedureDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [pending, startTransition] = useTransition()

  function setParam(key: 'q' | 'status' | 'categoria', value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '' || value === 'all') params.delete(key)
    else params.set(key, value)
    router.push(`/configuracoes/procedimentos?${params.toString()}`)
  }

  function close() {
    setEditing(null)
    setCreating(false)
  }

  function refresh() {
    router.refresh()
  }

  async function toggleActive(item: AdminProcedureDTO) {
    if (!canEdit) return
    startTransition(async () => {
      await setProcedureActiveAction({ id: item.id, active: !item.ativo })
      refresh()
    })
  }

  return (
    <div className="mt-4 space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Total" value={counts.total} />
        <KpiCard label="Ativos" value={counts.active} tone="ok" />
        <KpiCard label="Inativos" value={counts.inactive} tone="muted" />
        <KpiCard label="Preço a definir" value={counts.priceUndefined} tone="alert" />
        <KpiCard label="Com promoção" value={counts.withPromo} />
      </div>

      {/* Filters + create */}
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
          options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <FilterSelect
          label="Categoria"
          value={currentFilter.categoria}
          onChange={(v) => setParam('categoria', v === 'all' ? null : v)}
          options={[
            { value: 'all', label: 'Todas' },
            ...categorias.map((c) => ({ value: c, label: c })),
          ]}
        />
        {canEdit && (
          <Button size="sm" onClick={() => setCreating(true)} disabled={pending}>
            <Plus className="h-4 w-4" />
            Novo procedimento
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{items.length} procedimento{items.length !== 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              Nenhum procedimento encontrado com os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Categoria</th>
                    <th className="py-2 pr-3 text-right">Duração</th>
                    <th className="py-2 pr-3 text-right">Preço</th>
                    <th className="py-2 pr-3 text-right">Promo</th>
                    <th className="py-2 pr-3 text-center">Status</th>
                    <th className="py-2 pr-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-[var(--border)]/40 hover:bg-[var(--color-border-soft)]/30"
                    >
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-[var(--foreground)]">{p.nome}</div>
                        {p.descricao && (
                          <div className="text-[10px] text-[var(--muted-foreground)] line-clamp-1">
                            {p.descricao}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-[var(--muted-foreground)]">
                        {p.categoria ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {p.duracaoMin ? `${p.duracaoMin} min` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {p.preco && p.preco > 0 ? (
                          BRL.format(p.preco)
                        ) : (
                          <span className="text-[var(--muted-foreground)] italic">a definir</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {p.precoPromo != null && p.precoPromo > 0 ? BRL.format(p.precoPromo) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-display-uppercase tracking-widest ${
                            p.ativo
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'border-[var(--border)] text-[var(--muted-foreground)]'
                          }`}
                        >
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <div className="inline-flex gap-1">
                          {canEdit && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing(p)}
                                disabled={pending}
                                title="Editar"
                                aria-label="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleActive(p)}
                                disabled={pending}
                                title={p.ativo ? 'Desativar' : 'Ativar'}
                                aria-label={p.ativo ? 'Desativar' : 'Ativar'}
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(editing || creating) && (
        <ProcedureFormDialog
          initial={editing}
          categorias={categorias}
          onClose={close}
          onSaved={() => {
            close()
            refresh()
          }}
        />
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'alert' | 'muted'
}) {
  const color =
    tone === 'alert'
      ? 'text-[var(--destructive)]'
      : tone === 'ok'
        ? 'text-emerald-700 dark:text-emerald-300'
        : tone === 'muted'
          ? 'text-[var(--muted-foreground)]'
          : 'text-[var(--foreground)]'
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
          {label}
        </span>
        <span className={`text-2xl font-semibold ${color}`}>{value}</span>
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
  const [local, setLocal] = useState(value)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </span>
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(local.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChange(local.trim())
        }}
        placeholder="Buscar por nome…"
        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

interface FormState {
  nome: string
  categoria: string
  descricao: string
  preco: string
  precoPromo: string
  duracaoMin: string
  sessoes: string
  observacoes: string
  ativo: boolean
}

function emptyForm(initial: AdminProcedureDTO | null): FormState {
  return {
    nome: initial?.nome ?? '',
    categoria: initial?.categoria ?? '',
    descricao: initial?.descricao ?? '',
    preco: initial?.preco != null ? String(initial.preco) : '',
    precoPromo: initial?.precoPromo != null ? String(initial.precoPromo) : '',
    duracaoMin: initial?.duracaoMin != null ? String(initial.duracaoMin) : '',
    sessoes: initial?.sessoes != null ? String(initial.sessoes) : '1',
    observacoes: initial?.observacoes ?? '',
    ativo: initial?.ativo ?? true,
  }
}

function ProcedureFormDialog({
  initial,
  categorias,
  onClose,
  onSaved,
}: {
  initial: AdminProcedureDTO | null
  categorias: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = initial !== null
  const [form, setForm] = useState<FormState>(() => emptyForm(initial))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function buildPayload() {
    const parseOptional = (s: string): number | null => {
      const t = s.trim()
      if (t === '') return null
      const n = Number(t.replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    return {
      nome: form.nome.trim(),
      categoria: form.categoria.trim() || null,
      descricao: form.descricao.trim() || null,
      preco: parseOptional(form.preco) ?? 0,
      precoPromo: parseOptional(form.precoPromo),
      duracaoMin: parseOptional(form.duracaoMin) ?? null,
      sessoes: parseOptional(form.sessoes) ?? 1,
      observacoes: form.observacoes.trim() || null,
      ativo: form.ativo,
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = buildPayload()

    startTransition(async () => {
      const r = isEdit
        ? await updateProcedureAction({ id: initial.id, ...payload })
        : await createProcedureAction(payload)
      if (!r.ok) {
        setError(r.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-luxury-lg">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest">
          {isEdit ? 'Editar procedimento' : 'Novo procedimento'}
        </h3>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="Nome" required>
              <input
                type="text"
                required
                minLength={2}
                maxLength={200}
                value={form.nome}
                onChange={(e) => set('nome', e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </FormField>
            <FormField label="Categoria">
              <input
                type="text"
                list="categorias-list"
                value={form.categoria}
                onChange={(e) => set('categoria', e.target.value)}
                maxLength={100}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
              <datalist id="categorias-list">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FormField label="Duração (min)">
              <input
                type="number"
                min="1"
                max="480"
                value={form.duracaoMin}
                onChange={(e) => set('duracaoMin', e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </FormField>
            <FormField label="Sessões">
              <input
                type="number"
                min="1"
                max="50"
                value={form.sessoes}
                onChange={(e) => set('sessoes', e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </FormField>
            <FormField label="Preço (R$)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.preco}
                onChange={(e) => set('preco', e.target.value)}
                placeholder="0,00"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </FormField>
            <FormField label="Promo (R$)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.precoPromo}
                onChange={(e) => set('precoPromo', e.target.value)}
                placeholder="—"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </FormField>
          </div>

          <FormField label="Descrição">
            <textarea
              value={form.descricao}
              onChange={(e) => set('descricao', e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            />
          </FormField>

          <FormField label="Observações internas">
            <textarea
              value={form.observacoes}
              onChange={(e) => set('observacoes', e.target.value)}
              maxLength={2000}
              rows={2}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            />
          </FormField>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => set('ativo', e.target.checked)}
            />
            <span>Ativo (aparece no wizard de agendamento)</span>
          </label>

          {error && (
            <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-2 py-1.5 text-xs text-[var(--destructive)]">
              {error === 'promo_maior_que_preco'
                ? 'Promoção não pode ser maior que o preço'
                : error === 'nome_required'
                  ? 'Nome é obrigatório'
                  : error === 'forbidden'
                    ? 'Apenas owner/admin pode criar/editar'
                    : `Erro: ${error}`}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar procedimento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
        {required && <span className="text-[var(--destructive)]"> *</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
