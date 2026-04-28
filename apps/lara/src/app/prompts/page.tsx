/**
 * Editor visual de regras (prompts) da Lara · Server Component.
 *
 * 19 layers em 5 grupos · DB override via clinic_data.lara_*.
 * Empty value = volta pro filesystem default.
 *
 * ADR-012 · repos.clinicData.getSettings (batch · 1 query pra todos os layers).
 */

import { redirect } from 'next/navigation'
import * as fs from 'fs'
import * as path from 'path'
import { loadServerReposContext } from '@/lib/repos'
import { PromptsWorkspace } from '@/components/organisms/PromptsWorkspace'

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
    title: 'Mensagens fixas (zero token)',
    emoji: '💬',
    description:
      'Primeiras 2 mensagens da Lara · texto fixo · sem chamada na IA · economia total · {firstName} é interpolado dinamicamente',
    layers: [
      {
        key: 'lara_fixed_msg_0',
        label: 'Msg 0 · primeira mensagem (pede nome)',
        file: ['src', 'prompt', 'fixed', 'msg-0.md'],
        description:
          'Saudação inicial · texto enviado quando paciente manda a 1ª mensagem · pede o nome dele.',
      },
      {
        key: 'lara_fixed_msg_1',
        label: 'Msg 1 · após o nome (sem funil claro)',
        file: ['src', 'prompt', 'fixed', 'msg-1.md'],
        description:
          'Mensagem de apresentação · usa {firstName} interpolado · injeta [FOTO:geral] (Lara mandará 2 fotos antes/depois). Pulada quando NLP já carimbou funil olheiras/fullface.',
      },
    ],
  },
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
    <main className="flex-1 flex flex-col overflow-hidden bg-[var(--b2b-bg-0)]">
      {/* Header compacto · 1 linha · padrao Mira (top bar) */}
      <header
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--b2b-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          background: 'var(--b2b-bg-1)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Prompts da Lara
          </p>
          <span style={{ color: 'var(--b2b-border-strong)' }}>·</span>
          <span
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'var(--b2b-text-muted)',
              fontWeight: 600,
            }}
          >
            <span style={{ color: 'var(--b2b-ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {totalLayers}
            </span>{' '}
            layers
          </span>
          <span
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'var(--b2b-text-muted)',
              fontWeight: 600,
            }}
          >
            <span style={{ color: 'var(--b2b-champagne)', fontVariantNumeric: 'tabular-nums' }}>
              {totalOverrides}
            </span>{' '}
            overrides
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: 'var(--b2b-text-dim)',
            fontStyle: 'italic',
            marginLeft: 'auto',
          }}
        >
          esvaziar campo e salvar restaura o padrão do repo
        </span>
      </header>

      <PromptsWorkspace groups={groups} />
    </main>
  )
}
