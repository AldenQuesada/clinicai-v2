/**
 * EmptyState · luxury empty placeholder com SVG handmade.
 *
 * Substitui textos curtos como "Nenhuma parceria" por uma composição
 * com peso visual: SVG line-art champagne 60% + título Cormorant Garamond
 * italic + mensagem ivory dim + CTA opcional outline gold.
 *
 * Variants (cada uma tem SVG inline próprio · sem dependência lucide-react):
 *   - partnerships : 2 figuras femininas estilizadas (parceria conjunta)
 *   - vouchers     : envelope/presente com fita
 *   - comm         : balão de fala 3 pontos
 *   - history      : ampulheta minimalista
 *   - leads        : silhueta + question mark
 *   - generic      : estrela 8 pontas decorativa
 *
 * Stroke 1.5 · cor #C9A96E 60% opacity · sem fill (line art).
 *
 * Uso:
 *   <EmptyState
 *     variant="partnerships"
 *     title="Sem parcerias ainda"
 *     message="Clique em 'Nova parceria' para começar."
 *     action={{ label: 'Nova parceria', href: '/estudio/cadastrar' }}
 *   />
 */

import * as React from 'react'
import { cn } from '../lib/cn'

export type EmptyStateVariant =
  | 'partnerships'
  | 'vouchers'
  | 'comm'
  | 'history'
  | 'leads'
  | 'generic'

export interface EmptyStateProps {
  variant: EmptyStateVariant
  title: string
  message?: string
  action?: { label: string; href?: string; onClick?: () => void }
  className?: string
}

const SVG_COLOR = '#C9A96E'
const SVG_OPACITY = 0.6

interface SvgProps {
  size?: number
}

function PartnershipsSvg({ size = 140 }: SvgProps) {
  // 2 figuras femininas estilizadas em outline · cabeças ovais lado a lado,
  // ombros que se entrelaçam (sugere parceria conjunta).
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      stroke={SVG_COLOR}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: SVG_OPACITY }}
      aria-hidden="true"
    >
      {/* Figura esquerda · cabeça */}
      <ellipse cx="52" cy="48" rx="14" ry="17" />
      {/* Figura esquerda · cabelo (linhas) */}
      <path d="M40 44 Q42 30 52 28 Q62 30 64 44" />
      <path d="M44 50 Q42 60 38 64" />
      {/* Figura esquerda · busto/ombros */}
      <path d="M34 96 Q34 78 52 72 Q66 76 70 86" />

      {/* Figura direita · cabeça */}
      <ellipse cx="92" cy="48" rx="14" ry="17" />
      {/* Figura direita · cabelo */}
      <path d="M80 44 Q82 30 92 28 Q102 30 104 44" />
      <path d="M100 50 Q102 60 106 64" />
      {/* Figura direita · busto/ombros */}
      <path d="M70 86 Q74 76 88 72 Q106 78 106 96" />

      {/* Linha horizontal sutil ligando os busts (parceria) */}
      <path d="M34 96 L106 96" />

      {/* Pequeno losango decorativo central acima (símbolo de união) */}
      <path d="M70 18 L74 22 L70 26 L66 22 Z" />
    </svg>
  )
}

function VouchersSvg({ size = 140 }: SvgProps) {
  // Envelope/presente com fita · retângulo + fita vertical + nó top.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      stroke={SVG_COLOR}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: SVG_OPACITY }}
      aria-hidden="true"
    >
      {/* Caixa principal */}
      <rect x="28" y="50" width="84" height="64" rx="4" />
      {/* Fita vertical */}
      <line x1="70" y1="50" x2="70" y2="114" />
      {/* Fita horizontal */}
      <line x1="28" y1="74" x2="112" y2="74" />
      {/* Laço esquerdo */}
      <path d="M70 50 Q56 38 50 30 Q56 26 64 32 Q70 38 70 50" />
      {/* Laço direito */}
      <path d="M70 50 Q84 38 90 30 Q84 26 76 32 Q70 38 70 50" />
      {/* Nó central */}
      <ellipse cx="70" cy="46" rx="4" ry="3" />
      {/* Pontilhado de aba (envelope feel) */}
      <path d="M28 50 L70 80 L112 50" strokeDasharray="2 3" />
    </svg>
  )
}

function CommSvg({ size = 140 }: SvgProps) {
  // Balão de fala arredondado com 3 pontos.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      stroke={SVG_COLOR}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: SVG_OPACITY }}
      aria-hidden="true"
    >
      {/* Balão grande */}
      <path d="M28 56 Q28 32 52 32 L92 32 Q116 32 116 56 L116 80 Q116 96 100 96 L74 96 L60 110 L62 96 L52 96 Q28 96 28 80 Z" />
      {/* 3 pontos */}
      <circle cx="56" cy="64" r="2.5" />
      <circle cx="72" cy="64" r="2.5" />
      <circle cx="88" cy="64" r="2.5" />
    </svg>
  )
}

