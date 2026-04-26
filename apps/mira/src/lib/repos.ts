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
  B2BGeoRepository,
  B2BHealthRepository,
  B2BClosureRepository,
  B2BCollabRepository,
  B2BAnalyticsRepository,
  B2BMetricsV2Repository,
  B2BPerformanceRepository,
  B2BCommentsRepository,
  MiraCronRegistryRepository,
  B2BNpsRepository,
  B2BAdminPhonesRepository,
  B2BSystemHealthRepository,
  B2BClinicDefaultsRepository,
  B2BWASenderRepository,
  B2BCommTemplateRepository,
  WaProAuditRepository,
  WaNumberRepository,
  ProfessionalProfilesRepository,
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
  b2bGeo: B2BGeoRepository
  b2bHealth: B2BHealthRepository
  b2bClosure: B2BClosureRepository
  b2bCollab: B2BCollabRepository
  b2bAnalytics: B2BAnalyticsRepository
  b2bMetricsV2: B2BMetricsV2Repository
  b2bPerformance: B2BPerformanceRepository
  b2bComments: B2BCommentsRepository
  miraCronRegistry: MiraCronRegistryRepository
  b2bNps: B2BNpsRepository
  b2bAdminPhones: B2BAdminPhonesRepository
  b2bSystemHealth: B2BSystemHealthRepository
  b2bClinicDefaults: B2BClinicDefaultsRepository
  b2bSenders: B2BWASenderRepository
  b2bTemplates: B2BCommTemplateRepository
  waProAudit: WaProAuditRepository
  waNumbers: WaNumberRepository
  professionalProfiles: ProfessionalProfilesRepository
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
    b2bGeo: new B2BGeoRepository(supabase),
    b2bHealth: new B2BHealthRepository(supabase),
    b2bClosure: new B2BClosureRepository(supabase),
    b2bCollab: new B2BCollabRepository(supabase),
    b2bAnalytics: new B2BAnalyticsRepository(supabase),
    b2bMetricsV2: new B2BMetricsV2Repository(supabase),
    b2bPerformance: new B2BPerformanceRepository(supabase),
    b2bComments: new B2BCommentsRepository(supabase),
    miraCronRegistry: new MiraCronRegistryRepository(supabase),
    b2bNps: new B2BNpsRepository(supabase),
    b2bAdminPhones: new B2BAdminPhonesRepository(supabase),
    b2bSystemHealth: new B2BSystemHealthRepository(supabase),
    b2bClinicDefaults: new B2BClinicDefaultsRepository(supabase),
    b2bSenders: new B2BWASenderRepository(supabase),
    b2bTemplates: new B2BCommTemplateRepository(supabase),
    waProAudit: new WaProAuditRepository(supabase),
    waNumbers: new WaNumberRepository(supabase),
    professionalProfiles: new ProfessionalProfilesRepository(supabase),
    miraChannels: new MiraChannelRepository(supabase),
    appointments: new AppointmentRepository(supabase),
    webhookQueue: new WebhookProcessingQueueRepository(supabase),
  }
}
