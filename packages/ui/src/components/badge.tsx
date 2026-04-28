/**
 * Badge · indicador visual de status. Variants neutras + helpers tipados
 * pros enums do CRM (LeadPhase, AppointmentStatus, OrcamentoStatus,
 * PatientStatus).
 *
 * Uso:
 *   <Badge variant="success">Ativo</Badge>
 *   <LeadPhaseBadge phase="agendado" />
 *   <AppointmentStatusBadge status="finalizado" />
 *   <OrcamentoStatusBadge status="approved" />
 *   <PatientStatusBadge status="active" />
 *
 * Helpers tipados garantem cor + label PT-BR consistentes em todo CRM.
 * Mudar enum no SQL → atualizar mapeamento aqui (single source of truth UI).
 */

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[10px] font-display-uppercase tracking-widest whitespace-nowrap',
  {
    variants: {
      variant: {
        // Neutra · status default sem cor especifica
        neutral:
          'bg-[var(--color-border-soft)] text-[var(--muted-foreground)] border border-[var(--border)]',
        // Champagne · destaque (default Lead, em andamento)
        primary:
          'bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30',
        // Verde · sucesso (paciente, approved, finalizado)
        success:
          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
        // Amarelo · atencao (compareceu, viewed, pendente)
        warning:
          'bg-amber-500/15 text-amber-400 border border-amber-500/30',
        // Vermelho · negativo (perdido, lost, cancelado, no_show)
        destructive:
          'bg-rose-500/15 text-rose-400 border border-rose-500/30',
        // Azul · info (orcamento, draft, sent)
        info: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
      },
      size: {
        default: 'text-[10px] px-2.5 py-0.5',
        sm: 'text-[9px] px-2 py-px',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

// ── Helpers tipados pros enums CRM ─────────────────────────────────────────

type LeadPhase =
  | 'lead'
  | 'agendado'
  | 'reagendado'
  | 'compareceu'
  | 'paciente'
  | 'orcamento'
  | 'perdido'

const LEAD_PHASE_MAP: Record<
  LeadPhase,
  { label: string; variant: VariantProps<typeof badgeVariants>['variant'] }
> = {
  lead: { label: 'Lead', variant: 'primary' },
  agendado: { label: 'Agendado', variant: 'info' },
  reagendado: { label: 'Reagendado', variant: 'info' },
  compareceu: { label: 'Compareceu', variant: 'warning' },
  paciente: { label: 'Paciente', variant: 'success' },
  orcamento: { label: 'Orçamento', variant: 'info' },
  perdido: { label: 'Perdido', variant: 'destructive' },
}

export function LeadPhaseBadge({
  phase,
  size,
}: {
  phase: LeadPhase
  size?: VariantProps<typeof badgeVariants>['size']
}) {
  const cfg = LEAD_PHASE_MAP[phase]
  return (
    <Badge variant={cfg.variant} size={size} title={`Phase: ${phase}`}>
      {cfg.label}
    </Badge>
  )
}

type AppointmentStatus =
  | 'agendado'
  | 'aguardando_confirmacao'
  | 'confirmado'
  | 'pre_consulta'
  | 'aguardando'
  | 'na_clinica'
  | 'em_consulta'
  | 'em_atendimento'
  | 'finalizado'
  | 'remarcado'
  | 'cancelado'
  | 'no_show'
  | 'bloqueado'

const APPT_STATUS_MAP: Record<
  AppointmentStatus,
  { label: string; variant: VariantProps<typeof badgeVariants>['variant'] }
> = {
  agendado: { label: 'Agendado', variant: 'info' },
  aguardando_confirmacao: { label: 'Aguardando confirmação', variant: 'warning' },
  confirmado: { label: 'Confirmado', variant: 'primary' },
  pre_consulta: { label: 'Pré-consulta', variant: 'warning' },
  aguardando: { label: 'Aguardando', variant: 'warning' },
  na_clinica: { label: 'Na clínica', variant: 'primary' },
  em_consulta: { label: 'Em consulta', variant: 'primary' },
  em_atendimento: { label: 'Em atendimento', variant: 'primary' },
  finalizado: { label: 'Finalizado', variant: 'success' },
  remarcado: { label: 'Remarcado', variant: 'warning' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
  no_show: { label: 'Não compareceu', variant: 'destructive' },
  bloqueado: { label: 'Bloqueado', variant: 'neutral' },
}

export function AppointmentStatusBadge({
  status,
  size,
}: {
  status: AppointmentStatus
  size?: VariantProps<typeof badgeVariants>['size']
}) {
  const cfg = APPT_STATUS_MAP[status]
  return (
    <Badge variant={cfg.variant} size={size} title={`Status: ${status}`}>
      {cfg.label}
    </Badge>
  )
}

type OrcamentoStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'followup'
  | 'negotiation'
  | 'approved'
  | 'lost'

const ORC_STATUS_MAP: Record<
  OrcamentoStatus,
  { label: string; variant: VariantProps<typeof badgeVariants>['variant'] }
> = {
  draft: { label: 'Rascunho', variant: 'neutral' },
  sent: { label: 'Enviado', variant: 'info' },
  viewed: { label: 'Visualizado', variant: 'info' },
  followup: { label: 'Follow-up', variant: 'warning' },
  negotiation: { label: 'Negociação', variant: 'warning' },
  approved: { label: 'Aprovado', variant: 'success' },
  lost: { label: 'Perdido', variant: 'destructive' },
}

export function OrcamentoStatusBadge({
  status,
  size,
}: {
  status: OrcamentoStatus
  size?: VariantProps<typeof badgeVariants>['size']
}) {
  const cfg = ORC_STATUS_MAP[status]
  return (
    <Badge variant={cfg.variant} size={size} title={`Status: ${status}`}>
      {cfg.label}
    </Badge>
  )
}

type PatientStatus = 'active' | 'inactive' | 'blocked' | 'deceased'

const PATIENT_STATUS_MAP: Record<
  PatientStatus,
  { label: string; variant: VariantProps<typeof badgeVariants>['variant'] }
> = {
  active: { label: 'Ativo', variant: 'success' },
  inactive: { label: 'Inativo', variant: 'neutral' },
  blocked: { label: 'Bloqueado', variant: 'destructive' },
  deceased: { label: 'Falecido', variant: 'neutral' },
}

export function PatientStatusBadge({
  status,
  size,
}: {
  status: PatientStatus
  size?: VariantProps<typeof badgeVariants>['size']
}) {
  const cfg = PATIENT_STATUS_MAP[status]
  return (
    <Badge variant={cfg.variant} size={size} title={`Status: ${status}`}>
      {cfg.label}
    </Badge>
  )
}
