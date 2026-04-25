/**
 * Editor visual de prompts da Lara · Server Component.
 *
 * 4 prompts em camadas (clinic_data.settings):
 *   - lara_prompt_base           → identidade/regras gerais
 *   - lara_prompt_olheiras       → flow Smooth Eyes
 *   - lara_prompt_fullface       → flow Lifting 5D
 *   - lara_prompt_prices_defense → playbook obrigatório de preço
 *
 * Quando vazio · ai.service.ts usa fallback do filesystem (.md no repo).
 * Quando preenchido · DB override · sem rebuild necessário.
 *
 * Apenas owner/admin podem editar (RBAC).
 */

import { cookies } from 'next/headers'
import { createServerClient, requireClinicContext } from '@clinicai/supabase'
import { redirect } from 'next/navigation'
import * as fs from 'fs'
import * as path from 'path'
import { Sparkles, AlertTriangle } from 'lucide-react'
import { savePromptAction } from './actions'

export const dynamic = 'force-dynamic'

const LAYERS = [
  {
    key: 'lara_prompt_base',
    label: 'Base · identidade + regras',
    file: ['src', 'prompt', 'lara-prompt.md'] as const,
    description:
      'Prompt principal · identidade, tom, personas, regras inegociáveis. Sempre injetado em qualquer conversa.',
  },
  {
    key: 'lara_prompt_olheiras',
    label: 'Flow · Olheiras (Smooth Eyes)',
    file: ['src', 'prompt', 'flows', 'olheiras-flow.md'] as const,
    description:
      'Roteiro especializado pra leads com queixa de olheiras · injetado quando funnel=olheiras.',
  },
  {
    key: 'lara_prompt_fullface',
    label: 'Flow · Full Face (Lifting 5D)',
    file: ['src', 'prompt', 'flows', 'fullface-flow.md'] as const,
    description:
      'Roteiro especializado pra leads com queixa de flacidez/sulcos · injetado quando funnel=fullface.',
  },
  {
    key: 'lara_prompt_prices_defense',
    label: 'Defesa de preços',
    file: ['src', 'prompt', 'flows', 'prices-defense-flow.md'] as const,
    description:
      'Playbook obrigatório de defesa de preço · sempre injetado · usado quando lead pergunta valor.',
  },
] as const

interface PromptData {
  key: string
  label: string
  description: string
  filesystem_default: string
  override: string | null
  hasOverride: boolean
}

async function loadPrompts(): Promise<{ prompts: PromptData[]; canManage: boolean }> {
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
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)

  const prompts: PromptData[] = []
  for (const layer of LAYERS) {
    // Filesystem default · seed do repo
    let fsDefault = ''
    try {
      const fullPath = path.resolve(process.cwd(), ...layer.file)
      if (fs.existsSync(fullPath)) {
        fsDefault = fs.readFileSync(fullPath, 'utf-8')
      }
    } catch {
      fsDefault = '(arquivo não encontrado)'
    }

    // DB override
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('clinic_data') as any)
      .select('value')
      .eq('clinic_id', ctx.clinic_id)
      .eq('key', layer.key)
      .maybeSingle()

    const override =
      typeof data?.value === 'string'
        ? data.value
        : data?.value?.content && typeof data.value.content === 'string'
        ? (data.value.content as string)
        : null

    prompts.push({
      key: layer.key,
      label: layer.label,
      description: layer.description,
      filesystem_default: fsDefault,
      override,
      hasOverride: override !== null && override.trim().length > 0,
    })
  }

  return { prompts, canManage }
}

export default async function PromptsPage() {
  const { prompts, canManage } = await loadPrompts()

  if (!canManage) {
    redirect('/dashboard')
  }

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-light">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">
                Prompts da Lara
              </span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Editor de prompts em camadas · DB override sem rebuild
            </p>
          </div>
        </div>

        <div className="rounded-card border border-yellow-500/30 bg-yellow-500/5 p-4 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm text-[hsl(var(--foreground))]">
            <strong>Atenção · prompts moldam comportamento da IA real.</strong> Mudanças
            aplicam imediatamente em todas as próximas conversas. Se algo der errado, deixe o
            campo vazio · sistema cai automaticamente no padrão (filesystem do repo).
          </div>
        </div>

        <div className="space-y-8">
          {prompts.map((p) => (
            <PromptCard key={p.key} prompt={p} />
          ))}
        </div>
      </div>
    </main>
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
                className="px-4 py-2 rounded-md text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
