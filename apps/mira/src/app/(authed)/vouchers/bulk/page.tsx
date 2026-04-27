/**
 * /vouchers/bulk · admin emit lote de vouchers.
 *
 * Server Component denso (mirror mira-config antigo) · fluxo:
 *   1. Form: parceria + combo + lista textarea + dispatch_when → "Validar lote"
 *   2. Server Action validateBulkAction parseia + dedup paralelo · grava
 *      preview em cookie · revalida pagina.
 *   3. Page renderiza preview com cards eligible/blocked.
 *   4. "Confirmar e enfileirar" chama enqueueBulkAction · redirect /bulk/[batchId].
 *
 * Sem client components · forms via Server Actions.
 *
 * UI: gold #C9A96E, slate #9CA3AF, max-w-[860px], rounded-lg.
 *
 * SCHEDULING (mig 800-23 · 2026-04-26):
 *   Radio "Quando enviar": [Agora] | [Agendar pra DD/MM HH:MM]
 *   - Agora: scheduled_at = now() · worker pega no proximo tick (1min)
 *   - Agendar: datetime-local · min +5min no futuro · worker pega quando vencer
 *   Native datetime-local renderiza no fuso do browser · server converte pra
 *   ISO em validateBulkAction (Date(value) usa offset local · em prod o
 *   container roda UTC mas BR digita BRT · ver actions.ts pra conversao).
 */

import Link from 'next/link'
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { formatPhoneBR } from '@clinicai/utils'
import { loadMiraServerContext } from '@/lib/server-context'
import {
  validateBulkAction,
  enqueueBulkAction,
  clearBulkPreviewAction,
  readBulkPreview,
  type BulkPreviewItem,
} from './actions'

export const dynamic = 'force-dynamic'

