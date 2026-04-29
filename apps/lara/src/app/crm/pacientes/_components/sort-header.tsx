'use client'

/**
 * SortHeader · header de coluna clicavel pra sort.
 *
 * URL state: ?sort=name&dir=asc preserva outros params (search, page, etc).
 * Click toggla asc/desc. Click em coluna diferente reseta pra desc.
 */

import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@clinicai/ui'

export type SortField =
  | 'name'
  | 'updated_at'
  | 'created_at'
  | 'total_revenue'
  | 'last_procedure_at'
  | 'first_procedure_at'

interface SortHeaderProps {
  field: SortField
  label: string
  /** Default direcao quando user clica primeira vez · default 'desc' */
  defaultDir?: 'asc' | 'desc'
  className?: string
}

export function SortHeader({
  field,
  label,
  defaultDir = 'desc',
  className,
}: SortHeaderProps) {
  const sp = useSearchParams()
  const pathname = usePathname()

  const currentSort = sp.get('sort') ?? 'updated_at'
  const currentDir = sp.get('dir') ?? 'desc'
  const isActive = currentSort === field

  // Build href: toggla dir se ja ativa · senao usa defaultDir
  const nextDir =
    isActive && currentDir === defaultDir
      ? defaultDir === 'desc'
        ? 'asc'
        : 'desc'
      : defaultDir

  const next = new URLSearchParams(sp)
  next.set('sort', field)
  next.set('dir', nextDir)
  next.delete('page') // reset page

  const Icon = !isActive ? ArrowUpDown : currentDir === 'asc' ? ArrowUp : ArrowDown

  return (
    <Link
      href={`${pathname}?${next.toString()}`}
      className={cn(
        'inline-flex items-center gap-1 hover:text-[var(--foreground)]',
        isActive && 'text-[var(--foreground)]',
        className,
      )}
    >
      {label}
      <Icon className="h-3 w-3" />
    </Link>
  )
}
