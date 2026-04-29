'use server'

/**
 * Server Actions · salvar/resetar prompts em clinic_data.
 * ADR-012 · ClinicDataRepository.upsertSetting/deleteSetting.
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'

const ALLOWED_KEYS = [
  // Mensagens fixas (zero token)
  'lara_fixed_msg_0',
  'lara_fixed_msg_1',
  // Base & regras
  'lara_prompt_base',
  'lara_prompt_compact',
  'lara_prompt_prices_defense',
  'lara_prompt_voucher_recipient',
  // Funis
  'lara_prompt_olheiras',
  'lara_prompt_fullface',
  // Personas
  'lara_prompt_persona_sdr',
  'lara_prompt_persona_confirmador',
  'lara_prompt_persona_closer',
  'lara_prompt_persona_recuperador',
  'lara_prompt_persona_agendador',
  // Cold-open
  'lara_prompt_cold_open_aq_novo_lead',
  'lara_prompt_cold_open_aq_lead_frio',
  'lara_prompt_cold_open_aq_orcamento_aberto',
  'lara_prompt_cold_open_aq_agendado_futuro',
  'lara_prompt_cold_open_aq_paciente_ativo',
  'lara_prompt_cold_open_aq_requiz_recente',
] as const

export async function savePromptAction(key: string, formData: FormData) {
  if (!ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
    throw new Error(`Key invalida: ${key}`)
  }

  const { ctx, repos } = await loadServerReposContext()
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }

  const action = String(formData.get('action') || 'save')

  if (action === 'reset') {
    await repos.clinicData.deleteSetting(ctx.clinic_id, key)
  } else {
    const content = String(formData.get('content') || '').trim()
    if (!content) {
      // Vazio = remove override (mesmo efeito de reset)
      await repos.clinicData.deleteSetting(ctx.clinic_id, key)
    } else {
      await repos.clinicData.upsertSetting(ctx.clinic_id, key, content)
    }
  }

  revalidatePath('/prompts')
}
