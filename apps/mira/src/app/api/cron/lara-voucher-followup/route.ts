/**
 * Cron: lara-voucher-followup.
 *
 * Schedule: cada hora (cron `0 * * * *`).
 *
 * Drena candidatos de follow-up via RPC lara_voucher_followup_pick (mig 800-07):
 *   1. picker retorna items com bucket calculado (24h, 48h ou 72h)
 *   2. pra cada item: escolhe template engracado por bucket · variacao 5 templates
 *      (hash do voucher_id pra ser deterministico mas distribuido)
 *   3. envia via Evolution Mih (recipient_voucher dispatch)
 *   4. registra envio · markFollowupSent(voucherId, bucket) seta state cold_<bucket>
 *   5. apos enviar 72h · envia ALSO mensagem pra parceira via Mira instance
 *      ("sua indicada nao respondeu, vou marcar como lead frio")
 *
 * Audit: waProAudit.logDispatch · b2b_comm_dispatch_log com event_key
 * "lara.voucher.followup.<bucket>" e recipient_role beneficiary | partner.
 *
 * Anti-flood: 1.5s entre envios pra Mih nao saturar Evolution.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { createLogger, hashPhone } from '@clinicai/logger'
import { getEvolutionService } from '@/services/evolution.service'
import type { LaraFollowupBucket, LaraFollowupCandidateDTO } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

const log = createLogger({ app: 'mira' }).child({ cron: 'lara-voucher-followup' })

const SPACING_MS = 1500
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
    const candidates = await repos.b2bVouchers.findFollowupCandidates()

    if (candidates.length === 0) {
      return { picked: 0, sent: 0, failed: 0, partner_reports: 0 }
    }

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
                senderInstance: SENDER_INSTANCE_MIRA,
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
      { picked: candidates.length, sent, failed, partner_reports: partnerReports },
      'lara_voucher_followup.batch.processed',
    )

    return {
      picked: candidates.length,
      sent,
      failed,
      partner_reports: partnerReports,
    }
  })
}
