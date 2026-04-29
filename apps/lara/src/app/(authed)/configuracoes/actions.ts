'use server'

/**
 * Server Actions · salvar configuracoes da Lara em clinic_data.
 * ADR-012 · ClinicDataRepository.upsertSetting.
 * ADR-028 · clinic_id resolvido via JWT.
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'
import { invalidateLaraConfigCache } from '@/lib/lara-config'

export async function saveLaraConfigAction(formData: FormData) {
  const { ctx, repos } = await loadServerReposContext()

  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin pode mexer em configuracoes')
  }

  const config = {
    model: String(formData.get('model') || 'claude-sonnet-4-6'),
    daily_budget_usd: Number(formData.get('daily_budget_usd') || 5),
    daily_message_limit: Number(formData.get('daily_message_limit') || 45),
    auto_pause_minutes: Number(formData.get('auto_pause_minutes') || 30),
    disparo_cooldown_minutes: Number(formData.get('disparo_cooldown_minutes') || 30),
    compact_after: Number(formData.get('compact_after') || 6),
    photo_delay_seconds: Number(formData.get('photo_delay_seconds') || 15),
  }

  await repos.clinicData.upsertSetting(ctx.clinic_id, 'lara_config', config)

  // Invalida cache em memoria (lib/lara-config.ts) pra mudancas refletirem no proximo webhook
  invalidateLaraConfigCache(ctx.clinic_id)

  revalidatePath('/configuracoes')
  revalidatePath('/dashboard')
}
