/**
 * Re-export do package canônico @clinicai/whatsapp.
 *
 * Antes: arquivo local com `WhatsAppCloudService` que lia
 * `process.env.WHATSAPP_ACCESS_TOKEN` global · violava ADR-028 multi-tenant
 * (achado N7 / Gap 7 da auditoria 2026-04-27 · Alden vetou versão "débito
 * aceito" desse pattern).
 *
 * Depois: re-export da factory canônica `createWhatsAppCloudFromWaNumber`
 * que resolve credenciais por `wa_number_id` (multi-tenant correto).
 *
 * IMPORTANTE: o construtor canônico exige `WaNumberConfig` (acess_token +
 * phone_number_id por clínica). Callers devem usar a factory:
 *
 *   const wa = await createWhatsAppCloudFromWaNumber(svc, wa_number_id)
 *
 * Em vez do antigo:
 *
 *   const wa = new WhatsAppCloudService()  // ❌ env global, não multi-tenant
 */

export {
  WhatsAppCloudService,
  createWhatsAppCloudFromWaNumber,
} from '@clinicai/whatsapp'
export type { WaNumberConfig } from '@clinicai/whatsapp'