function HistorySvg({ size = 140 }: SvgProps) {
  // Ampulheta minimalista.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      stroke={SVG_COLOR}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: SVG_OPACITY }}
      aria-hidden="true"
    >
      {/* Tampa superior */}
      <line x1="36" y1="22" x2="104" y2="22" />
      {/* Tampa inferior */}
      <line x1="36" y1="118" x2="104" y2="118" />
      {/* Lateral esquerda da ampulheta */}
      <path d="M40 22 L40 36 Q40 50 70 70 Q40 90 40 104 L40 118" />
      {/* Lateral direita */}
      <path d="M100 22 L100 36 Q100 50 70 70 Q100 90 100 104 L100 118" />
      {/* Areia superior (linha curva) */}
      <path d="M52 28 Q70 38 88 28" strokeDasharray="2 3" />
      {/* Areia inferior */}
      <path d="M58 112 Q70 100 82 112" />
      {/* Grão central caindo */}
      <line x1="70" y1="70" x2="70" y2="84" strokeDasharray="1 2" />
    </svg>
  )
}

function LeadsSvg({ size = 140 }: SvgProps) {
  // Silhueta humana + question mark sobre a cabeça.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      stroke={SVG_COLOR}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: SVG_OPACITY }}
      aria-hidden="true"
    >
      {/* Cabeça */}
      <circle cx="70" cy="68" r="16" />
      {/* Ombros / busto */}
      <path d="M40 118 Q40 92 70 88 Q100 92 100 118" />
      {/* Question mark · arco superior */}
      <path d="M62 30 Q62 18 74 18 Q86 18 86 28 Q86 36 76 38 L76 44" />
      {/* Question mark · ponto */}
      <circle cx="76" cy="50" r="1.5" fill={SVG_COLOR} stroke="none" />
    </svg>
  )
}

function GenericSvg({ size = 140 }: SvgProps) {
  // Estrela de 8 pontas decorativa (ornamental luxury).
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      stroke={SVG_COLOR}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: SVG_OPACITY }}
      aria-hidden="true"
    >
      {/* 4 raios ortogonais longos */}
      <line x1="70" y1="14" x2="70" y2="126" />
      <line x1="14" y1="70" x2="126" y2="70" />
      {/* 4 raios diagonais curtos */}
      <line x1="32" y1="32" x2="108" y2="108" />
      <line x1="108" y1="32" x2="32" y2="108" />
      {/* Losango central */}
      <path d="M70 46 L94 70 L70 94 L46 70 Z" />
      {/* Círculo no miolo */}
      <circle cx="70" cy="70" r="6" />
    </svg>
  )
}

const SVG_BY_VARIANT: Record<EmptyStateVariant, React.ComponentType<SvgProps>> = {
  partnerships: PartnershipsSvg,
  vouchers: VouchersSvg,
  comm: CommSvg,
  history: HistorySvg,
  leads: LeadsSvg,
  generic: GenericSvg,
}

export function EmptyState({
  variant,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  const SvgIcon = SVG_BY_VARIANT[variant] ?? GenericSvg

  const actionEl = action
    ? action.href
      ? (
        <a
          href={action.href}
          className="empty-state-action"
          style={{
            display: 'inline-block',
            marginTop: 18,
            padding: '10px 22px',
            border: `1px solid ${SVG_COLOR}`,
            borderRadius: 999,
            color: SVG_COLOR,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            textDecoration: 'none',
            transition: 'background 200ms ease, color 200ms ease',
          }}
        >
          {action.label}
        </a>
      )
      : (
        <button
          type="button"
          onClick={action.onClick}
          className="empty-state-action"
          style={{
            display: 'inline-block',
            marginTop: 18,
            padding: '10px 22px',
            border: `1px solid ${SVG_COLOR}`,
            borderRadius: 999,
            background: 'transparent',
            color: SVG_COLOR,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'background 200ms ease, color 200ms ease',
          }}
        >
          {action.label}
        </button>
      )
    : null

  return (
    <div
      className={cn('empty-state', className)}
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '40px 24px',
        gap: 12,
      }}
    >
      <SvgIcon />
      <div
        style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontStyle: 'italic',
          fontSize: 22,
          fontWeight: 500,
          color: SVG_COLOR,
          lineHeight: 1.2,
          marginTop: 4,
        }}
      >
        {title}
      </div>
      {message ? (
        <div
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13,
            color: '#B8A88E',
            lineHeight: 1.5,
            maxWidth: 380,
          }}
        >
          {message}
        </div>
      ) : null}
      {actionEl}
    </div>
  )
}
