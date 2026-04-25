'use server'

import { revalidatePath } from 'next/cache'
import { loadServerContext } from '@clinicai/supabase'

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

  const { supabase, ctx } = await loadServerContext()
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }

  const action = String(formData.get('action') || 'save')

  if (action === 'reset') {
    // Remove override · ai.service cai no fallback do filesystem
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('clinic_data') as any)
      .delete()
      .eq('clinic_id', ctx.clinic_id)
      .eq('key', key)
    if (error) throw new Error(`Falha ao resetar: ${error.message}`)
  } else {
    const content = String(formData.get('content') || '').trim()
    if (!content) {
      // Vazio = remove override (mesmo efeito de reset)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('clinic_data') as any)
        .delete()
        .eq('clinic_id', ctx.clinic_id)
        .eq('key', key)
    } else {
      // UPSERT em clinic_data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('clinic_data') as any).upsert(
        {
          clinic_id: ctx.clinic_id,
          key,
          value: content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id,key' },
      )
      if (error) throw new Error(`Falha ao salvar: ${error.message}`)
    }
  }

  revalidatePath('/prompts')
}
