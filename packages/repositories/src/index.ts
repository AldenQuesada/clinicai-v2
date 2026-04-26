/**
 * @clinicai/repositories · barrel.
 *
 * Padrao canonico ADR-012 · UI/Service nunca chama supabase.from() direto.
 * Tudo passa por um Repository que aplica:
 *   - mapping snake -> camel (ADR-005 boundary)
 *   - clinic_id explicito multi-tenant (ADR-028)
 *   - DTOs tipados em vez de row bruto
 */

export { LeadRepository } from './lead.repository'
export { ConversationRepository, type StatusFilter } from './conversation.repository'
export { MessageRepository, type AIHistoryMessage } from './message.repository'
export { ClinicDataRepository } from './clinic-data.repository'
export { TemplateRepository } from './template.repository'
export { BudgetRepository } from './budget.repository'
export { InboxNotificationRepository } from './inbox-notification.repository'
export { ProfileRepository, type ProfileDTO } from './profile.repository'

// ── Mira repositories (B2B + admin · WhatsApp Evolution) ──────────────────
export { MiraStateRepository, type MiraStateRow } from './mira-state.repository'
export { B2BPartnershipRepository, type B2BPartnershipDTO } from './b2b-partnership.repository'
export {
  B2BPartnershipContractRepository,
  type PartnershipContractDTO,
  type PartnershipActivityDTO,
  type ContractStatus,
  type ContractUpsertInput,
  type ActivityKind,
  type ActivityStatus,
  type ActivityResponsible,
  type ActivityUpsertInput,
} from './b2b-partnership-contract.repository'
export {
  B2BVoucherRepository,
  type B2BVoucherDTO,
  type IssueVoucherInput,
  type LaraFollowupState,
  type LaraFollowupBucket,
  type LaraFollowupCandidateDTO,
} from './b2b-voucher.repository'
export {
  B2BVoucherDispatchQueueRepository,
  type VoucherDispatchQueueDTO,
  type VoucherDispatchQueueStatus,
  type EnqueueInput,
  type EnqueueItemInput,
  type EnqueueResultDTO,
  type EnqueueResultItemDTO,
  type PickedQueueItemDTO,
  type BatchSummaryDTO,
} from './voucher-dispatch-queue.repository'
export {
  WebhookProcessingQueueRepository,
  type WebhookQueueDTO,
  type WebhookQueueStatus,
  type WebhookQueueSource,
  type WebhookQueueRole,
  type EnqueueWebhookInput,
  type EnqueueWebhookResultDTO,
  type PickedWebhookItemDTO,
  type WebhookCompleteResultDTO,
  type WebhookFailResultDTO,
  type WebhookResetStuckResultDTO,
} from './webhook-processing-queue.repository'
export { B2BAttributionRepository, type B2BAttributionDTO } from './b2b-attribution.repository'
export {
  B2BVoucherComboRepository,
  type B2BVoucherComboDTO,
} from './b2b-voucher-combo.repository'
export {
  B2BSuggestionsRepository,
  type SuggestionCategory,
  type SuggestionsSnapshot,
} from './b2b-suggestions.repository'
export {
  B2BScoutRepository,
  type CandidateDTO,
  type CandidateStatus,
  type ConsumptionDTO,
  type ScoutSummaryDTO,
  type SimilarCandidateDTO,
} from './b2b-scout.repository'
export {
  B2BApplicationRepository,
  type ApplicationDTO,
  type ApplicationStatus,
} from './b2b-application.repository'
export {
  B2BGeoRepository,
  type GeoPoint,
} from './b2b-geo.repository'
export {
  B2BHealthRepository,
  type HealthSnapshot,
} from './b2b-health.repository'
export {
  B2BClosureRepository,
  type ClosureCandidate,
} from './b2b-closure.repository'
export {
  B2BCollabRepository,
  type BroadcastFilters,
  type BroadcastSampleEntry,
  type BroadcastPreview,
  type BroadcastPartnerIds,
  type TeamManager,
} from './b2b-collab.repository'
export {
  B2BAnalyticsRepository,
  type AnalyticsApplications,
  type AnalyticsVouchers,
  type AnalyticsTiming,
  type AnalyticsHealth,
  type AnalyticsMiraNPS,
  type AnalyticsMira,
  type AnalyticsBlob,
} from './b2b-analytics.repository'
export {
  B2BFinancialRepository,
  type FinancialSnapshot,
  type FinancialDelta,
  type FinancialDeltaEntry,
  type FinancialSignal,
  type FinancialKpisBlob,
} from './b2b-financial.repository'
export {
  B2BNpsRepository,
  type NpsBucket,
  type NpsResponseEntry,
  type NpsListResult,
  type NpsSummary,
} from './b2b-nps.repository'
export {
  B2BPerformanceRepository,
  type PerformanceROI,
  type PerformanceVouchers,
  type PerformanceNPS,
  type PerformanceHealth,
  type PerformanceHealthHistory,
  type PerformanceVelocity,
  type PerformanceChurnRisk,
  type PerformanceFull,
  type MonthlyConversion,
  type MonthlyConversionCurrent,
  type MonthlyConversionPrevious,
  type MonthlyConversionDelta,
  type MonthlyConversionRow,
} from './b2b-performance.repository'
export {
  B2BCommentsRepository,
  type PartnershipComment,
} from './b2b-comments.repository'
export {
  B2BImpactRepository,
  type ImpactScore,
} from './b2b-impact.repository'
export {
  B2BCostRepository,
  type CostBreakdown,
} from './b2b-cost.repository'
export {
  B2BHealthTrendRepository,
  type HealthTrend,
  type HealthTrendHistoryEntry,
} from './b2b-health-trend.repository'
export {
  B2BPartnershipHealthSnapshotRepository,
  type PartnershipHealthSnapshot,
  type PartnershipHealthSnapshotMetrics,
} from './b2b-health-snapshot.repository'
export {
  B2BLgpdRepository,
  type ConsentType,
  type ConsentEntry,
  type ConsentState,
  type AnonymizeResult,
  type ExportData,
} from './b2b-lgpd.repository'
export {
  B2BAuditRepository,
  type AuditTimelineEntry,
} from './b2b-audit.repository'
export {
  B2BGrowthRepository,
  type GrowthPanel,
  type GrowthPartnership,
  type GrowthConversionLifetime,
  type GrowthCost,
  type GrowthNPS,
  type GrowthHealthHistoryEntry,
  type GrowthTrend,
  type GrowthImpact,
  type GrowthPitchStats,
} from './b2b-growth.repository'
export {
  B2BInsightsRepository,
  type Insight,
  type InsightKind,
  type InsightSeverity,
  type InsightsGlobal,
  type DismissResult,
  type UndoDismissResult,
} from './b2b-insights.repository'
export {
  B2BPlaybookRepository,
  type PlaybookKind,
  type PlaybookTemplate,
  type PlaybookTaskTemplate,
  type PlaybookContentTemplate,
  type PlaybookMetaTemplate,
  type PlaybookApplication,
  type ApplyPlaybookResult,
  type PlaybookTemplateUpsertInput,
} from './b2b-playbook.repository'
export {
  MiraCronRegistryRepository,
  type CronJobCategory,
  type CronRunStatus,
  type MiraCronJob,
  type MiraCronRun,
} from './mira-cron-registry.repository'
export {
  B2BMetricsV2Repository,
  type GrowthWeek,
  type GrowthWeekly,
  type PipelineFunnel,
  type PartnerClassification,
  type PartnerPerformanceRow,
  type AlertSeverity,
  type CriticalAlert,
  type PaybackData,
  type VelocityData,
  type ForecastStatus,
  type ForecastData,
} from './b2b-metrics-v2.repository'
export {
  B2BAdminPhonesRepository,
  type B2BAdminPhoneRaw,
  type B2BAdminPhoneInput,
} from './b2b-admin-phones.repository'
export {
  B2BSystemHealthRepository,
  type SystemHealthSection,
  type SystemHealthCounts,
  type SystemHealthSnapshot,
  type AuditEntry,
} from './b2b-system-health.repository'
export {
  B2BClinicDefaultsRepository,
  type VoucherCTA,
  type ClinicDefaultsRaw,
  type ClinicDefaultsResponse,
} from './b2b-clinic-defaults.repository'
export {
  B2BTierConfigRepository,
  type B2BTierConfigDTO,
  type B2BTierConfigUpsertInput,
} from './b2b-tier-config.repository'
export {
  B2BFunnelBenchmarkRepository,
  B2B_FUNNEL_STAGES,
  type B2BFunnelStage,
  type B2BFunnelBenchmarkDTO,
  type B2BFunnelBenchmarkUpsertInput,
} from './b2b-funnel-benchmark.repository'
export { B2BWASenderRepository, type B2BWASenderDTO } from './b2b-wa-sender.repository'
export {
  B2BCommTemplateRepository,
  type B2BCommTemplateDTO,
  type B2BCommTemplateRaw,
  type B2BCommTemplateSequenceGroup,
  type B2BCommEventDef,
  type B2BCommEventCatalog,
  type B2BCommEventKeyDTO,
  type B2BCommStats,
  type B2BCommHistoryEntry,
} from './b2b-comm-template.repository'
export {
  WaProAuditRepository,
  type WaProMessageInput,
  type WaProAuditInput,
} from './wa-pro-audit.repository'
export {
  WaNumberRepository,
  type WaNumberDTO,
  type WaNumberFullDTO,
  type WaNumberRegisterInput,
} from './wa-number.repository'
export {
  ProfessionalProfilesRepository,
  type ProfessionalProfileDTO,
} from './professional-profiles.repository'
export { MiraChannelRepository, type MiraChannelDTO } from './mira-channel.repository'
export { AppointmentRepository } from './appointment.repository'

// ── Legal Documents (Onda 4 Mira · 2026-04-26) ────────────────────────────
export {
  LegalDocTemplateRepository,
  type LegalDocTemplateDTO,
  type LegalDocTemplateUpsertInput,
  type LegalDocType,
} from './legal-doc-template.repository'
export {
  LegalDocRequestRepository,
  type LegalDocRequestDTO,
  type LegalDocStatus,
  type ValidatedRequestDTO,
  type CreateLegalDocRequestInput,
} from './legal-doc-request.repository'
export {
  LegalDocSignatureRepository,
  type LegalDocSignatureDTO,
  type SubmitSignatureInput,
} from './legal-doc-signature.repository'

export type {
  Funnel,
  ConversationStatus,
  MessageDirection,
  MessageSender,
  LeadDTO,
  ConversationDTO,
  MessageDTO,
  TemplateDTO,
  BudgetDayDTO,
  ClinicDataValue,
  CreateLeadInput,
  CreateConversationInput,
  SaveInboundMessageInput,
  SaveOutboundMessageInput,
  CreateTemplateInput,
  InboxNotificationInput,
  DedupHit,
  DedupHitKind,
} from './types'
