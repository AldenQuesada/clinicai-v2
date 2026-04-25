/**
 * Mira · helper de instanciacao dos repositories (ADR-012).
 *
 * Inclui os 8 repositories existentes (compartilhados com Lara · leads,
 * conversations, messages, etc) + 7 Mira-specific (state, b2b_*, wa_pro_audit).
 *
 * Uso comum no webhook:
 *   import { makeMiraRepos } from '@/lib/repos'
 *   const supabase = createServerClient()
 *   const repos = makeMiraRepos(supabase)
 *   const role = await repos.b2bSenders.findByPhone(clinicId, phone)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  // Shared (Lara + Mira)
  LeadRepository,
  ConversationRepository,
  MessageRepository,
  ClinicDataRepository,
  TemplateRepository,
  BudgetRepository,
  InboxNotificationRepository,
  ProfileRepository,
  // Mira-specific
  MiraStateRepository,
  B2BPartnershipRepository,
  B2BVoucherRepository,
  B2BVoucherDispatchQueueRepository,
  B2BAttributionRepository,
  B2BVoucherComboRepository,
  B2BSuggestionsRepository,
  B2BScoutRepository,
  B2BApplicationRepository,
  B2BWASenderRepository,
  B2BCommTemplateRepository,
  WaProAuditRepository,
  WaNumberRepository,
  MiraChannelRepository,
  AppointmentRepository,
  WebhookProcessingQueueRepository,
} from '@clinicai/repositories'

export interface MiraRepos {
  // Shared
  leads: LeadRepository
  conversations: ConversationRepository
  messages: MessageRepository
  clinicData: ClinicDataRepository
  templates: TemplateRepository
  budget: BudgetRepository
  inboxNotifications: InboxNotificationRepository
  profiles: ProfileRepository

  // Mira-specific
  miraState: MiraStateRepository
  b2bPartnerships: B2BPartnershipRepository
  b2bVouchers: B2BVoucherRepository
  voucherQueue: B2BVoucherDispatchQueueRepository
  b2bAttributions: B2BAttributionRepository
  b2bVoucherCombos: B2BVoucherComboRepository
  b2bSuggestions: B2BSuggestionsRepository
  b2bScout: B2BScoutRepository
  b2bApplications: B2BApplicationRepository
  b2bSenders: B2BWASenderRepository
  b2bTemplates: B2BCommTemplateRepository
  waProAudit: WaProAuditRepository
  waNumbers: WaNumberRepository
  miraChannels: MiraChannelRepository
  appointments: AppointmentRepository
  webhookQueue: WebhookProcessingQueueRepository
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeMiraRepos(supabase: SupabaseClient<any>): MiraRepos {
  return {
    leads: new LeadRepository(supabase),
    conversations: new ConversationRepository(supabase),
    messages: new MessageRepository(supabase),
    clinicData: new ClinicDataRepository(supabase),
    templates: new TemplateRepository(supabase),
    budget: new BudgetRepository(supabase),
    inboxNotifications: new InboxNotificationRepository(supabase),
    profiles: new ProfileRepository(supabase),

    miraState: new MiraStateRepository(supabase),
    b2bPartnerships: new B2BPartnershipRepository(supabase),
    b2bVouchers: new B2BVoucherRepository(supabase),
    voucherQueue: new B2BVoucherDispatchQueueRepository(supabase),
    b2bAttributions: new B2BAttributionRepository(supabase),
    b2bVoucherCombos: new B2BVoucherComboRepository(supabase),
    b2bSuggestions: new B2BSuggestionsRepository(supabase),
    b2bScout: new B2BScoutRepository(supabase),
    b2bApplications: new B2BApplicationRepository(supabase),
    b2bSenders: new B2BWASenderRepository(supabase),
    b2bTemplates: new B2BCommTemplateRepository(supabase),
    waProAudit: new WaProAuditRepository(supabase),
    waNumbers: new WaNumberRepository(supabase),
    miraChannels: new MiraChannelRepository(supabase),
    appointments: new AppointmentRepository(supabase),
    webhookQueue: new WebhookProcessingQueueRepository(supabase),
  }
}
