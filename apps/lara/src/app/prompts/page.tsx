/**
 * Editor visual de regras (prompts) da Lara · Server Component.
 *
 * 17 layers em 4 grupos · DB override via clinic_data.lara_prompt_*.
 * Empty value = volta pro filesystem default.
 *
 * ADR-012 · repos.clinicData.getSettings (batch · 1 query pra todos os layers).
 */

import { redirect } from 'next/navigation'
import * as fs from 'fs'
import * as path from 'path'
import { Sparkles, AlertTriangle } from 'lucide-react'
import { savePromptAction } from './actions'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

interface LayerSpec {
  key: string
  label: string
  file: readonly string[]
  description: string
}

interface LayerGroup {
  title: string
  emoji: string
  description: string
  layers: readonly LayerSpec[]
}

const LAYER_GROUPS: readonly LayerGroup[] = [
  {
    title: 'Base & regras',
    emoji: '📌',
    description: 'Identidade da Lara, regras inegociáveis e contextos sempre injetados',
    layers: [
      {
        key: 'lara_prompt_base',
        label: 'Identidade + regras inegociáveis',
        file: ['src', 'prompt', 'lara-prompt.md'],
        description:
          'Prompt principal · identidade, tom, regras inegociáveis. Sempre injetado em qualquer conversa.',
      },
      {
        key: 'lara_prompt_compact',
        label: 'Compact (após 6 msgs · economia de tokens)',
        file: ['src', 'prompt', 'lara-prompt-compact.md'],
        description:
          'Versão condensada (~70% menor) usada quando conversa passa de N msgs. Reduz custo em conversas longas. Threshold via env LARA_PROMPT_COMPACT_AFTER (default 6).',
      },
      {
        key: 'lara_prompt_prices_defense',
        label: 'Defesa de preços',
        file: ['src', 'prompt', 'flows', 'prices-defense-flow.md'],
        description:
          'Playbook obrigatório de objeção de preço · sempre injetado · 4 passos (Isolar → ROI → Bifurcação → Corte).',
      },
      {
        key: 'lara_prompt_voucher_recipient',
        label: 'Voucher B2B (paciente beneficiária)',
        file: ['src', 'prompt', 'flows', 'voucher-recipient-flow.md'],
        description:
          'Injetado quando recipient tem voucher recente (b2b_vouchers, mig 800-07). Foca em agendar a consulta · combo já incluso · não negociar preço.',
      },
    ],
  },
  {
    title: 'Funis',
    emoji: '🎯',
    description: 'Roteiros especializados por queixa principal · injetados quando funnel detectado',
    layers: [
      {
        key: 'lara_prompt_olheiras',
        label: 'Olheiras (Smooth Eyes + AH)',
        file: ['src', 'prompt', 'flows', 'olheiras-flow.md'],
        description:
          'Roteiro pra leads com queixa de olheiras · metáfora balde furado, 2 etapas, evita cirurgia.',
      },
      {
        key: 'lara_prompt_fullface',
        label: 'Full Face (Lifting 5D)',
        file: ['src', 'prompt', 'flows', 'fullface-flow.md'],
        description:
          'Roteiro pra leads com queixa de flacidez/sulcos · cashback, Anovator A5, abordagem SPIN.',
      },
    ],
  },
  {
    title: 'Personas (tom por fase)',
    emoji: '👤',
    description: 'Layer extra que muda o tom da Lara conforme fase do lead (lead.ai_persona)',
    layers: [
      {
        key: 'lara_prompt_persona_sdr',
        label: 'SDR · follow-up de lead',
        file: ['src', 'prompt', 'personas', 'sdr.md'],
        description: 'Lead já conversou pelo menos 1x mas não agendou · tom consultivo, nutrir.',
      },
      {
        key: 'lara_prompt_persona_confirmador',
        label: 'Confirmador · lead agendado',
        file: ['src', 'prompt', 'personas', 'confirmador.md'],
        description: 'Lead com consulta marcada · tom organizado, prepara paciente, reduz no-show.',
      },
      {
        key: 'lara_prompt_persona_closer',
        label: 'Closer · pós-consulta / orçamento',
        file: ['src', 'prompt', 'personas', 'closer.md'],
        description:
          'Lead com orçamento aberto · 4-step objeção preço, cashback, sem desconto fácil.',
      },
      {
        key: 'lara_prompt_persona_recuperador',
        label: 'Recuperador · lead frio (sumiu)',
        file: ['src', 'prompt', 'personas', 'recuperador.md'],
        description:
          'Lead que sumiu · re-engaja com leveza, sem cobrança · 2 tentativas e respeita silêncio.',
      },
      {
        key: 'lara_prompt_persona_agendador',
        label: 'Agendador · quer agendar agora',
        file: ['src', 'prompt', 'personas', 'agendador.md'],
        description:
          'Decisão tomada · tom eficiente, NUNCA propor horário (não tem agenda) · marca [ACIONAR_HUMANO].',
      },
    ],
  },
  {
    title: 'Cold-open · push pós-quiz',
    emoji: '🚀',
    description:
      'Primeira mensagem proativa após paciente terminar anatomy quiz · 6 templates por fase (anatomy_quiz_lara_dispatch.template_key)',
    layers: [
      {
        key: 'lara_prompt_cold_open_aq_novo_lead',
        label: 'Novo lead · msg 1 de 5 onboarding',
        file: ['src', 'prompt', 'cold-open', 'aq_novo_lead.md'],
        description: 'Apresenta-se · agradece · cita 2 queixas · pede 2 perguntinhas. NÃO agenda.',
      },
      {
        key: 'lara_prompt_cold_open_aq_lead_frio',
        label: 'Lead frio · reconexão sem cobrança',
        file: ['src', 'prompt', 'cold-open', 'aq_lead_frio.md'],
        description: 'Reconexão leve · "que bom te ver de novo" · sem cobrança.',
      },
      {
        key: 'lara_prompt_cold_open_aq_orcamento_aberto',
        label: 'Orçamento aberto · re-engajamento',
        file: ['src', 'prompt', 'cold-open', 'aq_orcamento_aberto.md'],
        description: '"Olha que coincidência" · queixas atuais já entram no orçamento · urgência ética.',
      },
      {
        key: 'lara_prompt_cold_open_aq_agendado_futuro',
        label: 'Já agendada · injeta [DATA] dinâmica',
        file: ['src', 'prompt', 'cold-open', 'aq_agendado_futuro.md'],
        description:
          'Lead com consulta marcada · reframe consulta como espaço de dúvidas · não revende.',
      },
      {
        key: 'lara_prompt_cold_open_aq_paciente_ativo',
        label: 'Paciente ativa · oferece reavaliação',
        file: ['src', 'prompt', 'cold-open', 'aq_paciente_ativo.md'],
        description: 'Paciente já conhecida · reavaliação cada 6 meses · não re-explica protocolo.',
      },
      {
        key: 'lara_prompt_cold_open_aq_requiz_recente',
        label: 'Re-quiz <24h · humor leve',
        file: ['src', 'prompt', 'cold-open', 'aq_requiz_recente.md'],
        description: '"Voltou? 😊" · humor sutil · cita queixas novas · oferece horário.',
      },
    ],
  },
] as const

