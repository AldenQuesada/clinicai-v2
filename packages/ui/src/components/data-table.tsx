/**
 * DataTable · tabela tipada generica · server-side sort/pagination.
 *
 * Sem TanStack table · pages CRM sao listas medias e RSC ja faz fetch
 * com sort/page resolvidos via URL params. DataTable so renderiza.
 *
 * Uso (RSC consumindo Server Action ou repos.X.list direto):
 *   const rows = await repos.patients.list(ctx.clinic_id, { limit: 20, offset })
 *   <DataTable
 *     rows={rows}
 *     columns={[
 *       { key: 'name',  label: 'Nome',     render: (r) => r.name },
 *       { key: 'phone', label: 'Telefone', render: (r) => r.phone },
 *       { key: 'status', label: 'Status', render: (r) => <PatientStatusBadge status={r.status} /> },
 *     ]}
 *     emptyState={<EmptyState variant="leads" title="Sem pacientes" />}
 *     pagination={{ page: 1, total: 142, perPage: 20, baseHref: '/crm/pacientes' }}
 *   />
 *
 * Pagination: server-side via URL (`?page=2`). DataTable renderiza links
 * Prev/Next (Next.js Link). Total opcional · sem total nao mostra "X de Y".
 */

import * as React from 'react'
import Link from 'next/link'
import { cn } from '../lib/cn'

export interface DataTableColumn<T> {
  key: string
  label: string
  /** Render do valor da celula. Recebe row inteira pra montar JSX custom. */
  render: (row: T) => React.ReactNode
  /** Alinhamento do conteudo · default 'left' */
  align?: 'left' | 'right' | 'center'
  /** Width opcional · ex: 'w-32' tailwind ou '120px' */
  width?: string
  /** Esconde a coluna em mobile (< md) */
  hideMobile?: boolean
}

export interface DataTableProps<T> {
  rows: ReadonlyArray<T>
  columns: ReadonlyArray<DataTableColumn<T>>
  /** Funcao opcional pra extrair key estavel do React (default: index) */
  rowKey?: (row: T, index: number) => string
  /** Renderiza quando rows=[] · pode ser EmptyState ou texto solto */
  emptyState?: React.ReactNode
  /** Renderiza quando loading=true · pode ser <Skeleton> */
  loadingState?: React.ReactNode
  loading?: boolean
  /** Click em row · cuidado: nao pula buttons/links dentro do render */
  onRowClick?: (row: T) => void
  /** Href dinamico por row · gera <Link> wrap em toda celula */
  rowHref?: (row: T) => string
  pagination?: DataTablePagination
  className?: string
  /** ARIA label da tabela (a11y · screen readers) · ex: "Lista de pacientes" */
  ariaLabel?: string
  /**
   * Bulk-select opcional · injeta coluna checkbox na primeira posicao,
   * master checkbox no header (selecionar todas as rows visiveis).
   * Caller mantem state externo (Set<string>) · DataTable so emite onToggle.
   *
   * Uso:
   *   const [selected, setSelected] = useState(new Set<string>())
   *   <DataTable
   *     rows={...}
   *     rowKey={(p) => p.id}
   *     bulkSelect={{
   *       selected,
   *       onToggle: (id) => setSelected(prev => {
   *         const next = new Set(prev)
   *         next.has(id) ? next.delete(id) : next.add(id)
   *         return next
   *       }),
   *       onToggleAll: (ids, checked) => setSelected(prev => {
   *         const next = new Set(prev)
   *         if (checked) ids.forEach(id => next.add(id))
   *         else ids.forEach(id => next.delete(id))
   *         return next
   *       }),
   *     }}
   *   />
   */
  bulkSelect?: DataTableBulkSelect
}

export interface DataTableBulkSelect {
  /** Set de IDs selecionados (caller-owned) */
  selected: ReadonlySet<string>
  /** Callback ao togglear 1 row · recebe rowKey */
  onToggle: (id: string) => void
  /**
   * Callback do master-checkbox · recebe IDs visiveis na pagina + estado alvo.
   * Caller decide se faz add-todos ou remove-todos.
   */
  onToggleAll: (ids: string[], checked: boolean) => void
}

