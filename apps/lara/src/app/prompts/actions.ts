'use server'

/**
 * Server Actions · salvar/resetar prompts em clinic_data.
 * ADR-012 · ClinicDataRepository.upsertSetting/deleteSetting.
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'

const ALLOWED_KEYS = [
  'lara_prompt_base',
  'lara_prompt_olheiras',
  'lara_prompt_fullface',
  'lara_prompt_prices_defense',
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
