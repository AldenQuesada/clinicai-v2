'use server'

/**
 * Server Actions · salvar configuracoes da Lara em clinic_data.settings.
 * Multi-tenant ADR-028 · escopa por clinic_id resolvido via JWT.
 */

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient, requireClinicContext } from '@clinicai/supabase'

export async function saveLaraConfigAction(formData: FormData) {
  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    },
  })

  const ctx = await requireClinicContext(supabase)

  // Roles owner + admin podem mexer em config · viewer/receptionist nao
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin pode mexer em configuracoes')
  }

  const config = {
    model: String(formData.get('model') || 'claude-sonnet-4-6'),
    daily_budget_usd: Number(formData.get('daily_budget_usd') || 5),
    daily_message_limit: Number(formData.get('daily_message_limit') || 45),
    auto_pause_minutes: Number(formData.get('auto_pause_minutes') || 30),
    disparo_cooldown_minutes: Number(formData.get('disparo_cooldown_minutes') || 30),
  }

  // UPSERT em clinic_data · key='lara_config'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('clinic_data') as any).upsert(
    {
      clinic_id: ctx.clinic_id,
      key: 'lara_config',
      value: config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'clinic_id,key' },
  )

  if (error) {
    throw new Error(`Falha ao salvar config: ${error.message}`)
  }

  revalidatePath('/configuracoes')
  revalidatePath('/dashboard')
}
