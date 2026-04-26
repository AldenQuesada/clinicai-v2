/**
 * B2BPlaybookRepository · acesso canonico a templates de playbook + RPC apply.
 *
 * Mig 800-22 introduziu:
 *   - tabela b2b_playbook_templates (1 default por kind, por clinica)
 *   - tabelas alvo b2b_partnership_tasks/contents/metas
 *   - tabela b2b_playbook_applications (audit)
 *   - RPC b2b_apply_playbook(p_partnership_id uuid, p_kind text)
 *
 * Padrao ADR-012 · UI/Service nao chama supabase.from() direto.
 * Boundary ADR-005 · DTO camelCase. Multi-tenant ADR-028 · clinic_id resolvido
 * pelas RLS policies via app_clinic_id() — nao precisa passar explicito aqui.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type PlaybookKind = 'prospect_to_active' | 'retention' | 'renewal'

export interface PlaybookTaskTemplate {
  title: string
  days_offset: number
  owner_role: string | null
}

export interface PlaybookContentTemplate {
  title: string
  kind: 'post' | 'story' | 'reels' | 'email' | 'wa_broadcast'
  schedule: string | null
}

export interface PlaybookMetaTemplate {
  kind: 'vouchers_month' | 'conversion_pct' | 'nps_min' | 'contents_month'
  target: number
}

export interface PlaybookTemplate {
  clinicId: string
  kind: PlaybookKind
  name: string
  description: string | null
  tasks: PlaybookTaskTemplate[]
  contents: PlaybookContentTemplate[]
  metas: PlaybookMetaTemplate[]
  isDefault: boolean
  createdAt: string
}

export interface PlaybookApplication {
  id: string
  clinicId: string
  partnershipId: string
  templateKind: PlaybookKind
  templateName: string | null
  appliedAt: string
  appliedBy: string | null
  summary: {
    applied_tasks?: number
    applied_contents?: number
    applied_metas?: number
  } & Record<string, unknown>
}

export interface ApplyPlaybookResult {
  ok: boolean
  application_id?: string
  template_name?: string
  template_kind?: PlaybookKind
  applied_tasks?: number
  applied_contents?: number
  applied_metas?: number
  error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplate(row: any): PlaybookTemplate {
  return {
    clinicId: String(row.clinic_id),
    kind: row.kind as PlaybookKind,
    name: String(row.name ?? ''),
    description: row.description ?? null,
    tasks: Array.isArray(row.tasks) ? (row.tasks as PlaybookTaskTemplate[]) : [],
    contents: Array.isArray(row.contents) ? (row.contents as PlaybookContentTemplate[]) : [],
    metas: Array.isArray(row.metas) ? (row.metas as PlaybookMetaTemplate[]) : [],
    isDefault: Boolean(row.is_default),
    createdAt: String(row.created_at),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApplication(row: any): PlaybookApplication {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    partnershipId: String(row.partnership_id),
    templateKind: row.template_kind as PlaybookKind,
    templateName: row.template_name ?? null,
    appliedAt: String(row.applied_at),
    appliedBy: row.applied_by ?? null,
    summary: (row.summary ?? {}) as PlaybookApplication['summary'],
  }
}

export class B2BPlaybookRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista templates de playbook da clinica corrente (RLS scoped via app_clinic_id()).
   * Ordena defaults primeiro, depois por kind+name.
   */
  async listTemplates(): Promise<PlaybookTemplate[]> {
    const { data, error } = await this.supabase
      .from('b2b_playbook_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('kind', { ascending: true })
      .order('name', { ascending: true })

    if (error || !data) return []
    return (data as unknown[]).map((r) => mapTemplate(r))
  }

  /**
   * Aplica template de playbook (kind) na parceria · idempotente.
   *
   * Chama RPC b2b_apply_playbook (mig 800-22). Skip de tasks/contents/metas
   * que ja existem com mesmo title (tasks/contents) ou kind (metas).
   */
  async apply(partnershipId: string, kind: PlaybookKind): Promise<ApplyPlaybookResult> {
    const { data, error } = await this.supabase.rpc('b2b_apply_playbook', {
      p_partnership_id: partnershipId,
      p_kind: kind,
    })
    if (error) return { ok: false, error: error.message }
    const r = (data ?? null) as ApplyPlaybookResult | null
    if (!r) return { ok: false, error: 'no_data' }
    return r
  }

  /**
   * Historico de aplicacoes pra essa parceria (mais recente primeiro).
   */
  async listApplications(partnershipId: string): Promise<PlaybookApplication[]> {
    const { data, error } = await this.supabase
      .from('b2b_playbook_applications')
      .select('*')
      .eq('partnership_id', partnershipId)
      .order('applied_at', { ascending: false })
      .limit(50)

    if (error || !data) return []
    return (data as unknown[]).map((r) => mapApplication(r))
  }
}
