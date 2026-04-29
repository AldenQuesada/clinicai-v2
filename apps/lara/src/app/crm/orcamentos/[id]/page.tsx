/**
 * /crm/orcamentos/[id] · detalhe + actions-bar.
 *
 * RSC busca orcamento + lead/paciente vinculado (resolve nome/telefone) +
 * passa pra ActionsBar (client). Layout sequencial:
 *
 *   PageHeader (titulo + status badge + breadcrumb)
 *   Cards horizontais: subject info, datas, total
 *   ActionsBar (botoes transicao + share + soft-delete)
 *   Items table (descricao | qty x unitPrice | subtotal)
 *   Subtotal/Discount/Total
 *   Payments timeline (lista) · vazio = "Nenhum pagamento registrado"
 *   Notes (markdown-ish · so quebra linha por enquanto)
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  OrcamentoStatusBadge,
  PageHeader,
  Button,
} from '@clinicai/ui'
import { ArrowLeft, FileText, Calendar, User } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { OrcamentoActionsBar } from './_actions-bar'

export const dynamic = 'force-dynamic'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function OrcamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { ctx, repos } = await loadServerReposContext()

  const orcamento = await repos.orcamentos.getById(id).catch(() => null)
  if (!orcamento) notFound()

  // Resolve subject (lead OU paciente) em paralelo · um dos dois eh null
  const [lead, patient] = await Promise.all([
    orcamento.leadId
      ? repos.leads.getById(orcamento.leadId).catch(() => null)
      : Promise.resolve(null),
    orcamento.patientId
      ? repos.patients.getById(orcamento.patientId).catch(() => null)
      : Promise.resolve(null),
  ])

  const subjectName = patient?.name ?? lead?.name ?? null
  const subjectPhone = patient?.phone ?? lead?.phone ?? null
  const subjectKind = patient ? 'Paciente' : lead ? 'Lead' : 'Anônimo'
  const subjectHref = patient
    ? `/crm/pacientes/${patient.id}`
    : lead
      ? `/crm/leads/${lead.id}`
      : null

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={orcamento.title || 'Orçamento'}
        description={`#${orcamento.number ?? orcamento.id.slice(0, 8)}`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Orçamentos', href: '/crm/orcamentos' },
          { label: orcamento.title || 'Detalhe' },
        ]}
        actions={
          <Link href="/crm/orcamentos">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        }
      />

      {/* Status + actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <OrcamentoStatusBadge status={orcamento.status} />
        <OrcamentoActionsBar
          orcamento={orcamento}
          phoneE164={subjectPhone}
          recipientName={subjectName}
          userRole={ctx.role ?? null}
        />
      </div>

      {/* Info cards · 3 colunas */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <InfoCard
          icon={<User className="h-4 w-4" />}
          label="Vinculado a"
          value={
            subjectName ?? `${subjectKind} sem nome`
          }
          subValue={subjectKind}
          href={subjectHref}
        />
        <InfoCard
          icon={<Calendar className="h-4 w-4" />}
          label="Validade"
          value={formatDate(orcamento.validUntil)}
          subValue={`Criado ${formatDate(orcamento.createdAt)}`}
        />
        <InfoCard
          icon={<FileText className="h-4 w-4" />}
          label="Total"
          value={BRL.format(orcamento.total)}
          subValue={
            orcamento.discount > 0
              ? `Desconto ${BRL.format(orcamento.discount)}`
              : undefined
          }
          accent="primary"
        />
      </div>

      {/* Items */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent>
          {orcamento.items.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Nenhum item cadastrado.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-2 text-left">Descrição</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unitário</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {orcamento.items.map((it, i) => (
                  <tr
                    key={`${it.name}-${i}`}
                    className="border-b border-[var(--border)]/40"
                  >
                    <td className="py-2 text-[var(--foreground)]">
                      {it.name}
                      {it.procedureCode && (
                        <span className="ml-2 text-[10px] text-[var(--muted-foreground)]/70">
                          ({it.procedureCode})
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right text-[var(--muted-foreground)]">
                      {it.qty}
                    </td>
                    <td className="py-2 text-right text-[var(--muted-foreground)]">
                      {BRL.format(it.unitPrice)}
                    </td>
                    <td className="py-2 text-right font-medium text-[var(--foreground)]">
                      {BRL.format(it.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr>
                  <td colSpan={3} className="pt-3 text-right text-[var(--muted-foreground)]">
                    Subtotal
                  </td>
                  <td className="pt-3 text-right text-[var(--foreground)]">
                    {BRL.format(orcamento.subtotal)}
                  </td>
                </tr>
                {orcamento.discount > 0 && (
                  <tr>
                    <td colSpan={3} className="text-right text-[var(--muted-foreground)]">
                      Desconto
                    </td>
                    <td className="text-right text-rose-300">
                      − {BRL.format(orcamento.discount)}
                    </td>
                  </tr>
                )}
                <tr className="font-display-italic text-base">
                  <td colSpan={3} className="pt-2 text-right text-[var(--foreground)]">
                    Total
                  </td>
                  <td className="pt-2 text-right text-[var(--primary)]">
                    {BRL.format(orcamento.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pagamentos registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {orcamento.payments.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Nenhum pagamento registrado.
            </p>
          ) : (
            <ul className="space-y-2">
              {orcamento.payments.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between border-b border-[var(--border)]/40 pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className="text-[var(--foreground)]">
                    {p.method ?? 'Pagamento'}{' '}
                    {p.date && (
                      <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                        {formatDateTime(p.date)}
                      </span>
                    )}
                  </span>
                  <span className="font-display-italic text-[var(--foreground)]">
                    {p.amount != null ? BRL.format(p.amount) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {orcamento.notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-[var(--foreground)]">
              {orcamento.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Status timeline · audit visivel pra cliente entender por onde passou */}
      <Card>
        <CardHeader>
          <CardTitle>Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-xs">
            <li>
              <span className="text-[var(--muted-foreground)]">Criado:</span>{' '}
              {formatDateTime(orcamento.createdAt)}
            </li>
            {orcamento.sentAt && (
              <li>
                <span className="text-[var(--muted-foreground)]">Enviado:</span>{' '}
                {formatDateTime(orcamento.sentAt)}
              </li>
            )}
            {orcamento.viewedAt && (
              <li>
                <span className="text-[var(--muted-foreground)]">Visualizado:</span>{' '}
                {formatDateTime(orcamento.viewedAt)}
              </li>
            )}
            {orcamento.approvedAt && (
              <li>
                <span className="text-emerald-400">Aprovado:</span>{' '}
                {formatDateTime(orcamento.approvedAt)}
              </li>
            )}
            {orcamento.lostAt && (
              <li>
                <span className="text-rose-400">Perdido:</span>{' '}
                {formatDateTime(orcamento.lostAt)}{' '}
                {orcamento.lostReason && (
                  <em className="text-[var(--muted-foreground)]">
                    · {orcamento.lostReason}
                  </em>
                )}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

interface InfoCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  href?: string | null
  accent?: 'primary'
}

function InfoCard({ icon, label, value, subValue, href, accent }: InfoCardProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-medium ${
          accent === 'primary' ? 'text-[var(--primary)]' : 'text-[var(--foreground)]'
        }`}
      >
        {value}
      </div>
      {subValue && (
        <div className="text-[10px] text-[var(--muted-foreground)]/70">
          {subValue}
        </div>
      )}
    </>
  )
  return (
    <Card className={`p-3 ${href ? 'transition-colors hover:bg-[var(--card)]/80' : ''}`}>
      {href ? <Link href={href}>{body}</Link> : body}
    </Card>
  )
}
