/**
 * ClinicAI — Export Button UI
 *
 * Botão reutilizável com dropdown para exportar em PDF, Excel ou CSV.
 * Verificação de permissão integrada (apenas admin/owner por padrão).
 *
 * Depende de:
 *   ExportService       (export.service.js)
 *   PermissionsService  (permissions.service.js)
 *
 * API pública (window.ExportButtonUI):
 *   mount(containerId, options)  — renderiza o botão no container
 *   unmount(containerId)         — remove o botão
 *
 * Options:
 *   {
 *     label?:      string            — texto do botão (default: 'Exportar')
 *     formats?:    ('pdf'|'excel'|'csv')[]  — formatos disponíveis (default: todos)
 *     action?:     string            — PermissionsService action para guard
 *                                      (default: 'reports:export')
 *     getConfig:   () => ExportConfig | Promise<ExportConfig>
 *                                    — retorna o config no momento do clique
 *                                      (lazy: só executa quando o usuário clica)
 *     onError?:    (err) => void     — callback de erro (default: toast)
 *   }
 *
 * Uso:
 *   ExportButtonUI.mount('exportContainer', {
 *     label: 'Exportar Pacientes',
 *     getConfig: () => ({
 *       title:    'Relatório de Pacientes',
 *       subtitle: 'Período: Jan–Mar 2026',
 *       columns: [
 *         { key: 'name',  label: 'Nome' },
 *         { key: 'email', label: 'E-mail' },
 *         { key: 'status', label: 'Status', format: v => v === 'active' ? 'Ativo' : 'Inativo' },
 *       ],
 *       data:     getPatientsData(),
 *       filename: 'pacientes-jan-mar-2026',
 *     })
 *   })
 */

