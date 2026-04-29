'use client'

/**
 * Matriz de permissoes role x modulo · Port 1:1 do
 * clinic-dashboard/js/ui/module-permissions.ui.js
 *
 * Logica:
 *   - Le defaults de MODULES (espelho do NAV_CONFIG)
 *   - Le overrides do banco (clinic_module_permissions via RPC)
 *   - Override > default · sem override usa default
 *   - Owner nunca aparece (banner em vez de coluna · proteção no DB)
 *   - Toggle em secao propaga pras sub-paginas (mesma UX do vanilla)
 *   - Salva via bulk_set_module_permissions em batch
 *
 * Drawer de override por usuario:
 *   - Reaproveita mesma matriz, sem coluna role (mini-matriz)
 *   - Salva via set_user_permissions (RPC ja existente)
 */

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import {
  Save,
  Lock,
  Crown,
  Shield,
  Heart,
  Phone,
  Eye,
  Loader2,
  UserCog,
  Grid3x3,
  Star,
  Activity,
  Calendar,
  MessageCircle,
  TrendingUp,
  Zap,
  DollarSign,
  BookOpen,
  Cpu,
  Folder,
  type LucideIcon,
} from 'lucide-react'
import type {
  StaffMemberDTO,
  ModulePermissionRow,
} from '@clinicai/repositories'
import type { StaffRole } from '@/lib/permissions'
import {
  MODULES,
  MATRIX_ROLES,
  ROLE_LABEL_SHORT,
  getDefaultAllowed,
  permKey,
  type ModuleDef,
} from './lib/modules'
import {
  saveMatrixPermissionsAction,
  loadUserPermissionsAction,
  saveUserPermissionsAction,
} from './actions'
import { UserPermissionsDrawer } from './UserPermissionsDrawer'

const ROLE_META: Record<
  Exclude<StaffRole, 'owner'>,
  { Icon: LucideIcon; color: string }
> = {
  admin: { Icon: Shield, color: '#D4B894' },
  therapist: { Icon: Heart, color: 'var(--b2b-sage)' },
  receptionist: { Icon: Phone, color: 'var(--b2b-text-dim)' },
  viewer: { Icon: Eye, color: 'var(--b2b-text-muted)' },
}

const MODULE_ICON_MAP: Record<ModuleDef['icon'], LucideIcon> = {
  grid: Grid3x3,
  star: Star,
  activity: Activity,
  calendar: Calendar,
  heart: Heart,
  'message-circle': MessageCircle,
  'trending-up': TrendingUp,
  zap: Zap,
  'dollar-sign': DollarSign,
  'book-open': BookOpen,
  cpu: Cpu,
  tool: Folder,
  folder: Folder,
}

