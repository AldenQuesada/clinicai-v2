'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft } from 'lucide-react'

interface Props {
  /** Destino fallback caso `history.back()` não tenha entrada anterior (deep link, nova aba) */
  fallbackHref: string
  label?: string
  /** Variante visual: 'arrow' usa ArrowLeft, 'chevron' usa ChevronLeft */
  variant?: 'arrow' | 'chevron'
  className?: string
}

/**
 * Botão de voltar inteligente: tenta `history.back()` (mantém contexto da
 * navegação), com fallback pra rota fixa quando não tem histórico (ex:
 * usuário abriu via deep link ou nova aba).
 */
export function BackButton({
  fallbackHref,
  label = 'Voltar',
  variant = 'arrow',
  className = '',
}: Props) {
  const router = useRouter()
  const Icon = variant === 'chevron' ? ChevronLeft : ArrowLeft

  function onClick() {
    // Se há history (entrada de navegação prévia na mesma sessão),
    // volta pra ela. Senão cai no fallback.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ||
        'font-meta text-text-muted hover:text-gold transition flex items-center gap-1.5 text-xs'
      }
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  )
}