// Flat array de todos os layers · pra batch fetch + lookups
const ALL_LAYERS: readonly LayerSpec[] = LAYER_GROUPS.flatMap((g) => g.layers)

interface PromptData {
  key: string
  label: string
  description: string
  filesystem_default: string
  override: string | null
  hasOverride: boolean
}

function valueToString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (
    value &&
    typeof value === 'object' &&
    'content' in value &&
    typeof (value as { content: unknown }).content === 'string'
  ) {
    return (value as { content: string }).content
  }
  return null
}

interface PromptGroup {
  title: string
  emoji: string
  description: string
  prompts: PromptData[]
}

async function loadPrompts(): Promise<{ groups: PromptGroup[]; canManage: boolean }> {
  const { ctx, repos } = await loadServerReposContext()
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)

  // Batch fetch dos overrides · 1 query pra todos os 17 layers
  const overrides = await repos.clinicData.getSettings(
    ctx.clinic_id,
    ALL_LAYERS.map((l) => l.key),
  )

  const buildPrompt = (layer: LayerSpec): PromptData => {
    let fsDefault = ''
    try {
      const fullPath = path.resolve(process.cwd(), ...layer.file)
      if (fs.existsSync(fullPath)) {
        fsDefault = fs.readFileSync(fullPath, 'utf-8')
      } else {
        fsDefault = '(arquivo não encontrado)'
      }
    } catch {
      fsDefault = '(erro lendo arquivo)'
    }

    const override = valueToString(overrides.get(layer.key))

    return {
      key: layer.key,
      label: layer.label,
      description: layer.description,
      filesystem_default: fsDefault,
      override,
      hasOverride: override !== null && override.trim().length > 0,
    }
  }

  const groups: PromptGroup[] = LAYER_GROUPS.map((g) => ({
    title: g.title,
    emoji: g.emoji,
    description: g.description,
    prompts: g.layers.map(buildPrompt),
  }))

  return { groups, canManage }
}