export function PermissionsMatrixClient({
  initialOverrides,
  editableMembers,
}: {
  initialOverrides: ModulePermissionRow[]
  editableMembers: StaffMemberDTO[]
}) {
  // Build initial overrides map: key -> allowed
  const buildOverridesMap = useCallback(
    (rows: ModulePermissionRow[]): Record<string, boolean> => {
      const m: Record<string, boolean> = {}
      for (const r of rows) {
        m[permKey(r.moduleId, r.pageId, r.role)] = r.allowed
      }
      return m
    },
    [],
  )

  const [overrides, setOverrides] = useState<Record<string, boolean>>(() =>
    buildOverridesMap(initialOverrides),
  )
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)
  const [drawerUser, setDrawerUser] = useState<StaffMemberDTO | null>(null)

  // Re-sync if server pushes new initialOverrides
  const lastInitialRef = useRef(initialOverrides)
  useEffect(() => {
    if (lastInitialRef.current !== initialOverrides) {
      lastInitialRef.current = initialOverrides
      setOverrides(buildOverridesMap(initialOverrides))
      setDirty({})
    }
  }, [initialOverrides, buildOverridesMap])

  function showToast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3500)
  }

  function getEffective(
    moduleId: string,
    pageId: string | null,
    role: StaffRole,
    module: ModuleDef,
    page: ModuleDef['pages'][number] | null,
  ): boolean {
    const k = permKey(moduleId, pageId, role)
    if (k in dirty) return dirty[k]
    if (k in overrides) return overrides[k]
    return getDefaultAllowed(module, page, role)
  }

  function handleToggle(
    moduleId: string,
    pageId: string | null,
    role: StaffRole,
    nextValue: boolean,
    module: ModuleDef,
  ) {
    setDirty((d) => {
      const next = { ...d }
      next[permKey(moduleId, pageId, role)] = nextValue
      // Toggle de secao propaga pras sub-paginas (espelho do vanilla)
      if (pageId === null && module.pages.length > 0) {
        for (const p of module.pages) {
          next[permKey(moduleId, p.page, role)] = nextValue
        }
      }
      return next
    })
  }

  async function handleSave() {
    if (saving) return
    const keys = Object.keys(dirty)
    if (keys.length === 0) return

    setSaving(true)
    try {
      const payload = keys.map((k) => {
        const [moduleId, pageRaw, role] = k.split('|')
        return {
          moduleId,
          pageId: pageRaw ? pageRaw : null,
          role: role as StaffRole,
          allowed: dirty[k],
        }
      })

      const result = await saveMatrixPermissionsAction({ permissions: payload })
      if (!result.ok) {
        showToast(result.error || 'Falha ao salvar', 'err')
        return
      }

      // Merge dirty into overrides
      setOverrides((prev) => {
        const next = { ...prev }
        for (const k of keys) next[k] = dirty[k]
        return next
      })
      setDirty({})
      showToast(
        `Permissões salvas (${result.updated ?? keys.length}). Recarregue para aplicar.`,
        'ok',
      )
      startTransition(() => {
        // RSC re-fetch nao e estritamente necessario (state ja sincronizado)
        // mas mantemos pra consistencia com cache de outros consumidores.
      })
    } finally {
      setSaving(false)
    }
  }

  const dirtyCount = Object.keys(dirty).length

  return (
    <>
      {/* Header com botao de salvar */}
      <div className="b2b-list-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock className="w-4 h-4" style={{ color: 'var(--b2b-champagne)' }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--b2b-ivory)',
              letterSpacing: 0.3,
            }}
          >
            Matriz role × módulo
          </span>
        </div>
        <div className="b2b-list-head-acts">
          <button
            type="button"
            className="b2b-btn b2b-btn-primary"
            disabled={!dirtyCount || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Salvando...' : 'Salvar alterações'}
            {dirtyCount > 0 && !saving && (
              <span
                style={{
                  marginLeft: 6,
                  padding: '1px 7px',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.18)',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {dirtyCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Banner Owner · sempre acesso total */}
      <div
        className="luxury-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          marginBottom: 16,
          borderLeft: '3px solid var(--b2b-champagne)',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: 'rgba(201,169,110,0.14)',
            color: 'var(--b2b-champagne)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Crown className="w-4 h-4" />
        </div>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--b2b-champagne)',
              letterSpacing: 0.3,
            }}
          >
            Dono · acesso total
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--b2b-text-muted)',
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            O dono da clínica sempre tem acesso a todos os módulos e não pode ser limitado.
          </div>
        </div>
      </div>

      {/* Legenda das colunas (alinhada a direita) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '4px 16px 8px',
          gap: 0,
        }}
      >
        {MATRIX_ROLES.map((r) => {
          const meta = ROLE_META[r]
          const Icon = meta.Icon
          return (
            <div
              key={r}
              style={{
                width: 64,
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                color: meta.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Icon className="w-3 h-3" />
              {ROLE_LABEL_SHORT[r]}
            </div>
          )
        })}
      </div>

      {/* Matriz */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {MODULES.map((module) => {
          const ModIcon = MODULE_ICON_MAP[module.icon] ?? Folder
          const hasSubpages = module.pages.length > 1
          return (
            <div key={module.section}>
              {/* Section row */}
              <div
                className="luxury-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 200 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: 'rgba(201,169,110,0.08)',
                      color: 'var(--b2b-champagne)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ModIcon className="w-4 h-4" />
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--b2b-ivory)',
                    }}
                  >
                    {module.label}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 0 }}>
                  {MATRIX_ROLES.map((role) => {
                    const allowed = getEffective(
                      module.section,
                      null,
                      role,
                      module,
                      null,
                    )
                    const isDirty = permKey(module.section, null, role) in dirty
                    return (
                      <ToggleCell
                        key={role}
                        checked={allowed}
                        dirty={isDirty}
                        onChange={(v) =>
                          handleToggle(module.section, null, role, v, module)
                        }
                        ariaLabel={`${module.label} · ${ROLE_LABEL_SHORT[role]}`}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Page rows (so renderiza se tiver mais de 1 pagina · igual vanilla) */}
              {hasSubpages &&
                module.pages.map((page) => (
                  <div
                    key={page.page}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 16px 8px 30px',
                      marginLeft: 32,
                      borderLeft: '2px solid var(--b2b-border)',
                      background: 'rgba(255,255,255,0.01)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 188,
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 1,
                          background: 'var(--b2b-border)',
                          flexShrink: 0,
                        }}
                      />
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--b2b-text-dim)',
                        }}
                      >
                        {page.label}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 0 }}>
                      {MATRIX_ROLES.map((role) => {
                        const allowed = getEffective(
                          module.section,
                          page.page,
                          role,
                          module,
                          page,
                        )
                        const isDirty = permKey(module.section, page.page, role) in dirty
                        return (
                          <ToggleCell
                            key={role}
                            checked={allowed}
                            dirty={isDirty}
                            onChange={(v) =>
                              handleToggle(module.section, page.page, role, v, module)
                            }
                            ariaLabel={`${module.label} · ${page.label} · ${ROLE_LABEL_SHORT[role]}`}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )
        })}
      </div>

      {/* Override por usuario · drawer */}
      {editableMembers.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <UserCog className="w-4 h-4" style={{ color: 'var(--b2b-champagne)' }} />
            <h2
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--b2b-ivory)',
                letterSpacing: 0.3,
                margin: 0,
              }}
            >
              Customizar acesso por usuário
            </h2>
          </div>
          <p
            style={{
              fontSize: 11,
              color: 'var(--b2b-text-muted)',
              marginBottom: 14,
              maxWidth: 600,
              lineHeight: 1.5,
            }}
          >
            Override por pessoa · sobrescreve a matriz por role apenas para esse usuário.
            Owner não aparece (acesso total inegociável).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {editableMembers.map((m) => (
              <UserOverrideRow
                key={m.id}
                member={m}
                onOpen={() => setDrawerUser(m)}
              />
            ))}
          </div>
        </section>
      )}

      {drawerUser && (
        <UserPermissionsDrawer
          member={drawerUser}
          matrixOverrides={overrides}
          loadAction={loadUserPermissionsAction}
          saveAction={saveUserPermissionsAction}
          onClose={() => setDrawerUser(null)}
          onSaved={() => {
            showToast(`Permissões de ${drawerUser.firstName || drawerUser.email || ''} salvas.`)
            setDrawerUser(null)
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '12px 16px',
            background:
              toast.tone === 'err' ? 'rgba(217,122,122,0.18)' : 'rgba(138,158,136,0.18)',
            border: `1px solid ${
              toast.tone === 'err' ? 'rgba(217,122,122,0.5)' : 'rgba(138,158,136,0.5)'
            }`,
            color: toast.tone === 'err' ? 'var(--b2b-red)' : 'var(--b2b-sage)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 1100,
          }}
        >
          {toast.msg}
        </div>
      )}
    </>
  )
}

function ToggleCell({
  checked,
  dirty,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  dirty: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
}) {
  return (
    <div
      style={{
        width: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
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
          aria-label={ariaLabel}
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
    </div>
  )
}

function UserOverrideRow({
  member,
  onOpen,
}: {
  member: StaffMemberDTO
  onOpen: () => void
}) {
  const fullName = `${member.firstName} ${member.lastName}`.trim() || member.email || 'Sem nome'
  const initials = (member.firstName || member.email || 'U').slice(0, 1).toUpperCase()
  return (
    <div
      className="luxury-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
      }}
    >
      <div className="b2b-avatar">{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--b2b-ivory)',
            marginBottom: 2,
          }}
        >
          {fullName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>
          {member.email || '— sem email —'} · {ROLE_LABEL_SHORT[member.role]}
        </div>
      </div>
      <button
        type="button"
        className="b2b-btn"
        onClick={onOpen}
        style={{ padding: '7px 12px', fontSize: 11 }}
      >
        <UserCog className="w-3.5 h-3.5" />
        Customizar acesso
      </button>
    </div>
  )
}
