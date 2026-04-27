/**
 * Sparkline · mini grafico SVG inline (sem dep externa).
 *
 * Usado pra trend de KPIs (ex: vouchers/dia · 7 ou 30 pontos). Renderiza
 * 100% server-safe · sem 'use client'. Hover/tooltip via <title> nativo
 * do SVG (acessivel · funciona sem JS).
 *
 * Padrao luxury Mirian:
 *   - Linha cor ouro (#C9A96E) por default, override via prop `color`
 *   - Gradient ouro→transparent sob a linha quando `fill=true`
 *   - Mini-trend ▲/▼ quando `showTrend=true` (compara end vs start)
 *
 * Comportamento defensivo:
 *   - data vazio ou len<2 · render placeholder vazio (nao quebra layout)
 *   - todos pontos iguais · linha horizontal no meio
 *   - viewBox responsivo · width/height sao defaults (preserveAspectRatio)
 */

import * as React from 'react'
import { cn } from '../lib/cn'

export interface SparklineProps {
  /** Serie temporal · 7 ou 30 pontos tipicamente. Min 2 pontos pra render. */
  data: number[]
  /** Largura em px · default 60 */
  width?: number
  /** Altura em px · default 18 */
  height?: number
  /** Cor da linha · default ouro champagne */
  color?: string
  /** Gradient ouro→transparent sob a linha · default true */
  fill?: boolean
  /** Renderiza ▲/▼ comparando end vs start (delta direcional simples) */
  showTrend?: boolean
  /** Override CSS · concatenado com classes default via cn() */
  className?: string
  /** Aria-label custom · default "Tendência: <start> → <end>" */
  'aria-label'?: string
}

const DEFAULT_COLOR = '#C9A96E'

export function Sparkline({
  data,
  width = 60,
  height = 18,
  color = DEFAULT_COLOR,
  fill = true,
  showTrend = false,
  className,
  'aria-label': ariaLabel,
}: SparklineProps) {
  // Defensive · serie invalida vira placeholder vazio (preserva layout).
  if (!Array.isArray(data) || data.length < 2) {
    return (
      <span
        className={cn('inline-block align-middle', className)}
        style={{ width, height }}
        aria-hidden="true"
      />
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1 // evita div/0 quando todos iguais
  const step = data.length > 1 ? width / (data.length - 1) : 0

  // Path · normaliza Y invertido (SVG y cresce pra baixo)
  const points = data.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / range) * height
    return [x, y] as const
  })

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  const fillPath = fill
    ? `${linePath} L ${width.toFixed(2)} ${height} L 0 ${height} Z`
    : null

  const start = data[0]
  const end = data[data.length - 1]
  const trendUp = end > start
  const trendFlat = end === start
  const gradId = React.useId().replace(/:/g, '-') + '-spark'
  const label =
    ariaLabel ?? `Tendência: ${start} → ${end}${trendFlat ? '' : trendUp ? ' (subindo)' : ' (caindo)'}`

  return (
    <span
      className={cn('inline-flex items-center gap-1 align-middle', className)}
      role="img"
      aria-label={label}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <title>{`${start} → ${end}`}</title>
        {fill ? (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
        ) : null}
        {fill && fillPath ? <path d={fillPath} fill={`url(#${gradId})`} /> : null}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
        {/* Ponto final · destaque sutil */}
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r={1.6}
          fill={color}
        />
      </svg>
      {showTrend ? (
        <span
          aria-hidden="true"
          style={{
            fontSize: 9,
            lineHeight: 1,
            color: trendFlat ? '#9CA3AF' : trendUp ? '#10B981' : '#EF4444',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 700,
          }}
        >
          {trendFlat ? '·' : trendUp ? '▲' : '▼'}
        </span>
      ) : null}
    </span>
  )
}
