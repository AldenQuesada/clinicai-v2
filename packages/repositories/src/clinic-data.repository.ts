/**
 * ClinicDataRepository · acesso canonico a `clinic_data` (key/value jsonb).
 *
 * Estrutura: (clinic_id, key) PK · value jsonb. Usado pra:
 *   - lara_config (settings da IA)
 *   - lara_prompt_base / olheiras / fullface / prices_defense
 *   - flags experimentais futuras
 *
 * Multi-tenant ADR-028 · clinic_id sempre arg.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export class ClinicDataRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Le valor armazenado · null se key nao existe.
   * Type param T pra UI tipar setting (ex: getSetting<LaraConfig>).
   */
  async getSetting<T = unknown>(clinicId: string, key: string): Promise<T | null> {
    const { data } = await this.supabase
      .from('clinic_data')
      .select('data')
      .eq('clinic_id', clinicId)
      .eq('key', key)
      .maybeSingle()

    if (!data || data.data === undefined || data.data === null) return null
    return data.data as T
  }

  async upsertSetting(
    clinicId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    await this.supabase.from('clinic_data').upsert(
      {
        clinic_id: clinicId,
        key,
        data: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clinic_id,key' },
    )
  }

  async deleteSetting(clinicId: string, key: string): Promise<void> {
    await this.supabase
      .from('clinic_data')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('key', key)
  }

  /**
   * Le multiplas keys de uma so vez · evita N+1 ao montar prompt em camadas.
   * Retorna Map<key, value> · ausentes nao aparecem.
   */
  async getSettings(
    clinicId: string,
    keys: string[],
  ): Promise<Map<string, unknown>> {
    const map = new Map<string, unknown>()
    if (!keys.length) return map

    const { data } = await this.supabase
      .from('clinic_data')
      .select('key, data')
      .eq('clinic_id', clinicId)
      .in('key', keys)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      map.set(String(row.key), row.data)
    }
    return map
  }
}
