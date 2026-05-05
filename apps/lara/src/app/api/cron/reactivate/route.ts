/**
 * GET /api/cron/reactivate · cron horario · D1 reactivation (23h-26h window).
 *
 * Encontra conversations 'active' com last_lead_msg entre 23h e 26h atras
 * que ainda nao receberam mensagem de reativacao. Envia template aprovado
 * pra evitar perder a sessao Meta de 24h.
 *
 * ADR-012: usa ConversationRepository.findReactivationCandidates +
 *          MessageRepository.saveOutbound + ConversationRepository.setReactivationSent.
 *
 * Audit fix N3 (2026-04-27): exige header `x-cron-secret` matching LARA_CRON_SECRET
 * (timing-safe). Sem isso, qualquer ator com a URL dispara mass-messaging.
 *
 * Audit fix N7 (2026-04-27): WhatsApp service per-tenant via wa_numbers
 * (não usa mais env global). wa_number_id resolvido pela conversation
 * (em vez do env, que misturaria clínicas em multi-tenant futuro).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createWhatsAppCloudFromWaNumber, WhatsAppCloudService } from '@clinicai/whatsapp';
import { makeRepos } from '@/lib/repos';
import { validateCronSecret } from '@clinicai/utils';
import { createLogger, hashPhone } from '@clinicai/logger';
import { isInternalWaNumber } from '@/lib/webhook/internal-phone';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Audit fix N3: valida cron secret · fail-CLOSED se env ausente.
  // Aceita LARA_CRON_SECRET (preferido) OU CRON_SECRET (compat com prod
  // existente em 2026-04-27). Defina UMA das duas no Easypanel.
  const reject =
    validateCronSecret(req, 'LARA_CRON_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET');
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status });
  }

  const supabase = createServerClient();
  const repos = makeRepos(supabase);

  // Fallback service (env global) · usado quando conversation não tem wa_number_id
  // associado · TODO remover quando todos wa_numbers populados (N23 audit)
  const fallbackWa = new WhatsAppCloudService({
    wa_number_id: 'fallback-env',
    clinic_id: '00000000-0000-0000-0000-000000000001',
    phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
  });

  const olderThan = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  const newerThan = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

  try {
    const candidates = await repos.conversations.findReactivationCandidates({
      olderThan,
      newerThan,
    });

    if (candidates.length === 0) {
      return NextResponse.json({ success: true, processed: 0, msg: 'Nenhum lead pendente.' });
    }

    let processedCount = 0;
    let skippedInternal = 0;

    for (const conv of candidates) {
      // Guard universal · cron jamais reativa pra próprio wa_number (audit
      // 2026-05-05). Mira/Marci/Mih com is_active=false não escapam mais.
      const internalCheck = await isInternalWaNumber(supabase, conv.clinicId, conv.phone);
      if (internalCheck.internal) {
        log.info(
          {
            conv_id: conv.id,
            phone_hash: hashPhone(conv.phone),
            own_label: internalCheck.label,
            own_role: internalCheck.inboxRole,
            own_type: internalCheck.numberType,
            own_active: internalCheck.isActive,
          },
          'reactivate.skip_internal_wa_number',
        );
        skippedInternal += 1;
        continue;
      }

      const reactivateMessage =
        'Oi! Você acabou se ocupando por aí? Entendo perfeitamente, a rotina esmaga a gente. Vou pausar meu contato por aqui pra não atrapalhar seu dia, mas seu cadastro (com os bônus) está salvo. Assim que tiver um respiro, me chama de volta pra continuarmos!';

      // Audit fix N7 (Camada 3.5 cleanup): ConversationDTO agora tem waNumberId tipado
      let wa: WhatsAppCloudService | null = null;
      if (conv.waNumberId) {
        wa = await createWhatsAppCloudFromWaNumber(supabase, conv.waNumberId);
      }
      const sender = wa ?? fallbackWa;

      const sendResult = await sender.sendText(conv.phone, reactivateMessage);

      if (sendResult.ok) {
        await repos.conversations.setReactivationSent(conv.id, true);

        await repos.messages.saveOutbound(conv.clinicId, {
          conversationId: conv.id,
          sender: 'lara',
          content: reactivateMessage,
          contentType: 'text',
          status: 'sent',
          providerMsgId: sendResult.messageId ?? null,
          waMessageId: sendResult.messageId ?? null,
          channel: 'cloud',
        });

        processedCount++;
      }
    }

    log.info(
      { processed: processedCount, candidates: candidates.length, skipped_internal: skippedInternal },
      'cron.reactivate.done',
    );
    return NextResponse.json({ success: true, processed: processedCount, skipped_internal: skippedInternal });
  } catch (err) {
    log.error({ err: (err as Error)?.message }, 'cron.reactivate.failed');
    return NextResponse.json({ success: false, error: (err as Error)?.message }, { status: 500 });
  }
}