;(function () {
  'use strict'

  if (window._clinicaiExportBtnLoaded) return
  window._clinicaiExportBtnLoaded = true

  // ── Escape HTML ─────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // ── Toast ────────────────────────────────────────────────────────────────
  function _toast(msg, type) {
    const bg = type === 'error' ? '#FEF2F2' : '#F0FDF4'
    const cl = type === 'error' ? '#DC2626' : '#15803D'
    const t  = document.createElement('div')
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${cl};
      padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;
      z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-width:320px`
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 3500)
  }

  // ── Ícones por formato ───────────────────────────────────────────────────
  const FORMAT_CONFIG = {
    pdf: {
      label: 'PDF',
      color: '#DC2626',
      bg:    '#FEF2F2',
      icon:  `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
        <line x1="9" y1="11" x2="11" y2="11"/>
      </svg>`,
    },
    excel: {
      label: 'Excel',
      color: '#16A34A',
      bg:    '#F0FDF4',
      icon:  `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="8" y1="13" x2="16" y2="13"/>
        <line x1="8" y1="17" x2="16" y2="17"/>
        <line x1="10" y1="9" x2="14" y2="9"/>
      </svg>`,
    },
    csv: {
      label: 'CSV',
      color: '#2563EB',
      bg:    '#EFF6FF',
      icon:  `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>`,
    },
  }

  // ── Estado dos botões montados ───────────────────────────────────────────
  // Map de containerId → { options, clickHandler }
  const _instances = new Map()

  // ── Lógica de exportação ─────────────────────────────────────────────────

  async function _runExport(format, options, triggerBtn) {
    const service = window.ExportService
    if (!service) {
      _toast('ExportService não carregado. Recarregue a página.', 'error')
      return
    }

    // Verifica permissão
    const action = options.action || 'reports:export'
    const perms  = window.PermissionsService
    if (perms && !perms.can(action)) {
      _toast('Sem permissão para exportar relatórios.', 'error')
      return
    }

    // Loading state
    const originalHTML = triggerBtn.innerHTML
    triggerBtn.disabled   = true
    triggerBtn.innerHTML  = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        style="animation:spin 1s linear infinite">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Gerando ${format.toUpperCase()}...`

    try {
      const config = await Promise.resolve(options.getConfig())
      if (!config) throw new Error('getConfig retornou vazio')

      await service[format](config)
      _toast(`${format.toUpperCase()} exportado com sucesso.`, 'success')
    } catch (err) {
      console.error('[ExportButtonUI]', err)
      if (typeof options.onError === 'function') {
        options.onError(err)
      } else {
        _toast('Erro ao exportar: ' + (err.message || 'desconhecido'), 'error')
      }
    } finally {
      triggerBtn.disabled  = false
      triggerBtn.innerHTML = originalHTML
    }
  }

  // ── Dropdown ─────────────────────────────────────────────────────────────

  function _closeDropdown() {
    document.getElementById('_exportDropdown')?.remove()
    document.removeEventListener('click', _closeDropdownOnOutside)
  }

  function _closeDropdownOnOutside(e) {
    const dd = document.getElementById('_exportDropdown')
    if (dd && !dd.contains(e.target)) _closeDropdown()
  }

  function _openDropdown(triggerBtn, options) {
    _closeDropdown()

    const formats  = options.formats || ['pdf', 'excel', 'csv']
    const rect     = triggerBtn.getBoundingClientRect()

    const dd = document.createElement('div')
    dd.id    = '_exportDropdown'
    dd.style.cssText = `
      position:fixed;
      top:${rect.bottom + 6}px;
      left:${rect.left}px;
      background:#fff;border-radius:12px;padding:6px;
      box-shadow:0 8px 30px rgba(0,0,0,0.15);border:1px solid #F3F4F6;
      z-index:9990;min-width:160px`

    formats.forEach(format => {
      const cfg = FORMAT_CONFIG[format]
      if (!cfg) return

      const item = document.createElement('button')
      item.style.cssText = `
        display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;
        background:none;border:none;border-radius:8px;cursor:pointer;
        font-size:13px;font-weight:600;color:#374151;text-align:left;
        transition:background .1s`

      item.innerHTML = `
        <span style="
          width:28px;height:28px;border-radius:7px;background:${cfg.bg};color:${cfg.color};
          display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${cfg.icon}
        </span>
        ${_esc(cfg.label)}`

      item.addEventListener('mouseenter', () => { item.style.background = '#F9FAFB' })
      item.addEventListener('mouseleave', () => { item.style.background = 'none' })
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        _closeDropdown()
        _runExport(format, options, triggerBtn)
      })

      dd.appendChild(item)
    })

    document.body.appendChild(dd)

    // Reposiciona se sair da viewport
    requestAnimationFrame(() => {
      const ddRect = dd.getBoundingClientRect()
      if (ddRect.right > window.innerWidth - 8) {
        dd.style.left = (rect.right - ddRect.width) + 'px'
      }
      if (ddRect.bottom > window.innerHeight - 8) {
        dd.style.top = (rect.top - ddRect.height - 6) + 'px'
      }
    })

    setTimeout(() => document.addEventListener('click', _closeDropdownOnOutside), 10)
  }

  // ── API pública ──────────────────────────────────────────────────────────

  /**
   * Monta o botão de exportação em um container.
   *
   * @param {string} containerId
   * @param {object} options
   */
  function mount(containerId, options) {
    if (!options?.getConfig) {
      console.error('[ExportButtonUI] options.getConfig é obrigatório')
      return
    }

    unmount(containerId)  // limpa instância anterior

    const container = document.getElementById(containerId)
    if (!container) {
      console.warn('[ExportButtonUI] Container não encontrado:', containerId)
      return
    }

    // Guard de permissão: oculta completamente se sem acesso
    const action = options.action || 'reports:export'
    const perms  = window.PermissionsService
    if (perms && !perms.can(action)) {
      container.innerHTML = ''
      return
    }

    const label   = options.label || 'Exportar'
    const formats = options.formats || ['pdf', 'excel', 'csv']
    const single  = formats.length === 1

    const btn = document.createElement('button')
    btn.id    = `_exportBtn_${containerId}`
    btn.style.cssText = `
      display:inline-flex;align-items:center;gap:6px;
      padding:8px 16px;background:#fff;color:#374151;
      border:1.5px solid #E5E7EB;border-radius:10px;
      font-size:13px;font-weight:600;cursor:pointer;
      transition:all .15s;white-space:nowrap`

    btn.innerHTML = `
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      ${_esc(label)}
      ${!single ? `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="opacity:.5">
        <polyline points="6 9 12 15 18 9"/>
      </svg>` : ''}`

    btn.addEventListener('mouseenter', () => {
      btn.style.background   = '#F9FAFB'
      btn.style.borderColor  = '#D1D5DB'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background  = '#fff'
      btn.style.borderColor = '#E5E7EB'
    })

    if (single) {
      // Um único formato: clique direto, sem dropdown
      btn.addEventListener('click', () => _runExport(formats[0], options, btn))
    } else {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        _openDropdown(btn, options)
      })
    }

    container.appendChild(btn)

    // Injeta keyframes de spin se necessário
    if (!document.getElementById('_exportSpinStyle')) {
      const style = document.createElement('style')
      style.id    = '_exportSpinStyle'
      style.textContent = '@keyframes spin { to { transform: rotate(360deg) } }'
      document.head.appendChild(style)
    }

    _instances.set(containerId, { options, btn })
  }

  /**
   * Remove o botão de um container.
   * @param {string} containerId
   */
  function unmount(containerId) {
    const inst = _instances.get(containerId)
    if (!inst) return
    inst.btn?.remove()
    _instances.delete(containerId)
  }

  // ── Exposição global ────────────────────────────────────────────────────
  window.ExportButtonUI = Object.freeze({ mount, unmount })

})()
