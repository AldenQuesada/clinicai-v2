/**
 * Configurações da Lara · Server Component.
 *
 * Persiste em clinic_data (jsonb · key='lara_config') via ClinicDataRepository.
 * Multi-tenant ADR-028 · escopa por clinic_id (JWT).
 * ADR-012 · loadServerReposContext + repos.clinicData.getSetting<T>.
 *
 * UX redesign 2026-04-28 (design-squad spec): 6 knobs agrupados por intencao
 * em 3 secoes (Custo, Limites operacionais, Performance).
 */

import { Settings, AlertTriangle } from 'lucide-react'
import { saveLaraConfigAction } from './actions'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { loadServerReposContext } from '@/lib/repos'
import { ConfigSection } from '@/components/organisms/ConfigSection'
import { NumericField } from '@/components/molecules/NumericField'
import { SelectField } from '@/components/molecules/SelectField'

export const dynamic = 'force-dynamic'

interface LaraConfig {
  model: string
  daily_budget_usd: number
  daily_message_limit: number
  auto_pause_minutes: number
  disparo_cooldown_minutes: number
  compact_after: number
}

const DEFAULT_CONFIG: LaraConfig = {
  model: 'claude-sonnet-4-6',
  daily_budget_usd: 5.0,
  daily_message_limit: 45,
  auto_pause_minutes: 30,
  disparo_cooldown_minutes: 30,
  compact_after: 6,
}

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'balanceado · padrão' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'rápido + barato' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7', description: 'raciocínio complexo' },
]

async function loadConfig(): Promise<{ config: LaraConfig; clinic_id: string }> {
  const { ctx, repos } = await loadServerReposContext()
  const stored =
    (await repos.clinicData.getSetting<Partial<LaraConfig>>(ctx.clinic_id, 'lara_config')) ?? {}
  return {
    config: { ...DEFAULT_CONFIG, ...stored },
    clinic_id: ctx.clinic_id,
  }
}

export default async function ConfiguracoesPage() {
  const { config } = await loadConfig()

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-4xl mx-auto px-6 lg:px-8 py-8 lg:py-10">
        {/* ─── Page header ──────────────────────────────────────────── */}
        <header className="mb-10 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] shadow-luxury-sm">
            <Settings className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-light leading-tight">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">Configurações</span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 leading-relaxed">
              Comportamento da IA · cost control · limites operacionais
            </p>
          </div>
        </header>

        <form action={saveLaraConfigAction} className="space-y-6">
          {/* ─── Custo ─────────────────────────────────────────────── */}
          <ConfigSection
            emoji="💸"
            title="Custo"
            description="Modelo Claude e teto diário em USD · quando atingido, IA bloqueia até 00:00 UTC"
            cols={2}
          >
            <SelectField
              name="model"
              label="Modelo Claude"
              defaultValue={config.model}
              options={MODEL_OPTIONS}
              helper="Sonnet 4.6 é o padrão recomendado · custo médio, qualidade alta. Haiku usa ~5× menos tokens mas pode ser menos consistente em scripts complexos."
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
              helper="Padrão $5/dia · suficiente pra ~80 conversas Sonnet 4.6."
            />
          </ConfigSection>

          {/* ─── Limites operacionais ─────────────────────────────── */}
          <ConfigSection
            emoji="🛡️"
            title="Limites operacionais"
            description="Anti-loop, comportamento quando humano assume e cooldown pós-disparo de campanha"
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
              helper="Anti-loop · se Lara passar disso pra UMA conversa em 24h, IA é desligada automaticamente (paused_by=auto_limit). Padrão 45 cobre 99% dos casos."
            />
            <NumericField
              name="auto_pause_minutes"
              label="Pausa quando humano assume"
              defaultValue={config.auto_pause_minutes}
              min={5}
              max={1440}
              step={5}
              suffix="min"
              helper="Após atendente clicar &quot;Assumir&quot; ou enviar mensagem manual. IA volta automaticamente após o tempo expirar."
            />
            <NumericField
              name="disparo_cooldown_minutes"
              label="Cooldown pós-disparo"
              defaultValue={config.disparo_cooldown_minutes}
              min={0}
              max={1440}
              step={5}
              suffix="min"
              helper="Após disparo de campanha (aniversário, broadcast), Lara espera antes de processar mensagens dessa conversa · evita sobreposição de assuntos."
            />
          </ConfigSection>

          {/* ─── Performance ──────────────────────────────────────── */}
          <ConfigSection
            emoji="⚡"
            title="Performance"
            description="Otimizações de tokens em conversas longas · paridade com Lara legacy n8n"
            cols={1}
          >
            <NumericField
              name="compact_after"
              label="Compact prompt após N msgs"
              defaultValue={config.compact_after}
              min={2}
              max={50}
              step={1}
              suffix="msgs"
              helper="Após N mensagens trocadas, Lara troca pro prompt compact (~70% menor) · economia em conversas longas. Padrão 6. Diminuir = econômico mas pode perder contexto · aumentar = mais tokens por chamada na fase tardia."
            />
          </ConfigSection>

          {/* ─── Save bar (sticky) ────────────────────────────────── */}
          <div className="sticky bottom-0 -mx-6 lg:-mx-8 -mb-8 lg:-mb-10 px-6 lg:px-8 py-4 backdrop-blur-md bg-[hsl(var(--chat-bg))]/80 border-t border-[hsl(var(--chat-border))] flex items-center justify-between gap-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
              Mudanças aplicam imediatamente · sem rebuild
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-pill font-display-uppercase text-xs tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 transition-all hover:-translate-y-px shadow-luxury-sm hover:shadow-luxury-md"
            >
              Salvar configurações
            </button>
          </div>
        </form>

        {/* Settings client-side · per-device · localStorage */}
        <div className="mt-10">
          <NotificationSettingsPanel />
        </div>
      </div>
    </main>
  )
}
