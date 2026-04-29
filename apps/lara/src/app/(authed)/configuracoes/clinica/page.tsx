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
    <main
      className="flex-1 overflow-y-auto custom-scrollbar"
      style={{
        background: 'var(--b2b-bg-0)',
        backgroundImage:
          'radial-gradient(circle at 20% 0%, rgba(201,169,110,0.04), transparent 60%), radial-gradient(circle at 90% 80%, rgba(201,169,110,0.02), transparent 50%)',
      }}
    >
      {/* Container narrow tipo "longform" · max-width 980px (estilo flipbook-auditoria) */}
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 28px 72px' }}>
        {/* Hero compacto · kicker + h1 + lede sem cards */}
        <header style={{ marginBottom: 36 }}>
          <p
            className="eyebrow"
            style={{ marginBottom: 10, fontSize: 10, letterSpacing: 3 }}
          >
            Painel · Configurações
          </p>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(32px, 4vw, 44px)',
              lineHeight: 1.05,
              color: 'var(--b2b-ivory)',
              marginBottom: 12,
              fontWeight: 300,
            }}
          >
            Dados da <em>clínica</em>
          </h1>
          <p
            className="font-display"
            style={{
              fontSize: 16,
              fontStyle: 'italic',
              color: 'var(--b2b-text-dim)',
              maxWidth: 620,
              lineHeight: 1.5,
            }}
          >
            Cadastrais, fiscais, atendimento, identidade visual, horários e
            notificações. Tudo o que aparece pro paciente e o que regula a operação.
          </p>
        </header>

        {errorMsg && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(217, 122, 122, 0.10)',
              color: 'var(--b2b-red)',
              borderLeft: '2px solid var(--b2b-red)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {errorMsg}
          </div>
        )}

        {!canEdit && (
          <div
            style={{
              marginBottom: 20,
              padding: '12px 16px',
              background:
                'linear-gradient(135deg, rgba(201,169,110,0.06), rgba(201,169,110,0.02))',
              borderLeft: '2px solid var(--b2b-champagne)',
              fontSize: 13,
              fontFamily: 'Cormorant Garamond, serif',
              fontStyle: 'italic',
              color: 'var(--b2b-text-dim)',
              lineHeight: 1.5,
            }}
          >
            Modo de visualização · somente administradores podem editar as
            configurações.
          </div>
        )}

        <ClinicSettingsClient initialData={data} canEdit={canEdit} canEditOwner={canEditOwner} />
      </div>
    </main>
  )
}
