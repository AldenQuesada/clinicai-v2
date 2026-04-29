/**
 * GET /api/cron/orcamento-followup · cron diario · follow-up automatico
 * de orcamentos parados.
 *
 * Schedule: 1x/dia 13h UTC (10h SP) · GitHub Actions `lara-crons.yml`.
 *
 * Camada 10a (2026-04-29). Espelha pattern de `lara_voucher_followup_pick`:
 *   1. clearStuckFollowups() · libera locks > 5min (cron crashou em
 *      execucao anterior)
 *   2. picker retorna ate BATCH_LIMIT (10) candidatos elegiveis · cada um
 *      ja vem c/ picking_at = now() setado atomicamente (UPDATE FOR
 *      SKIP LOCKED)
 *   3. pra cada candidato: resolve telefone (lead/patient) + wa_number
 *      ativo · template determinado pelo bucket + variacao por hash do id
 *      (5 variacoes por bucket pra nao soar robotico)
 *   4. envia via WhatsAppCloudService (texto livre · janela 24h ativa
 *      enquanto paciente respondeu recente)
 *   5. markFollowupSent(id) seta last_followup_at + libera lock
 *
 * Anti-avalanche: BATCH_LIMIT=10 por execucao + SPACING_MS=4s entre
 * envios = ~40s/run (cabe na janela de 60s default da Action).
 *
 * Audit fix N3 (2026-04-27): exige header `x-cron-secret` matching
 * LARA_CRON_SECRET ou CRON_SECRET (timing-safe). Fail-CLOSED se env
 * ausente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { createWhatsAppCloudFromWaNumber, WhatsAppCloudService } from '@clinicai/whatsapp'
import { makeRepos } from '@/lib/repos'
import { validateCronSecret } from '@clinicai/utils'
import { createLogger, hashPhone } from '@clinicai/logger'
import {
  WaNumberRepository,
  type OrcamentoFollowupCandidateDTO,
} from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

const log = createLogger({ app: 'lara' }).child({ cron: 'orcamento-followup' })

const BATCH_LIMIT = 10
const SPACING_MS = 4000
const STUCK_MAX_AGE_MIN = 5

// ── Templates por bucket (3 variacoes cada) ──────────────────────────────────
//
// Texto livre · funciona dentro da janela 24h Meta (paciente conversou
// recente · esperado pra orcamento ativo). Se janela fechou, Meta retorna
// erro e logamos warn (skip · proxima execucao tenta novamente em 24h).

interface TemplateInput {
  recipient: string // primeiro nome ou string vazia
  title: string // titulo do orcamento ou "seu orcamento"
  daysToExpire: number // 0 = expira hoje, 1 = amanha, etc
  shareUrl: string // /orcamento/<token> URL completa
  total: string // BRL formatado, ex: "R$ 1.500,00"
}

type TemplateFn = (i: TemplateInput) => string

const TEMPLATES_RECENT: TemplateFn[] = [
  ({ recipient, title }) =>
    `Oi${recipient ? `, ${recipient}` : ''}! É a Mirian. Sobre o orçamento "${title}" que te enviei — qualquer dúvida me chama. Posso esclarecer alguma coisa? 💛`,
  ({ recipient, title, shareUrl }) =>
    `${recipient ? `${recipient}, ` : ''}passando aqui rapidinho: você ainda consegue ver o orçamento de "${title}" neste link: ${shareUrl}\n\nFica à vontade pra me chamar se precisar de algum ajuste 🌿`,
  ({ recipient, title }) =>
    `Olá${recipient ? `, ${recipient}` : ''}! Tudo bem? Queria saber se conseguiu ver a proposta de "${title}". Tô aqui pra qualquer dúvida ✨`,
]

const TEMPLATES_EXPIRING: TemplateFn[] = [
  ({ recipient, title, daysToExpire }) =>
    `${recipient ? `${recipient}, ` : ''}lembrando que o orçamento de "${title}" vence em ${daysToExpire}d. Se quiser fechar pelo valor proposto, me avisa que reservo seu horário 💛`,
  ({ recipient, title, total, daysToExpire }) =>
    `Oi${recipient ? `, ${recipient}` : ''}! Sobre "${title}" (${total}): a validade do orçamento termina em ${daysToExpire}d. Posso te ajudar a decidir? 🌸`,
  ({ recipient, title, daysToExpire, shareUrl }) =>
    `${recipient ? `${recipient}! ` : 'Oi! '}Pra você não perder a oportunidade — "${title}" expira em ${daysToExpire}d. Link da proposta: ${shareUrl}`,
]

const TEMPLATES_EXPIRING_SOON: TemplateFn[] = [
  ({ recipient, title, daysToExpire }) =>
    `${recipient ? `${recipient}, ` : ''}última chance: o orçamento de "${title}" expira ${daysToExpire <= 0 ? 'hoje' : 'amanhã'}. Se ainda fizer sentido pra você, me chama agora pra eu te ajudar ✨`,
  ({ recipient, title }) =>
    `Oi${recipient ? `, ${recipient}` : ''}! Tô passando pra avisar: a validade do orçamento "${title}" termina em breve. Se quiser garantir o valor, me responde por aqui 💛`,
  ({ recipient, title, total, daysToExpire }) =>
    `${recipient ? `${recipient}! ` : 'Oi! '}A proposta "${title}" (${total}) vence ${daysToExpire <= 0 ? 'hoje' : 'amanhã'}. Posso renovar pra você se ainda for o momento certo, é só me avisar 🌿`,
]

function pickTemplateIdx(orcId: string, total: number): number {
  // Hash deterministico simples · ultimo char hex
  const last = orcId[orcId.length - 1] ?? '0'
  const code = parseInt(last, 16)
  if (Number.isNaN(code)) return 0
  return code % total
}

function templatesForBucket(bucket: 'recent' | 'expiring' | 'expiring_soon'): TemplateFn[] {
  switch (bucket) {
    case 'expiring_soon':
      return TEMPLATES_EXPIRING_SOON
    case 'expiring':
      return TEMPLATES_EXPIRING
    case 'recent':
    default:
      return TEMPLATES_RECENT
  }
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

interface SubjectInfo {
  name: string | null
  phone: string | null
}

async function resolveSubject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repos: ReturnType<typeof makeRepos>,
  candidate: OrcamentoFollowupCandidateDTO,
): Promise<SubjectInfo> {
  if (candidate.patientId) {
    const p = await repos.patients.getById(candidate.patientId).catch(() => null)
    if (p) return { name: p.name ?? null, phone: p.phone ?? null }
  }
  if (candidate.leadId) {
    const l = await repos.leads.getById(candidate.leadId).catch(() => null)
    if (l) return { name: l.name ?? null, phone: l.phone }
  }
  return { name: null, phone: null }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(req: NextRequest) {
  // Audit fix N3: valida cron secret · fail-CLOSED se env ausente.
  const reject =
    validateCronSecret(req, 'LARA_CRON_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET')
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status })
  }

  const supabase = createServerClient()
  const repos = makeRepos(supabase)
  const waRepo = new WaNumberRepository(supabase)

  // Fallback service (env global) · usado quando clinica nao tem wa_number ativo
  const fallbackWa = new WhatsAppCloudService({
    wa_number_id: 'fallback-env',
    clinic_id: '00000000-0000-0000-0000-000000000001',
    phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
  })

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'https://lara.miriandpaula.com.br'

  try {
    // 1. Libera locks stuck (cron crashou em execucao anterior)
    const cleared = await repos.orcamentos.clearStuckFollowups(STUCK_MAX_AGE_MIN)
    if (cleared > 0) {
      log.warn({ cleared }, 'orc.followup.stuck.cleared')
    }

    // 2. Picker atomico
    const candidates = await repos.orcamentos.pickFollowupCandidates(BATCH_LIMIT)

    if (candidates.length === 0) {
      log.info('orc.followup.no_candidates')
      return NextResponse.json({ success: true, processed: 0, msg: 'Nenhum orcamento pendente.' })
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const cand of candidates) {
      try {
        const subject = await resolveSubject(repos, cand)

        // Skip se nao tem telefone valido · libera lock pra nao re-pegar amanha
        if (!subject.phone || subject.phone.length < 10) {
          await repos.orcamentos.markFollowupSent(cand.orcamentoId)
          log.warn(
            { orc_id: cand.orcamentoId, reason: 'no_phone' },
            'orc.followup.skip',
          )
          skipped++
          continue
        }

        // Resolve wa_number ativo da clinica (1a opcao) · fallback env global
        const activeNumbers = await waRepo.listActive(cand.clinicId).catch(() => [])
        const firstActive = activeNumbers.length > 0 ? activeNumbers[0] : null
        let wa: WhatsAppCloudService | null = null
        if (firstActive?.id) {
          wa = await createWhatsAppCloudFromWaNumber(supabase, firstActive.id)
        }
        const sender = wa ?? fallbackWa

        // Monta mensagem
        const firstName = (subject.name ?? '').trim().split(/\s+/)[0] || ''
        const title = (cand.title || '').trim() || 'seu orçamento'
        const shareUrl = cand.shareToken
          ? `${baseUrl}/orcamento/${cand.shareToken}`
          : ''
        const totalFmt = BRL.format(cand.total)

        const tpls = templatesForBucket(cand.bucket)
        const idx = pickTemplateIdx(cand.orcamentoId, tpls.length)
        const message = tpls[idx]({
          recipient: firstName,
          title,
          daysToExpire: cand.daysToExpire,
          shareUrl,
          total: totalFmt,
        })

        // Envia
        const sendResult = await sender.sendText(subject.phone, message)
        if (sendResult.ok) {
          await repos.orcamentos.markFollowupSent(cand.orcamentoId)
          log.info(
            {
              event_key: `lara.orcamento.followup.${cand.bucket}`,
              clinic_id: cand.clinicId,
              orc_id: cand.orcamentoId,
              recipient_hash: hashPhone(subject.phone),
              bucket: cand.bucket,
              days_to_expire: cand.daysToExpire,
              template_idx: idx,
            },
            'orc.followup.sent',
          )
          sent++
        } else {
          // Nao limpa lock · proxima execucao tenta de novo apos 5min
          log.warn(
            {
              orc_id: cand.orcamentoId,
              recipient_hash: hashPhone(subject.phone),
              error: sendResult.error,
            },
            'orc.followup.send_failed',
          )
          failed++
        }

        // Spacing entre envios · evita rate limit Meta
        if (candidates.indexOf(cand) < candidates.length - 1) {
          await sleep(SPACING_MS)
        }
      } catch (e) {
        log.error(
          { orc_id: cand.orcamentoId, err: (e as Error)?.message },
          'orc.followup.item_exception',
        )
        failed++
      }
    }

    log.info(
      { sent, skipped, failed, total: candidates.length },
      'orc.followup.done',
    )
    return NextResponse.json({
      success: true,
      sent,
      skipped,
      failed,
      total: candidates.length,
    })
  } catch (err) {
    log.error({ err: (err as Error)?.message }, 'orc.followup.failed')
    return NextResponse.json(
      { success: false, error: (err as Error)?.message },
      { status: 500 },
    )
  }
}
