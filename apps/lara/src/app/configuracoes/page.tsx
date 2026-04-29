/**
 * Configurações da Lara · Server Component.
 * Visual: ESPELHO Mira (.b2b-page-container, .luxury-card, .eyebrow, .font-display, .b2b-form-actions).
 */

import Link from 'next/link'
import { Users } from 'lucide-react'
import { saveLaraConfigAction } from './actions'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { loadServerReposContext } from '@/lib/repos'
import { ConfigSection } from '@/components/organisms/ConfigSection'
import { NumericField } from '@/components/molecules/NumericField'
import { SelectField } from '@/components/molecules/SelectField'
import { can, type StaffRole } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

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

async function loadConfig(): Promise<{
  config: LaraConfig
  clinic_id: string
  role: StaffRole | null
}> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const stored =
      (await repos.clinicData.getSetting<Partial<LaraConfig>>(ctx.clinic_id, 'lara_config')) ?? {}
    return {
      config: { ...DEFAULT_CONFIG, ...stored },
      clinic_id: ctx.clinic_id,
      role: (ctx.role ?? null) as StaffRole | null,
    }
  } catch (e) {
    console.error('[/configuracoes] loadConfig failed:', (e as Error).message, (e as Error).stack)
    return { config: DEFAULT_CONFIG, clinic_id: '', role: null }
  }
}

export default async function ConfiguracoesPage() {
  const { config, role } = await loadConfig()
  const canManageUsers = can(role, 'users:view')

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        {/* Page heading · padrao Mira */}
        <div className="mb-8">
          <p className="eyebrow mb-3">Painel · Lara</p>
          <h1 className="font-display text-[40px] leading-tight text-[var(--b2b-ivory)]">
            Configurações da <em>clínica</em>
          </h1>
          <p className="text-[13px] text-[var(--b2b-text-dim)] italic mt-2 max-w-2xl">
            Comportamento da IA · cost control · limites operacionais. Mudanças aplicam imediatamente.
          </p>
        </div>

        {canManageUsers && (
          <div style={{ marginBottom: 24 }}>
            <Link
              href="/configuracoes/usuarios"
              className="luxury-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '16px 20px',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: 'rgba(201,169,110,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--b2b-champagne)',
                  flexShrink: 0,
                }}
              >
                <Users className="w-5 h-5" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ marginBottom: 2 }}>
                  Equipe
                </div>
                <div style={{ fontSize: 14, color: 'var(--b2b-ivory)', marginBottom: 2 }}>
                  Gerenciar usuários e permissões
                </div>
                <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>
                  Convidar membros · alterar nível de acesso · revogar convites
                </div>
              </div>
              <span
                style={{
                  color: 'var(--b2b-champagne)',
                  fontSize: 18,
                  fontWeight: 300,
                  padding: '0 8px',
                }}
              >
                →
              </span>
            </Link>
          </div>
        )}

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
      </div>
    </main>
  )
}
