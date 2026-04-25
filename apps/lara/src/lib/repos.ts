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

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  LeadRepository,
  ConversationRepository,
  MessageRepository,
  ClinicDataRepository,
  TemplateRepository,
  BudgetRepository,
  InboxNotificationRepository,
  ProfileRepository,
} from '@clinicai/repositories'
import { loadServerContext, type ClinicContext } from '@clinicai/supabase'

export interface Repos {
  leads: LeadRepository
  conversations: ConversationRepository
  messages: MessageRepository
  clinicData: ClinicDataRepository
  templates: TemplateRepository
  budget: BudgetRepository
  inboxNotifications: InboxNotificationRepository
  profiles: ProfileRepository
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeRepos(supabase: SupabaseClient<any>): Repos {
  return {
    leads: new LeadRepository(supabase),
    conversations: new ConversationRepository(supabase),
    messages: new MessageRepository(supabase),
    clinicData: new ClinicDataRepository(supabase),
    templates: new TemplateRepository(supabase),
    budget: new BudgetRepository(supabase),
    inboxNotifications: new InboxNotificationRepository(supabase),
    profiles: new ProfileRepository(supabase),
  }
}

/**
 * Carrega supabase + clinic context + repos numa chamada · pra RSC/Action.
 */
export async function loadServerReposContext(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  ctx: ClinicContext
  repos: Repos
}> {
  const { supabase, ctx } = await loadServerContext()
  return { supabase, ctx, repos: makeRepos(supabase) }
}