export interface DataTablePagination {
  page: number
  perPage: number
  /** Total de rows · opcional. Se omitido, paginacao infinita (Next sem disabled) */
  total?: number
  /** Base URL pros links de page · ex: '/crm/pacientes' */
  baseHref: string
  /** Param adicional pra preservar (search, filter, etc) */
  preserveParams?: Record<string, string | undefined>
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  emptyState,
  loadingState,
  loading,
  onRowClick,
  rowHref,
  pagination,
  className,
  ariaLabel,
  bulkSelect,
}: DataTableProps<T>) {
  if (loading) {
    return <div className={className}>{loadingState ?? <DefaultSkeleton />}</div>
  }

  if (rows.length === 0) {
    return (
      <div className={cn('py-8', className)}>
        {emptyState ?? (
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            Nenhum resultado.
          </p>
        )}
      </div>
    )
  }

  // bulkSelect requer rowKey · sem id estavel nao da pra trackear selecao
  // entre re-renders. Caller deve passar rowKey OU bulkSelect=undefined.
  const hasBulk = !!bulkSelect && !!rowKey
  const visibleIds = hasBulk
    ? rows.map((r, i) => (rowKey as (r: T, i: number) => string)(r, i))
    : []
  const visibleSelectedCount = hasBulk
    ? visibleIds.filter((id) => bulkSelect!.selected.has(id)).length
    : 0
  const allVisibleSelected =
    hasBulk && visibleIds.length > 0 && visibleSelectedCount === visibleIds.length
  const someVisibleSelected =
    hasBulk && visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full text-sm" aria-label={ariaLabel}>
          <thead className="bg-[var(--color-border-soft)]/40">
            <tr>
              {hasBulk && (
                <th
                  scope="col"
                  className="w-10 px-3 py-3 text-left"
                  aria-label="Selecionar todos os visíveis"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-[var(--border)] bg-[var(--card)] accent-[var(--primary)]"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected
                    }}
                    onChange={(e) => {
                      bulkSelect!.onToggleAll(visibleIds, e.target.checked)
                    }}
                    aria-label={
                      allVisibleSelected
                        ? 'Desmarcar todos os visíveis'
                        : 'Selecionar todos os visíveis'
                    }
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    !c.align && 'text-left',
                    c.hideMobile && 'hidden md:table-cell',
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((row, idx) => {
              const key = rowKey ? rowKey(row, idx) : String(idx)
              const interactive = !!onRowClick || !!rowHref
              const isChecked = hasBulk && bulkSelect!.selected.has(key)
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors',
                    interactive &&
                      'cursor-pointer hover:bg-[var(--color-border-soft)]/30',
                    isChecked && 'bg-[var(--primary)]/5',
                  )}
                >
                  {hasBulk && (
                    <td
                      className="w-10 px-3 py-3"
                      // Importante: stop click pra nao acionar onRowClick/Link
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-[var(--border)] bg-[var(--card)] accent-[var(--primary)]"
                        checked={isChecked}
                        onChange={() => bulkSelect!.onToggle(key)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={isChecked ? 'Desmarcar linha' : 'Selecionar linha'}
                      />
                    </td>
                  )}
                  {columns.map((c) => {
                    const content = c.render(row)
                    const cellInner = rowHref ? (
                      <Link href={rowHref(row)} className="block">
                        {content}
                      </Link>
                    ) : (
                      content
                    )
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          'px-4 py-3 text-[var(--foreground)]',
                          c.align === 'right' && 'text-right',
                          c.align === 'center' && 'text-center',
                          c.hideMobile && 'hidden md:table-cell',
                        )}
                      >
                        {cellInner}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pagination && <Pagination {...pagination} />}
    </div>
  )
}

// ── Skeleton default · 5 rows fake enquanto carrega ─────────────────────────

function DefaultSkeleton() {
  return (
    <div className="rounded-md border border-[var(--border)]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="border-b border-[var(--border)] px-4 py-4 last:border-0"
        >
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--color-border-soft)]" />
        </div>
      ))}
    </div>
  )
}

// ── Pagination · Prev/Next + indicador "Pagina X de Y" ─────────────────────

function Pagination({
  page,
  perPage,
  total,
  baseHref,
  preserveParams,
}: DataTablePagination) {
  const totalPages = total != null ? Math.max(1, Math.ceil(total / perPage)) : null
  const isFirst = page <= 1
  const isLast = totalPages != null ? page >= totalPages : false

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams()
    if (preserveParams) {
      for (const [k, v] of Object.entries(preserveParams)) {
        if (v != null && v !== '') params.set(k, v)
      }
    }
    if (targetPage > 1) params.set('page', String(targetPage))
    const qs = params.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }

  return (
    <nav
      aria-label="Paginação"
      className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]"
    >
      <span>
        {totalPages != null ? (
          <>
            Página <strong className="text-[var(--foreground)]">{page}</strong> de{' '}
            <strong className="text-[var(--foreground)]">{totalPages}</strong>
            {total != null && (
              <>
                {' · '}
                {total} {total === 1 ? 'registro' : 'registros'}
              </>
            )}
          </>
        ) : (
          <>Página {page}</>
        )}
      </span>
      <div className="flex gap-1">
        {isFirst ? (
          <span className="rounded-md border border-[var(--border)] px-3 py-1.5 opacity-40">
            Anterior
          </span>
        ) : (
          <Link
            href={buildHref(page - 1)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--color-border-soft)]/40 hover:text-[var(--foreground)]"
          >
            Anterior
          </Link>
        )}
        {isLast ? (
          <span className="rounded-md border border-[var(--border)] px-3 py-1.5 opacity-40">
            Próxima
          </span>
        ) : (
          <Link
            href={buildHref(page + 1)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--color-border-soft)]/40 hover:text-[var(--foreground)]"
          >
            Próxima
          </Link>
        )}
      </div>
    </nav>
  )
}
