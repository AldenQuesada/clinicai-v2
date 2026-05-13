'use client'

/**
 * PatientRecordTabs · CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_DETAIL.
 *
 * Cliente em abas · estado por hash (URL `#tab=...`) para deep-link sem
 * rerodar o server. Cada aba renderiza um sub-componente focado:
 *
 *   1. overview · cards atuais (identidade, contato, financeiro, endereço, origem)
 *   2. agenda · histórico completo de appointments
 *   3. procedimentos · agrupamento snapshot + match com clinic_procedimentos
 *   4. anamnese · lista appointment_anamneses · status + flag hasContent
 *   5. orcamentos · lista orcamentos
 *   6. timeline · merge cronológico read-only
 *   7. documentos · placeholder (medical_record_attachments inacessível)
 *   8. notas · patients.notes + foto/recepção (PRONTUARIO_BASE)
 *
 * Hard gate clínico intocado · respostas clínicas detalhadas não viajam.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
} from '@clinicai/ui'
import {
  Phone,
  Mail,
  CalendarClock,
  Activity,
  ClipboardList,
  FileText,
  ListChecks,
  History,
  FolderLock,
  StickyNote,
  Receipt,
} from 'lucide-react'
import { sexLabel, formatPhoneBR } from '@clinicai/utils'
import type {
  AppointmentDTO,
  OrcamentoDTO,
  PatientAnamnesisRecordDTO,
  PatientDTO,
  PatientProfileExtendedDTO,
  MedicalRecordAttachmentDTO,
} from '@clinicai/repositories'
import { PatientReceptionPanel } from './_reception-panel'
import {
  uploadMedicalRecordAttachmentAction,
  softDeleteMedicalRecordAttachmentAction,
} from './_documents-actions'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

interface ProcedureCatalogEntry {
  key: string
  id: string
  nome: string
  categoria: string | null
  duracaoMin: number | null
  preco: number
  precoPromo: number | null
}

/**
 * DTO público + signed URL (TTL 5min server-side).
 * NUNCA inclui `storagePath`/`bucket` — esses ficam no server.
 */
export type AttachmentForClient = MedicalRecordAttachmentDTO & {
  signedUrl: string | null
  signedUrlExpiresAt: string | null
}

interface Props {
  patient: PatientDTO
  appointments: AppointmentDTO[]
  orcamentos: OrcamentoDTO[]
  anamnesisRecords: PatientAnamnesisRecordDTO[]
  profileExtended: PatientProfileExtendedDTO | null
  photoSignedUrl: string | null
  canEditReception: boolean
  canWriteDocuments: boolean
  attachments: AttachmentForClient[]
  procedureCatalog: ProcedureCatalogEntry[]
  initialTab: string
}

type TabKey =
  | 'overview'
  | 'data'
  | 'agenda'
  | 'procedimentos'
  | 'anamnese'
  | 'orcamentos'
  | 'timeline'
  | 'documentos'
  | 'notas'

const TAB_DEFS: ReadonlyArray<{
  key: TabKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { key: 'overview', label: 'Visão geral', icon: Activity },
  { key: 'data', label: 'Dados', icon: FileText },
  { key: 'agenda', label: 'Agenda', icon: CalendarClock },
  { key: 'procedimentos', label: 'Procedimentos', icon: ListChecks },
  { key: 'anamnese', label: 'Anamnese', icon: ClipboardList },
  { key: 'orcamentos', label: 'Orçamentos', icon: Receipt },
  { key: 'timeline', label: 'Timeline', icon: History },
  { key: 'documentos', label: 'Documentos', icon: FolderLock },
  { key: 'notas', label: 'Notas', icon: StickyNote },
]

function pickTab(raw: string | undefined): TabKey {
  const valid = TAB_DEFS.map((t) => t.key) as readonly TabKey[]
  if (raw && (valid as readonly string[]).includes(raw)) return raw as TabKey
  return 'overview'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

const APPT_STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  aguardando_confirmacao: 'Aguard. confirmação',
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  na_clinica: 'Na clínica',
  em_atendimento: 'Em atendimento',
  finalizado: 'Finalizado',
  remarcado: 'Remarcado',
  cancelado: 'Cancelado',
  no_show: 'Não compareceu',
  bloqueado: 'Bloqueado',
}

