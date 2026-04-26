'use client'

/**
 * FunnelClient · 5 linhas editaveis (1 por stage do funil B2B).
 *
 * Cada linha · stage label / slider 0-100 + input numerico / label editavel
 * / botao Salvar. Save por stage chama saveFunnelBenchmarkAction(payload)
 * que upserta + revalida /b2b/config/funnel + /b2b/analytics.
 *
 * Espelho do TiersClient (config/tiers/TiersClient.tsx) com mesmo visual
 * tom-em-tom (border-left colorido, bcomm-input, bcomm-btn).
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { B2BFunnelStage } from '@clinicai/repositories'
import { saveFunnelBenchmarkAction } from './actions'

export interface BenchmarkDraft {
  stage: B2BFunnelStage
  targetPct: number
  label: string
  sortOrder: number
  persisted: boolean
}

const STAGE_META: Record<
  B2BFunnelStage,
  { title: string; sub: string; color: string }
> = {
  delivered: {
    title: 'Entregues',
    sub: 'WhatsApp aceitou e o voucher foi entregue',
    color: '#10B981',
  },
  opened: {
    title: 'Abertos',
    sub: 'Convidada abriu/engajou com a mensagem',
    color: '#22D3EE',
  },
  scheduled: {
    title: 'Agendaram',
    sub: 'Convidada agendou consulta após o voucher',
    color: '#C9A96E',
  },
  redeemed: {
    title: 'Compareceram',
    sub: 'Convidada de fato compareceu (anti no-show)',
    color: '#A78BFA',
  },
  purchased: {
    title: 'Pagaram',
    sub: 'Convidada virou paciente pagante',
    color: '#F59E0B',
  },
}

export function FunnelClient({
  initialBenchmarks,
}: {
  initialBenchmarks: BenchmarkDraft[]
}) {
  return (
    <div className="bcfg-body flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <p className="bcfg-hint" style={{ flex: 1, minWidth: 280 }}>
          Benchmarks de step-rate do funil de conversão. Define quando uma
          etapa entra em <strong style={{ color: '#10B981' }}>verde</strong>{' '}
          (≥ meta), <strong style={{ color: '#F59E0B' }}>amarelo</strong>{' '}
          (50-100% da meta) ou{' '}
          <strong style={{ color: '#EF4444' }}>vermelho</strong> (&lt; 50% da
          meta).
        </p>
        <Link
          href="/b2b/analytics"
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            padding: '4px 8px',
            borderRadius: 999,
            background: 'rgba(201, 169, 110, 0.12)',
            color: '#C9A96E',
            border: '1px solid rgba(201, 169, 110, 0.3)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
          title="Aplicado em /b2b/analytics · JourneyBar usa estes valores"
        >
          aplicado em /b2b/analytics →
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {initialBenchmarks.map((b) => (
          <BenchmarkRow key={b.stage} initial={b} />
        ))}
      </div>
    </div>
  )
}

function BenchmarkRow({ initial }: { initial: BenchmarkDraft }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<BenchmarkDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const meta = STAGE_META[draft.stage]

  function patch<K extends keyof BenchmarkDraft>(
    key: K,
    value: BenchmarkDraft[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function reset() {
    setDraft(initial)
    setError(null)
  }

  function save() {
    setError(null)
    if (!draft.label.trim() || draft.label.trim().length < 2) {
      setError('Label obrigatoria (min 2 chars)')
      return
    }
    if (draft.targetPct < 0 || draft.targetPct > 100) {
      setError('Meta deve estar entre 0 e 100')
      return
    }
    startTransition(async () => {
      try {
        const r = await saveFunnelBenchmarkAction({
          stage: draft.stage,
          targetPct: draft.targetPct,
          label: draft.label.trim(),
          sortOrder: draft.sortOrder,
        })
        if (!r.ok) {
          setError(r.error || 'Falha ao salvar')
          return
        }
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 1800)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const dirty =
    draft.targetPct !== initial.targetPct ||
    draft.label !== initial.label

  function setTarget(n: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(n)))
    patch('targetPct', clamped)
  }

  return (
    <div
      className="rounded-lg border border-white/10 bg-[#C9A96E]/[0.03] p-4 flex flex-col gap-3"
      style={{ borderLeftWidth: 4, borderLeftColor: meta.color }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold"
            style={{
              background: `${meta.color}20`,
              color: meta.color,
              border: `1px solid ${meta.color}55`,
            }}
            title={`Stage ${draft.stage}`}
          >
            {draft.sortOrder}
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[2px] font-bold text-[#C9A96E]">
              {draft.stage}
            </span>
            <span className="text-[14px] text-[#F5F0E8] font-medium">
              {meta.title}
            </span>
            <span
              style={{
                fontSize: 10.5,
                color: '#9CA3AF',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {meta.sub}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!initial.persisted && (
            <span className="text-[9px] uppercase tracking-[1.4px] text-[#FCD34D] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded px-1.5 py-0.5">
              nao salvo
            </span>
          )}
          {savedFlash && (
            <span className="text-[9px] uppercase tracking-[1.4px] text-[#86EFAC] bg-[#16A34A]/10 border border-[#16A34A]/30 rounded px-1.5 py-0.5">
              salvo
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="bcfg-field flex flex-col gap-1">
          <span className="bcfg-field-lbl text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">
            Meta (%) <span className="text-[#FCA5A5]">*</span>
            <span className="ml-1 normal-case font-normal tracking-normal text-[#6B7280]">
              · % minimo pra entrar em verde
            </span>
          </span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={draft.targetPct}
              onChange={(e) => setTarget(Number(e.target.value))}
              style={{
                flex: 1,
                accentColor: meta.color,
              }}
              aria-label={`Meta % do stage ${draft.stage}`}
            />
            <input
              type="number"
              className="bcomm-input font-mono"
              value={draft.targetPct}
              min={0}
              max={100}
              step={1}
              onChange={(e) => setTarget(Number(e.target.value) || 0)}
              style={{ width: 80, textAlign: 'center' }}
            />
            <span
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 22,
                fontWeight: 500,
                color: meta.color,
                lineHeight: 1,
                minWidth: 44,
                textAlign: 'right',
              }}
            >
              {draft.targetPct}%
            </span>
          </div>
        </label>

        <label className="bcfg-field flex flex-col gap-1">
          <span className="bcfg-field-lbl text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">
            Label da legenda <span className="text-[#FCA5A5]">*</span>
            <span className="ml-1 normal-case font-normal tracking-normal text-[#6B7280]">
              · texto exibido na legenda do funil
            </span>
          </span>
          <input
            type="text"
            className="bcomm-input"
            value={draft.label}
            onChange={(e) => patch('label', e.target.value)}
            placeholder="Ex.: Taxa de entrega · WhatsApp aceito"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-[#FCA5A5]/30 bg-[#FCA5A5]/10 px-3 py-2 text-[11px] text-[#FCA5A5]">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <button
          type="button"
          className="bcomm-btn"
          onClick={reset}
          disabled={pending || !dirty}
        >
          Desfazer
        </button>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-primary ml-auto"
          onClick={save}
          disabled={pending || (!dirty && initial.persisted)}
          title={!initial.persisted ? 'Salvar primeira vez' : 'Salvar alteracoes'}
        >
          {pending
            ? 'Salvando…'
            : initial.persisted
              ? 'Salvar benchmark'
              : 'Criar benchmark'}
        </button>
      </div>
    </div>
  )
}
