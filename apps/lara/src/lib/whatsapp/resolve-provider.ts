/**
 * resolveProviderForConv · helper compartilhado para resolver Cloud OU
 * Evolution baseado no `wa_numbers` da conversa.
 *
 * Mig 91/92 · per-tenant · usado por:
 *   · POST /api/conversations/[id]/messages (envio normal · forward)
 *   · POST /api/conversations/[id]/messages/[messageId]/reaction (React A)
 *   · futuras rotas que precisarem do provider correto da conv
 *
 * Lê o row de wa_numbers e instancia Cloud OU Evolution conforme
 * phone_number_id/instance_id. Fallback Cloud env-global se conv.waNumberId
 * for null (legacy · pré-mig 91).
 */

import {
  WhatsAppCloudService,
  createWhatsAppCloudFromWaNumber,
  EvolutionService,
  type WhatsAppProvider,
} from '@clinicai/whatsapp'

export type WhatsAppTransport = 'cloud' | 'evolution' | 'env_fallback'

export async function resolveProviderForConv(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  conv: { id: string; clinicId: string; waNumberId: string | null },
): Promise<{ provider: WhatsAppProvider; transport: WhatsAppTransport }> {
  if (conv.waNumberId) {
    const { data: row } = await supabase
      .from('wa_numbers')
      .select('id, phone_number_id, access_token, instance_id, api_url, api_key, is_active')
      .eq('id', conv.waNumberId)
      .maybeSingle()

    if (row?.is_active) {
      // Evolution · instance_id presente E api_url/api_key configurados
      if (row.instance_id && row.api_url && row.api_key) {
        return {
          provider: new EvolutionService({
            apiUrl: String(row.api_url),
            apiKey: String(row.api_key),
            instance: String(row.instance_id),
          }),
          transport: 'evolution',
        }
      }
      // Cloud · phone_number_id + access_token
      if (row.phone_number_id && row.access_token) {
        const cloud = await createWhatsAppCloudFromWaNumber(supabase, conv.waNumberId)
        if (cloud) return { provider: cloud, transport: 'cloud' }
      }
    }
  }
  // Fallback · env global (legacy · Lara antiga)
  return {
    provider: new WhatsAppCloudService({
      wa_number_id: 'fallback-env',
      clinic_id: conv.clinicId,
      phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    }),
    transport: 'env_fallback',
  }
}
