/**
 * Configurações da Lara · Server Component.
 *
 * Permite ajustar settings que afetam comportamento da IA:
 *   - Modelo Claude (sonnet-4-6 / haiku / opus)
 *   - Daily budget USD (cost control)
 *   - Daily message limit (anti-loop)
 *   - Auto-pause minutes default (quando humano assume)
 *   - Cooldown entre conversa e disparo manual (semantico)
 *
 * Persiste em clinic_data.settings (jsonb · key="lara_config"). Lê via JOIN
 * por clinic_id (resolvido via JWT). Server Actions pra UPDATE.
 */

import { loadServerContext } from '@clinicai/supabase'
import { Settings, AlertTriangle } from 'lucide-react'
import { saveLaraConfigAction } from './actions'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'

export const dynamic = 'force-dynamic'

interface LaraConfig {
  model: string
  daily_budget_usd: number
  daily_message_limit: number
  auto_pause_minutes: number
  disparo_cooldown_minutes: number
}

const DEFAULT_CONFIG: LaraConfig = {
  model: 'claude-sonnet-4-6',
  daily_budget_usd: 5.0,
  daily_message_limit: 45,
  auto_pause_minutes: 30,
  disparo_cooldown_minutes: 30,
}

async function loadConfig(): Promise<{ config: LaraConfig; clinic_id: string }> {
  const { supabase, ctx } = await loadServerContext()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from('clinic_data') as any)
    .select('value')
    .eq('clinic_id', ctx.clinic_id)
    .eq('key', 'lara_config')
    .maybeSingle()

  const stored = (data?.value as Partial<LaraConfig>) || {}
  return {
    config: { ...DEFAULT_CONFIG, ...stored },
    clinic_id: ctx.clinic_id,
  }
}

export default async function ConfiguracoesPage() {
  const { config } = await loadConfig()

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-light">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">
                Configurações
              </span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Comportamento da IA · cost control · limites operacionais
            </p>
          </div>
        </div>

        <form action={saveLaraConfigAction} className="space-y-6">
          {/* Modelo */}
          <Section title="Modelo Claude">
            <select
              name="model"
              defaultValue={config.model}
              className="w-full px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
            >
              <option value="claude-sonnet-4-6">Sonnet 4.6 · balanceado (default)</option>
              <option value="claude-haiku-4-5-20251001">Haiku 4.5 · rápido + barato</option>
              <option value="claude-opus-4-7">Opus 4.7 · raciocínio complexo</option>
            </select>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              Sonnet 4.6 é o padrão recomendado · custo médio, qualidade alta. Haiku usa
              ~5x menos tokens mas pode ser menos consistente em scripts complexos.
            </p>
          </Section>

          {/* Cost control */}
          <Section title="Limite diário de gasto IA (USD)">
            <input
              type="number"
              name="daily_budget_usd"
              defaultValue={config.daily_budget_usd}
              min="0.5"
              max="100"
              step="0.5"
              className="w-full px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              Quando atingido · IA bloqueia novas chamadas até reset (00:00 UTC).
              Padrão $5/dia · suficiente pra ~80 conversas Sonnet 4.6.
            </p>
          </Section>

          {/* Daily message limit (anti-loop) */}
          <Section title="Limite de mensagens por conversa em 24h">
            <input
              type="number"
              name="daily_message_limit"
              defaultValue={config.daily_message_limit}
              min="10"
              max="200"
              step="5"
              className="w-full px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              Anti-loop · se Lara mandar mais que esse número de mensagens pra UMA
              conversa em 24h, a IA é desligada automaticamente (paused_by=auto_limit).
              Padrão 45 cobre 99% dos casos reais.
            </p>
          </Section>

          {/* Auto-pause minutes */}
          <Section title="Tempo de pausa quando humano assume (minutos)">
            <input
              type="number"
              name="auto_pause_minutes"
              defaultValue={config.auto_pause_minutes}
              min="5"
              max="1440"
              step="5"
              className="w-full px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              Quando atendente clica &quot;Assumir&quot; ou envia mensagem manual,
              IA fica pausada por esse tempo. Após expirar, IA volta a responder
              automaticamente. Padrão 30 minutos.
            </p>
          </Section>

          {/* Cooldown disparos */}
          <Section title="Cooldown entre disparo manual e Lara responder (minutos)">
            <input
              type="number"
              name="disparo_cooldown_minutes"
              defaultValue={config.disparo_cooldown_minutes}
              min="0"
              max="1440"
              step="5"
              className="w-full px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              Após disparo de campanha (aniversário, broadcast), Lara espera esse
              tempo antes de processar novas mensagens dessa conversa · evita
              sobreposição de assuntos. Padrão 30 minutos.
            </p>
          </Section>

          <div className="pt-4 border-t border-[hsl(var(--chat-border))] flex items-center justify-between">
            <div className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />
              Mudanças aplicam imediatamente · sem rebuild necessário
            </div>
            <button
              type="submit"
              className="px-6 py-3 rounded-pill font-display-uppercase text-xs tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 transition-all hover:-translate-y-px shadow-luxury-sm hover:shadow-luxury-md"
            >
              Salvar configurações
            </button>
          </div>
        </form>

        {/* Settings client-side · per-device · localStorage */}
        <div className="mt-6">
          <NotificationSettingsPanel />
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
      <label className="block text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-3 font-display-uppercase">
        {title}
      </label>
      {children}
    </div>
  )
}