export default async function PromptsPage() {
  const { groups, canManage } = await loadPrompts()

  if (!canManage) {
    redirect('/dashboard')
  }

  const totalLayers = groups.reduce((sum, g) => sum + g.prompts.length, 0)
  const totalOverrides = groups.reduce(
    (sum, g) => sum + g.prompts.filter((p) => p.hasOverride).length,
    0,
  )

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-light">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">
                Prompts da Lara
              </span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Editor de prompts em camadas · DB override sem rebuild ·{' '}
              <span className="text-[hsl(var(--foreground))]">{totalLayers} layers</span> ·{' '}
              <span className="text-[hsl(var(--primary))]">{totalOverrides} overrides ativos</span>
            </p>
          </div>
        </div>

        <div className="rounded-card border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 p-4 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
          <div className="text-sm text-[hsl(var(--foreground))]">
            <strong>Atenção · prompts moldam comportamento da IA real.</strong> Mudanças
            aplicam imediatamente em todas as próximas conversas. Se algo der errado, deixe o
            campo vazio · sistema cai automaticamente no padrão (filesystem do repo).
          </div>
        </div>

        <div className="space-y-4">
          {groups.map((group, idx) => (
            <PromptGroupSection key={group.title} group={group} defaultOpen={idx === 0} />
          ))}
        </div>
      </div>
    </main>
  )
}

function PromptGroupSection({
  group,
  defaultOpen,
}: {
  group: PromptGroup
  defaultOpen: boolean
}) {
  const overrideCount = group.prompts.filter((p) => p.hasOverride).length

  return (
    <details
      open={defaultOpen}
      className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] group"
    >
      <summary className="cursor-pointer list-none p-5 flex items-center gap-4 hover:bg-[hsl(var(--muted))]/30 transition-colors rounded-card">
        <span className="text-2xl">{group.emoji}</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display-uppercase text-sm tracking-widest text-[hsl(var(--foreground))]">
            {group.title}
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 truncate">
            {group.description}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            {group.prompts.length} {group.prompts.length === 1 ? 'layer' : 'layers'}
          </span>
          {overrideCount > 0 && (
            <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              {overrideCount} override{overrideCount === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-[hsl(var(--muted-foreground))] text-xs transition-transform group-open:rotate-90">
            ▶
          </span>
        </div>
      </summary>
      <div className="px-5 pb-5 pt-2 space-y-4 border-t border-[hsl(var(--chat-border))]">
        {group.prompts.map((p) => (
          <PromptCard key={p.key} prompt={p} />
        ))}
      </div>
    </details>
  )
}

function PromptCard({ prompt }: { prompt: PromptData }) {
  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-display-uppercase text-sm tracking-widest text-[hsl(var(--foreground))]">
            {prompt.label}
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{prompt.description}</p>
        </div>
        <div
          className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded ${
            prompt.hasOverride
              ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
          }`}
        >
          {prompt.hasOverride ? 'Override ativo' : 'Padrão (repo)'}
        </div>
      </div>

      <form action={savePromptAction.bind(null, prompt.key)} className="space-y-3">
        <textarea
          name="content"
          defaultValue={prompt.override ?? prompt.filesystem_default}
          rows={20}
          className="w-full px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs font-mono leading-relaxed focus:outline-none focus:border-[hsl(var(--primary))] resize-y"
        />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {prompt.hasOverride
              ? 'Editando override do DB · esvaziar campo restaura padrão'
              : 'Conteúdo atual = padrão do repo · salvar cria override'}
          </p>
          <div className="flex items-center gap-2">
            {prompt.hasOverride && (
              <button
                type="submit"
                name="action"
                value="reset"
                className="px-4 py-2 rounded-md text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/10 transition-colors"
              >
                Restaurar padrão
              </button>
            )}
            <button
              type="submit"
              name="action"
              value="save"
              className="px-4 py-2 rounded-pill font-display-uppercase text-xs tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
            >
              Salvar
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
