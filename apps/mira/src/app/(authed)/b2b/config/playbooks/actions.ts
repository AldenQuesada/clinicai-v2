'use server'

/**
 * Server Actions · /b2b/config/playbooks · upsert template de playbook.
 *
 * RPC b2b_playbook_template_upsert (mig 800-27) · UPSERT por (clinic, kind, name).
 * Valida arrays jsonb · garante 1 default por kind. Apos save,
 * revalidatePath('/b2b/config/playbooks') + '/partnerships' (lista de
 * parcerias usa template default ao aplicar playbook).
 *
 * Espelho 1:1 do saveTierConfigAction (mig 800-25) + saveFunnelBenchmarkAction
 * (mig 800-26).
 */

import { revalidatePath } from 'next/cache'
import type {
  PlaybookKind,
  PlaybookTaskTemplate,
  PlaybookContentTemplate,
  PlaybookMetaTemplate,
} from '@clinicai/repositories'
import { loadMiraServerContext } from '@/lib/server-context'

const VALID_KINDS: PlaybookKind[] = ['prospect_to_active', 'retention', 'renewal']
const VALID_CONTENT_KINDS = ['post', 'story', 'reels', 'email', 'wa_broadcast']
const VALID_META_KINDS = [
  'vouchers_month',
  'conversion_pct',
  'nps_min',
  'contents_month',
]

function assertOwnerAdmin(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export interface SavePlaybookTemplateInput {
  kind: PlaybookKind
  name: string
  description?: string | null
  tasks: PlaybookTaskTemplate[]
  contents: PlaybookContentTemplate[]
  metas: PlaybookMetaTemplate[]
  isDefault?: boolean
}

function isKind(s: unknown): s is PlaybookKind {
  return typeof s === 'string' && (VALID_KINDS as readonly string[]).includes(s)
}

/**
 * Sanitiza arrays · descarta entradas invalidas (sem title/kind/target).
 * RPC valida tipos jsonb mas e bom limpar lixo aqui antes de mandar.
 */
function cleanTasks(arr: PlaybookTaskTemplate[]): PlaybookTaskTemplate[] {
  return (Array.isArray(arr) ? arr : [])
    .map((t) => ({
      title: String(t?.title ?? '').trim(),
      days_offset: Number.isFinite(Number(t?.days_offset))
        ? Number(t.days_offset)
        : 0,
      owner_role: t?.owner_role ? String(t.owner_role).trim() || null : null,
    }))
    .filter((t) => t.title.length > 0)
}

function cleanContents(arr: PlaybookContentTemplate[]): PlaybookContentTemplate[] {
  return (Array.isArray(arr) ? arr : [])
    .map((c) => {
      const ck = VALID_CONTENT_KINDS.includes(String(c?.kind))
        ? (c.kind as PlaybookContentTemplate['kind'])
        : ('post' as const)
      return {
        title: String(c?.title ?? '').trim(),
        kind: ck,
        schedule: c?.schedule ? String(c.schedule).trim() || null : null,
      }
    })
    .filter((c) => c.title.length > 0)
}

function cleanMetas(arr: PlaybookMetaTemplate[]): PlaybookMetaTemplate[] {
  return (Array.isArray(arr) ? arr : [])
    .filter((m) => VALID_META_KINDS.includes(String(m?.kind)))
    .map((m) => ({
      kind: m.kind as PlaybookMetaTemplate['kind'],
      target: Number.isFinite(Number(m?.target)) ? Number(m.target) : 0,
    }))
}

export async function savePlaybookTemplateAction(
  payload: SavePlaybookTemplateInput,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)

  if (!isKind(payload.kind)) {
    return { ok: false, error: 'kind invalido (esperado prospect_to_active/retention/renewal)' }
  }
  const name = String(payload.name || '').trim()
  if (name.length < 2) {
    return { ok: false, error: 'Nome do template obrigatorio (min 2 chars)' }
  }

  const r = await repos.b2bPlaybook.upsertTemplate({
    kind: payload.kind,
    name,
    description: payload.description?.trim() || null,
    tasks: cleanTasks(payload.tasks),
    contents: cleanContents(payload.contents),
    metas: cleanMetas(payload.metas),
    isDefault: payload.isDefault === true,
  })

  revalidatePath('/b2b/config/playbooks')
  revalidatePath('/partnerships')
  return { ok: r.ok, error: r.error }
}
