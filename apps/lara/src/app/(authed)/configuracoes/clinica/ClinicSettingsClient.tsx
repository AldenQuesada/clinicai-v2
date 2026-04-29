'use client'

/**
 * ClinicSettingsClient · orquestrador da pagina de configuracoes da clinica.
 *
 * Mantem state unico do form (rico) e renderiza as 8 secoes do legacy. Sub-nav
 * do topo replica o original (clinic-section botoes csn_*) · linha 776-803
 * do clinic-dashboard/index.html. Mantem todas as 58 colunas + repeaters
 * 1:1 com o legacy.
 *
 * Save: invoca server action `saveClinicSettingsAction` que chama RPC
 * `update_clinic_settings`. Owner-only fields (nome, fiscal) sao zerados
 * no server quando role nao tem `settings:clinic-data`.
 */

import { useMemo, useState, useTransition } from 'react'
import {
  User,
  CreditCard,
  Palette,
  CalendarClock,
  Bell,
  Settings as SettingsIcon,
  Clock,
  StickyNote,
  Save,
  Check,
  AlertTriangle,
} from 'lucide-react'
import type { ClinicSettingsData } from './types'
import { saveClinicSettingsAction } from './actions'
import { PerfilContatoSection } from './sections/PerfilContatoSection'
import { EnderecoSection } from './sections/EnderecoSection'
import { FiscalBancarioSection } from './sections/FiscalBancarioSection'
import { IdentidadeVisualSection } from './sections/IdentidadeVisualSection'
import { AtendimentoSection } from './sections/AtendimentoSection'
import { HorariosSection } from './sections/HorariosSection'
import { NotificacoesSection } from './sections/NotificacoesSection'
import { SistemaSection } from './sections/SistemaSection'
import { ObservacoesSection } from './sections/ObservacoesSection'

type SectionKey =
  | 'perfil'
  | 'fiscal'
  | 'visual'
  | 'atendimento'
  | 'horarios'
  | 'notificacoes'
  | 'sistema'
  | 'observacoes'

const SECTIONS: { key: SectionKey; label: string; Icon: typeof User }[] = [
  { key: 'perfil', label: 'Perfil & Contato', Icon: User },
  { key: 'fiscal', label: 'Fiscal & Bancário', Icon: CreditCard },
  { key: 'visual', label: 'Identidade Visual', Icon: Palette },
  { key: 'atendimento', label: 'Atendimento', Icon: CalendarClock },
  { key: 'horarios', label: 'Horários', Icon: Clock },
  { key: 'notificacoes', label: 'Notificações', Icon: Bell },
  { key: 'sistema', label: 'Sistema', Icon: SettingsIcon },
  { key: 'observacoes', label: 'Observações', Icon: StickyNote },
]

// Cores default do legacy (linha 747 do clinic-settings.js)
const DEFAULT_CORES = [
  { nome: 'Primária', valor: '#7C3AED' },
  { nome: 'Secundária', valor: '#5B21B6' },
]

export function ClinicSettingsClient({
  initialData,
  canEdit,
  canEditOwner,
}: {
  initialData: ClinicSettingsData
  canEdit: boolean
  canEditOwner: boolean
}) {
  // Aplica defaults · cores nunca podem comecar vazias (espelho do legacy
  // que renderiza defaultCores quando data.cores ta vazio · linha 751)
  const initial = useMemo<ClinicSettingsData>(() => {
    return {
      ...initialData,
      cores: initialData.cores && initialData.cores.length ? initialData.cores : DEFAULT_CORES,
    }
  }, [initialData])

  const [data, setData] = useState<ClinicSettingsData>(initial)
  const [section, setSection] = useState<SectionKey>('perfil')
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' | 'warn' } | null>(null)

  function patch(p: Partial<ClinicSettingsData>) {
    setData((cur) => ({ ...cur, ...p }))
  }
  function showToast(msg: string, tone: 'ok' | 'err' | 'warn' = 'ok', durationMs = 3500) {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), durationMs)
  }

  function handleSave() {
    if (!canEdit) {
      showToast('Sem permissão para salvar configurações.', 'err')
      return
    }
    startTransition(async () => {
      try {
        const result = await saveClinicSettingsAction(data)
        if (!result.ok) {
          showToast('Erro ao salvar: ' + (result.error || 'desconhecido'), 'err', 6000)
          return
        }
        showToast('Salvo!', 'ok')
      } catch (e) {
        showToast('Erro ao salvar: ' + (e as Error).message, 'err', 6000)
      }
    })
  }

  return (
    <div>
      {/* Top action bar · espelho do header do legacy linhas 759-773 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--b2b-ivory)' }}>
            Dados da Clínica
          </div>
          <div style={{ fontSize: 12, color: 'var(--b2b-text-muted)', marginTop: 2 }}>
            Gerencie todas as informações da sua clínica
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {toast && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                color:
                  toast.tone === 'ok'
                    ? 'var(--b2b-sage)'
                    : toast.tone === 'warn'
                      ? 'var(--b2b-champagne)'
                      : 'var(--b2b-red)',
              }}
            >
              {toast.tone === 'ok' ? <Check size={14} /> : <AlertTriangle size={14} />}
              {toast.msg}
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="b2b-btn b2b-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Save size={13} />
              {isPending ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>

      {/* Sub-nav · espelho linha 776-803 */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 20,
          paddingBottom: 14,
          borderBottom: '1px solid var(--b2b-border)',
        }}
      >
        {SECTIONS.map((s) => {
          const active = section === s.key
          const Icon = s.Icon
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                background: active ? 'rgba(201,169,110,0.15)' : 'transparent',
                color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-dim)',
                border: `1px solid ${active ? 'var(--b2b-champagne)' : 'var(--b2b-border)'}`,
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.4,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={12} /> {s.label}
            </button>
          )
        })}
      </div>

      {/* Panels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {section === 'perfil' && (
          <>
            <PerfilContatoSection
              data={data}
              onChange={patch}
              canEdit={canEdit}
              canEditOwner={canEditOwner}
            />
            <EnderecoSection data={data} onChange={patch} canEdit={canEdit} />
            <HorariosSection data={data} onChange={patch} canEdit={canEdit} />
          </>
        )}
        {section === 'fiscal' && (
          <FiscalBancarioSection data={data} onChange={patch} canEditOwner={canEditOwner} />
        )}
        {section === 'visual' && (
          <IdentidadeVisualSection
            data={data}
            onChange={patch}
            canEdit={canEdit}
            onError={(msg) => showToast(msg, 'warn', 4000)}
          />
        )}
        {section === 'atendimento' && (
          <AtendimentoSection data={data} onChange={patch} canEdit={canEdit} />
        )}
        {section === 'horarios' && (
          <HorariosSection data={data} onChange={patch} canEdit={canEdit} />
        )}
        {section === 'notificacoes' && (
          <NotificacoesSection data={data} onChange={patch} canEdit={canEdit} />
        )}
        {section === 'sistema' && (
          <SistemaSection data={data} onChange={patch} canEdit={canEdit} />
        )}
        {section === 'observacoes' && (
          <ObservacoesSection data={data} onChange={patch} canEdit={canEdit} />
        )}
      </div>

      {/* Bottom save · espelho linhas 1382-1384 */}
      {canEdit && (
        <div className="b2b-form-actions">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="b2b-btn b2b-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Save size={13} />
            {isPending ? 'Salvando...' : 'Salvar Dados da Clínica'}
          </button>
        </div>
      )}
    </div>
  )
}
