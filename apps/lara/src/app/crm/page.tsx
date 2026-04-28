/**
 * CRM dashboard · /crm
 *
 * Landing com cards dos modulos + KPIs leves (counts read-only).
 * Reads via repos diretos (RSC · convencao Camada 5: read = repo direto,
 * mutation = Server Action).
 *
 * KPIs basicos · todos defensivos (catch → 0).
 */

import Link from 'next/link'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  PageHeader,
} from '@clinicai/ui'
import { Users, UserCircle, Calendar, FileText } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

export default async function CrmDashboardPage() {
  const { ctx, repos } = await loadServerReposContext()

  // Hoje pra contar appointments do dia
  const todayIso = new Date().toISOString()
  const todayDate = todayIso.slice(0, 10)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // KPIs em paralelo · todos defensivos
  const [leadsActive, patientsActive, appointmentsToday, orcamentosOpen] =
    await Promise.all([
      repos.leads.count(ctx.clinic_id, {}).catch(() => 0),
      repos.patients.count(ctx.clinic_id, { status: 'active' }).catch(() => 0),
      repos.appointments
        .countInRange(ctx.clinic_id, todayDate, tomorrow)
        .catch(() => 0),
      repos.orcamentos.countByStatus(ctx.clinic_id, 'sent').catch(() => 0),
    ])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="CRM"
        description="Pacientes · Agenda · Orçamentos"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ModuleCard
          href="/crm/leads"
          icon={<UserCircle className="h-5 w-5" />}
          title="Leads"
          kpi={leadsActive}
          kpiLabel="ativos"
          description="Pipeline de captação · Kanban"
        />
        <ModuleCard
          href="/crm/pacientes"
          icon={<Users className="h-5 w-5" />}
          title="Pacientes"
          kpi={patientsActive}
          kpiLabel="ativos"
          description="Cadastro + histórico clínico"
        />
        <ModuleCard
          href="/crm/agenda"
          icon={<Calendar className="h-5 w-5" />}
          title="Agenda"
          kpi={appointmentsToday}
          kpiLabel="hoje"
          description="Calendário + multi-profissional"
        />
        <ModuleCard
          href="/crm/orcamentos"
          icon={<FileText className="h-5 w-5" />}
          title="Orçamentos"
          kpi={orcamentosOpen}
          kpiLabel="enviados"
          description="Propostas + follow-up automático"
        />
      </div>

      <p className="mt-8 text-xs text-[var(--muted-foreground)]">
        Camada 6 entregue · módulos individuais (Pacientes/Agenda/Orçamentos)
        chegam nas Camadas 7-9 conforme roadmap.
      </p>
    </div>
  )
}

function ModuleCard({
  href,
  icon,
  title,
  kpi,
  kpiLabel,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  kpi: number
  kpiLabel: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group block rounded-md border border-[var(--border)] bg-[var(--card)] p-4 transition-all hover:border-[var(--primary)]/50 hover:shadow-luxury-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary)]/10 text-[var(--primary)]">
          {icon}
        </div>
        <div className="text-right">
          <div className="font-display-italic text-2xl text-[var(--foreground)]">
            {kpi.toLocaleString('pt-BR')}
          </div>
          <div className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
            {kpiLabel}
          </div>
        </div>
      </div>
      <h3 className="mt-3 font-display-uppercase text-sm tracking-widest text-[var(--foreground)] group-hover:text-[var(--primary)]">
        {title}
      </h3>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{description}</p>
    </Link>
  )
}
