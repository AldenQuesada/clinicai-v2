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
  BroadcastRepository,
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
  broadcasts: BroadcastRepository
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
    broadcasts: new BroadcastRepository(sb),
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
 * patch · ou hook offline), enriquece ctx.role via RPC `get_my_profile()`.
 *
 * Por que RPC e nao .from('profiles')?
 * Porque profiles_select policy exige `clinic_id = app_clinic_id() AND is_active`.
 * Quando JWT nao tem clinic_id, app_clinic_id() = null e a policy retorna
 * false → getById retorna null silencioso. RPC e SECURITY DEFINER,
 * bypassa RLS, le direto da tabela usando auth.uid() como gate proprio.
 *
 * Custo: 1 RPC extra apenas quando JWT antigo · zero overhead com hook OK.
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
      // RPC SECURITY DEFINER · funciona mesmo com JWT sem claims
      const result = await repos.users.getMyProfile()
      if (result.ok && result.data?.role) {
        ctx.role = result.data.role as ClinicContext['role']
        // Tambem atualiza clinic_id se estava com fallback _default_clinic_id
        if (result.data.clinicId && !ctx.clinic_id) {
          ctx.clinic_id = result.data.clinicId
        }
      }
    } catch {
      // ignore · ctx.role permanece null · permission guards bloqueiam
    }
  }

  return { supabase, ctx, repos }
}
