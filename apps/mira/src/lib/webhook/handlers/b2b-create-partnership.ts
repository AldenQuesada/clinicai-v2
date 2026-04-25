/**
 * Handler: admin.create_partnership
 *
 * Wizard conversacional 7-turno (mirror logico do clinic-dashboard
 * b2b-mira-router#handleCreatePartnership · adaptado pra state machine
 * cp_step explicita em vez de pending fields):
 *
 *   step=menu          → mostra tipos (Profissional/Estúdio/Influencer · type)
 *                         e pede escolha
 *   step=name          → captura nome do negocio
 *   step=contact_name  → captura nome do responsavel
 *   step=phone         → captura WhatsApp (valida E.164ish, retry)
 *   step=pillar        → escolhe pilar
 *   step=combo         → escolhe combo (texto livre · validacao P1)
 *   step=confirm       → mostra resumo + SIM/NAO
 *
 * Side-effects:
 *   - SIM final → chama B2BPartnershipRepository.upsert(slug, payload)
 *     com status='dna_check' (NAO ativa direto · admin precisa aprovar
 *     via handler #2 b2b-admin-approve depois)
 *   - NAO em qualquer ponto → clear state + "Beleza, criação cancelada"
 *
 * State key: cp_step (ja existe em STATE_KEY) · TTL 15min.
 *
 * Gate: somente role='admin' (route.ts ja preempta cp_step pra esse handler
 * antes de classificar nova intent).
 */

import {
  STATE_KEY,
  TTL_CP_WIZARD_MIN,
  isAffirmative,
  isNegative,
  isE164ish,
  normalizePillar,
  slugify,
  type CpStep,
  type CpStepState,
} from '../state-machine'
import type { Handler, HandlerResult, StateTransition } from './types'

const TYPE_MAP: Record<string, 'transactional' | 'occasion' | 'institutional'> = {
  '1': 'institutional',
  'profissional': 'institutional',
  'institucional': 'institutional',
  '2': 'occasion',
  'estudio': 'occasion',
  'estúdio': 'occasion',
  'estudios': 'occasion',
  'occasion': 'occasion',
  '3': 'transactional',
  'influencer': 'transactional',
  'influenciadora': 'transactional',
  'transactional': 'transactional',
}

function detectType(text: string): 'transactional' | 'occasion' | 'institutional' | null {
  const t = String(text || '').trim().toLowerCase()
  if (TYPE_MAP[t]) return TYPE_MAP[t]
  // Tenta primeira palavra
  const first = t.split(/\s+/)[0]
  if (first && TYPE_MAP[first]) return TYPE_MAP[first]
  return null
}

function setCpState(
  data: CpStepState['data'],
  step: CpStep,
): StateTransition {
  return {
    op: 'set',
    key: STATE_KEY.CP_STEP,
    value: { step, data } as unknown as Record<string, unknown>,
    ttlMinutes: TTL_CP_WIZARD_MIN,
  }
}

function clearCpState(): StateTransition {
  return { op: 'clear', key: STATE_KEY.CP_STEP }
}

function summary(data: CpStepState['data']): string {
  return (
    `• Tipo: *${data.type ?? '?'}*\n` +
    `• Negócio: *${data.name ?? '?'}*\n` +
    `• Responsável: *${data.contact_name ?? '?'}*\n` +
    `• WhatsApp: *${data.contact_phone ?? '?'}*\n` +
    `• Pilar: *${data.pillar ?? '?'}*\n` +
    `• Combo: *${data.combo ?? 'cortesia padrão'}*`
  )
}

