// Provider interface (canonico · ADR-029-mira-evolution-adapter)
export type { WhatsAppProvider } from './provider'
export type { WhatsAppSendResult, WhatsAppMediaDownload } from './provider'
// Mig 143 (2026-05-07) · quoted reply opts pra sendText (Cloud + Evolution)
export type { SendTextOptions, QuotedRefBaileys } from './provider'

// Cloud (Meta) · usado pela Lara
export { WhatsAppCloudService, createWhatsAppCloudFromWaNumber } from './cloud'
export type { WaNumberConfig } from './cloud'

// Evolution (Baileys self-hosted) · usado pela Mira
export { EvolutionService, createEvolutionService } from './evolution'
export type { EvolutionConfig } from './evolution'

// HMAC signature validation (Meta webhook) · fail-closed em produção
export { validateMetaSignature } from './signature'
export type { SignatureValidationResult } from './signature'
