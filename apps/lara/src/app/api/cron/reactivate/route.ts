/**
 * GET /api/cron/reactivate · cron horario · D1 reactivation (23h-26h window).
 *
 * Encontra conversations 'active' com last_lead_msg entre 23h e 26h atras
 * que ainda nao receberam mensagem de reativacao. Envia template aprovado
 * pra evitar perder a sessao Meta de 24h.
 *
 * ADR-012: usa ConversationRepository.findReactivationCandidates +
 *          MessageRepository.saveOutbound + ConversationRepository.setReactivationSent.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { WhatsAppCloudService } from '@/services/whatsapp-cloud';
import { makeRepos } from '@/lib/repos';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerClient();
  const repos = makeRepos(supabase);
  const wa = new WhatsAppCloudService();

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

    for (const conv of candidates) {
      const reactivateMessage =
        'Oi! Você acabou se ocupando por aí? Entendo perfeitamente, a rotina esmaga a gente. Vou pausar meu contato por aqui pra não atrapalhar seu dia, mas seu cadastro (com os bônus) está salvo. Assim que tiver um respiro, me chama de volta pra continuarmos!';

      const sendResult = await wa.sendText(conv.phone, reactivateMessage);

      if (sendResult.ok) {
        await repos.conversations.setReactivationSent(conv.id, true);

        // Grava mensagem · clinic_id da conv (resolvido no inbound original · ADR-028)
        await repos.messages.saveOutbound(conv.clinicId, {
          conversationId: conv.id,
          sender: 'lara',
          content: reactivateMessage,
          contentType: 'text',
          status: 'sent',
        });

        processedCount++;
      }
    }

    return NextResponse.json({ success: true, processed: processedCount });
  } catch (err: any) {
    console.error('[CRON] Reactivation Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
