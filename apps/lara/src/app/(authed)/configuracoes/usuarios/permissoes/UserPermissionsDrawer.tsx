'use client'

/**
 * Drawer de override por usuario · Port 1:1 do
 * clinic-dashboard/js/users-admin.js _renderModuleDetail.
 *
 * Mini-matriz modulo x [allowed], sem coluna role · 3 estados:
 *   - usar default (null · sem override)
 *   - forcar allowed = true
 *   - forcar allowed = false
 *
 * Resolucao do estado inicial respeita hierarquia do clinic-dashboard:
 *   1. user_module_permissions (override do user)        ← maior
 *   2. clinic_module_permissions (override por role)
 *   3. NAV_CONFIG default                                  ← fallback
 *
 * Salva via setUserPermissions (RPC ja existente · zero mudanca).
 */

import { useEffect, useState } from 'react'
import {
  X as XIcon,
  Check,
  Save,
  Loader2,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import type { StaffMemberDTO } from '@clinicai/repositories'
import type { StaffRole } from '@/lib/permissions'
import {
  MODULES,
  ROLE_LABEL_SHORT,
  getDefaultAllowed,
  permKey,
  userPermKey,
  type ModuleDef,
} from './lib/modules'

type DrawerState = 'loading' | 'ready' | 'saving'

// Tri-state: undefined=usar default, true=forcar allow, false=forcar deny
type OverrideMap = Record<string, boolean | undefined>

export function UserPermissionsDrawer({
  member,
  matrixOverrides,
  loadAction,
  saveAction,
  onClose,
  onSaved,
}: {
  member: StaffMemberDTO
  matrixOverrides: Record<string, boolean>
  loadAction: (
    userId: string,
  ) => Promise<{
    ok: boolean
    permissions?: Array<{ moduleId: string; pageId: string | null; allowed: boolean }>
    error?: string
  }>
  saveAction: (payload: {
    userId: string
    permissions: Array<{ moduleId: string; pageId: string | null; allowed: boolean }>
  }) => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
  onSaved: () => void
}) {
  const [state, setState] = useState<DrawerState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [userOverrides, setUserOverrides] = useState<OverrideMap>({})
  const [dirty, setDirty] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let active = true
    ;(async () => {
      setState('loading')
      setError(null)
      const result = await loadAction(member.id)
      if (!active) return
      if (!result.ok) {
        setError(result.error || 'Falha ao carregar permissões')
        setState('ready')
        return
      }
      const map: OverrideMap = {}
      for (const p of result.permissions ?? []) {
        map[userPermKey(p.moduleId, p.pageId)] = p.allowed
      }
      setUserOverrides(map)
      setDirty({})
      setState('ready')
    })()
    return () => {
      active = false
    }
  }, [member.id, loadAction])

  // Esc fecha o drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && state !== 'saving') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, state])

  // Estado efetivo igual logica do _getEffectiveForUser do vanilla,
  // mas simplificado: como UI mostra checkbox tri-state, o "checked"
  // corresponde ao ESTADO EFETIVO atual (default + roleOverride + userOverride).
  function getEffective(
    module: ModuleDef,
    page: ModuleDef['pages'][number] | null,
    role: StaffRole,
  ): boolean {
    const uKey = userPermKey(module.section, page?.page ?? null)
    if (uKey in userOverrides) {
      const v = userOverrides[uKey]
      if (typeof v === 'boolean') return v
    }
    // Section-level override do user vale pra paginas filhas
    if (page) {
      const uSec = userPermKey(module.section, null)
      if (uSec in userOverrides) {
        const v = userOverrides[uSec]
        if (typeof v === 'boolean') return v
      }
    }
    // Role override (matriz)
    const rKey = permKey(module.section, page?.page ?? null, role)
    if (rKey in matrixOverrides) return matrixOverrides[rKey]
    if (page) {
      const rSec = permKey(module.section, null, role)
      if (rSec in matrixOverrides) return matrixOverrides[rSec]
    }
    return getDefaultAllowed(module, page, role)
  }

  function handleToggle(
    moduleId: string,
    pageId: string | null,
    nextValue: boolean,
  ) {
    const key = userPermKey(moduleId, pageId)
    setUserOverrides((prev) => ({ ...prev, [key]: nextValue }))
    setDirty((prev) => ({ ...prev, [key]: nextValue }))
  }

  function handleClearOverride(moduleId: string, pageId: string | null) {
    const key = userPermKey(moduleId, pageId)
    setUserOverrides((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDirty((prev) => {
      const next = { ...prev }
      // Se ainda tinha override no servidor, mandar como "default" eh tricky:
      // o RPC set_user_permissions faz upsert sem deletar · pra desfazer
      // override, escrevemos o valor padrao calculado pela matriz.
      // O resolver do servidor (get_my_effective_permissions) reaplica
      // hierarquia · entao mandar o default eh equivalente a "remover override".
      next[key] = computeDefaultForUser(moduleId, pageId)
      return next
    })
  }

  function computeDefaultForUser(moduleId: string, pageId: string | null): boolean {
    const module = MODULES.find((m) => m.section === moduleId)
    if (!module) return true
    const page = pageId ? module.pages.find((p) => p.page === pageId) ?? null : null
    // Owner blocked upstream · este drawer so abre pra non-owner
    const role = member.role
    // Re-aplica hierarquia ignorando user override (estamos limpando)
    const rKey = permKey(moduleId, pageId, role)
    if (rKey in matrixOverrides) return matrixOverrides[rKey]
    if (pageId) {
      const rSec = permKey(moduleId, null, role)
      if (rSec in matrixOverrides) return matrixOverrides[rSec]
    }
    return getDefaultAllowed(module, page, role)
  }

  async function handleSave() {
    if (state === 'saving') return
    setState('saving')
    setError(null)

    // Send all toggles (espelho do vanilla: itera todos os toggles · DB faz upsert)
    const payload: Array<{ moduleId: string; pageId: string | null; allowed: boolean }> = []
    for (const module of MODULES) {
      // Modulo (secao)
      const sKey = userPermKey(module.section, null)
      if (sKey in userOverrides && typeof userOverrides[sKey] === 'boolean') {
        payload.push({
          moduleId: module.section,
          pageId: null,
          allowed: userOverrides[sKey] as boolean,
        })
      }
      // Sub-paginas
      if (module.pages.length > 1) {
        for (const p of module.pages) {
          const pKey = userPermKey(module.section, p.page)
          if (pKey in userOverrides && typeof userOverrides[pKey] === 'boolean') {
            payload.push({
              moduleId: module.section,
              pageId: p.page,
              allowed: userOverrides[pKey] as boolean,
            })
          }
        }
      }
    }

    const result = await saveAction({ userId: member.id, permissions: payload })
    if (!result.ok) {
      setError(result.error || 'Falha ao salvar permissões')
      setState('ready')
      return
    }
    setDirty({})
    setState('ready')
    onSaved()
  }

  const fullName =
    `${member.firstName} ${member.lastName}`.trim() || member.email || 'Usuário'
  const dirtyCount = Object.keys(dirty).length

  return (
    <div
      className="b2b-overlay"
      onClick={() => state !== 'saving' && onClose()}
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'stretch',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100vw)',
          height: '100vh',
          background: 'var(--b2b-bg-1)',
          borderLeft: '1px solid var(--b2b-border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.45)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 22px 16px',
            borderBottom: '1px solid var(--b2b-border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              Override por usuário · {ROLE_LABEL_SHORT[member.role]}
            </p>
            <h2
              className="font-display"
              style={{
                fontSize: 22,
                color: 'var(--b2b-ivory)',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {fullName}
            </h2>
            <p
              style={{
                marginTop: 6,
                fontSize: 11,
                color: 'var(--b2b-text-muted)',
                lineHeight: 1.5,
              }}
            >
              Sobrescreve a matriz por role apenas para esta pessoa. Toggle =
              forçar acesso. Botão limpar = voltar ao default da role.
            </p>
          </div>
          <button
            type="button"
            className="b2b-btn"
            onClick={() => state !== 'saving' && onClose()}
            disabled={state === 'saving'}
            aria-label="Fechar"
            style={{ padding: '7px 9px' }}
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body · scrollable */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 22px',
          }}
          className="custom-scrollbar"
        >
          {state === 'loading' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '40px 0',
                color: 'var(--b2b-text-muted)',
                fontSize: 12,
              }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando permissões...
            </div>
          )}

          {state !== 'loading' && error && (
            <div
              style={{
                padding: '10px 12px',
                marginBottom: 14,
                background: 'rgba(217,122,122,0.10)',
                border: '1px solid rgba(217,122,122,0.35)',
                borderRadius: 6,
                color: 'var(--b2b-red)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}

          {state !== 'loading' &&
            MODULES.map((module) => {
              const hasSubpages = module.pages.length > 1
              const sKey = userPermKey(module.section, null)
              const sHasOverride = sKey in userOverrides
              const sAllowed = getEffective(module, null, member.role)
              return (
                <div
                  key={module.section}
                  className="luxury-card"
                  style={{
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--b2b-ivory)',
                      }}
                    >
                      {module.label}
                      {sHasOverride && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 9,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                            color: 'var(--b2b-champagne)',
                            fontWeight: 700,
                          }}
                        >
                          override
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ToggleRow
                        checked={sAllowed}
                        dirty={sKey in dirty}
                        onChange={(v) => handleToggle(module.section, null, v)}
                      />
                      {sHasOverride && (
                        <button
                          type="button"
                          onClick={() => handleClearOverride(module.section, null)}
                          title="Limpar override (voltar ao default da role)"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--b2b-text-muted)',
                            padding: 4,
                            display: 'flex',
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {hasSubpages &&
                    module.pages.map((page) => {
                      const pKey = userPermKey(module.section, page.page)
                      const pHasOverride = pKey in userOverrides
                      const pAllowed = getEffective(module, page, member.role)
                      return (
                        <div
                          key={page.page}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '8px 4px 4px',
                            borderTop: '1px solid var(--b2b-border)',
                            marginTop: 8,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--b2b-text-dim)',
                            }}
                          >
                            {page.label}
                            {pHasOverride && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 9,
                                  letterSpacing: 1,
                                  textTransform: 'uppercase',
                                  color: 'var(--b2b-champagne)',
                                  fontWeight: 700,
                                }}
                              >
                                override
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ToggleRow
                              checked={pAllowed}
                              dirty={pKey in dirty}
                              onChange={(v) => handleToggle(module.section, page.page, v)}
                            />
                            {pHasOverride && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleClearOverride(module.section, page.page)
                                }
                                title="Limpar override"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--b2b-text-muted)',
                                  padding: 4,
                                  display: 'flex',
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )
            })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--b2b-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>
            {dirtyCount > 0 ? (
              <span>
                <Check
                  className="w-3 h-3"
                  style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}
                />
                {dirtyCount} alteraç{dirtyCount === 1 ? 'ão' : 'ões'} pendente
                {dirtyCount === 1 ? '' : 's'}
              </span>
            ) : (
              'Nenhuma alteração'
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="b2b-btn"
              onClick={onClose}
              disabled={state === 'saving'}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="b2b-btn b2b-btn-primary"
              onClick={handleSave}
              disabled={state !== 'ready' || dirtyCount === 0}
            >
              {state === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {state === 'saving' ? 'Salvando...' : 'Salvar permissões'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  checked,
  dirty,
  onChange,
}: {
  checked: boolean
  dirty: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 36,
        height: 20,
        cursor: 'pointer',
        boxShadow: dirty ? '0 0 0 2px rgba(201,169,110,0.45)' : 'none',
        borderRadius: 20,
        transition: 'box-shadow 0.15s',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
        }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: checked ? 'var(--b2b-sage)' : 'rgba(255,255,255,0.12)',
          borderRadius: 20,
          transition: 'all 0.15s',
          border: '1px solid var(--b2b-border)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          left: 2,
          top: 2,
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.15s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </label>
  )
}
