'use client'

/**
 * AIDigestCard · "Resumo do dia" generativo (Claude Haiku) no topo
 * de /b2b/analytics.
 *
 * UI luxury (Cormorant Garamond italic 18px · champagne #E8DCC4 ·
 * eyebrow gold #C9A96E uppercase 11px · border 1px gold/20%). Loading
 * com shimmer dourado · botao sutil "regenerar" no canto superior
 * direito · estado de erro discreto.
 *
 * Server Action: generateDailyDigestAction({ force }) · cache 1h em
 * memoria server-side por clinic_id.
 */

import { useEffect, useState, useTransition } from 'react'
import {
  generateDailyDigestAction,
  type DailyDigestResult,
} from './ai-actions'

export function AIDigestCard() {
  const [result, setResult] = useState<DailyDigestResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
    startTransition(async () => {
      const r = await generateDailyDigestAction({ force: false })
      setResult(r)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRegenerate = () => {
    startTransition(async () => {
      const r = await generateDailyDigestAction({ force: true })
      setResult(r)
    })
  }

  const showSkeleton = isPending || !hasMounted
  const text = result?.ok && result.text ? result.text : null
  const errorMsg = result && !result.ok ? digestErrorLabel(result.error) : null

  return (
    <section
      aria-label="Resumo do dia gerado por IA"
      style={{
        position: 'relative',
        padding: '20px 24px',
        background:
          'linear-gradient(135deg, rgba(201,169,110,0.06) 0%, rgba(15,15,15,0.4) 100%)',
        border: '1px solid rgba(201, 169, 110, 0.2)',
        borderRadius: 12,
        marginBottom: 14,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: '#C9A96E',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <span aria-hidden="true" style={{ marginRight: 4 }}>
            ✨
          </span>
          resumo do dia
        </div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isPending}
          aria-label="Regenerar resumo"
          title={
            result?.cachedAt
              ? `Gerado em ${new Date(result.cachedAt).toLocaleString('pt-BR')} · clique pra regerar`
              : 'Regenerar resumo'
          }
          style={{
            background: 'transparent',
            border: '1px solid rgba(201, 169, 110, 0.3)',
            borderRadius: 999,
            color: '#C9A96E',
            fontSize: 10.5,
            letterSpacing: '0.5px',
            padding: '4px 10px',
            cursor: isPending ? 'wait' : 'pointer',
            opacity: isPending ? 0.5 : 1,
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              transition: 'transform 0.4s',
              transform: isPending ? 'rotate(360deg)' : 'rotate(0deg)',
            }}
          >
            ↻
          </span>
          regenerar
        </button>
      </header>

      <div style={{ minHeight: 72 }}>
        {showSkeleton ? (
          <DigestSkeleton />
        ) : text ? (
          <p
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontStyle: 'italic',
              fontSize: 18,
              fontWeight: 400,
              lineHeight: 1.5,
              color: '#E8DCC4',
              margin: 0,
              letterSpacing: '0.2px',
            }}
          >
            {text}
          </p>
        ) : (
          <p
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 12,
              color: '#7A7165',
              margin: 0,
              fontStyle: 'italic',
            }}
          >
            {errorMsg ?? 'não consegui gerar agora'}
          </p>
        )}
      </div>

      {result?.cachedAt && !showSkeleton && text ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 9.5,
            color: '#7A7165',
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: '0.4px',
          }}
        >
          gerado em{' '}
          {new Date(result.cachedAt).toLocaleString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
          })}
        </div>
      ) : null}
    </section>
  )
}

function DigestSkeleton() {
  return (
    <div
      role="status"
      aria-label="Gerando resumo do dia"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <SkeletonLine width="92%" />
      <SkeletonLine width="78%" />
      <SkeletonLine width="64%" />
      <style>{`
        @keyframes b2b-digest-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  )
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      style={{
        height: 18,
        width,
        borderRadius: 4,
        background:
          'linear-gradient(90deg, rgba(201,169,110,0.06) 0%, rgba(201,169,110,0.18) 50%, rgba(201,169,110,0.06) 100%)',
        backgroundSize: '200% 100%',
        animation: 'b2b-digest-shimmer 1.6s ease-in-out infinite',
      }}
    />
  )
}

function digestErrorLabel(code: string | undefined): string {
  if (!code) return 'não consegui gerar agora'
  if (code === 'budget_exceeded')
    return 'orçamento de IA do dia esgotado · tente amanhã'
  if (code === 'api_key_missing')
    return 'API key da Anthropic não configurada'
  if (code === 'analytics_unavailable')
    return 'sem dados suficientes pra resumir agora'
  if (code === 'empty_completion') return 'resposta vazia · tente regenerar'
  return 'não consegui gerar agora'
}
