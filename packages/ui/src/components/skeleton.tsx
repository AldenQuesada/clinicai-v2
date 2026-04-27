/**
 * Skeleton · loaders luxury com shimmer dourado champagne.
 *
 * Background usa gradient horizontal com champagne suave (rgba(201,169,110,0.08))
 * deslizando sobre superfície escura · animação @keyframes shimmer-luxury
 * injetada inline (evita conflito com globals.css em edição por outro agent).
 *
 * Variants:
 *   - text-line  : barra 12px altura · width customizável (className)
 *   - kpi        : card 90px com bar grande (número) + bar pequeno (label)
 *   - card       : 200×120 com bordas arredondadas
 *   - list       : 5 linhas vertical
 *   - circle     : avatar 40px
 *
 * Uso:
 *   <Skeleton variant="kpi" count={6} />
 *   <Skeleton variant="text-line" className="w-32" />
 */

import * as React from 'react'
import { cn } from '../lib/cn'

export type SkeletonVariant = 'card' | 'list' | 'kpi' | 'text-line' | 'circle'

export interface SkeletonProps {
  variant: SkeletonVariant
  /** Quantos elementos renderizar (default 1). */
  count?: number
  className?: string
}

/**
 * Estilos base · injetados uma vez via <style> top-level. ID evita
 * duplicação caso múltiplos Skeletons coexistam na mesma página.
 *
 * Animação 1.8s ease-in-out infinite · gradient slide left → right.
 * Background base champagne 4% sobre dark · shimmer pico champagne 12%.
 */
const STYLE_ID = 'skeleton-luxury-shimmer'

const STYLE_CSS = `
@keyframes shimmer-luxury {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-luxury {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(
      90deg,
      rgba(201, 169, 110, 0.04) 0%,
      rgba(201, 169, 110, 0.12) 50%,
      rgba(201, 169, 110, 0.04) 100%
    );
  background-size: 200% 100%;
  animation: shimmer-luxury 1.8s ease-in-out infinite;
  border-radius: 4px;
}
.skeleton-luxury-card {
  border: 1px solid rgba(201, 169, 110, 0.15);
  border-radius: 8px;
}
`

function ShimmerStyle() {
  // Dedup via ID · render uma vez no client tree (Server Components também
  // emitem este node, browser de-dup pelo id).
  return <style id={STYLE_ID} dangerouslySetInnerHTML={{ __html: STYLE_CSS }} />
}

function TextLine({ className }: { className?: string }) {
  return (
    <div
      className={cn('skeleton-luxury', className)}
      style={{ height: 12, width: className ? undefined : '100%' }}
      aria-hidden="true"
    />
  )
}

function Circle({ className }: { className?: string }) {
  return (
    <div
      className={cn('skeleton-luxury', className)}
      style={{ width: 40, height: 40, borderRadius: '50%' }}
      aria-hidden="true"
    />
  )
}

function Kpi({ className }: { className?: string }) {
  return (
    <div
      className={cn('skeleton-luxury-card', className)}
      style={{
        padding: '14px 16px',
        height: 90,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.02)',
      }}
      aria-hidden="true"
    >
      {/* Número grande · placeholder Cormorant */}
      <div
        className="skeleton-luxury"
        style={{ height: 28, width: '50%' }}
      />
      {/* Label uppercase pequeno */}
      <div
        className="skeleton-luxury"
        style={{ height: 10, width: '70%' }}
      />
    </div>
  )
}

function CardBox({ className }: { className?: string }) {
  return (
    <div
      className={cn('skeleton-luxury-card', className)}
      style={{
        width: 200,
        height: 120,
        padding: 14,
        background: 'rgba(255, 255, 255, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
      aria-hidden="true"
    >
      <div
        className="skeleton-luxury"
        style={{ height: 18, width: '70%' }}
      />
      <div
        className="skeleton-luxury"
        style={{ height: 10, width: '90%' }}
      />
      <div
        className="skeleton-luxury"
        style={{ height: 10, width: '60%' }}
      />
      <div
        className="skeleton-luxury"
        style={{ height: 10, width: '80%', marginTop: 'auto' }}
      />
    </div>
  )
}

function ListRows({ className }: { className?: string }) {
  // 5 linhas de altura ~16 com pequeno gap · simula lista de items.
  const widths = ['90%', '75%', '85%', '65%', '80%']
  return (
    <div
      className={cn(className)}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      aria-hidden="true"
    >
      {widths.map((w, i) => (
        <div
          key={i}
          className="skeleton-luxury"
          style={{ height: 16, width: w }}
        />
      ))}
    </div>
  )
}

export function Skeleton({ variant, count = 1, className }: SkeletonProps) {
  const items: React.ReactNode[] = []
  for (let i = 0; i < Math.max(1, count); i++) {
    let el: React.ReactNode
    if (variant === 'text-line') el = <TextLine key={i} className={className} />
    else if (variant === 'circle') el = <Circle key={i} className={className} />
    else if (variant === 'kpi') el = <Kpi key={i} className={className} />
    else if (variant === 'card') el = <CardBox key={i} className={className} />
    else if (variant === 'list') el = <ListRows key={i} className={className} />
    else el = <TextLine key={i} className={className} />
    items.push(el)
  }

  return (
    <>
      <ShimmerStyle />
      {count === 1 ? items[0] : <>{items}</>}
    </>
  )
}
