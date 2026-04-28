/**
 * Configurações da Lara · Server Component.
 *
 * Persiste em clinic_data (jsonb · key='lara_config') via ClinicDataRepository.
 * Multi-tenant ADR-028 · escopa por clinic_id (JWT).
 * ADR-012 · loadServerReposContext + repos.clinicData.getSetting<T>.
 *
 * UX brandbook-aligned 2026-04-28: tipografia cormorant 300 + eyebrow Montserrat
 * uppercase letter-spacing 4px gold · radius 8px (cards) / 4px (inputs) ·
 * sem emoji em headers institucionais (anti-padrao secao 22) · sem cursive-italic
 * em titulos inteiros (so palavra-ancora · secao 12.2).
 */

import { saveLaraConfigAction } from './actions'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { loadServerReposContext } from '@/lib/repos'
import { ConfigSection } from '@/components/organisms/ConfigSection'
import { NumericField } from '@/components/molecules/NumericField'
import { SelectField } from '@/components/molecules/SelectField'
import { Button } from '@/components/atoms/Button'

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
      <div className="max-w-4xl mx-auto px-6 lg:px-10 py-12 lg:py-16">
        {/* ─── Page header · brandbook spec: eyebrow + cormorant 300 + italic anchor ── */}
        <header className="mb-12 lg:mb-16">
          <p className="font-display-uppercase text-[10px] tracking-[0.4em] text-[hsl(var(--primary))]/80 mb-4">
            Painel · Lara
          </p>
          <h1 className="font-[family-name:var(--font-cursive)] text-5xl lg:text-6xl font-light leading-[0.95] tracking-[-0.02em] text-[hsl(var(--foreground))]">
            Configurações da{' '}
            <em className="font-[family-name:var(--font-cursive)] italic font-light text-[hsl(var(--primary))]">
              clínica
            </em>
          </h1>
          <p className="text-[14px] text-[hsl(var(--muted-foreground))] mt-5 leading-[1.7] max-w-xl">
            Comportamento da IA, controle de custo e limites operacionais. Mudanças aplicam
            imediatamente, sem rebuild.
          </p>
        </header>

        <form action={saveLaraConfigAction} className="space-y-7">
          <ConfigSection
            eyebrow="Custo"
            title="Modelo e teto"
            italicAnchor="diário"
            description="Modelo Claude usado nas conversas e teto diário em USD. Quando atingido, IA bloqueia novas chamadas até 00:00 UTC."
            cols={2}
          >
            <SelectField
              name="model"
              label="Modelo Claude"
              defaultValue={config.model}
              options={MODEL_OPTIONS}
              helper="Sonnet 4.6 é o padrão recomendado · custo médio, qualidade alta. Haiku usa cerca de 5× menos tokens, mas pode ser menos consistente em scripts complexos."
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
              helper="Padrão $5/dia · suficiente para cerca de 80 conversas Sonnet 4.6."
            />
          </ConfigSection>

          <ConfigSection
            eyebrow="Limites operacionais"
            title="Anti-loop e"
            italicAnchor="cooldown"
            description="Anti-loop por conversa, comportamento quando atendente humano assume e cooldown pós-disparo de campanha."
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
              helper="Anti-loop · se Lara passar disso para uma conversa em 24h, IA é desligada automaticamente. Padrão 45 cobre 99% dos casos."
            />
            <NumericField
              name="auto_pause_minutes"
              label="Pausa quando humano assume"
              defaultValue={config.auto_pause_minutes}
              min={5}
              max={1440}
              step={5}
              suffix="min"
              helper="Após atendente clicar Assumir ou enviar mensagem manual. IA volta automaticamente após o tempo expirar."
            />
            <NumericField
              name="disparo_cooldown_minutes"
              label="Cooldown pós-disparo"
              defaultValue={config.disparo_cooldown_minutes}
              min={0}
              max={1440}
              step={5}
              suffix="min"
              helper="Após disparo de campanha, Lara espera antes de processar mensagens dessa conversa · evita sobreposição de assuntos."
            />
          </ConfigSection>

          <ConfigSection
            eyebrow="Performance"
            title="Compact prompt"
            italicAnchor="threshold"
            description="Após N mensagens trocadas, Lara troca para um prompt compacto · cerca de 70% menos tokens · paridade com Lara legacy n8n."
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
              helper="Padrão 6. Diminuir = mais econômico, mas pode perder contexto · aumentar = mais tokens por chamada na fase tardia."
            />
          </ConfigSection>

          <ConfigSection
            eyebrow="Cadência de mídia"
            title="Envio de"
            italicAnchor="fotos"
            description="Quando uma tag [FOTO:queixa] dispara, Lara envia 2 fotos de pessoas diferentes do banco. O delay define o intervalo entre a 1ª e a 2ª · paciente registra a primeira antes da segunda chegar."
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
              helper="Padrão 15s · paridade com fluxo Lara legacy n8n. 0 = mandar simultâneas. Acima de 30s pode parecer travado."
            />
          </ConfigSection>

          {/* Save bar */}
          <div className="sticky bottom-0 -mx-6 lg:-mx-10 -mb-12 lg:-mb-16 px-6 lg:px-10 py-5 backdrop-blur-md bg-[hsl(var(--chat-bg))]/85 border-t border-[hsl(var(--chat-border))] flex items-center justify-end gap-3">
            <Button type="submit" variant="gold" size="md">
              Salvar configurações
            </Button>
          </div>
        </form>

        <div className="mt-16">
          <NotificationSettingsPanel />
        </div>
      </div>
    </main>
  )
}
