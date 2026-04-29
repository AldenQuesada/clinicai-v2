/**
 * LaraConfigTab · aba "Lara IA" da pagina /configuracoes.
 *
 * Configuracao de comportamento da IA · modelo Claude, budget USD,
 * limites operacionais, compact threshold, photo delay. Especifico Lara
 * (legado clinic-dashboard nao tem · adicao nossa).
 */

import { saveLaraConfigAction } from './actions'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { loadServerReposContext } from '@/lib/repos'
import { ConfigSection } from '@/components/organisms/ConfigSection'
import { NumericField } from '@/components/molecules/NumericField'
import { SelectField } from '@/components/molecules/SelectField'
import { can, type StaffRole } from '@/lib/permissions'

interface LaraConfig {
  model: string
  daily_budget_usd: number
  daily_message_limit: number
  auto_pause_minutes: number
  disparo_cooldown_minutes: number
  compact_after: number
  photo_delay_seconds: number
}

const DEFAULT_CONFIG: LaraConfig = {
  model: 'claude-sonnet-4-6',
  daily_budget_usd: 5.0,
  daily_message_limit: 45,
  auto_pause_minutes: 30,
  disparo_cooldown_minutes: 30,
  compact_after: 6,
  photo_delay_seconds: 15,
}

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'balanceado · padrão' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'rápido + barato' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7', description: 'raciocínio complexo' },
]

async function loadLaraConfig(): Promise<LaraConfig> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const stored =
      (await repos.clinicData.getSetting<Partial<LaraConfig>>(ctx.clinic_id, 'lara_config')) ??
      {}
    return { ...DEFAULT_CONFIG, ...stored }
  } catch (e) {
    console.error('[LaraConfigTab] loadLaraConfig failed:', (e as Error).message)
    return DEFAULT_CONFIG
  }
}

export async function LaraConfigTab({ role }: { role: StaffRole | null }) {
  if (!can(role, 'settings:edit')) {
    return (
      <div className="luxury-card" style={{ padding: 32, textAlign: 'center' }}>
        <p
          className="font-display"
          style={{ fontSize: 18, fontStyle: 'italic', color: 'var(--b2b-text-dim)' }}
        >
          Apenas administradores configuram a IA.
        </p>
      </div>
    )
  }

  const config = await loadLaraConfig()

  return (
    <>
      <form action={saveLaraConfigAction}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ConfigSection
            eyebrow="Custo"
            title="Modelo e teto diário"
            description="Modelo Claude usado nas conversas e teto em USD por dia. Quando atingido, IA bloqueia até 00:00 UTC."
            cols={2}
          >
            <SelectField
              name="model"
              label="Modelo Claude"
              defaultValue={config.model}
              options={MODEL_OPTIONS}
              helper="Sonnet 4.6 é o padrão. Haiku usa cerca de 5× menos tokens, mas pode ser menos consistente."
            />
            <NumericField
              name="daily_budget_usd"
              label="Limite diário"
              defaultValue={config.daily_budget_usd}
              min={0.5}
              max={100}
              step={0.5}
              prefix="$"
              suffix="USD"
              helper="Padrão $5/dia · suficiente para ~80 conversas Sonnet 4.6."
            />
          </ConfigSection>

          <ConfigSection
            eyebrow="Limites operacionais"
            title="Anti-loop e cooldown"
            description="Anti-loop por conversa, comportamento quando humano assume e cooldown pós-disparo."
            cols={3}
          >
            <NumericField
              name="daily_message_limit"
              label="Msgs/conversa em 24h"
              defaultValue={config.daily_message_limit}
              min={10}
              max={200}
              step={5}
              suffix="msgs"
              helper="Anti-loop · IA é desligada se ultrapassar (paused_by=auto_limit). Padrão 45."
            />
            <NumericField
              name="auto_pause_minutes"
              label="Pausa quando humano assume"
              defaultValue={config.auto_pause_minutes}
              min={5}
              max={1440}
              step={5}
              suffix="min"
              helper="IA volta automaticamente após o tempo expirar."
            />
            <NumericField
              name="disparo_cooldown_minutes"
              label="Cooldown pós-disparo"
              defaultValue={config.disparo_cooldown_minutes}
              min={0}
              max={1440}
              step={5}
              suffix="min"
              helper="Após disparo de campanha, Lara espera antes de processar mensagens."
            />
          </ConfigSection>

          <ConfigSection
            eyebrow="Performance"
            title="Compact prompt threshold"
            description="Após N mensagens trocadas, Lara troca para um prompt compacto · ~70% menos tokens."
            cols={1}
          >
            <NumericField
              name="compact_after"
              label="Após N mensagens trocadas"
              defaultValue={config.compact_after}
              min={2}
              max={50}
              step={1}
              suffix="msgs"
              helper="Padrão 6. Diminuir = mais econômico · aumentar = mais contexto na fase tardia."
            />
          </ConfigSection>

          <ConfigSection
            eyebrow="Cadência de mídia"
            title="Envio de fotos"
            description="Quando [FOTO:queixa] dispara, Lara envia 2 fotos do banco. O delay define o intervalo entre a 1ª e a 2ª."
            cols={1}
          >
            <NumericField
              name="photo_delay_seconds"
              label="Delay entre 1ª e 2ª foto"
              defaultValue={config.photo_delay_seconds}
              min={0}
              max={120}
              step={1}
              suffix="seg"
              helper="Padrão 15s · paridade legacy n8n. 0 = simultâneas. Acima de 30s parece travado."
            />
          </ConfigSection>
        </div>

        <div className="b2b-form-actions">
          <button type="submit" className="b2b-btn b2b-btn-primary">
            Salvar configurações
          </button>
        </div>
      </form>

      <div style={{ marginTop: 32 }}>
        <NotificationSettingsPanel />
      </div>
    </>
  )
}
