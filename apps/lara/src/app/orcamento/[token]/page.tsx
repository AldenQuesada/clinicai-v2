/**
 * /orcamento/[token] · pagina PUBLICA (sem JWT) do orcamento.
 *
 * Token serve de auth · UUID v4 gerado em ensureShareToken. Server lookup
 * via service_role (bypass RLS) porque caller eh anonimo. Repository
 * `getByShareTokenGlobal` faz o lookup sem clinic_id; service_role aplica
 * permissoes de Postgres direto.
 *
 * Side-effect: marca viewed_at na primeira leitura (status=sent → viewed).
 *
 * Privacidade: NAO expoe `notes` (notas internas), `payments` (info
 * financeira), `lostReason`, `createdBy`. Mostra so titulo, items, total,
 * validade, status visivel, nome do destinatario.
 *
 * Layout sem nav · usa root layout. Estilo prox do legacy orcamento.html
 * mas mais sobrio (sem CTA Embaixadoras VPI).
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  OrcamentoStatusBadge,
} from '@clinicai/ui'
import { Calendar, FileText, MessageCircle } from 'lucide-react'
import { OrcamentoRepository, LeadRepository, PatientRepository } from '@clinicai/repositories'
import { createServiceRoleClient } from '@clinicai/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

interface ResolvedSubject {
  name: string | null
  phone: string | null
}

async function resolveSubject(
  sb: ReturnType<typeof createServiceRoleClient>,
  leadId: string | null,
  patientId: string | null,
): Promise<ResolvedSubject> {
  if (patientId) {
    const repo = new PatientRepository(sb)
    const p = await repo.getById(patientId).catch(() => null)
    if (p) return { name: p.name, phone: p.phone ?? null }
  }
  if (leadId) {
    const repo = new LeadRepository(sb)
    const l = await repo.getById(leadId).catch(() => null)
    if (l) return { name: l.name, phone: l.phone }
  }
  return { name: null, phone: null }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  try {
    const sb = createServiceRoleClient()
    const repo = new OrcamentoRepository(sb)
    const orc = await repo.getByShareTokenGlobal(token, { markViewed: false })
    if (!orc) return { title: 'Orçamento · Mirian de Paula' }
    return {
      title: `${orc.title ?? 'Orçamento'} · Mirian de Paula`,
      description: `Proposta no valor de ${BRL.format(orc.total)} · válida até ${formatDate(orc.validUntil)}`,
      robots: 'noindex, nofollow',
    }
  } catch {
    return { title: 'Orçamento · Mirian de Paula' }
  }
}

export default async function PublicOrcamentoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // service_role · token serve de auth (UUID v4 nao adivinhavel)
  const sb = createServiceRoleClient()
  const repo = new OrcamentoRepository(sb)
  const orcamento = await repo
    .getByShareTokenGlobal(token, { markViewed: true })
    .catch(() => null)
  if (!orcamento) notFound()

  const subject = await resolveSubject(sb, orcamento.leadId, orcamento.patientId)
  const firstName = (subject.name ?? '').trim().split(/\s+/)[0]
  const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!'

  // Validade · calcula dias restantes pra exibir hint
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const validUntilDate = orcamento.validUntil
    ? new Date(`${orcamento.validUntil}T00:00:00`)
    : null
  const daysLeft = validUntilDate
    ? Math.ceil((validUntilDate.getTime() - today.getTime()) / 86400000)
    : null
  const isExpired =
    daysLeft !== null && daysLeft < 0 && orcamento.status !== 'approved'

  const waUrl = `https://wa.me/5573988887777?text=${encodeURIComponent(
    orcamento.status === 'approved'
      ? `Olá Mirian! Vim aprovar o orçamento "${orcamento.title ?? 'meu orçamento'}" pra agendar.`
      : `Olá Mirian! Vim sobre o orçamento "${orcamento.title ?? 'que recebi'}". Tenho uma dúvida.`,
  )}`

  return (
    <div className="min-h-screen bg-[var(--background)] py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header da clinica */}
        <div className="mb-8 text-center">
          <p className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
            Mirian de Paula · Estética
          </p>
          <h1 className="mt-2 font-display-italic text-2xl text-[var(--foreground)]">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Aqui está o orçamento que preparei pra você.
          </p>
        </div>

        {/* Status + titulo */}
        <Card className="mb-4">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <OrcamentoStatusBadge status={orcamento.status} />
              {isExpired && (
                <span className="text-[10px] font-display-uppercase tracking-widest text-rose-400">
                  Expirado
                </span>
              )}
              {!isExpired && daysLeft !== null && daysLeft <= 7 && (
                <span className="text-[10px] font-display-uppercase tracking-widest text-amber-300">
                  Expira em {daysLeft}d
                </span>
              )}
            </div>
            <h2 className="font-display-italic text-xl text-[var(--foreground)]">
              {orcamento.title ?? 'Orçamento personalizado'}
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                  <FileText className="h-3 w-3" />
                  Nº
                </div>
                <div className="text-[var(--foreground)]">
                  #{orcamento.number ?? orcamento.id.slice(0, 8)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                  <Calendar className="h-3 w-3" />
                  Validade
                </div>
                <div className="text-[var(--foreground)]">
                  {formatDate(orcamento.validUntil)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Procedimentos</CardTitle>
          </CardHeader>
          <CardContent>
            {orcamento.items.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Nenhum item.
              </p>
            ) : (
              <ul className="space-y-3">
                {orcamento.items.map((it, i) => (
                  <li
                    key={`${it.name}-${i}`}
                    className="flex items-baseline justify-between border-b border-[var(--border)]/40 pb-2 text-sm last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="text-[var(--foreground)]">{it.name}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]/70">
                        {it.qty} × {BRL.format(it.unitPrice)}
                      </div>
                    </div>
                    <div className="font-display-italic text-[var(--foreground)]">
                      {BRL.format(it.subtotal)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Totais */}
        <Card className="mb-6">
          <CardContent className="space-y-2 p-5 text-sm">
            <div className="flex justify-between text-[var(--muted-foreground)]">
              <span>Subtotal</span>
              <span>{BRL.format(orcamento.subtotal)}</span>
            </div>
            {orcamento.discount > 0 && (
              <div className="flex justify-between text-rose-300">
                <span>Desconto</span>
                <span>− {BRL.format(orcamento.discount)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-[var(--border)] pt-2 font-display-italic text-2xl">
              <span className="text-[var(--foreground)]">Total</span>
              <span className="text-[var(--primary)]">
                {BRL.format(orcamento.total)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-6 py-3 text-sm font-medium text-[var(--primary-foreground)] shadow-luxury-md transition-opacity hover:opacity-90"
        >
          <MessageCircle className="h-4 w-4" />
          {orcamento.status === 'approved'
            ? 'Agendar minha sessão'
            : 'Conversar com Mirian'}
        </a>

        <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]/60">
          Mirian de Paula · Estética · este link é único e pessoal.
        </p>
      </div>
    </div>
  )
}