const ORC_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  viewed: 'Visualizado',
  approved: 'Aprovado',
  paid: 'Pago',
  lost: 'Perdido',
  expired: 'Expirado',
}

export function PatientRecordTabs({
  patient,
  appointments,
  orcamentos,
  anamnesisRecords,
  profileExtended,
  photoSignedUrl,
  canEditReception,
  canWriteDocuments,
  attachments,
  procedureCatalog,
  initialTab,
}: Props) {
  const [tab, setTab] = React.useState<TabKey>(pickTab(initialTab))

  // Persiste seleção em URL hash (sem rerodar o server)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (tab === 'overview') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    window.history.replaceState({}, '', url.toString())
  }, [tab])

  return (
    <div className="space-y-4">
      <nav
        className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2"
        aria-label="Seções do prontuário"
      >
        {TAB_DEFS.map((t) => {
          const Icon = t.icon
          const active = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                active
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40 hover:text-[var(--foreground)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </nav>

      {tab === 'overview' && (
        <OverviewTab
          patient={patient}
          appointments={appointments}
          orcamentos={orcamentos}
          anamnesisRecords={anamnesisRecords}
        />
      )}
      {tab === 'data' && <DataTab patient={patient} />}
      {tab === 'agenda' && <AgendaTab appointments={appointments} />}
      {tab === 'procedimentos' && (
        <ProceduresTab
          appointments={appointments}
          catalog={procedureCatalog}
        />
      )}
      {tab === 'anamnese' && (
        <AnamnesisTab records={anamnesisRecords} appointments={appointments} />
      )}
      {tab === 'orcamentos' && <OrcamentosTab orcamentos={orcamentos} />}
      {tab === 'timeline' && (
        <TimelineTab
          patient={patient}
          appointments={appointments}
          orcamentos={orcamentos}
          anamnesisRecords={anamnesisRecords}
        />
      )}
      {tab === 'documentos' && (
        <DocumentsTab
          patientId={patient.id}
          attachments={attachments}
          canWrite={canWriteDocuments}
        />
      )}
      {tab === 'notas' && (
        <NotesTab
          patient={patient}
          profile={profileExtended}
          photoSignedUrl={photoSignedUrl}
          canEditReception={canEditReception}
        />
      )}
    </div>
  )
}

// ── Visão geral ─────────────────────────────────────────────────────────────

function OverviewTab({
  patient,
  appointments,
  orcamentos,
  anamnesisRecords,
}: {
  patient: PatientDTO
  appointments: AppointmentDTO[]
  orcamentos: OrcamentoDTO[]
  anamnesisRecords: PatientAnamnesisRecordDTO[]
}) {
  const address = (patient.addressJson ?? null) as Record<string, string> | null
  const sourceMeta = patient.sourceLeadMeta ?? {}
  const todayIso = new Date().toISOString().slice(0, 10)

  const totalAppointments = appointments.length
  const finalizado = appointments.filter((a) => a.status === 'finalizado').length
  const cancelado = appointments.filter((a) => a.status === 'cancelado').length
  const noShow = appointments.filter((a) => a.status === 'no_show').length

  let last: AppointmentDTO | null = null
  let next: AppointmentDTO | null = null
  for (const a of appointments) {
    if (a.scheduledDate <= todayIso) {
      if (!last || a.scheduledDate > last.scheduledDate) last = a
    }
    if (
      a.scheduledDate > todayIso &&
      !['cancelado', 'no_show', 'finalizado', 'remarcado'].includes(a.status)
    ) {
      if (!next || a.scheduledDate < next.scheduledDate) next = a
    }
  }

  const orcAtivos = orcamentos.filter(
    (o) => o.status === 'sent' || o.status === 'viewed' || o.status === 'approved',
  ).length

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Identidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label="Nome completo" value={patient.name} />
          <Field
            label="CPF"
            value={
              patient.cpf
                ? `${patient.cpf.slice(0, 3)}.${patient.cpf.slice(3, 6)}.${patient.cpf.slice(6, 9)}-${patient.cpf.slice(9)}`
                : '—'
            }
          />
          <Field label="RG" value={patient.rg ?? '—'} />
          <Field label="Sexo" value={sexLabel(patient.sex)} />
          <Field label="Nascimento" value={fmtDate(patient.birthDate)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Phone className="mt-0.5 h-3 w-3 text-[var(--muted-foreground)]" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Telefone
              </div>
              <div>{formatPhoneBR(patient.phone) || patient.phone}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-3 w-3 text-[var(--muted-foreground)]" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Email
              </div>
              <div className="break-all">{patient.email ?? '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financeiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label="Receita acumulada" value={BRL.format(patient.totalRevenue)} />
          <Field label="Procedimentos" value={String(patient.totalProcedures)} />
          <Field
            label="Ticket médio"
            value={
              patient.totalProcedures > 0
                ? BRL.format(patient.totalRevenue / patient.totalProcedures)
                : '—'
            }
          />
          <Field
            label="Primeiro atendimento"
            value={fmtDate(patient.firstProcedureAt)}
          />
          <Field
            label="Último atendimento"
            value={fmtDate(patient.lastProcedureAt)}
          />
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Endereço</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {address ? (
            <div className="space-y-1">
              {address.rua && (
                <div>
                  {address.rua}
                  {address.numero ? `, ${address.numero}` : ''}
                  {address.complemento ? ` · ${address.complemento}` : ''}
                </div>
              )}
              {(address.bairro || address.cidade || address.uf) && (
                <div className="text-[var(--muted-foreground)]">
                  {[address.bairro, address.cidade, address.uf]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
              {address.cep && (
                <div className="text-xs text-[var(--muted-foreground)]/70">
                  CEP {address.cep}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[var(--muted-foreground)]">
              Sem endereço cadastrado
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[var(--primary)]" />
              Resumo clínico
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Atendimentos
              </div>
              <div className="text-2xl font-semibold">{totalAppointments}</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">
                {finalizado} finalizados · {cancelado} cancelados · {noShow} no-show
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Último
              </div>
              {last ? (
                <>
                  <div>{fmtDate(last.scheduledDate)}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {last.procedureName || '—'} ·{' '}
                    {APPT_STATUS_LABEL[last.status] ?? last.status}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-[var(--muted-foreground)]">—</div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Próximo
              </div>
              {next ? (
                <>
                  <div>
                    {fmtDate(next.scheduledDate)}
                    {next.startTime ? ` · ${next.startTime.slice(0, 5)}` : ''}
                  </div>
                  <div className="text-[11px] text-amber-500">
                    {APPT_STATUS_LABEL[next.status] ?? next.status}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-[var(--muted-foreground)]">—</div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Orçamentos ativos
              </div>
              <div className="text-2xl font-semibold">{orcAtivos}</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">
                {orcamentos.length} no total
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
            <span>
              <strong>{anamnesisRecords.length}</strong> registro(s) de anamnese
            </span>
            {anamnesisRecords.filter((r) => r.hasContent).length > 0 && (
              <span>
                <strong>{anamnesisRecords.filter((r) => r.hasContent).length}</strong>{' '}
                com conteúdo registrado
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle>Origem do paciente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Field
            label="Source"
            value={(sourceMeta.source as string) ?? '—'}
          />
          <Field label="Funnel" value={(sourceMeta.funnel as string) ?? '—'} />
          <Field
            label="Temperature"
            value={(sourceMeta.temperature as string) ?? '—'}
          />
          <Field
            label="Promovido em"
            value={fmtDateTime(patient.sourceLeadPhaseAt)}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ── Dados ──────────────────────────────────────────────────────────────────

function DataTab({ patient }: { patient: PatientDTO }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados cadastrais</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <Field label="Status" value={patient.status} />
        <Field label="Responsável (assigned to)" value={patient.assignedTo ?? '—'} />
        <Field label="Criado em" value={fmtDateTime(patient.createdAt)} />
        <Field label="Atualizado em" value={fmtDateTime(patient.updatedAt)} />
        <Field
          label="Primeiro atendimento"
          value={fmtDateTime(patient.firstProcedureAt)}
        />
        <Field
          label="Último atendimento"
          value={fmtDateTime(patient.lastProcedureAt)}
        />
      </CardContent>
    </Card>
  )
}

// ── Agenda ─────────────────────────────────────────────────────────────────

function AgendaTab({ appointments }: { appointments: AppointmentDTO[] }) {
  if (appointments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          Sem agendamentos para este paciente.
        </CardContent>
      </Card>
    )
  }
  const sorted = [...appointments].sort((a, b) => {
    if (a.scheduledDate !== b.scheduledDate)
      return b.scheduledDate.localeCompare(a.scheduledDate)
    return (b.startTime ?? '').localeCompare(a.startTime ?? '')
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de agenda · {appointments.length}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--border)]">
              <th className="py-2 text-left">Data</th>
              <th className="py-2 text-left">Horário</th>
              <th className="py-2 text-left">Procedimento</th>
              <th className="py-2 text-left">Profissional</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.id} className="border-b border-[var(--border)]/60">
                <td className="py-2">{fmtDate(a.scheduledDate)}</td>
                <td className="py-2 tabular-nums">
                  {a.startTime ? a.startTime.slice(0, 5) : '—'}
                </td>
                <td className="py-2">{a.procedureName || '—'}</td>
                <td className="py-2 text-[12px]">{a.professionalName || '—'}</td>
                <td className="py-2 text-[11px]">
                  {APPT_STATUS_LABEL[a.status] ?? a.status}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {a.value > 0 ? BRL.format(a.value) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ── Procedimentos ──────────────────────────────────────────────────────────

function ProceduresTab({
  appointments,
  catalog,
}: {
  appointments: AppointmentDTO[]
  catalog: ProcedureCatalogEntry[]
}) {
  const catalogByName = new Map(catalog.map((c) => [c.key, c]))
  const catalogById = new Map(catalog.map((c) => [c.id, c]))
  // CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE (mig 182): preferir agrupamento
  // por FK canônica (`procedureId`) · fallback por `procedureName` snapshot.
  // Origem:
  //   - 'canonical': appointment.procedureId não-null e bate com catálogo ativo
  //   - 'snapshot_compat': sem FK, mas nome bate com catálogo
  //   - 'legacy': nem FK nem match · só snapshot textual
  type Origin = 'canonical' | 'snapshot_compat' | 'legacy'
  const groups = new Map<
    string,
    {
      key: string
      name: string
      count: number
      lastDate: string
      match: ProcedureCatalogEntry | null
      origin: Origin
    }
  >()
  for (const a of appointments) {
    const fkMatch = a.procedureId ? catalogById.get(a.procedureId) ?? null : null
    const name = (a.procedureName || fkMatch?.nome || '').trim()
    if (!name && !fkMatch) continue
    let key: string
    let match: ProcedureCatalogEntry | null
    let origin: Origin
    if (fkMatch) {
      key = `id:${fkMatch.id}`
      match = fkMatch
      origin = 'canonical'
    } else {
      const lower = name.toLowerCase()
      const nameMatch = catalogByName.get(lower) ?? null
      key = `name:${lower}`
      match = nameMatch
      origin = nameMatch ? 'snapshot_compat' : 'legacy'
    }
    const displayName = fkMatch?.nome ?? name
    const existing = groups.get(key)
    if (existing) {
      existing.count++
      if (a.scheduledDate > existing.lastDate) existing.lastDate = a.scheduledDate
    } else {
      groups.set(key, {
        key,
        name: displayName,
        count: 1,
        lastDate: a.scheduledDate,
        match,
        origin,
      })
    }
  }
  const items = Array.from(groups.values()).sort(
    (a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate),
  )

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          Sem procedimentos registrados nos appointments.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Procedimentos consumidos · {items.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[11px] text-[var(--muted-foreground)]">
            Vínculo canônico via <code>procedure_id</code> (FK · mig 182) ·
            fallback para snapshot <code>procedure_name</code> em appointments
            legados/manuais.
          </p>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 text-left">Procedimento</th>
                <th className="py-2 text-left">Categoria</th>
                <th className="py-2 text-right">Sessões</th>
                <th className="py-2 text-left">Última</th>
                <th className="py-2 text-right">Preço ref.</th>
                <th className="py-2 text-left">Vínculo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.key} className="border-b border-[var(--border)]/60">
                  <td className="py-2 font-medium">{g.name}</td>
                  <td className="py-2 text-[12px]">
                    {g.match?.categoria || '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums">{g.count}</td>
                  <td className="py-2">{fmtDate(g.lastDate)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {g.match?.precoPromo != null && g.match.precoPromo > 0
                      ? BRL.format(g.match.precoPromo)
                      : g.match?.preco && g.match.preco > 0
                        ? BRL.format(g.match.preco)
                        : 'A definir'}
                  </td>
                  <td className="py-2 text-[11px]">
                    {g.origin === 'canonical' ? (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                        FK canônica
                      </span>
                    ) : g.origin === 'snapshot_compat' ? (
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">
                        snapshot compatível
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300">
                        snapshot legado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Anamnese ───────────────────────────────────────────────────────────────

function AnamnesisTab({
  records,
  appointments,
}: {
  records: PatientAnamnesisRecordDTO[]
  appointments: AppointmentDTO[]
}) {
  const apptById = new Map(appointments.map((a) => [a.id, a]))
  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          Nenhuma anamnese registrada ainda. Hard gate clínico continua intacto ·
          esta seção é somente leitura.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Anamneses · {records.length}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-[11px] text-[var(--muted-foreground)]">
          Snapshot de <code>appointment_anamneses</code> · respostas detalhadas
          permanecem no fluxo clínico. Aqui mostramos apenas status + flag de
          preenchimento.
        </p>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--border)]">
              <th className="py-2 text-left">Criada</th>
              <th className="py-2 text-left">Appointment</th>
              <th className="py-2 text-left">Queixa principal</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-left">Conteúdo</th>
              <th className="py-2 text-left">Concluída em</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const ap = r.appointmentId ? apptById.get(r.appointmentId) : null
              return (
                <tr key={r.id} className="border-b border-[var(--border)]/60">
                  <td className="py-2">{fmtDateTime(r.createdAt)}</td>
                  <td className="py-2 text-[12px]">
                    {ap
                      ? `${fmtDate(ap.scheduledDate)} · ${ap.procedureName || '—'}`
                      : r.appointmentId
                        ? `${r.appointmentId.slice(0, 8)}…`
                        : '—'}
                  </td>
                  <td className="py-2 text-[12px] line-clamp-1 max-w-xs">
                    {r.chiefComplaint || '—'}
                  </td>
                  <td className="py-2 text-[11px]">{r.status ?? '—'}</td>
                  <td className="py-2 text-[11px]">
                    {r.hasContent ? (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                        preenchida
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300">
                        vazia
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-[12px]">
                    {r.completedAt ? fmtDateTime(r.completedAt) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ── Orçamentos ─────────────────────────────────────────────────────────────

function OrcamentosTab({ orcamentos }: { orcamentos: OrcamentoDTO[] }) {
  if (orcamentos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          Nenhum orçamento registrado para este paciente.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orçamentos · {orcamentos.length}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--border)]">
              <th className="py-2 text-left">Nº</th>
              <th className="py-2 text-left">Título</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-right">Total</th>
              <th className="py-2 text-left">Enviado</th>
              <th className="py-2 text-left">Validade</th>
              <th className="py-2 text-left">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {orcamentos.map((o) => (
              <tr key={o.id} className="border-b border-[var(--border)]/60">
                <td className="py-2 text-[12px]">{o.number ?? '—'}</td>
                <td className="py-2 text-[12px] line-clamp-1 max-w-xs">
                  {o.title ?? '—'}
                </td>
                <td className="py-2 text-[11px]">
                  {ORC_STATUS_LABEL[o.status] ?? o.status}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {BRL.format(o.total)}
                </td>
                <td className="py-2 text-[11px]">{fmtDate(o.sentAt)}</td>
                <td className="py-2 text-[11px]">{fmtDate(o.validUntil)}</td>
                <td className="py-2 text-[11px]">{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ── Timeline ───────────────────────────────────────────────────────────────

interface TimelineEvent {
  ts: string
  kind: 'create' | 'appointment' | 'anamnesis' | 'orcamento'
  title: string
  detail: string
  badge?: string
}

function TimelineTab({
  patient,
  appointments,
  orcamentos,
  anamnesisRecords,
}: {
  patient: PatientDTO
  appointments: AppointmentDTO[]
  orcamentos: OrcamentoDTO[]
  anamnesisRecords: PatientAnamnesisRecordDTO[]
}) {
  const events: TimelineEvent[] = []

  events.push({
    ts: patient.createdAt,
    kind: 'create',
    title: 'Paciente criado',
    detail: `Status ${patient.status}`,
  })

  for (const a of appointments) {
    const dt = a.scheduledDate + 'T' + (a.startTime || '00:00:00')
    events.push({
      ts: dt,
      kind: 'appointment',
      title: a.procedureName || 'Appointment',
      detail: `${APPT_STATUS_LABEL[a.status] ?? a.status}${a.professionalName ? ` · ${a.professionalName}` : ''}`,
      badge: APPT_STATUS_LABEL[a.status] ?? a.status,
    })
  }

  for (const r of anamnesisRecords) {
    events.push({
      ts: r.createdAt,
      kind: 'anamnesis',
      title: 'Anamnese registrada',
      detail: r.hasContent ? 'Preenchida' : 'Vazia',
      badge: r.status ?? undefined,
    })
    if (r.completedAt) {
      events.push({
        ts: r.completedAt,
        kind: 'anamnesis',
        title: 'Anamnese concluída',
        detail: '',
        badge: 'concluída',
      })
    }
  }

  for (const o of orcamentos) {
    events.push({
      ts: o.createdAt,
      kind: 'orcamento',
      title: `Orçamento ${o.number ?? ''}`.trim() || 'Orçamento',
      detail: BRL.format(o.total),
      badge: ORC_STATUS_LABEL[o.status] ?? o.status,
    })
    if (o.sentAt) {
      events.push({
        ts: o.sentAt,
        kind: 'orcamento',
        title: `Orçamento enviado`,
        detail: o.number ?? '',
      })
    }
    if (o.approvedAt) {
      events.push({
        ts: o.approvedAt,
        kind: 'orcamento',
        title: 'Orçamento aprovado',
        detail: BRL.format(o.total),
      })
    }
  }

  events.sort((a, b) => b.ts.localeCompare(a.ts))

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          Sem eventos para exibir.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline · {events.length}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {events.map((e, idx) => (
            <li
              key={idx}
              className="flex items-start gap-3 border-l-2 border-[var(--border)] py-1 pl-3"
            >
              <span className="mt-0.5 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] w-32 shrink-0 tabular-nums">
                {fmtDateTime(e.ts)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{e.title}</span>
                  {e.badge && (
                    <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                      · {e.badge}
                    </span>
                  )}
                </div>
                {e.detail && (
                  <div className="text-[12px] text-[var(--muted-foreground)]">
                    {e.detail}
                  </div>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]/60">
                {e.kind}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ── Documentos · MEDIA_VAULT_WIRE (mig 183) ─────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  clinical_photo: 'Foto clínica',
  exam: 'Exame',
  document: 'Documento',
  consent: 'Consentimento',
  budget: 'Orçamento',
  other: 'Outro',
}

const CATEGORY_OPTIONS = [
  { value: 'document', label: 'Documento' },
  { value: 'clinical_photo', label: 'Foto clínica' },
  { value: 'exam', label: 'Exame' },
  { value: 'consent', label: 'Consentimento' },
  { value: 'budget', label: 'Orçamento' },
  { value: 'other', label: 'Outro' },
] as const

function fmtBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentsTab({
  patientId,
  attachments,
  canWrite,
}: {
  patientId: string
  attachments: AttachmentForClient[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [showUpload, setShowUpload] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  function refresh() {
    router.refresh()
  }

  async function handleSoftDelete(att: AttachmentForClient) {
    if (!canWrite) return
    const ok = confirm(
      `Remover "${att.fileName}"? O arquivo é mantido para auditoria (soft-delete) e não aparece mais na lista.`,
    )
    if (!ok) return
    startTransition(async () => {
      const r = await softDeleteMedicalRecordAttachmentAction({
        attachmentId: att.id,
        patientId,
      })
      if (!r.ok) alert('Falha ao remover documento')
      refresh()
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <FolderLock className="h-4 w-4 text-[var(--primary)]" />
                Documentos clínicos · {attachments.length}
              </span>
              {canWrite && (
                <Button size="sm" onClick={() => setShowUpload(true)}>
                  Anexar documento
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[11px] text-[var(--muted-foreground)]">
            Bucket privado · signed URLs server-side (TTL 5 min) · soft-delete
            preserva audit trail. {canWrite ? '' : 'Você está em modo leitura.'}
          </p>
          {attachments.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--border)] px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
              Nenhum documento clínico anexado ainda.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 text-left">Arquivo</th>
                  <th className="py-2 text-left">Categoria</th>
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-right">Tamanho</th>
                  <th className="py-2 text-left">Criado em</th>
                  <th className="py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--border)]/60">
                    <td className="py-2.5">
                      <div className="font-medium">{a.fileName}</div>
                      {a.description && (
                        <div className="text-[11px] text-[var(--muted-foreground)] line-clamp-1">
                          {a.description}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-[12px]">
                      {CATEGORY_LABEL[a.category ?? ''] ?? a.category ?? '—'}
                    </td>
                    <td className="py-2.5 text-[11px] text-[var(--muted-foreground)]">
                      {a.mimeType}
                    </td>
                    <td className="py-2.5 text-right text-[12px] tabular-nums">
                      {fmtBytes(a.sizeBytes)}
                    </td>
                    <td className="py-2.5 text-[11px]">
                      {fmtDateTime(a.createdAt)}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {a.signedUrl ? (
                          // eslint-disable-next-line react/jsx-no-target-blank
                          <a
                            href={a.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] uppercase tracking-widest text-[var(--primary)] hover:underline"
                          >
                            Abrir
                          </a>
                        ) : (
                          <span
                            className="text-[11px] uppercase tracking-widest text-[var(--muted-foreground)]"
                            title="Link temporário indisponível"
                          >
                            —
                          </span>
                        )}
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => handleSoftDelete(a)}
                            disabled={pending}
                            className="text-[11px] uppercase tracking-widest text-rose-600 hover:underline dark:text-rose-300 disabled:opacity-50"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showUpload && canWrite && (
        <DocumentsUploadDialog
          patientId={patientId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function DocumentsUploadDialog({
  patientId,
  onClose,
  onUploaded,
}: {
  patientId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [category, setCategory] = React.useState<string>('document')
  const [description, setDescription] = React.useState<string>('')
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setErr('Selecione um arquivo')
      return
    }
    setErr(null)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('patientId', patientId)
      fd.set('file', file)
      fd.set('category', category)
      if (description.trim()) fd.set('description', description.trim())
      const r = await uploadMedicalRecordAttachmentAction(fd)
      if (!r.ok) {
        setErr(r.error ?? 'upload_failed')
        return
      }
      onUploaded()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl"
      >
        <div>
          <h2 className="text-base font-semibold">Anexar documento clínico</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Bucket privado · signed URL TTL 5 min · soft-delete preserva
            audit trail. Sem URL pública. Sem provider externo.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            Arquivo (até 20 MB · JPG/PNG/WEBP/PDF)
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
            className="block w-full text-sm"
            disabled={busy}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            Categoria
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="block w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            disabled={busy}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            Descrição (opcional)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="block w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            placeholder="Contexto clínico do documento (visível para staff)"
            disabled={busy}
          />
        </label>

        {err && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Erro: {err}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Anexar'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ── Notas (+ foto/recepção) ────────────────────────────────────────────────

function NotesTab({
  patient,
  profile,
  photoSignedUrl,
  canEditReception,
}: {
  patient: PatientDTO
  profile: PatientProfileExtendedDTO | null
  photoSignedUrl: string | null
  canEditReception: boolean
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Notas internas</CardTitle>
        </CardHeader>
        <CardContent>
          {patient.notes ? (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
              {patient.notes}
            </pre>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              Sem notas internas. Edição pelo botão "Editar" no topo da página.
            </p>
          )}
        </CardContent>
      </Card>

      <PatientReceptionPanel
        patientId={patient.id}
        patientName={patient.name}
        profile={profile}
        photoSignedUrl={photoSignedUrl}
        canEdit={canEditReception}
      />
    </div>
  )
}

// ── helper ─────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="text-[var(--foreground)]">{value}</div>
    </div>
  )
}
