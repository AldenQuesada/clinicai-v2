/**
 * GET /api/cron/reactivate
 * Destinado a ser chamado por sistemas CRON (ex: Vercel Cron, github actions ou upstash) a cada hora.
 * Verifica conversas ativas onde a última mensagem do Lead tem mais de 23h.
 * Impede que a sessão da Meta (24h) seja perdida sem follow-up automático.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { WhatsAppCloudService } from '@/services/whatsapp-cloud';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerClient();
  const wa = new WhatsAppCloudService();

  // Calcula o limite: há 23 horas exatas.
  const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  // Limite inferior para não ressucitar leads parados há meses (ex: há no máximo 26h atras)
  const twentySixHoursAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

  try {
    const { data: convs, error } = await supabase
      .from('wa_conversations')
      .select('id, phone, lead_id, clinic_id')
      .eq('status', 'active')
      .eq('reactivation_sent', false)
      .lte('last_lead_msg', twentyThreeHoursAgo)
      .gte('last_lead_msg', twentySixHoursAgo);

    if (error || !convs || convs.length === 0) {
      return NextResponse.json({ success: true, processed: 0, msg: "Nenhum lead pendente." });
    }

    let processedCount = 0;

    for (const conv of convs) {
      // Mensagem de recuperação aprovada para D1/23h
      const reactivateMessage = "Oi! Você acabou se ocupando por aí? Entendo perfeitamente, a rotina esmaga a gente. Vou pausar meu contato por aqui pra não atrapalhar seu dia, mas seu cadastro (com os bônus) está salvo. Assim que tiver um respiro, me chama de volta pra continuarmos!";
      
      const sendResult = await wa.sendText(conv.phone, reactivateMessage);
      
      if (sendResult.ok) {
        // Marca que a reativação já foi enviada
        await supabase
          .from('wa_conversations')
          .update({ reactivation_sent: true })
          .eq('id', conv.id);
        
        // Também gravamos na tabela de mensagens pro histórico do dashboard
        // Multi-tenant: pega clinic_id da conversation (resolvido no inbound)
        await supabase.from('wa_messages').insert({
          clinic_id: conv.clinic_id,
          conversation_id: conv.id,
          direction: 'outbound',
          sender: 'lara',
          content: reactivateMessage,
          content_type: 'text',
          status: 'sent',
          sent_at: new Date().toISOString(),
        });

        processedCount++;
      }
    }

    return NextResponse.json({ success: true, processed: processedCount });

  } catch (err: any) {
    console.error("[CRON] Reactivation Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
