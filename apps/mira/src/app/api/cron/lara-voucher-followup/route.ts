/**
 * Cron: lara-voucher-followup.
 *
 * Schedule: cada hora (cron `0 * * * *`) · GitHub Actions mira-crons.yml.
 *
 * Drena candidatos de follow-up via RPC lara_voucher_followup_pick (mig 800-07
 * + 800-09 batch limit + picking_at lock):
 *   0. clearStuckFollowups() · libera locks > 5min (cron crashou em execucao
 *      anterior · log warn se cleared > 0)
 *   1. picker retorna ate BATCH_LIMIT (10) items priorizados server-side por
 *      bucket_priority DESC (72h > 48h > 24h) · audio_sent_at ASC.
 *      Cada item ja vem c/ picking_at = now() setado atomicamente · 2 crons
 *      concorrentes nao pegam os mesmos vouchers.
 *   2. pra cada item: template engracado por bucket · 5 variacoes (hash do
 *      voucher_id deterministico mas distribuido)
 *   3. envia via Evolution Mih (recipient_voucher dispatch)
 *   4. markFollowupSent(voucherId, bucket) seta state cold_<bucket> +
 *      libera picking_at (lock)
 *   5. apos 72h · envia tambem mensagem pra parceira via Mira instance
 *
 * Anti-avalanche (mig 800-09): se cron atrasar e backlog acumular (ex 26
 * vouchers Dani pendentes), pegamos 10 por execucao. 26 → 16 → 6 → 0 em 3h.
 * Spacing 6s entre envios · 10 itens × 6s = 60s · cabe na janela.
 *
 * Audit: waProAudit.logDispatch · b2b_comm_dispatch_log com event_key
 * "lara.voucher.followup.<bucket>" e recipient_role beneficiary | partner.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { createLogger, hashPhone } from '@clinicai/logger'
import { getEvolutionService } from '@/services/evolution.service'
import { resolveMiraInstance } from '@/lib/mira-instance'
import type { LaraFollowupBucket, LaraFollowupCandidateDTO } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

const log = createLogger({ app: 'mira' }).child({ cron: 'lara-voucher-followup' })

// Batch limit (mig 800-09 anti-avalanche) · cabe em ~60s c/ spacing 6s.
const BATCH_LIMIT = 10
const SPACING_MS = 6000
const SENDER_INSTANCE_MIH = process.env.EVOLUTION_INSTANCE_MIH ?? 'mih'
const SENDER_INSTANCE_MIRA = process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian'

// ── Templates engracados por bucket · variacao via hash do voucher_id ─────
// 5 variacoes por bucket pra nao soar robotico em volume.
const TEMPLATES_24H: ((p: { recipient: string; partner: string; combo: string }) => string)[] = [
  ({ recipient, partner }) =>
    `Oiê ${recipient}! 🌿 Vi que ainda não tive resposta sobre o voucher que a ${partner} te presenteou. Tá tudo bem? Posso te ajudar a agendar?`,
  ({ recipient, partner }) =>
    `${recipient}, oi! Lembrando aqui: a ${partner} te indicou e seu voucher tá ativo. Quando der me chama pra escolhermos um horário 💛`,
  ({ recipient, partner, combo }) =>
    `${recipient}! Passando pra avisar que seu voucher de ${combo || 'cortesia'} (presente da ${partner}) tá esperando. Bora agendar?`,
  ({ recipient, partner }) =>
    `Oi ${recipient}, sou a Lara da Dra. Mirian. A ${partner} pediu pra eu cuidar bem de você. Conseguiu ver as mensagens? 🌸`,
  ({ recipient, partner }) =>
    `${recipient}, tudo certo? Sua cortesia presenteada pela ${partner} tá disponível. Me dá um sinalzinho que combinamos um horário ✨`,
]

const TEMPLATES_48H: ((p: { recipient: string; partner: string; combo: string }) => string)[] = [
  ({ recipient }) =>
    `${recipient}, sumiu? 😅 Seu voucher ainda tá ativo, qualquer dúvida me chama. Tá animada pra conhecer a clínica?`,
  ({ recipient, partner }) =>
    `Oi ${recipient}! Já são uns dias desde o presente da ${partner}. Topa marcar agora? Tenho horários nesta semana 💛`,
  ({ recipient }) =>
    `${recipient}, é a Lara! Sei como rotina aperta, mas seu voucher tá guardadinho aqui. Me avisa um dia bom pra você?`,
  ({ recipient, partner }) =>
    `${recipient}, a ${partner} vai me perguntar como você tá hahaha. Bora pelo menos escolher um dia? Pode ser bem solto 🌿`,
  ({ recipient }) =>
    `Oi ${recipient}! Última atualização: seu voucher tá pra vencer em breve. Me chama que prioritizamos um horário pra você ✨`,
]

const TEMPLATES_72H: ((p: { recipient: string; partner: string; combo: string }) => string)[] = [
  ({ recipient }) =>
    `Última cantadinha: ${recipient}, voucher pra você ainda tá esperando. Me dá um sinalzinho? Senão deixo o presente guardado pra ocasião certa 💛`,
  ({ recipient, partner }) =>
    `${recipient}, vou parar de te encher 😅 Mas saiba que a porta da Dra. Mirian tá aberta e a ${partner} torceu muito por você. Quando quiser, me chama!`,
  ({ recipient }) =>
    `Oi ${recipient}! Vou pausar os recados pra não ser chata. Se mudar de ideia me avisa, seu lugar fica reservado 🌿`,
  ({ recipient, partner }) =>
    `${recipient}, sem problema se não rolou agora. A ${partner} vai entender. Quando o momento for melhor, me liga aqui no Whats que retomamos 💛`,
  ({ recipient }) =>
    `${recipient}, prometo não insistir mais. Mas o voucher fica anotado em seu nome. Quando você quiser, é só dar um oi por aqui ✨`,
]

const TEMPLATES_PARTNER_72H: ((p: { partner: string; recipient: string }) => string)[] = [
  ({ partner, recipient }) =>
    `${partner}, sou a Lara da Dra. Mirian. Sua indicada ${recipient} ainda não respondeu nas últimas 72h, vou marcar como lead frio por enquanto. Se ela aparecer, retomo na hora e te aviso 💛`,
  ({ partner, recipient }) =>
    `Oi ${partner}! Atualização sobre ${recipient}: 72h sem resposta, vou pausar os contatos pra não ser invasiva. Mas o voucher fica em pé, qualquer movimento eu te aviso 🌿`,
]

// Hash deterministico simples · pega o ultimo char do uuid hex e mod
function pickTemplateIdx(voucherId: string, total: number): number {
  const last = voucherId[voucherId.length - 1] ?? '0'
  const code = parseInt(last, 16)
  if (Number.isNaN(code)) return 0
  return code % total
}

function renderRecipientText(
  bucket: LaraFollowupBucket,
  candidate: LaraFollowupCandidateDTO,
): string {
  const recipient = candidate.recipientFirstName || 'oi'
  const partner = candidate.partnerFirstName || 'sua amiga'
  const combo = candidate.combo || ''

  const templates =
    bucket === '24h' ? TEMPLATES_24H : bucket === '48h' ? TEMPLATES_48H : TEMPLATES_72H
  const idx = pickTemplateIdx(candidate.voucherId, templates.length)
  return templates[idx]({ recipient, partner, combo })
}

function renderPartnerText(candidate: LaraFollowupCandidateDTO): string {
  const partner = candidate.partnerFirstName || 'parceira'
  const recipient = candidate.recipientFirstName || candidate.recipientName || 'a indicada'
  const idx = pickTemplateIdx(candidate.voucherId, TEMPLATES_PARTNER_72H.length)
  return TEMPLATES_PARTNER_72H[idx]({ partner, recipient })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(req: NextRequest) {
  return runCron(req, 'lara-voucher-followup', async ({ repos, clinicId }) => {
    // Source-of-truth UI · resolve sender 1x antes do loop (cache 60s)
    const SENDER_INSTANCE_MIRA_RESOLVED = await resolveMiraInstance(
      clinicId,
      'partner_response',
    )
    // Step 0 · libera vouchers stuck (cron crashou no meio de pick anterior).
    // Roda SEMPRE antes de pickar pra evitar starvation eterna de voucher
    // que ficou marcado picking_at mas nunca foi processado.
    const stuck = await repos.b2bVouchers.clearStuckFollowups()
    if (stuck.cleared > 0) {
      log.warn(
        { cleared: stuck.cleared },
        'lara_voucher_followup.stuck_cleared',
      )
      // Audit log · marker visivel pra debugging em b2b_comm_dispatch_log/wa_pro
      try {
        await repos.waProAudit.logQuery({
          msg: {
            clinicId,
            phone: 'system',
            direction: 'outbound',
            content: `lara_followup.stuck_cleared count=${stuck.cleared}`,
            intent: 'lara.voucher.followup.stuck_cleared',
            status: 'sent',
          },
          audit: {
            clinicId,
            phone: 'system',
            query: 'lara_voucher_followup_clear_stuck',
            intent: 'lara.voucher.followup.stuck_cleared',
            rpcCalled: 'lara_voucher_followup_clear_stuck',
            success: true,
            resultSummary: `cleared=${stuck.cleared}`,
          },
        })
      } catch {
        // best-effort
      }
    }

    // Step 1 · pick batch limitado (mig 800-09)
    const candidates = await repos.b2bVouchers.findFollowupCandidates(undefined, BATCH_LIMIT)

    if (candidates.length === 0) {
      log.info({ stuck_cleared: stuck.cleared }, 'lara_voucher_followup.empty_batch')
      return {
        picked: 0,
        sent: 0,
        failed: 0,
        partner_reports: 0,
        stuck_cleared: stuck.cleared,
        batch_limit: BATCH_LIMIT,
      }
    }

    log.info(
      {
        candidates: candidates.length,
        batch_limit: BATCH_LIMIT,
        stuck_cleared: stuck.cleared,
        bucket_breakdown: {
          '72h': candidates.filter((c) => c.bucket === '72h').length,
          '48h': candidates.filter((c) => c.bucket === '48h').length,
          '24h': candidates.filter((c) => c.bucket === '24h').length,
        },
      },
      'lara_voucher_followup.batch.picked',
    )

    const waMih = getEvolutionService('mih')
    const waMira = getEvolutionService('mira')

    let sent = 0
    let failed = 0
    let partnerReports = 0

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]
      const bucket = c.bucket
      const text = renderRecipientText(bucket, c)

      try {
        const result = await waMih.sendText(c.recipientPhone, text)

        await repos.waProAudit.logDispatch({
          clinicId: c.clinicId || clinicId,
          eventKey: `lara.voucher.followup.${bucket}`,
          channel: 'text',
          recipientRole: 'beneficiary',
          recipientPhone: c.recipientPhone,
          senderInstance: SENDER_INSTANCE_MIH,
          textContent: text,
          waMessageId: result.messageId ?? null,
          status: result.ok ? 'sent' : 'failed',
          errorMessage: result.error ?? null,
          partnershipId: c.partnershipId,
          meta: { voucher_id: c.voucherId, bucket },
        })

        if (result.ok) {
          sent++
          await repos.b2bVouchers.markFollowupSent(c.voucherId, bucket)
          log.info(
            {
              clinic_id: c.clinicId,
              voucher_id: c.voucherId,
              partnership_id: c.partnershipId,
              bucket,
              phone_hash: hashPhone(c.recipientPhone),
              chars: text.length,
            },
            'lara_voucher_followup.sent',
          )

          // Apos 72h tambem manda relatorio pra parceira (via Mira instance)
          if (bucket === '72h' && c.partnerContactPhone) {
            const partnerText = renderPartnerText(c)
            try {
              const partnerResult = await waMira.sendText(c.partnerContactPhone, partnerText)
              await repos.waProAudit.logDispatch({
                clinicId: c.clinicId || clinicId,
                eventKey: 'lara.voucher.followup.72h.partner_report',
                channel: 'text',
                recipientRole: 'partner',
                recipientPhone: c.partnerContactPhone,
                senderInstance: SENDER_INSTANCE_MIRA_RESOLVED,
                textContent: partnerText,
                waMessageId: partnerResult.messageId ?? null,
                status: partnerResult.ok ? 'sent' : 'failed',
                errorMessage: partnerResult.error ?? null,
                partnershipId: c.partnershipId,
                meta: { voucher_id: c.voucherId, related_bucket: '72h' },
              })
              if (partnerResult.ok) {
                partnerReports++
                log.info(
                  {
                    clinic_id: c.clinicId,
                    voucher_id: c.voucherId,
                    partnership_id: c.partnershipId,
                  },
                  'lara_voucher_followup.partner_report.sent',
                )
              }
            } catch (partnerErr) {
              log.warn(
                {
                  clinic_id: c.clinicId,
                  voucher_id: c.voucherId,
                  err: (partnerErr as Error)?.message,
                },
                'lara_voucher_followup.partner_report.failed',
              )
            }
          }
        } else {
          failed++
          log.warn(
            {
              clinic_id: c.clinicId,
              voucher_id: c.voucherId,
              bucket,
              error: result.error,
            },
            'lara_voucher_followup.send_failed',
          )
        }
      } catch (err) {
        failed++
        log.error(
          {
            clinic_id: c.clinicId,
            voucher_id: c.voucherId,
            bucket,
            err: err instanceof Error ? err.message : String(err),
          },
          'lara_voucher_followup.exception',
        )
      }

      // Anti-flood entre items
      if (i < candidates.length - 1) {
        await sleep(SPACING_MS)
      }
    }

    log.info(
      {
        picked: candidates.length,
        sent,
        failed,
        partner_reports: partnerReports,
        stuck_cleared: stuck.cleared,
        batch_limit: BATCH_LIMIT,
      },
      'lara_voucher_followup.batch.processed',
    )

    // Audit batch · marker em wa_pro_audit_log pra debugging em massa
    try {
      await repos.waProAudit.logQuery({
        msg: {
          clinicId,
          phone: 'system',
          direction: 'outbound',
          content: `lara_followup.batch picked=${candidates.length} sent=${sent} failed=${failed} partner_reports=${partnerReports}`,
          intent: 'lara.voucher.followup.batch_processed',
          status: failed > 0 ? 'partial' : 'sent',
        },
        audit: {
          clinicId,
          phone: 'system',
          query: 'lara_voucher_followup_pick',
          intent: 'lara.voucher.followup.batch_processed',
          rpcCalled: 'lara_voucher_followup_pick',
          success: failed === 0,
          resultSummary: `picked=${candidates.length} sent=${sent} failed=${failed} partner_reports=${partnerReports} stuck_cleared=${stuck.cleared}`,
        },
      })
    } catch {
      // best-effort
    }

    return {
      picked: candidates.length,
      sent,
      failed,
      partner_reports: partnerReports,
      stuck_cleared: stuck.cleared,
      batch_limit: BATCH_LIMIT,
    }
  })
}