export const b2bCreatePartnershipHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, role, text } = ctx

  if (role !== 'admin') {
    return {
      replyText: 'Esse comando é só pra admin.',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-create-partnership', error: 'not_admin' },
    }
  }

  // Cancel global · qualquer turno · admin manda "cancela"/"esquece" → clear
  if (isNegative(text) && /^(nao|n|esquece|cancela|deixa|para|pare)\b/i.test(text.trim())) {
    const stateRow = await repos.miraState.get<CpStepState>(phone, STATE_KEY.CP_STEP)
    if (stateRow) {
      return {
        replyText: 'Beleza, criação cancelada · nada foi salvo.',
        actions: [],
        stateTransitions: [clearCpState()],
        meta: { handler: 'b2b-create-partnership', cancelled: true },
      }
    }
  }

  // Fetch state · null = primeira interacao
  const stateRow = await repos.miraState.get<CpStepState>(phone, STATE_KEY.CP_STEP)
  const data: CpStepState['data'] = stateRow?.value?.data ?? {}
  const currentStep: CpStep = stateRow?.value?.step ?? 'menu'
  const trimmed = String(text || '').trim()

  // ──────────── STEP: menu ────────────
  if (currentStep === 'menu') {
    const detected = detectType(trimmed)
    if (!detected) {
      return {
        replyText:
          `Vamos cadastrar uma parceria nova ✍️\n\n` +
          `Que *tipo* é?\n` +
          `*1.* Profissional / Institucional (clínica, médico, espaço)\n` +
          `*2.* Estúdio / Ocasião (eventos, photo studios)\n` +
          `*3.* Influencer / Transactional (criadora de conteúdo)\n\n` +
          `Manda o número (1-3) ou o nome.`,
        actions: [],
        stateTransitions: [setCpState({}, 'menu')],
        meta: { handler: 'b2b-create-partnership', step: 'menu_prompt' },
      }
    }
    return {
      replyText:
        `Boa, *${detected}*. Qual o *nome do negócio*? ` +
        `(ex.: "Clínica da Sílvia")`,
      actions: [],
      stateTransitions: [setCpState({ ...data, type: detected }, 'name')],
      meta: { handler: 'b2b-create-partnership', step: 'name', type: detected },
    }
  }

  // ──────────── STEP: name ────────────
  if (currentStep === 'name') {
    if (trimmed.length < 2) {
      return {
        replyText: 'Manda um nome com pelo menos 2 caracteres, por favor.',
        actions: [],
        stateTransitions: [setCpState(data, 'name')],
        meta: { handler: 'b2b-create-partnership', step: 'name_retry' },
      }
    }
    return {
      replyText:
        `Anotado: *${trimmed}*. Qual o *nome do responsável*? ` +
        `(ex.: "Sílvia Menezes")`,
      actions: [],
      stateTransitions: [setCpState({ ...data, name: trimmed }, 'contact_name')],
      meta: { handler: 'b2b-create-partnership', step: 'contact_name' },
    }
  }

  // ──────────── STEP: contact_name ────────────
  if (currentStep === 'contact_name') {
    if (trimmed.length < 2) {
      return {
        replyText: 'Nome do responsável com pelo menos 2 caracteres, por favor.',
        actions: [],
        stateTransitions: [setCpState(data, 'contact_name')],
        meta: { handler: 'b2b-create-partnership', step: 'contact_name_retry' },
      }
    }
    return {
      replyText: `Beleza, *${trimmed}*. Qual o *WhatsApp* dela? (44 9XXXX-XXXX)`,
      actions: [],
      stateTransitions: [setCpState({ ...data, contact_name: trimmed }, 'phone')],
      meta: { handler: 'b2b-create-partnership', step: 'phone' },
    }
  }

  // ──────────── STEP: phone ────────────
  if (currentStep === 'phone') {
    const digits = trimmed.replace(/\D/g, '')
    if (!isE164ish(digits)) {
      return {
        replyText:
          'Hmm, esse número não tá certo. Manda com DDD (ex.: 44 99999-9999).',
        actions: [],
        stateTransitions: [setCpState(data, 'phone')],
        meta: { handler: 'b2b-create-partnership', step: 'phone_retry' },
      }
    }
    // Normaliza pra 55XXXXXXXXXXX
    const normalized = digits.length === 11 || digits.length === 10
      ? `55${digits}`
      : digits.startsWith('55')
        ? digits
        : `55${digits.slice(-11)}`
    return {
      replyText:
        `Anotado. Qual o *pilar* da parceria?\n` +
        `Opções: saúde, imagem, fitness, rede, evento, alimentação, ` +
        `institucional, status, outros.`,
      actions: [],
      stateTransitions: [setCpState({ ...data, contact_phone: normalized }, 'pillar')],
      meta: { handler: 'b2b-create-partnership', step: 'pillar' },
    }
  }

  // ──────────── STEP: pillar ────────────
  if (currentStep === 'pillar') {
    const pillar = normalizePillar(trimmed)
    if (!pillar) {
      return {
        replyText:
          'Não bati esse pilar. Manda uma destas: saúde, imagem, fitness, ' +
          'rede, evento, alimentação, institucional, status, outros.',
        actions: [],
        stateTransitions: [setCpState(data, 'pillar')],
        meta: { handler: 'b2b-create-partnership', step: 'pillar_retry' },
      }
    }
    return {
      replyText:
        `Pilar *${pillar}* ✓\n\n` +
        `Qual o *combo* de voucher dela? ` +
        `(ex.: "Véu de Noiva + Anovator A5" · ou manda "padrão" pra usar a cortesia base)`,
      actions: [],
      stateTransitions: [setCpState({ ...data, pillar }, 'combo')],
      meta: { handler: 'b2b-create-partnership', step: 'combo' },
    }
  }

  // ──────────── STEP: combo ────────────
  if (currentStep === 'combo') {
    let combo: string | undefined
    if (/^(padrao|padrão|default|cortesia)\b/i.test(trimmed)) {
      combo = undefined // usa default da clinica
    } else if (trimmed.length >= 2) {
      combo = trimmed
    } else {
      return {
        replyText: 'Manda o nome do combo (ou "padrão" pra cortesia base).',
        actions: [],
        stateTransitions: [setCpState(data, 'combo')],
        meta: { handler: 'b2b-create-partnership', step: 'combo_retry' },
      }
    }
    const next: CpStepState['data'] = { ...data, combo: combo ?? 'padrão' }
    return {
      replyText:
        `Confere pra eu cadastrar:\n\n${summary(next)}\n\n` +
        `Status inicial: *Avaliar DNA* (precisa aprovação depois).\n\n` +
        `Manda *SIM* pra criar ou *NÃO* pra cancelar.`,
      actions: [],
      stateTransitions: [setCpState(next, 'confirm')],
      meta: { handler: 'b2b-create-partnership', step: 'confirm' },
    }
  }

  // ──────────── STEP: confirm ────────────
  if (currentStep === 'confirm') {
    if (isNegative(trimmed)) {
      return {
        replyText: 'Cancelado · nada foi criado.',
        actions: [],
        stateTransitions: [clearCpState()],
        meta: { handler: 'b2b-create-partnership', cancelled: true },
      }
    }
    if (!isAffirmative(trimmed)) {
      return {
        replyText: 'Não entendi · manda *SIM* pra criar ou *NÃO* pra cancelar.',
        actions: [],
        stateTransitions: [setCpState(data, 'confirm')],
        meta: { handler: 'b2b-create-partnership', step: 'confirm_retry' },
      }
    }

    // SIM · upsert
    if (!data.name || !data.contact_name || !data.contact_phone || !data.pillar || !data.type) {
      return {
        replyText:
          'Hmm, faltou dado · vou recomeçar.\n\n' +
          'Manda "criar parceria" de novo.',
        actions: [],
        stateTransitions: [clearCpState()],
        meta: { handler: 'b2b-create-partnership', error: 'incomplete_data' },
      }
    }

    const slug = slugify(data.name)
    const upsertResult = await repos.b2bPartnerships.upsert(slug, {
      name: data.name,
      pillar: data.pillar,
      type: data.type,
      contact_name: data.contact_name,
      contact_phone: data.contact_phone,
      voucher_combo: data.combo && data.combo !== 'padrão' ? data.combo : null,
      status: 'dna_check',
      voucher_monthly_cap: 5,
      voucher_validity_days: 30,
      voucher_min_notice_days: 15,
      created_by: `wa_mira:${phone}`,
    })

    if (!upsertResult.ok) {
      return {
        replyText:
          `Tive um problema pra cadastrar (${upsertResult.error ?? 'unknown'}). Tenta de novo daqui a pouco?`,
        actions: [],
        stateTransitions: [clearCpState()],
        meta: {
          handler: 'b2b-create-partnership',
          error: 'upsert_failed',
          rpc_error: upsertResult.error,
        },
      }
    }

    // Audit
    await repos.waProAudit.logQuery({
      msg: {
        clinicId,
        phone,
        direction: 'inbound',
        content: `[wizard cp_confirm SIM]`,
        intent: 'admin.create_partnership',
        intentData: {
          partnership_id: upsertResult.id,
          slug,
          ...data,
        },
        status: 'sent',
      },
      audit: {
        clinicId,
        phone,
        query: `[wizard cp_confirm SIM] ${data.name}`,
        intent: 'admin.create_partnership',
        rpcCalled: 'b2b_partnership_upsert',
        success: true,
        resultSummary: `Parceria ${data.name} (${slug}) cadastrada · status=dna_check`,
      },
    })

    return {
      replyText:
        `Feito ✅\n\n` +
        `*${data.name}* cadastrada como *Avaliar DNA*.\n\n` +
        `Próximos passos:\n` +
        `1. Preencher DNA no painel (excelência · estética · propósito)\n` +
        `2. Manda _aprova ${data.name}_ aqui pra ativar\n\n` +
        `Painel: https://painel.miriandpaula.com.br/b2b-partners.html`,
      actions: [],
      stateTransitions: [clearCpState()],
      meta: {
        handler: 'b2b-create-partnership',
        partnership_id: upsertResult.id,
        slug,
      },
    }
  }

  // Estado desconhecido · reset defensivo
  return {
    replyText:
      'Algo zoou no fluxo de cadastro · vamos do zero?\n' +
      'Manda "criar parceria" de novo.',
    actions: [],
    stateTransitions: [clearCpState()],
    meta: { handler: 'b2b-create-partnership', error: 'unknown_step', currentStep },
  }
}
