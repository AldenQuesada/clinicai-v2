/**
 * PageHeader · titulo + breadcrumb opcional + slot de acoes a direita.
 *
 * Uso:
 *   <PageHeader
 *     title="Pacientes"
 *     description="142 ativos"
 *     breadcrumb={[{ label: 'CRM', href: '/crm' }, { label: 'Pacientes' }]}
 *     actions={<Button>Novo paciente</Button>}
 *   />
 */

import * as React from 'react'
import Link from 'next/link'
import { cn } from '../lib/cn'

export interface BreadcrumbItem {
  label: string
  /** Sem href = item atual (sem link) */
  href?: string
}

export interface PageHeaderProps {
  title: string
  description?: string
  breadcrumb?: ReadonlyArray<BreadcrumbItem>
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 pb-6', className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Navegação" className="flex items-center gap-1.5 text-xs">
          {breadcrumb.map((item, idx) => {
            const isLast = idx === breadcrumb.length - 1
            return (
              <React.Fragment key={`${item.label}-${idx}`}>
                {idx > 0 && (
                  <span className="text-[var(--muted-foreground)]/50">/</span>
                )}
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      'text-[var(--muted-foreground)]',
                      isLast && 'text-[var(--foreground)]',
                    )}
                  >
                    {item.label}
                  </span>
                )}
              </React.Fragment>
            )
          })}
        </nav>
      )}

      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display-italic text-3xl text-[var(--foreground)]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
