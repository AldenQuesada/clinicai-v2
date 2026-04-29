/**
 * Helper de instanciacao dos repositories · ADR-012.
 *
 * Uso:
 *   import { makeRepos } from '@/lib/repos'
 *   const repos = makeRepos(supabase)
 *   const lead = await repos.leads.findByPhoneVariants(ctx.clinic_id, [...])
 *
 * Em RSC/Server Action use loadServerReposContext (mais ergonomico · 1 chamada
 * pra supabase + ctx + repos).
 */

import {
  LeadRepository,
  ConversationRepository,
  MessageRepository,
  ClinicDataRepository,
  TemplateRepository,
  BudgetRepository,
  InboxNotificationRepository,
  ProfileRepository,
  UsersRepository,
  B2BVoucherRepository,
  WaMediaBankRepository,
  AppointmentRepository,
  PatientRepository,
  OrcamentoRepository,
  PhaseHistoryRepository,
} from '@clinicai/repositories'
import { loadServerContext, type ClinicContext } from '@clinicai/supabase'

// Camada 3 (2026-04-28): tipo polimorfico (qualquer SupabaseClient ·
// ssr 3-generics ou supabase-js 5-generics) · evita mismatch ao receber
// tanto loadServerContext (ssr · 3 generics) quanto createServiceRoleClient
// (supabase-js · 5 generics) que coexistem nos callers Lara.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = import('@supabase/supabase-js').SupabaseClient<any, any, any, any, any>
type LoadedSupabase = Awaited<ReturnType<typeof loadServerContext>>['supabase']

export interface Repos {
  leads: LeadRepository
  conversations: ConversationRepository
  messages: MessageRepository
  clinicData: ClinicDataRepository
  templates: TemplateRepository
  budget: BudgetRepository
  inboxNotifications: InboxNotificationRepository
  profiles: ProfileRepository
  users: UsersRepository
  b2bVouchers: B2BVoucherRepository
  mediaBank: WaMediaBankRepository
  /** CRM core (Camada 4) · Agenda/Pacientes/Orcamento + audit trail */
  appointments: AppointmentRepository
  patients: PatientRepository
  orcamentos: OrcamentoRepository
  phaseHistory: PhaseHistoryRepository
}

export function makeRepos(supabase: LoadedSupabase | AnySupabase): Repos {
  // Repos legacy aceitam SupabaseClient<any> · cast pra compatibilidade
  // de generics (3 vs 4) entre @supabase/ssr e @supabase/supabase-js@2.103+.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  return {
    leads: new LeadRepository(sb),
    conversations: new ConversationRepository(sb),
    messages: new MessageRepository(sb),
    clinicData: new ClinicDataRepository(sb),
    templates: new TemplateRepository(sb),
    budget: new BudgetRepository(sb),
    inboxNotifications: new InboxNotificationRepository(sb),
    profiles: new ProfileRepository(sb),
    users: new UsersRepository(sb),
    b2bVouchers: new B2BVoucherRepository(sb),
    mediaBank: new WaMediaBankRepository(sb),
    appointments: new AppointmentRepository(sb),
    patients: new PatientRepository(sb),
    orcamentos: new OrcamentoRepository(sb),
    phaseHistory: new PhaseHistoryRepository(sb),
  }
}

/**
 * Carrega supabase + clinic context + repos numa chamada · pra RSC/Action.
 *
 * Fallback de role · 2026-04-29:
 * Quando JWT nao tem `app_role` no claim (sessao antiga, antes do hook
 * patch), enriquece ctx.role lendo de profiles diretamente. Sem isso,
 * permission guards veem role=null e escondem features tipo "Gerenciar
 * usuarios". Custa 1 query extra apenas quando JWT nao tem claim ·
 * gratuito quando hook funcionar.
 */
export async function loadServerReposContext(): Promise<{
  supabase: LoadedSupabase
  ctx: ClinicContext
  repos: Repos
}> {
  const { supabase, ctx } = await loadServerContext()
  const repos = makeRepos(supabase)

  if (!ctx.role && ctx.user_id) {
    try {
      const profile = await repos.profiles.getById(ctx.user_id)
      if (profile?.role) {
        ctx.role = profile.role as ClinicContext['role']
      }
    } catch {
      // ignore · ctx.role permanece null · permission guards vao usar
      // fallback otimista (!role significa staff de confianca em codigo
      // legado tipo AppHeader)
    }
  }

  return { supabase, ctx, repos }
}
