/**
 * /b2b/config/playbooks · templates de playbook (3 kinds) por clinica.
 *
 * Server component magro · carrega templates seedados pela mig 800-22 e
 * entrega pra PlaybooksClient editar tasks/contents/metas.
 *
 * Usa b2bPlaybook.listTemplates() (RLS scoped via app_clinic_id()).
 * Se a clinica ainda nao tem rows pra algum kind (ex.: clinica sem parceria
 * quando a mig 800-22 rodou · seed condicional), preenche com fallback.
 *
 * Espelho 1:1 do padrao /b2b/config/tiers + /b2b/config/funnel.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type {
  PlaybookKind,
  PlaybookTemplate,
} from '@clinicai/repositories'
import { PlaybooksClient } from './PlaybooksClient'

export const dynamic = 'force-dynamic'

interface FallbackSeed {
  kind: PlaybookKind
  name: string
  description: string
  tasks: PlaybookTemplate['tasks']
  contents: PlaybookTemplate['contents']
  metas: PlaybookTemplate['metas']
}

/**
 * Defaults razoaveis (1:1 com seed da mig 800-22 · so usado quando a clinica
 * NAO tem nenhum template pra esse kind ainda).
 */
const FALLBACK: FallbackSeed[] = [
  {
    kind: 'prospect_to_active',
    name: 'Onboarding parceira (estetica)',
    description:
      'Sequencia padrao pra ativar parceira nova nos primeiros 30 dias.',
    tasks: [
      { title: 'Enviar contrato + brief de DNA', days_offset: 0, owner_role: 'owner' },
      { title: 'Agendar reuniao de kickoff (videocall 30min)', days_offset: 2, owner_role: 'account_manager' },
      { title: 'Cadastrar parceira no painel + emitir 1o voucher de teste', days_offset: 3, owner_role: 'account_manager' },
      { title: 'Treinar parceira no fluxo (script de entrega + WhatsApp)', days_offset: 5, owner_role: 'account_manager' },
      { title: 'Check-in 15d (feedback inicial + ajuste de combo)', days_offset: 15, owner_role: 'account_manager' },
      { title: 'Review 30d (KPIs iniciais + decisao de continuidade)', days_offset: 30, owner_role: 'owner' },
    ],
    contents: [
      { title: 'Post de anuncio da parceria', kind: 'post', schedule: 'D+3' },
      { title: 'Story conjunto de bastidores', kind: 'story', schedule: 'D+7' },
      { title: 'Reels com rotina/depoimento da parceira', kind: 'reels', schedule: 'D+15' },
    ],
    metas: [
      { kind: 'vouchers_month', target: 8 },
      { kind: 'conversion_pct', target: 20 },
      { kind: 'contents_month', target: 3 },
    ],
  },
  {
    kind: 'retention',
    name: 'Retencao parceira em risco',
    description: 'Aplicar quando saude amarela/vermelha · resgate proativo.',
    tasks: [
      { title: 'Ligar pra parceira (voz, nao WhatsApp)', days_offset: 0, owner_role: 'owner' },
      { title: 'Marcar cafe presencial pra revisar parceria', days_offset: 3, owner_role: 'account_manager' },
      { title: 'Revisar combo · trocar por mais atrativo', days_offset: 5, owner_role: 'account_manager' },
      { title: 'Emitir 3 vouchers cortesia pra reaquecer', days_offset: 7, owner_role: 'account_manager' },
      { title: 'Check de saude 30d apos retomada', days_offset: 30, owner_role: 'owner' },
    ],
    contents: [
      { title: 'Story reforcando parceria (gratidao publica)', kind: 'story', schedule: 'D+1' },
      { title: 'Post de cliente VIP convertida via parceria', kind: 'post', schedule: 'D+10' },
    ],
    metas: [
      { kind: 'vouchers_month', target: 5 },
      { kind: 'conversion_pct', target: 18 },
      { kind: 'nps_min', target: 7 },
    ],
  },
  {
    kind: 'renewal',
    name: 'Renovacao 12m de parceria',
    description: 'Sequencia 60d antes do fim do contrato pra renovar com upgrade.',
    tasks: [
      { title: 'Preparar relatorio de impacto 12m (vouchers, conv, NPS, ROI)', days_offset: 0, owner_role: 'owner' },
      { title: 'Reuniao de renovacao com a parceira (Pitch Mode)', days_offset: 7, owner_role: 'owner' },
      { title: 'Propor upgrade de combo OU expansao (+1 servico)', days_offset: 7, owner_role: 'owner' },
      { title: 'Assinar novo contrato (12m) + atualizar painel', days_offset: 15, owner_role: 'account_manager' },
      { title: 'Post de renovacao publica (selo de parceria 1+ ano)', days_offset: 20, owner_role: 'account_manager' },
    ],
    contents: [
      { title: 'Reels de retrospectiva 12m da parceria', kind: 'reels', schedule: 'D+15' },
      { title: 'Email de agradecimento as beneficiarias', kind: 'email', schedule: 'D+20' },
    ],
    metas: [
      { kind: 'vouchers_month', target: 10 },
      { kind: 'conversion_pct', target: 25 },
      { kind: 'nps_min', target: 8 },
    ],
  },
]

export default async function ConfigPlaybooksPage() {
  const { repos } = await loadMiraServerContext()
  const rows = await repos.b2bPlaybook.listTemplates().catch(() => [])

  // Pra cada kind, escolhe o template default da clinica · se nao existir,
  // usa o 1o do kind · se nao existir nenhum, fallback hardcoded (sem persisted).
  const byKind = new Map<PlaybookKind, PlaybookTemplate[]>()
  for (const r of rows) {
    const list = byKind.get(r.kind) ?? []
    list.push(r)
    byKind.set(r.kind, list)
  }

  const initialTemplates = FALLBACK.map((f) => {
    const list = byKind.get(f.kind) ?? []
    const def = list.find((t) => t.isDefault) ?? list[0]
    if (def) {
      return {
        kind: def.kind,
        name: def.name,
        description: def.description ?? '',
        tasks: def.tasks,
        contents: def.contents,
        metas: def.metas,
        isDefault: def.isDefault,
        persisted: true as const,
      }
    }
    return {
      kind: f.kind,
      name: f.name,
      description: f.description,
      tasks: f.tasks,
      contents: f.contents,
      metas: f.metas,
      isDefault: true,
      persisted: false as const,
    }
  })

  return <PlaybooksClient initialTemplates={initialTemplates} />
}
