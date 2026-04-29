/**
 * /configuracoes/clinica · Server Component.
 *
 * Port 1:1 do clinic-dashboard "settings-clinic" page · Next.js 16 +
 * React 19. Carrega dados via RPC get_clinic_settings, renderiza form
 * orquestrado por ClinicSettingsClient com server actions pra salvar.
 *
 * Permissoes (espelham legacy):
 *   settings:view → ler a pagina
 *   settings:edit (admin/owner) → salvar mudancas gerais
 *   settings:clinic-data (owner) → mexer em nome + dados fiscais
 */

import { redirect } from 'next/navigation'
import { loadServerReposContext } from '@/lib/repos'
import { can, type StaffRole } from '@/lib/permissions'
import { loadClinicSettingsAction } from './actions'
import { emptyClinicSettings, type ClinicSettingsData } from './types'
import { ClinicSettingsClient } from './ClinicSettingsClient'

export const dynamic = 'force-dynamic'

interface PageData {
  data: ClinicSettingsData
  role: StaffRole | null
  errorMsg: string | null
}

async function loadData(): Promise<PageData> {
  try {
    const { ctx } = await loadServerReposContext()
    const role = (ctx.role ?? null) as StaffRole | null

    if (!can(role, 'settings:view')) {
      return { data: emptyClinicSettings(), role, errorMsg: null }
    }

    const result = await loadClinicSettingsAction()
    if (!result.ok || !result.data) {
      return {
        data: emptyClinicSettings(),
        role,
        errorMsg: result.error || 'Falha ao carregar configuracoes',
      }
    }
    return { data: result.data, role, errorMsg: null }
  } catch (e) {
    console.error('[/configuracoes/clinica] loadData failed:', (e as Error).message)
    return { data: emptyClinicSettings(), role: null, errorMsg: (e as Error).message }
  }
}

export default async function ConfiguracoesClinicaPage() {
  const { data, role, errorMsg } = await loadData()

  if (!can(role, 'settings:view')) {
    redirect('/configuracoes')
  }

  const canEdit = can(role, 'settings:edit')
  const canEditOwner = can(role, 'settings:clinic-data')

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="mb-8">
          <p className="eyebrow mb-3">Painel · Configurações</p>
          <h1 className="font-display text-[40px] leading-tight text-[var(--b2b-ivory)]">
            Dados da <em>clínica</em>
          </h1>
          <p className="text-[13px] text-[var(--b2b-text-dim)] italic mt-2 max-w-2xl">
            Cadastrais, fiscais, atendimento, identidade visual, horários e notificações.
            Tudo o que aparece pro paciente e o que regula a operação.
          </p>
        </div>

        {errorMsg && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(217, 122, 122, 0.12)',
              color: 'var(--b2b-red)',
              border: '1px solid rgba(217, 122, 122, 0.3)',
              borderRadius: 5,
              fontSize: 12,
            }}
          >
            {errorMsg}
          </div>
        )}

        {!canEdit && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(201, 169, 110, 0.10)',
              color: 'var(--b2b-champagne)',
              border: '1px solid rgba(201, 169, 110, 0.3)',
              borderRadius: 5,
              fontSize: 12,
            }}
          >
            Você está no modo de visualização. Somente administradores podem editar as configurações.
          </div>
        )}

        <ClinicSettingsClient initialData={data} canEdit={canEdit} canEditOwner={canEditOwner} />
      </div>
    </main>
  )
}