// Default scheduled_at = agora (datetime-local sem TZ · YYYY-MM-DDTHH:mm)
function localNowInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Minimo permitido pra agendamento · agora + 5min · evita race com worker
// que ja pode estar rodando no minuto atual.
function localPlusMinutesInput(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Default sugerido quando user clica "Agendar": hoje 12:00 ou amanha 12:00
// se ja passou de meio-dia. Pedido Alden 2026-04-26: hora padrao 12:00,
// nao a hora atual.
function localNextNoonInput(): string {
  const now = new Date()
  const target = new Date(now)
  target.setHours(12, 0, 0, 0)
  // Se ja passou de meio-dia hoje, agenda pra amanha 12:00
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T12:00`
}

// Heuristica: scheduled_at e "agora-ish" se diferenca pra now <= 90s.
// Usado pra decidir qual radio vem checked quando carregamos preview do cookie.
function isNowIsh(iso: string): boolean {
  if (!iso) return true
  try {
    const t = new Date(iso).getTime()
    if (isNaN(t)) return true
    return Math.abs(t - Date.now()) <= 90_000
  } catch {
    return true
  }
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function fmtDateOnly(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return iso
  }
}

const BATCH_STATUS_PILL: Record<string, string> = {
  pending: 'bg-[#9CA3AF]/18 text-[#9CA3AF]',
  processing: 'bg-[#C9A96E]/18 text-[#C9A96E]',
  done: 'bg-[#10B981]/15 text-[#10B981]',
  failed: 'bg-[#DC2626]/15 text-[#DC2626]',
  cancelled: 'bg-[#6B7280]/15 text-[#6B7280]',
}

function worstStatus(s: {
  pending: number
  processing: number
  failed: number
  done: number
  cancelled: number
}): string {
  if (s.failed > 0) return 'failed'
  if (s.processing > 0) return 'processing'
  if (s.pending > 0) return 'pending'
  if (s.cancelled > 0 && s.done === 0) return 'cancelled'
  if (s.done > 0) return 'done'
  return 'pending'
}

export default async function VoucherBulkPage() {
  const { ctx, repos } = await loadMiraServerContext()

  const [partnerships, recentBatches, preview] = await Promise.all([
    repos.b2bPartnerships.list(ctx.clinic_id, { status: 'active' }),
    repos.voucherQueue.listRecentBatches(ctx.clinic_id, 10),
    readBulkPreview(),
  ])

  const partnershipNameById = new Map(partnerships.map((p) => [p.id, p.name]))
  // Mapa parceria → combo cadastrado · usado pra hint visual e datalist
  // (Alden 2026-04-26: combo tem que casar com parceria por defeito)
  const partnershipComboById = new Map(
    partnerships.map((p) => [p.id, p.voucherCombo ?? '']),
  )
  // Lista unica de combos disponiveis (datalist autocomplete)
  const uniqueCombos = Array.from(
    new Set(
      partnerships
        .map((p) => p.voucherCombo)
        .filter((c): c is string => !!c && c.trim().length > 0),
    ),
  )
  // Se preview existe e scheduled_at e ~now, mantem radio "Agora"
  // (eligibleCount>0 e usuario tinha clicado Agora no formulario anterior).
  // Senao "Agendar" e o defaultScheduled = horario que ele escolheu.
  const previewIsNow = preview ? isNowIsh(preview.scheduledAt) : true
  const defaultDispatchWhen: 'now' | 'schedule' = preview
    ? previewIsNow
      ? 'now'
      : 'schedule'
    : 'now'
  const defaultScheduled =
    preview?.scheduledAt && !previewIsNow
      ? toLocalInput(preview.scheduledAt)
      : localNextNoonInput() // sugestao 12:00 (Alden 2026-04-26)
  // min do datetime-local = +5min no futuro · evita race com worker atual
  const minScheduled = localPlusMinutesInput(5)

  return (
    <main
      className="flex-1 overflow-y-auto custom-scrollbar"
      style={{
        // Sanity belt-and-suspenders · forca bg dark (Alden 2026-04-26
        // reportou white flash). HSL var fallback se nao carregar.
        background: 'hsl(60 5% 7%)',
      }}
    >
      <div
        className="max-w-[860px] mx-auto px-6 py-6 flex flex-col gap-3"
        style={{ color: '#F5F0E8' }}
      >
        {/* Header denso */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Link
              href="/vouchers"
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div>
              <span className="eyebrow text-[#C9A96E]">Hoje · Vouchers em curso</span>
              <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
                Emitir lote de vouchers
              </h1>
              <p className="text-[11px] text-[#9CA3AF] mt-1">
                Cole a lista (1 por linha) · sistema valida dedup e agenda dispatch
              </p>
            </div>
          </div>
        </div>

        {/* Form principal */}
        <form
          action={validateBulkAction}
          className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3.5"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="bulk-partnership"
                className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]"
              >
                Parceria
              </label>
              <select
                id="bulk-partnership"
                name="partnership_id"
                defaultValue={preview?.partnershipId ?? ''}
                required
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
                style={{ colorScheme: 'dark' }}
              >
                <option value="">Selecionar parceria ativa…</option>
                {partnerships.map((p) => {
                  const combo = partnershipComboById.get(p.id)
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {combo ? ` · combo: ${combo}` : ' · sem combo'}
                    </option>
                  )
                })}
              </select>
              {partnerships.length === 0 && (
                <span className="text-[10px] text-[#DC2626]">
                  Nenhuma parceria ativa · ativa uma em /partnerships
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="bulk-combo"
                className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]"
              >
                Combo (opcional · default da parceria)
              </label>
              <input
                id="bulk-combo"
                name="combo"
                type="text"
                placeholder="vazio = usa combo cadastrado da parceria"
                defaultValue={preview?.combo ?? ''}
                list="bulk-combo-options"
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] placeholder:text-[#6B7280] focus:outline-none focus:border-[#C9A96E]/50"
              />
              {uniqueCombos.length > 0 ? (
                <datalist id="bulk-combo-options">
                  {uniqueCombos.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              ) : null}
              <span className="text-[10px] text-[#6B7280]">
                Vazio = usa combo da parceria selecionada (visivel no dropdown ↑)
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="bulk-list"
              className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]"
            >
              Lista (1 por linha · formatos aceitos)
            </label>
            <textarea
              id="bulk-list"
              name="list_text"
              rows={10}
              required
              placeholder={
                'Maria 5544991111111\nAna Paula (44) 99222-2222\nBia Mendes 44 99333-3333\n...'
              }
              defaultValue={preview?.listText ?? ''}
              className="px-3 py-2.5 rounded-lg bg-[#0a0a0a]/60 border border-white/10 text-xs font-mono text-[#F5F0E8] placeholder:text-[#6B7280] focus:outline-none focus:border-[#C9A96E]/50 resize-y"
            />
            <span className="text-[10px] text-[#6B7280]">
              Aceita: <span className="text-[#9CA3AF]">Nome 5544991111111</span>{' '}
              · <span className="text-[#9CA3AF]">Nome (44) 99111-1111</span> ·{' '}
              <span className="text-[#9CA3AF]">Nome 44 99111 1111</span> ·
              inline com vírgula
            </span>
          </div>

          {/*
            Quando enviar · datetime-local visivel SO se "Agendar" selecionado.
            CSS injetado abaixo usa :has() pra controlar visibilidade puro CSS
            (sem JS) · Pedido Alden 2026-04-26.
          */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                .bulk-schedule-section .bulk-schedule-row { display: none; }
                .bulk-schedule-section:has(input[value="schedule"]:checked) .bulk-schedule-row { display: flex; }
              `,
            }}
          />
          <div className="flex flex-col gap-2 bulk-schedule-section">
            <label className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]">
              Quando enviar
            </label>
            <div className="flex gap-3 items-center flex-wrap">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 cursor-pointer has-[:checked]:border-[#C9A96E]/50 has-[:checked]:bg-[#C9A96E]/[0.06] transition-colors">
                <input
                  type="radio"
                  name="dispatch_when"
                  value="now"
                  defaultChecked={defaultDispatchWhen === 'now'}
                  className="accent-[#C9A96E]"
                />
                <span className="text-xs text-[#F5F0E8]">Agora</span>
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 cursor-pointer has-[:checked]:border-[#C9A96E]/50 has-[:checked]:bg-[#C9A96E]/[0.06] transition-colors">
                <input
                  type="radio"
                  name="dispatch_when"
                  value="schedule"
                  defaultChecked={defaultDispatchWhen === 'schedule'}
                  className="accent-[#C9A96E]"
                />
                <span className="text-xs text-[#F5F0E8]">Agendar data e hora</span>
              </label>
            </div>
            {/* Linha do datetime · so aparece quando "Agendar" selecionado */}
            <div className="bulk-schedule-row gap-2 items-center mt-1">
              <span className="text-[10px] uppercase tracking-[1px] text-[#9CA3AF]">
                Disparar em:
              </span>
              <input
                id="bulk-scheduled"
                name="scheduled_at"
                type="datetime-local"
                defaultValue={defaultScheduled}
                min={minScheduled}
                step={60}
                aria-label="Data e hora do dispatch"
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
                style={{ colorScheme: 'dark' }}
              />
              <span className="text-[10px] text-[#6B7280]">
                Default 12:00 · mínimo +5min no futuro · fuso BR
              </span>
            </div>
            <span className="text-[10px] text-[#6B7280]">
              <span className="text-[#9CA3AF]">Agora</span> = worker dispara no próximo minuto ·{' '}
              <span className="text-[#9CA3AF]">Agendar</span> = abre seletor de data/hora
            </span>
          </div>

          <div className="flex justify-end gap-2">
            {preview && (
              <button
                type="submit"
                formAction={clearBulkPreviewAction}
                className="px-3 py-2 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/10 text-[#9CA3AF] hover:text-[#F5F0E8] hover:border-white/14 transition-colors"
              >
                Limpar
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 rounded font-semibold text-xs uppercase tracking-[1px] bg-[#C9A96E] text-[#0a0a0a] hover:opacity-90 transition-opacity"
            >
              Validar lote
            </button>
          </div>
        </form>

        {/* Preview · renderizado se cookie estiver presente */}
        {preview && <PreviewBlock preview={preview} />}

        {/* Lista de batches recentes */}
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]">
              Últimos lotes
            </h2>
            <span className="text-[10px] text-[#6B7280]">
              {recentBatches.length} batch{recentBatches.length === 1 ? '' : 'es'}
            </span>
          </div>
          {recentBatches.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-center text-xs text-[#9CA3AF]">
              Nenhum lote enviado ainda · valide e enfileire seu primeiro acima.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentBatches.map((b) => {
                const status = worstStatus(b)
                const pill = BATCH_STATUS_PILL[status] ?? BATCH_STATUS_PILL.pending
                return (
                  <Link
                    key={b.batchId}
                    href={`/vouchers/bulk/${b.batchId}`}
                    className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3.5 py-2.5 bg-white/[0.02] border border-white/10 rounded-lg hover:border-white/14 transition-colors"
                  >
                    <span className="font-mono text-[11px] text-[#C9A96E]">
                      #{b.batchId.slice(0, 8)}
                    </span>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span className="text-xs text-[#F5F0E8] truncate">
                        {partnershipNameById.get(b.partnershipId) ?? '—'}
                        <span className="ml-2 text-[10.5px] text-[#9CA3AF]">
                          {b.total} item{b.total === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono text-[#6B7280]">
                        agendado {fmtDateTime(b.scheduledAt)}
                      </span>
                    </div>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${pill}`}
                    >
                      {status}
                    </span>
                    <div className="flex flex-col items-end gap-0.5 text-[10px] text-[#6B7280] font-mono whitespace-nowrap">
                      <span>{b.done}/{b.total} done</span>
                      {b.failed > 0 && (
                        <span className="text-[#FCA5A5]">{b.failed} fail</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function PreviewBlock({ preview }: { preview: Awaited<ReturnType<typeof readBulkPreview>> }) {
  if (!preview) return null

  if (preview.fatalError) {
    return (
      <div className="rounded-lg border border-[#DC2626]/30 bg-[#DC2626]/10 px-3.5 py-3 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-[#FCA5A5] mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] uppercase tracking-[1px] font-bold text-[#FCA5A5]">
            Não consegui validar
          </span>
          <span className="text-xs text-[#F5F0E8]">{preview.fatalError}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] flex flex-col">
      {/* Resumo header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[1px] font-bold text-[#C9A96E]">
            Preview
          </span>
          <span className="text-xs text-[#F5F0E8]">
            {preview.partnershipName}
          </span>
          <span className="text-[10px] text-[#6B7280]">
            {preview.dispatchWhen === 'now' || isNowIsh(preview.scheduledAt)
              ? 'dispara agora'
              : `agendado ${fmtDateTime(preview.scheduledAt)}`}
          </span>
          {preview.scheduleWasFloored && (
            <span className="text-[10px] text-[#FCA5A5]">
              ajustado pra +5min (passado/proximo demais)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-[#10B981]">{preview.eligibleCount} OK</span>
          {preview.blockedCount > 0 && (
            <span className="text-[#FCA5A5]">{preview.blockedCount} bloq</span>
          )}
        </div>
      </div>

      {/* Lista preview */}
      <div className="divide-y divide-white/6">
        {preview.items.map((it, idx) => (
          <PreviewRow key={`${it.phone}-${idx}`} item={it} />
        ))}
      </div>

      {/* CTA confirmar · disabled se eligibleCount=0 */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-white/10">
        <span className="text-[10px] text-[#6B7280]">
          {preview.declaredCount != null && (
            <>declarados {preview.declaredCount} · </>
          )}
          {preview.scheduleHint && <>hint &quot;{preview.scheduleHint}&quot; · </>}
          combo &quot;{preview.combo || '—'}&quot;
        </span>
        <form action={enqueueBulkAction}>
          <button
            type="submit"
            disabled={preview.eligibleCount === 0}
            className="px-4 py-2 rounded font-semibold text-xs uppercase tracking-[1px] bg-[#C9A96E] text-[#0a0a0a] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {preview.dispatchWhen === 'schedule' && !isNowIsh(preview.scheduledAt)
              ? `Agendar ${preview.eligibleCount}`
              : `Disparar ${preview.eligibleCount} agora`}
          </button>
        </form>
      </div>
    </div>
  )
}

function PreviewRow({ item }: { item: BulkPreviewItem }) {
  if (item.status === 'eligible') {
    return (
      <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3.5 py-2 hover:bg-white/[0.01] transition-colors">
        <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-xs text-[#F5F0E8] truncate">{item.name}</span>
          <span className="text-[10.5px] font-mono text-[#9CA3AF]">
            {formatPhoneBR(item.phone)}
          </span>
        </div>
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] bg-[#10B981]/15 text-[#10B981]">
          OK
        </span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3.5 py-2 bg-[#DC2626]/[0.04] hover:bg-[#DC2626]/[0.07] transition-colors">
      <XCircle className="w-3.5 h-3.5 text-[#FCA5A5]" />
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="text-xs text-[#F5F0E8] truncate">
          {item.name}
          <span className="text-[10.5px] font-mono text-[#9CA3AF] ml-2">
            {formatPhoneBR(item.phone)}
          </span>
        </span>
        <span className="text-[10px] text-[#FCA5A5]">
          {item.blockReason ?? 'Bloqueada'}
          {item.dedupName && (
            <span className="text-[#9CA3AF] ml-1">
              · cadastrada como &quot;{item.dedupName}&quot;
            </span>
          )}
          {item.dedupSince && (
            <span className="text-[#6B7280] ml-1">
              · desde {fmtDateOnly(item.dedupSince)}
            </span>
          )}
          {item.dedupPartnership && (
            <span className="text-[#6B7280] ml-1">
              · via {item.dedupPartnership}
            </span>
          )}
        </span>
      </div>
      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] bg-[#DC2626]/15 text-[#FCA5A5]">
        BLOQ
      </span>
    </div>
  )
}

// Converte ISO → datetime-local input value (YYYY-MM-DDTHH:mm)
function toLocalInput(iso: string): string {
  if (!iso) return localNowInput()
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return localNowInput()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return localNowInput()
  }
}
