/**
 * ClinicAI — Medical Record Editor UI
 *
 * Componente completo de prontuário:
 *   • Card de resumo do paciente (total de registros + contadores por tipo)
 *   • Formulário de novo registro (tipo, título, conteúdo, confidencial)
 *   • Timeline de histórico com paginação
 *   • Inline edit + confirmação de exclusão
 *
 * Uso:
 *   MedicalRecordEditorUI.mount(containerId, { patientId, patientName })
 *   MedicalRecordEditorUI.unmount(containerId)
 *
 * Depende de:
 *   MedicalRecordsService   (medical-records.service.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiMrEditorLoaded) return
  window._clinicaiMrEditorLoaded = true

  // ── Constantes ────────────────────────────────────────────────
  const PAGE_SIZE = 20

  const TYPE_LABELS = {
    nota_clinica: 'Nota Clínica',
    evolucao:     'Evolução',
    prescricao:   'Prescrição',
    alerta:       'Alerta',
    observacao:   'Observação',
    procedimento: 'Procedimento',
  }

  const TYPE_COLORS = {
    nota_clinica: '#3B82F6',
    evolucao:     '#10B981',
    prescricao:   '#8B5CF6',
    alerta:       '#EF4444',
    observacao:   '#F59E0B',
    procedimento: '#06B6D4',
  }

  // Ícones SVG inline (Feather style)
  const ICONS = {
    plus:       `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit:       `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    trash:      `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
    lock:       `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    chevronDown:`<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
    clipboard:  `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  }

  // ── Estado por instância ──────────────────────────────────────
  const _instances = {}

  function _state(containerId) {
    if (!_instances[containerId]) {
      _instances[containerId] = {
        patientId:   null,
        patientName: '',
        records:     [],
        total:       0,
        offset:      0,
        hasMore:     false,
        loading:     false,
        typeFilter:  null,
        editingId:   null,
        summary:     { total: 0, last_record: null, by_type: {} },
      }
    }
    return _instances[containerId]
  }

  // ── Helpers de formatação ─────────────────────────────────────
  function _fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function _fmtDateShort(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  // ── Toast helpers ──────────────────────────────────────────────
  function _toastErr(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg, 'error'); return }
    alert(msg)
  }
  function _toastOk(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg, 'success'); return }
  }

  // ── Render: Summary Card ──────────────────────────────────────
  function _renderSummary(state) {
    const s = state.summary
    const byType = s.by_type || {}
    const pills = Object.entries(TYPE_LABELS)
      .filter(([k]) => byType[k])
      .map(([k, label]) => {
        const color = TYPE_COLORS[k] || '#6B7280'
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${color}1A;color:${color}">
          ${_esc(label)} <span style="font-weight:700">${byType[k]}</span>
        </span>`
      }).join('')

    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:10px;background:#3B82F61A;display:flex;align-items:center;justify-content:center;color:#3B82F6">${ICONS.clipboard}</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${_esc(state.patientName)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${s.total || 0} registro${s.total !== 1 ? 's' : ''} · Último em ${_fmtDateShort(s.last_record)}</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${pills || '<span style="font-size:12px;color:var(--text-muted)">Nenhum registro ainda</span>'}</div>
    </div>`
  }

  // ── Render: Formulário de novo registro ───────────────────────
  function _renderNewForm(state, containerId) {
    const svc = window.MedicalRecordsService
    if (!svc?.canCreate()) return ''

    const typeOptions = Object.entries(TYPE_LABELS)
      .map(([v, l]) => `<option value="${v}">${l}</option>`).join('')

    return `<div id="mr-new-form-${_esc(containerId)}" style="background:var(--surface);border:1.5px solid var(--accent-gold);border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:14px;display:flex;align-items:center;gap:7px">
        ${ICONS.plus} Novo Registro de Prontuário
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Tipo</label>
          <select id="mr-new-type-${_esc(containerId)}" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;cursor:pointer">
            ${typeOptions}
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Título <span style="font-weight:400;text-transform:none">(opcional)</span></label>
          <input id="mr-new-title-${_esc(containerId)}" type="text" placeholder="Ex: Consulta inicial, Retorno..." maxlength="200"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;box-sizing:border-box">
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Conteúdo <span style="color:#EF4444">*</span></label>
        <textarea id="mr-new-content-${_esc(containerId)}" rows="4" placeholder="Descreva a evolução, prescrição ou observação clínica..."
          style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5"></textarea>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
          <input type="checkbox" id="mr-new-confidential-${_esc(containerId)}" style="accent-color:var(--accent-gold);width:14px;height:14px">
          <span style="display:flex;align-items:center;gap:4px">${ICONS.lock} Registro confidencial (somente você e admins)</span>
        </label>
        <div style="display:flex;gap:8px;align-items:center">
          <span id="mr-new-error-${_esc(containerId)}" style="font-size:12px;color:#EF4444;display:none"></span>
          <button onclick="MedicalRecordEditorUI._saveNew('${_esc(containerId)}')"
            style="padding:9px 20px;background:var(--accent-gold);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:opacity .15s"
            onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
            ${ICONS.plus} Salvar Registro
          </button>
        </div>
      </div>
    </div>`
  }

  // ── Render: Filtro de tipo ────────────────────────────────────
  function _renderTypeFilter(state, containerId) {
    const all = state.typeFilter === null
    const makeBtn = (value, label, color) => {
      const active = state.typeFilter === value
      const bg = active ? color : 'transparent'
      const fc = active ? '#fff' : (color || 'var(--text-secondary)')
      const bd = active ? color : 'var(--border)'
      return `<button onclick="MedicalRecordEditorUI._setFilter('${_esc(containerId)}', ${value ? `'${value}'` : 'null'})"
        style="padding:5px 12px;border:1.5px solid ${bd};border-radius:20px;font-size:12px;font-weight:600;background:${bg};color:${fc};cursor:pointer;transition:all .15s">
        ${_esc(label)}
      </button>`
    }

    const allBg = all ? 'var(--accent-gold)' : 'transparent'
    const allFc = all ? '#fff' : 'var(--text-secondary)'
    const allBd = all ? 'var(--accent-gold)' : 'var(--border)'

    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      <button onclick="MedicalRecordEditorUI._setFilter('${_esc(containerId)}', null)"
        style="padding:5px 12px;border:1.5px solid ${allBd};border-radius:20px;font-size:12px;font-weight:600;background:${allBg};color:${allFc};cursor:pointer;transition:all .15s">
        Todos
      </button>
      ${Object.entries(TYPE_LABELS).map(([v, l]) => makeBtn(v, l, TYPE_COLORS[v])).join('')}
    </div>`
  }

  // ── Render: Linha de registro ─────────────────────────────────
  function _renderRecord(rec, state, containerId) {
    const svc = window.MedicalRecordsService
    const color = TYPE_COLORS[rec.record_type] || '#6B7280'
    const label = TYPE_LABELS[rec.record_type] || rec.record_type
    const canEdit   = svc?.canEdit(rec)
    const canDelete = svc?.canDelete(rec)
    const isEditing = state.editingId === rec.id

    if (isEditing) {
      return _renderEditForm(rec, state, containerId)
    }

    return `<div id="mr-record-${_esc(rec.id)}" style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:16px;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.06)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${color}1A;color:${color}">${_esc(label)}</span>
          ${rec.is_confidential ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#F3F4F6;color:#6B7280">${ICONS.lock} Confidencial</span>` : ''}
          ${rec.title ? `<span style="font-size:13px;font-weight:600;color:var(--text-primary)">${_esc(rec.title)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${rec.title && rec.title.includes('[ASSINADO]') ? `<span title="Registro assinado digitalmente" style="width:28px;height:28px;border:1.5px solid #10B98140;border-radius:6px;background:#F0FDF4;color:#10B981;display:flex;align-items:center;justify-content:center"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>` : ''}
          ${canEdit && !(rec.title && rec.title.includes('[ASSINADO]')) ? `<button title="Editar" onclick="MedicalRecordEditorUI._startEdit('${_esc(containerId)}','${_esc(rec.id)}')" style="width:28px;height:28px;border:1.5px solid var(--border);border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='#F3F4F6'" onmouseout="this.style.background='transparent'">${ICONS.edit}</button>` : ''}
          ${canEdit && !(rec.title && rec.title.includes('[ASSINADO]')) && window.ProntuarioWow ? `<button title="Assinar" onclick="ProntuarioWow.signRecord('${_esc(rec.id)}').then(function(){location.reload()})" style="width:28px;height:28px;border:1.5px solid #10B98140;border-radius:6px;background:transparent;color:#10B981;cursor:pointer;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='#F0FDF4'" onmouseout="this.style.background='transparent'"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>` : ''}
          ${canDelete ? `<button title="Excluir" onclick="MedicalRecordEditorUI._confirmDelete('${_esc(containerId)}','${_esc(rec.id)}')" style="width:28px;height:28px;border:1.5px solid var(--border);border-radius:6px;background:transparent;color:#EF4444;cursor:pointer;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='#FEF2F2'" onmouseout="this.style.background='transparent'">${ICONS.trash}</button>` : ''}
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;word-break:break-word">${_esc(rec.content)}</div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-muted)">
        <span>${_fmtDate(rec.created_at)}</span>
        ${rec.professional_name ? `<span>·</span><span>${_esc(rec.professional_name)}</span>` : ''}
        ${rec.is_mine ? `<span style="color:var(--accent-gold);font-weight:600">· Você</span>` : ''}
        ${rec.updated_at !== rec.created_at ? `<span>· editado</span>` : ''}
      </div>
    </div>`
  }

  // ── Render: Formulário inline de edição ───────────────────────
  function _renderEditForm(rec, state, containerId) {
    const typeOptions = Object.entries(TYPE_LABELS)
      .map(([v, l]) => `<option value="${v}" ${v === rec.record_type ? 'selected' : ''}>${l}</option>`).join('')

    return `<div id="mr-record-${_esc(rec.id)}" style="background:var(--surface);border:2px solid var(--accent-gold);border-radius:10px;padding:16px">
      <div style="font-size:12px;font-weight:700;color:var(--accent-gold);margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em">Editando registro</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px">Tipo</label>
          <select id="mr-edit-type-${_esc(rec.id)}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none">${typeOptions}</select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px">Título</label>
          <input id="mr-edit-title-${_esc(rec.id)}" type="text" value="${_esc(rec.title || '')}" maxlength="200"
            style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;box-sizing:border-box">
        </div>
      </div>
      <textarea id="mr-edit-content-${_esc(rec.id)}" rows="4"
        style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;margin-bottom:10px">${_esc(rec.content)}</textarea>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text-secondary)">
          <input type="checkbox" id="mr-edit-confidential-${_esc(rec.id)}" ${rec.is_confidential ? 'checked' : ''} style="accent-color:var(--accent-gold)">
          ${ICONS.lock} Confidencial
        </label>
        <div style="display:flex;gap:8px">
          <button onclick="MedicalRecordEditorUI._cancelEdit('${_esc(containerId)}')"
            style="padding:7px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:transparent;color:var(--text-secondary);cursor:pointer">
            Cancelar
          </button>
          <button onclick="MedicalRecordEditorUI._saveEdit('${_esc(containerId)}','${_esc(rec.id)}')"
            style="padding:7px 14px;background:var(--accent-gold);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">
            Salvar
          </button>
        </div>
      </div>
    </div>`
  }

  // ── Render: Timeline ──────────────────────────────────────────
  function _renderTimeline(state, containerId) {
    if (state.loading) {
      return `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Carregando registros...</div>`
    }
    if (!state.records.length) {
      return `<div style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:10px">📋</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">Nenhum registro encontrado</div>
        <div style="font-size:12px">${state.typeFilter ? 'Nenhum registro deste tipo para este paciente.' : 'Crie o primeiro registro de prontuário acima.'}</div>
      </div>`
    }

    const items = state.records.map(r => _renderRecord(r, state, containerId)).join('')

    const loadMore = state.hasMore ? `
      <div style="text-align:center;padding:16px">
        <button onclick="MedicalRecordEditorUI._loadMore('${_esc(containerId)}')"
          style="padding:9px 20px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:transparent;color:var(--text-secondary);cursor:pointer">
          Carregar mais registros ${ICONS.chevronDown}
        </button>
      </div>` : ''

    return `<div style="display:flex;flex-direction:column;gap:10px">${items}</div>${loadMore}`
  }

  // ── Render: Tabs ───────────────────────────────────────────────
  const TABS = [
    { id: 'timeline', label: 'Timeline', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    { id: 'registros', label: 'Registros', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
    { id: 'procedimentos', label: 'Procedimentos', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
    { id: 'documentos', label: 'Documentos', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
    { id: 'fotos', label: 'Fotos e Anexos', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' },
    { id: 'whatsapp', label: 'WhatsApp', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
    { id: 'financeiro', label: 'Financeiro', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
    { id: 'quiz', label: 'Avaliacoes', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' },
  ]

  function _renderTabs(state, containerId) {
    var activeTab = state.activeTab || 'registros'
    return '<div style="display:flex;gap:2px;margin-bottom:16px;border-bottom:2px solid var(--border,#E5E7EB);padding-bottom:0">'
      + TABS.map(function (t) {
        var active = t.id === activeTab
        return '<button data-tab="' + t.id + '" onclick="MedicalRecordEditorUI._switchTab(\'' + _esc(containerId) + '\',\'' + t.id + '\')"'
          + ' style="display:flex;align-items:center;gap:6px;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:' + (active ? '700' : '500')
          + ';color:' + (active ? 'var(--accent-gold,#C9A96E)' : 'var(--text-muted,#9CA3AF)')
          + ';border-bottom:2px solid ' + (active ? 'var(--accent-gold,#C9A96E)' : 'transparent')
          + ';margin-bottom:-2px;transition:all .15s">'
          + t.icon + ' ' + t.label + '</button>'
      }).join('') + '</div>'
  }

  // ── Tab: Documentos (Legal Docs + solicitar novo) ──────────────
  async function _renderDocumentosTab(state, containerId) {
    if (!window._sbShared) return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Supabase indisponivel</div>'

    var patientName = state.patientName || ''
    var res = await window._sbShared.from('legal_doc_requests')
      .select('id,patient_name,professional_name,status,created_at,signed_at,public_slug')
      .or('patient_name.ilike.%' + patientName.trim() + '%,patient_id.eq.' + (state.patientId || ''))
      .neq('status', 'purged')
      .order('created_at', { ascending: false })
      .limit(30)

    var docs = (res.data || [])
    var statusMap = { pending: ['Pendente','#F59E0B'], viewed: ['Visualizado','#3B82F6'], signed: ['Assinado','#10B981'], expired: ['Expirado','#6B7280'], revoked: ['Revogado','#EF4444'] }

    // Botao solicitar novo documento
    var html = '<div style="display:flex;flex-direction:column;gap:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<div style="font-size:12px;color:var(--text-muted)">' + docs.length + ' documento' + (docs.length !== 1 ? 's' : '') + '</div>'
      + '<button onclick="MedicalRecordEditorUI._showRequestDocModal(\'' + _esc(containerId) + '\')"'
      + ' style="padding:7px 16px;background:var(--accent-gold);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">'
      + '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      + ' Solicitar Documento</button>'
      + '</div>'

    if (!docs.length) {
      html += '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum consentimento registrado para este paciente.</div>'
    } else {
      docs.forEach(function (d) {
        var s = statusMap[d.status] || [d.status, '#6B7280']
        var date = d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : ''
        var signedDate = d.signed_at ? new Date(d.signed_at).toLocaleString('pt-BR') : ''
        html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface,#fff);border:1.5px solid var(--border,#E5E7EB);border-radius:10px">'
          + '<div style="width:8px;height:8px;border-radius:50%;background:' + s[1] + ';flex-shrink:0"></div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:12px;font-weight:600;color:var(--text-primary,#111)">' + _esc(d.professional_name || '') + '</div>'
          + '<div style="font-size:10px;color:var(--text-muted,#9CA3AF)">' + date + (signedDate ? ' | Assinado: ' + signedDate : '') + '</div>'
          + '</div>'
          + '<span style="font-size:10px;padding:3px 10px;background:' + s[1] + '15;color:' + s[1] + ';border-radius:20px;font-weight:600">' + s[0] + '</span>'
          + '</div>'
      })
    }

    html += '</div>'

    // Modal (hidden) para selecionar template
    html += '<div id="mr-doc-request-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center">'
      + '<div style="background:var(--surface,#fff);border-radius:14px;padding:24px;width:420px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      + '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">Solicitar Documento</div>'
      + '<button onclick="document.getElementById(\'mr-doc-request-modal\').style.display=\'none\'" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px">&times;</button>'
      + '</div>'
      + '<div id="mr-doc-template-list" style="font-size:12px;color:var(--text-muted)">Carregando templates...</div>'
      + '</div></div>'

    return html
  }

  async function _showRequestDocModal(containerId) {
    var modal = document.getElementById('mr-doc-request-modal')
    if (modal) modal.style.display = 'flex'

    // Carregar templates
    var svc = window.LegalDocumentsService
    if (!svc) return
    var templates = svc.getTemplates()
    if (!templates || !templates.length) templates = await svc.loadTemplates()

    var listEl = document.getElementById('mr-doc-template-list')
    if (!listEl) return

    if (!templates || !templates.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted)">Nenhum template disponivel. Configure em Documentos Legais.</div>'
      return
    }

    var state = _state(containerId)
    var typeIcons = { tcle: '#10B981', uso_imagem: '#3B82F6', custom: '#8B5CF6' }

    listEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px">'
      + templates.map(function (t) {
        var color = typeIcons[t.doc_type] || '#6B7280'
        return '<button onclick="MedicalRecordEditorUI._requestDoc(\'' + _esc(containerId) + '\',\'' + _esc(t.id) + '\')"'
          + ' style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;cursor:pointer;text-align:left;width:100%;transition:border-color .15s"'
          + ' onmouseover="this.style.borderColor=\'' + color + '\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
          + '<div style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></div>'
          + '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--text-primary)">' + _esc(t.name) + '</div>'
          + '<div style="font-size:10px;color:var(--text-muted)">' + _esc(t.doc_type || 'custom') + '</div></div>'
          + '<svg width="14" height="14" fill="none" stroke="' + color + '" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>'
          + '</button>'
      }).join('')
      + '</div>'
  }

  async function _requestDoc(containerId, templateId) {
    var state = _state(containerId)
    var svc = window.LegalDocumentsService
    if (!svc || !svc.createRequest) return

    var result = await svc.createRequest(templateId, {
      patient_id: state.patientId,
      id: state.patientId,
      pacienteNome: state.patientName,
      patient_name: state.patientName,
    })

    // Fechar modal
    var modal = document.getElementById('mr-doc-request-modal')
    if (modal) modal.style.display = 'none'

    if (result && result.ok) {
      _toastOk('Documento solicitado com sucesso')
      // Recarregar tab documentos
      _renderTabContent(containerId)
    } else {
      _toastErr((result && result.error) || 'Erro ao solicitar documento')
    }
  }

  // ── Tab: Procedimentos (historico via Supabase) ─────────────────
  async function _renderProcedimentosTab(state) {
    if (!window._sbShared) {
      // Fallback localStorage se Supabase indisponivel
      return _renderProcedimentosFallback(state)
    }

    var res = await window._sbShared.from('appointments')
      .select('id,patient_id,patient_name,professional_name,procedure_name,procedimento,scheduled_date,data,status,valor,procedimentos,procedimentosRealizados')
      .or('patient_id.eq.' + (state.patientId || '') + ',pacienteId.eq.' + (state.patientId || ''))
      .in('status', ['finalizado', 'em_consulta'])
      .order('scheduled_date', { ascending: false })
      .limit(50)

    var patientProcs = res.data || []

    // Fallback: se Supabase retornou vazio, tenta por nome
    if (!patientProcs.length && state.patientName) {
      var res2 = await window._sbShared.from('appointments')
        .select('id,patient_id,patient_name,professional_name,procedure_name,procedimento,scheduled_date,data,status,valor,procedimentos,procedimentosRealizados')
        .ilike('patient_name', '%' + state.patientName.trim() + '%')
        .in('status', ['finalizado', 'em_consulta'])
        .order('scheduled_date', { ascending: false })
        .limit(50)
      patientProcs = res2.data || []
    }

    if (!patientProcs.length) return '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum procedimento realizado registrado.</div>'

    return _renderProcedimentosList(patientProcs)
  }

  function _renderProcedimentosFallback(state) {
    var appts = []
    try { appts = JSON.parse(localStorage.getItem((window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments')) || '[]') } catch (e) {}
    var patientName = (state.patientName || '').toLowerCase().trim()
    var patientProcs = appts.filter(function (a) {
      return (a.status === 'finalizado' || a.status === 'em_consulta')
        && ((a.pacienteNome || a.patient_name || '').toLowerCase().trim() === patientName
          || a.pacienteId === state.patientId || a.patient_id === state.patientId)
    }).sort(function (a, b) { return (b.data || b.scheduled_date || '').localeCompare(a.data || a.scheduled_date || '') })
    if (!patientProcs.length) return '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum procedimento realizado registrado.</div>'
    return _renderProcedimentosList(patientProcs)
  }

  function _renderProcedimentosList(patientProcs) {
    return '<div style="display:flex;flex-direction:column;gap:8px">' + patientProcs.map(function (a) {
      var proc = a.procedimento || a.procedure_name || 'Consulta'
      var prof = a.profissionalNome || a.professional_name || ''
      var date = (a.data || a.scheduled_date) ? new Date(a.data || a.scheduled_date).toLocaleDateString('pt-BR') : ''
      var valor = a.valor ? 'R$ ' + Number(a.valor).toFixed(2).replace('.', ',') : ''
      var procs = window.ApptSchema ? window.ApptSchema.getProcs(a) : (a.procedimentos || a.procedimentosRealizados || [])

      var html = '<div style="padding:14px 16px;background:var(--surface,#fff);border:1.5px solid var(--border,#E5E7EB);border-radius:10px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        + '<div style="font-size:13px;font-weight:600;color:var(--text-primary,#111)">' + _esc(proc) + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted,#9CA3AF)">' + date + '</div>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted,#9CA3AF)">' + _esc(prof) + (valor ? ' | ' + valor : '') + '</div>'

      if (procs && procs.length) {
        html += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">'
        procs.forEach(function (p) {
          html += '<span style="font-size:10px;padding:2px 8px;background:#06B6D41A;color:#06B6D4;border-radius:4px">' + _esc(p.nome || p) + (p.qtd > 1 ? ' x' + p.qtd : '') + '</span>'
        })
        html += '</div>'
      }
      html += '</div>'
      return html
    }).join('') + '</div>'
  }

  // ── Tab: Fotos e Anexos ────────────────────────────────────────
  function _renderFotosTab(state) {
    // Face Mapping usa fm_session_<leadId> — leadId = patientId no ClinicAI
    var fmData = null
    try {
      var raw = localStorage.getItem('fm_session_' + state.patientId)
      if (raw) fmData = JSON.parse(raw)
    } catch (e) {}

    var html = '<div style="padding:16px;display:flex;flex-direction:column;gap:16px">'

    // ── Face Mapping section ──
    if (fmData && fmData.photos) {
      var photoKeys = Object.keys(fmData.photos).filter(function (k) { return fmData.photos[k] })
      var savedDate = fmData.savedAt ? new Date(fmData.savedAt).toLocaleDateString('pt-BR') : ''

      html += '<div style="background:var(--surface);border:1.5px solid #10B98140;border-radius:12px;padding:16px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<div style="width:32px;height:32px;border-radius:8px;background:#10B9811A;display:flex;align-items:center;justify-content:center;color:#10B981">'
        + '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
        + '</div>'
        + '<div><div style="font-size:13px;font-weight:700;color:var(--text-primary)">Face Mapping</div>'
        + '<div style="font-size:11px;color:var(--text-muted)">' + photoKeys.length + ' foto' + (photoKeys.length !== 1 ? 's' : '') + (savedDate ? ' · Salvo em ' + savedDate : '') + '</div></div>'
        + '</div>'
        + '<button onclick="if(window.navigateTo)navigateTo(\'face-mapping\')" style="padding:7px 16px;background:linear-gradient(135deg,#C9A96E,#D4B978);color:#1a1a2e;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer">Abrir</button>'
        + '</div>'

      // Thumbnails das fotos
      if (photoKeys.length) {
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        var angleLabels = { front: 'Frontal', left: 'Esquerda', right: 'Direita', oblique_left: 'Obliqua E', oblique_right: 'Obliqua D' }
        photoKeys.slice(0, 5).forEach(function (k) {
          var src = fmData.photos[k]
          if (typeof src === 'string' && src.startsWith('data:')) {
            html += '<div style="text-align:center">'
              + '<img src="' + src + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1.5px solid var(--border)" />'
              + '<div style="font-size:9px;color:var(--text-muted);margin-top:3px">' + (angleLabels[k] || k) + '</div>'
              + '</div>'
          }
        })
        html += '</div>'
      }
      html += '</div>'
    } else {
      html += '<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:20px;text-align:center">'
        + '<div style="color:var(--text-muted);margin-bottom:10px">'
        + '<svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="opacity:.4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
        + '</div>'
        + '<div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Nenhuma analise facial</div>'
        + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Use o Face Mapping para registrar fotos e analise deste paciente.</div>'
        + '<button onclick="if(window.navigateTo)navigateTo(\'face-mapping\')" style="padding:8px 18px;background:var(--accent-gold,#C9A96E);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Ir para Face Mapping</button>'
        + '</div>'
    }

    // ── Anexos (medical_record_attachments) ──
    html += '<div id="mr-attachments-section" style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:16px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      + '<div style="font-size:13px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px">'
      + '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>'
      + 'Anexos</div>'
      + '<label style="padding:6px 14px;background:var(--accent-gold);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">'
      + '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Upload'
      + '<input type="file" multiple accept="image/*,.pdf,.doc,.docx" style="display:none" onchange="MedicalRecordEditorUI._handleAttachmentUpload(\'' + _esc(state.patientId) + '\',this.files)" />'
      + '</label>'
      + '</div>'
      + '<div id="mr-attachments-list" style="min-height:40px">'
      + '<div style="text-align:center;padding:12px;font-size:12px;color:var(--text-muted)">Carregando anexos...</div>'
      + '</div>'
      + '</div>'

    html += '</div>'
    return html
  }

  // ── Tab: WhatsApp (historico de mensagens) ──────────────────────
  async function _renderWhatsappTab(state) {
    if (!window._sbShared) return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Supabase indisponivel</div>'

    // Buscar telefone do paciente nos leads
    var leads = []
    try { leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : [] } catch (e) {}
    var lead = leads.find(function (l) { return l.id === state.patientId })
    var phone = lead ? (lead.phone || lead.whatsapp || '') : ''

    if (!phone) {
      return '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">'
        + '<svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="opacity:.4;margin-bottom:8px"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>'
        + '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Sem telefone registrado</div>'
        + '<div style="font-size:12px">Nao foi possivel buscar mensagens sem numero de telefone.</div></div>'
    }

    // Normalizar telefone (pegar ultimos 8 digitos para match)
    var phoneClean = phone.replace(/\D/g, '')
    var phoneSuffix = phoneClean.slice(-8)

    var res = await window._sbShared.from('wa_messages')
      .select('id,remote_jid,from_me,message_type,content,timestamp,status')
      .or('remote_jid.like.%' + phoneSuffix + '%')
      .order('timestamp', { ascending: false })
      .limit(50)

    var msgs = res.data || []

    if (!msgs.length) {
      return '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">'
        + 'Nenhuma mensagem WhatsApp encontrada para ' + _esc(phone) + '</div>'
    }

    var html = '<div style="display:flex;flex-direction:column;gap:4px;max-height:500px;overflow-y:auto;padding:4px">'
    msgs.forEach(function (m) {
      var isMe = m.from_me
      var align = isMe ? 'flex-end' : 'flex-start'
      var bg = isMe ? '#DCF8C6' : 'var(--surface,#fff)'
      var border = isMe ? '#34B7F11A' : 'var(--border)'
      var time = m.timestamp ? new Date(m.timestamp).toLocaleString('pt-BR', { day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' }) : ''
      var content = m.content || (m.message_type === 'image' ? '[Imagem]' : m.message_type === 'audio' ? '[Audio]' : m.message_type === 'document' ? '[Documento]' : '[Mensagem]')

      html += '<div style="display:flex;justify-content:' + align + '">'
        + '<div style="max-width:75%;padding:8px 12px;background:' + bg + ';border:1px solid ' + border + ';border-radius:10px;font-size:12px;line-height:1.5;color:var(--text-primary)">'
        + '<div style="white-space:pre-wrap;word-break:break-word">' + _esc(content) + '</div>'
        + '<div style="font-size:9px;color:var(--text-muted);text-align:right;margin-top:2px">' + time + '</div>'
        + '</div></div>'
    })
    html += '</div>'

    return '<div style="display:flex;flex-direction:column;gap:8px">'
      + '<div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px">'
      + '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72"/></svg>'
      + _esc(phone) + ' · ' + msgs.length + ' mensagen' + (msgs.length !== 1 ? 's' : '') + '</div>'
      + html + '</div>'
  }

  // ── Tab: Financeiro (pagamentos e orcamentos) ─────────────────
  async function _renderFinanceiroTab(state) {
    if (!window._sbShared) return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Supabase indisponivel</div>'

    // Buscar agendamentos finalizados com valor
    var res = await window._sbShared.from('appointments')
      .select('id,procedimento,procedure_name,scheduled_date,data,valor,status,forma_pagamento')
      .or('patient_id.eq.' + (state.patientId || '') + ',pacienteId.eq.' + (state.patientId || ''))
      .in('status', ['finalizado'])
      .order('scheduled_date', { ascending: false })
      .limit(100)

    var appts = res.data || []

    // Buscar orcamentos
    var orcRes = await window._sbShared.from('orcamentos')
      .select('id,titulo,valor_total,status,created_at,validade')
      .eq('patient_id', state.patientId || '')
      .order('created_at', { ascending: false })
      .limit(20)

    var orcs = orcRes.data || []

    // Calcular totais
    var totalGasto = 0
    appts.forEach(function (a) { totalGasto += Number(a.valor) || 0 })

    var html = '<div style="display:flex;flex-direction:column;gap:16px">'

    // Cards de resumo
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">'
    html += _finCard('Total Gasto', 'R$ ' + totalGasto.toFixed(2).replace('.', ','), '#10B981')
    html += _finCard('Procedimentos', appts.length.toString(), '#3B82F6')
    html += _finCard('Orcamentos', orcs.length.toString(), '#8B5CF6')
    html += '</div>'

    // Lista de pagamentos
    if (appts.length) {
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-top:4px">Pagamentos</div>'
      html += '<div style="display:flex;flex-direction:column;gap:6px">'
      appts.forEach(function (a) {
        var proc = a.procedimento || a.procedure_name || 'Consulta'
        var date = (a.data || a.scheduled_date) ? new Date(a.data || a.scheduled_date).toLocaleDateString('pt-BR') : ''
        var valor = a.valor ? 'R$ ' + Number(a.valor).toFixed(2).replace('.', ',') : 'Sem valor'
        var forma = a.forma_pagamento || ''

        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:8px">'
          + '<div style="width:6px;height:6px;border-radius:50%;background:#10B981;flex-shrink:0"></div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:12px;font-weight:600;color:var(--text-primary)">' + _esc(proc) + '</div>'
          + '<div style="font-size:10px;color:var(--text-muted)">' + date + (forma ? ' · ' + _esc(forma) : '') + '</div>'
          + '</div>'
          + '<div style="font-size:12px;font-weight:700;color:#10B981">' + valor + '</div>'
          + '</div>'
      })
      html += '</div>'
    }

    // Lista de orcamentos
    if (orcs.length) {
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-top:4px">Orcamentos</div>'
      html += '<div style="display:flex;flex-direction:column;gap:6px">'
      var orcStatusMap = { draft: ['Rascunho','#6B7280'], sent: ['Enviado','#F59E0B'], approved: ['Aprovado','#10B981'], rejected: ['Recusado','#EF4444'], expired: ['Expirado','#6B7280'] }
      orcs.forEach(function (o) {
        var s = orcStatusMap[o.status] || [o.status || 'Pendente', '#6B7280']
        var date = o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : ''
        var valor = o.valor_total ? 'R$ ' + Number(o.valor_total).toFixed(2).replace('.', ',') : ''
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:8px">'
          + '<div style="width:6px;height:6px;border-radius:50%;background:' + s[1] + ';flex-shrink:0"></div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:12px;font-weight:600;color:var(--text-primary)">' + _esc(o.titulo || 'Orcamento') + '</div>'
          + '<div style="font-size:10px;color:var(--text-muted)">' + date + '</div>'
          + '</div>'
          + '<span style="font-size:10px;padding:3px 8px;background:' + s[1] + '15;color:' + s[1] + ';border-radius:12px;font-weight:600">' + s[0] + '</span>'
          + (valor ? '<div style="font-size:12px;font-weight:700;color:var(--text-primary)">' + valor + '</div>' : '')
          + '</div>'
      })
      html += '</div>'
    }

    if (!appts.length && !orcs.length) {
      html += '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum registro financeiro encontrado.</div>'
    }

    html += '</div>'
    return html
  }

  function _finCard(label, value, color) {
    return '<div style="padding:14px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;text-align:center">'
      + '<div style="font-size:18px;font-weight:700;color:' + color + '">' + value + '</div>'
      + '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + label + '</div>'
      + '</div>'
  }

  // ── Tab: Quiz / Avaliacoes ────────────────────────────────────
  async function _renderQuizTab(state) {
    if (!window._sbShared) return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Supabase indisponivel</div>'

    // Buscar quiz responses por lead_id (= patient_id)
    var res = await window._sbShared.from('quiz_responses')
      .select('id,quiz_slug,created_at,answers,score,queixas')
      .eq('lead_id', state.patientId || '')
      .order('created_at', { ascending: false })
      .limit(20)

    var responses = res.data || []

    // Fallback: buscar por telefone se nao encontrou por ID
    if (!responses.length) {
      var leads = []
      try { leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : [] } catch (e) {}
      var lead = leads.find(function (l) { return l.id === state.patientId })
      if (lead && (lead.phone || lead.whatsapp)) {
        var phoneSuffix = (lead.phone || lead.whatsapp).replace(/\D/g, '').slice(-8)
        if (phoneSuffix.length >= 8) {
          var res2 = await window._sbShared.from('quiz_responses')
            .select('id,quiz_slug,created_at,answers,score,queixas')
            .like('phone', '%' + phoneSuffix)
            .order('created_at', { ascending: false })
            .limit(20)
          responses = res2.data || []
        }
      }
    }

    if (!responses.length) {
      return '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">'
        + '<svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="opacity:.4;margin-bottom:8px"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'
        + '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Nenhuma avaliacao/quiz</div>'
        + '<div style="font-size:12px">Este paciente ainda nao respondeu nenhum quiz.</div></div>'
    }

    var html = '<div style="display:flex;flex-direction:column;gap:10px">'
    responses.forEach(function (r) {
      var date = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : ''
      var slug = r.quiz_slug || 'quiz'
      var queixas = r.queixas
      if (typeof queixas === 'string') { try { queixas = JSON.parse(queixas) } catch (e) { queixas = null } }

      html += '<div style="padding:14px 16px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<div style="font-size:13px;font-weight:600;color:var(--text-primary)">' + _esc(slug) + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted)">' + date + '</div>'
        + '</div>'

      if (r.score != null) {
        html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Score: <strong>' + r.score + '</strong></div>'
      }

      // Mostrar queixas se existirem
      if (queixas && Array.isArray(queixas) && queixas.length) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px">'
        queixas.forEach(function (q) {
          var label = typeof q === 'string' ? q : (q.label || q.name || q.queixa || JSON.stringify(q))
          html += '<span style="font-size:10px;padding:3px 8px;background:#8B5CF61A;color:#8B5CF6;border-radius:4px;font-weight:600">' + _esc(label) + '</span>'
        })
        html += '</div>'
      }

      // Mostrar respostas resumidas
      if (r.answers && typeof r.answers === 'object') {
        var entries = Object.entries(r.answers)
        if (entries.length > 0 && entries.length <= 10) {
          html += '<div style="margin-top:8px;font-size:11px;color:var(--text-muted);line-height:1.6">'
          entries.slice(0, 5).forEach(function (pair) {
            var val = typeof pair[1] === 'object' ? JSON.stringify(pair[1]) : String(pair[1])
            if (val.length > 80) val = val.substring(0, 77) + '...'
            html += '<div><strong>' + _esc(pair[0]) + ':</strong> ' + _esc(val) + '</div>'
          })
          if (entries.length > 5) html += '<div style="color:var(--text-muted)">... e mais ' + (entries.length - 5) + ' respostas</div>'
          html += '</div>'
        }
      }

      html += '</div>'
    })
    html += '</div>'
    return html
  }

  // ── Templates de registro rapido ──────────────────────────────
  const RECORD_TEMPLATES = [
    { type: 'nota_clinica', title: 'Consulta inicial', content: 'Queixa principal:\nHistoria:\nExame:\nConduta:' },
    { type: 'evolucao', title: 'Retorno', content: 'Evolucao desde ultima consulta:\nMelhora:\nPendencias:\nProxima etapa:' },
    { type: 'procedimento', title: 'Procedimento realizado', content: 'Procedimento:\nArea:\nProduto/Dose:\nIntercorrencias:\nOrientacoes pos:' },
    { type: 'prescricao', title: 'Prescricao', content: 'Medicamento:\nDose:\nPosologia:\nDuracao:\nOrientacoes:' },
    { type: 'alerta', title: 'Alerta clinico', content: 'Alergia/Contraindicacao:\nDetalhes:\nConduta recomendada:' },
  ]

  function _renderTemplateButtons(containerId) {
    return '<div style="margin-bottom:14px">'
      + '<div style="font-size:10px;font-weight:700;color:var(--text-muted,#9CA3AF);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Templates rapidos</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px">'
      + RECORD_TEMPLATES.map(function (t, i) {
        var color = TYPE_COLORS[t.type] || '#6B7280'
        return '<button data-tmpl="' + i + '" onclick="MedicalRecordEditorUI._applyTemplate(\'' + _esc(containerId) + '\',' + i + ')"'
          + ' style="padding:4px 10px;border:1px solid ' + color + '30;border-radius:6px;background:' + color + '0A;color:' + color + ';font-size:10px;font-weight:600;cursor:pointer">'
          + _esc(t.title) + '</button>'
      }).join('')
      + '</div></div>'
  }

  // ── Busca no conteudo dos registros ────────────────────────────
  function _renderSearchBar(state, containerId) {
    return '<div style="margin-bottom:12px">'
      + '<input id="mr-search-' + _esc(containerId) + '" type="text" placeholder="Buscar nos registros..." '
      + 'oninput="MedicalRecordEditorUI._onSearchRecords(\'' + _esc(containerId) + '\',this.value)" '
      + 'style="width:100%;padding:8px 12px;border:1.5px solid var(--border,#E5E7EB);border-radius:8px;font-size:12px;outline:none;box-sizing:border-box;background:var(--surface,#fff);color:var(--text-primary,#111)" />'
      + '</div>'
  }

  // ── Render completo ───────────────────────────────────────────
  function _render(containerId) {
    const container = document.getElementById(containerId)
    if (!container) return

    const state = _state(containerId)
    if (!state.activeTab) state.activeTab = 'timeline'

    // Use WOW header if available, fallback to basic summary
    var headerHtml = ''
    var alertsHtml = ''
    if (window.ProntuarioWow) {
      headerHtml = window.ProntuarioWow.renderPatientHeader(state.patientId, state.patientName)
    } else {
      headerHtml = _renderSummary(state)
    }

    container.innerHTML = `
      <div id="mr-root-${_esc(containerId)}">
        <div id="mr-header-${_esc(containerId)}">${headerHtml}</div>
        <div id="mr-alerts-${_esc(containerId)}"></div>
        ${_renderTabs(state, containerId)}
        <div id="mr-tab-content-${_esc(containerId)}"></div>
      </div>`

    // Load alerts async
    if (window.ProntuarioWow) {
      window.ProntuarioWow.renderClinicalAlerts(state.patientId).then(function(html) {
        var el = document.getElementById('mr-alerts-' + containerId)
        if (el) el.innerHTML = html
      })
    }

    _renderTabContent(containerId)
  }

  async function _renderTabContent(containerId) {
    var state = _state(containerId)
    var el = document.getElementById('mr-tab-content-' + containerId)
    if (!el) return

    if (state.activeTab === 'timeline') {
      // WOW #1: Timeline Unificada
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Carregando timeline...</div>'
      if (window.ProntuarioWow) {
        el.innerHTML = await window.ProntuarioWow.renderUnifiedTimeline(state.patientId, state.patientName)
      } else {
        el.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Modulo Timeline nao carregado.</div>'
      }
    } else if (state.activeTab === 'registros') {
      // WOW #5 + #6: Prescricao + SOAP no topo dos registros
      var wowForms = ''
      if (window.ProntuarioWow) {
        wowForms = window.ProntuarioWow.renderSOAPForm(containerId, state.patientId)
          + window.ProntuarioWow.renderPrescriptionForm(containerId, state.patientId, state.patientName)
      }
      el.innerHTML = wowForms
        + _renderTemplateButtons(containerId)
        + _renderNewForm(state, containerId)
        + _renderSearchBar(state, containerId)
        + _renderTypeFilter(state, containerId)
        + '<div id="mr-timeline-' + _esc(containerId) + '">' + _renderTimeline(state, containerId) + '</div>'
    } else if (state.activeTab === 'documentos') {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Carregando documentos...</div>'
      el.innerHTML = await _renderDocumentosTab(state, containerId)
    } else if (state.activeTab === 'procedimentos') {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Carregando procedimentos...</div>'
      el.innerHTML = await _renderProcedimentosTab(state)
    } else if (state.activeTab === 'fotos') {
      // WOW #4 + #9: Galeria Before/After no topo
      var galleryHtml = ''
      if (window.ProntuarioWow) {
        galleryHtml = window.ProntuarioWow.renderBeforeAfterGallery(state.patientId)
      }
      el.innerHTML = galleryHtml + _renderFotosTab(state)
      _loadAttachments(state.patientId)
    } else if (state.activeTab === 'whatsapp') {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Carregando mensagens...</div>'
      el.innerHTML = await _renderWhatsappTab(state)
    } else if (state.activeTab === 'financeiro') {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Carregando financeiro...</div>'
      // WOW #7: Financeiro Completo com LTV e grafico
      if (window.ProntuarioWow) {
        el.innerHTML = await window.ProntuarioWow.renderFinanceComplete(state.patientId)
      } else {
        el.innerHTML = await _renderFinanceiroTab(state)
      }
    } else if (state.activeTab === 'quiz') {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Carregando avaliacoes...</div>'
      el.innerHTML = await _renderQuizTab(state)
    }
  }

  function _reRenderTimeline(containerId) {
    const el = document.getElementById(`mr-timeline-${containerId}`)
    if (el) el.innerHTML = _renderTimeline(_state(containerId), containerId)
  }

  function _reRenderSummary(containerId) {
    var state = _state(containerId)
    // Use WOW header if available
    if (window.ProntuarioWow) {
      var el = document.getElementById('mr-header-' + containerId)
      if (el) el.innerHTML = window.ProntuarioWow.renderPatientHeader(state.patientId, state.patientName)
    } else {
      var el = document.getElementById('mr-summary-' + containerId)
      if (el) el.innerHTML = _renderSummary(state)
    }
  }

  // ── Ações públicas ────────────────────────────────────────────

  async function _loadRecords(containerId, append = false) {
    const state = _state(containerId)
    const svc = window.MedicalRecordsService
    if (!svc) return

    state.loading = true
    _reRenderTimeline(containerId)

    const result = await svc.listForPatient(state.patientId, {
      limit:      PAGE_SIZE,
      offset:     state.offset,
      typeFilter: state.typeFilter,
    })

    state.loading = false
    state.total   = result.total
    state.hasMore = result.has_more

    if (append) {
      state.records = [...state.records, ...result.records]
    } else {
      state.records = result.records
    }

    _reRenderTimeline(containerId)
  }

  async function _loadSummary(containerId) {
    const state = _state(containerId)
    const svc = window.MedicalRecordsService
    if (!svc) return
    state.summary = await svc.getPatientSummary(state.patientId)
    _reRenderSummary(containerId)
  }

  async function _saveNew(containerId) {
    const svc = window.MedicalRecordsService
    const state = _state(containerId)
    const errEl = document.getElementById(`mr-new-error-${containerId}`)
    if (errEl) errEl.style.display = 'none'

    const type    = document.getElementById(`mr-new-type-${containerId}`)?.value || 'nota_clinica'
    const title   = document.getElementById(`mr-new-title-${containerId}`)?.value.trim() || ''
    const content = document.getElementById(`mr-new-content-${containerId}`)?.value.trim() || ''
    const conf    = document.getElementById(`mr-new-confidential-${containerId}`)?.checked || false

    if (!content) {
      if (errEl) { errEl.textContent = 'O conteúdo não pode estar vazio.'; errEl.style.display = 'inline' }
      return
    }

    const btn = document.querySelector(`#mr-new-form-${containerId} button[onclick*="_saveNew"]`)
    if (btn) { btn.disabled = true; btn.style.opacity = '.5' }

    const result = await svc.create({
      patientId:      state.patientId,
      recordType:     type,
      title,
      content,
      isConfidential: conf,
    })

    if (btn) { btn.disabled = false; btn.style.opacity = '1' }

    if (!result.ok) {
      if (errEl) { errEl.textContent = result.error || 'Erro ao salvar.'; errEl.style.display = 'inline' }
      return
    }

    // Limpa form
    const contentEl = document.getElementById(`mr-new-content-${containerId}`)
    const titleEl   = document.getElementById(`mr-new-title-${containerId}`)
    const confEl    = document.getElementById(`mr-new-confidential-${containerId}`)
    if (contentEl) contentEl.value = ''
    if (titleEl)   titleEl.value   = ''
    if (confEl)    confEl.checked  = false

    // Recarrega lista e summary
    state.offset  = 0
    state.records = []
    await _loadRecords(containerId)
    await _loadSummary(containerId)
  }

  function _setFilter(containerId, typeFilter) {
    const state = _state(containerId)
    state.typeFilter = typeFilter
    state.offset     = 0
    state.records    = []
    _loadRecords(containerId)
    // Re-render filtro para refletir seleção ativa
    const filterEl = document.querySelector(`#mr-root-${containerId} > div:nth-child(3)`)
    if (filterEl) filterEl.outerHTML = _renderTypeFilter(state, containerId)
  }

  async function _loadMore(containerId) {
    const state = _state(containerId)
    state.offset += PAGE_SIZE
    await _loadRecords(containerId, true)
  }

  function _startEdit(containerId, recordId) {
    const state = _state(containerId)
    state.editingId = recordId
    _reRenderTimeline(containerId)
  }

  function _cancelEdit(containerId) {
    const state = _state(containerId)
    state.editingId = null
    _reRenderTimeline(containerId)
  }

  async function _saveEdit(containerId, recordId) {
    const svc   = window.MedicalRecordsService
    const state = _state(containerId)
    const rec   = state.records.find(r => r.id === recordId)
    if (!rec) return

    const type    = document.getElementById(`mr-edit-type-${recordId}`)?.value || rec.record_type
    const title   = document.getElementById(`mr-edit-title-${recordId}`)?.value.trim() || ''
    const content = document.getElementById(`mr-edit-content-${recordId}`)?.value.trim() || ''
    const conf    = document.getElementById(`mr-edit-confidential-${recordId}`)?.checked ?? rec.is_confidential

    const result = await svc.update(recordId, rec, {
      title,
      content,
      recordType:     type,
      isConfidential: conf,
    })

    if (!result.ok) {
      _toastErr(result.error || 'Erro ao editar registro.')
      return
    }

    state.editingId = null
    state.offset    = 0
    state.records   = []
    await _loadRecords(containerId)
    await _loadSummary(containerId)
  }

  async function _confirmDelete(containerId, recordId) {
    if (!confirm('Remover este registro do prontuário? O histórico clínico será preservado (soft delete).')) return

    const svc   = window.MedicalRecordsService
    const state = _state(containerId)
    const rec   = state.records.find(r => r.id === recordId)
    if (!rec) return

    const result = await svc.remove(recordId, rec)
    if (!result.ok) {
      _toastErr(result.error || 'Erro ao remover registro.')
      return
    }

    state.offset  = 0
    state.records = []
    await _loadRecords(containerId)
    await _loadSummary(containerId)
  }

  // ── API Pública ───────────────────────────────────────────────

  /**
   * Monta o editor de prontuário dentro de um container HTML.
   * @param {string} containerId   — id do elemento HTML raiz
   * @param {object} opts
   * @param {string} opts.patientId
   * @param {string} opts.patientName
   */
  async function mount(containerId, { patientId, patientName = '' } = {}) {
    const state = _state(containerId)
    state.patientId   = patientId
    state.patientName = patientName
    state.records     = []
    state.offset      = 0
    state.editingId   = null
    state.typeFilter  = null

    _render(containerId)
    await Promise.all([
      _loadSummary(containerId),
      _loadRecords(containerId),
    ])
  }

  /**
   * Limpa o container e libera o estado da instância.
   */
  function unmount(containerId) {
    const container = document.getElementById(containerId)
    if (container) container.innerHTML = ''
    delete _instances[containerId]
  }

  // ── Exposição global ──────────────────────────────────────────
  function _switchTab(containerId, tabId) {
    var state = _state(containerId)
    state.activeTab = tabId
    // Re-render tabs
    var root = document.getElementById('mr-root-' + containerId)
    if (root) {
      var tabsEl = root.querySelector('[data-tab]')?.parentElement
      if (tabsEl) tabsEl.outerHTML = _renderTabs(state, containerId)
    }
    _renderTabContent(containerId)
  }

  function _applyTemplate(containerId, idx) {
    var tmpl = RECORD_TEMPLATES[idx]
    if (!tmpl) return
    var typeEl = document.getElementById('mr-new-type-' + containerId)
    var titleEl = document.getElementById('mr-new-title-' + containerId)
    var contentEl = document.getElementById('mr-new-content-' + containerId)
    if (typeEl) typeEl.value = tmpl.type
    if (titleEl) titleEl.value = tmpl.title
    if (contentEl) { contentEl.value = tmpl.content; contentEl.focus() }
  }

  var _searchTimer = null
  function _onSearchRecords(containerId, query) {
    clearTimeout(_searchTimer)
    _searchTimer = setTimeout(async function () {
      var state = _state(containerId)
      var q = (query || '').trim()
      if (!q) {
        _reRenderTimeline(containerId)
        return
      }
      var el = document.getElementById('mr-timeline-' + containerId)
      if (!el) return

      // Busca server-side se disponivel
      var repo = window.MedicalRecordsRepository
      if (repo && repo.search && q.length >= 2) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Buscando...</div>'
        var result = await repo.search(state.patientId, q, 30)
        if (result.ok && result.data) {
          var tempState = Object.assign({}, state, { records: result.data.records || [], hasMore: false })
          el.innerHTML = _renderTimeline(tempState, containerId)
          return
        }
      }

      // Fallback: filtrar em memoria
      var filtered = state.records.filter(function (r) {
        var lq = q.toLowerCase()
        return (r.content || '').toLowerCase().includes(lq)
          || (r.title || '').toLowerCase().includes(lq)
          || (r.professional_name || '').toLowerCase().includes(lq)
      })
      var tempState = Object.assign({}, state, { records: filtered, hasMore: false })
      el.innerHTML = _renderTimeline(tempState, containerId)
    }, 400)
  }

  // ── Attachment upload handler ────────────────────────────────
  async function _handleAttachmentUpload(patientId, files) {
    if (!files || !files.length) return
    var sb = window._sbShared
    if (!sb) { _toastErr('Supabase indisponivel'); return }

    var listEl = document.getElementById('mr-attachments-list')
    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:12px;font-size:12px;color:var(--text-muted)">Enviando ' + files.length + ' arquivo(s)...</div>'

    var uploaded = 0
    for (var i = 0; i < files.length; i++) {
      var file = files[i]
      var ext = file.name.split('.').pop().toLowerCase()
      var path = 'prontuario/' + patientId + '/' + Date.now() + '_' + i + '.' + ext

      var uploadRes = await sb.storage.from('attachments').upload(path, file, { upsert: false })
      if (uploadRes.error) {
        _toastErr('Erro upload ' + file.name + ': ' + uploadRes.error.message)
        continue
      }

      // Salvar referencia na tabela
      var urlRes = sb.storage.from('attachments').getPublicUrl(path)
      var publicUrl = urlRes.data ? urlRes.data.publicUrl : ''

      await sb.from('medical_record_attachments').insert({
        clinic_id: (JSON.parse(localStorage.getItem('clinicai_session') || '{}')).clinic_id || null,
        patient_id: patientId,
        file_name: file.name,
        file_path: path,
        file_url: publicUrl,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
      })
      uploaded++
    }

    if (uploaded) _toastOk(uploaded + ' arquivo(s) enviado(s)')
    _loadAttachments(patientId)
  }

  async function _loadAttachments(patientId) {
    var listEl = document.getElementById('mr-attachments-list')
    if (!listEl) return
    var sb = window._sbShared
    if (!sb) {
      listEl.innerHTML = '<div style="text-align:center;padding:12px;font-size:12px;color:var(--text-muted)">Sem conexao</div>'
      return
    }

    var res = await sb.from('medical_record_attachments')
      .select('id,file_name,file_url,file_type,file_size,created_at')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    var files = res.data || []
    if (!files.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:12px;font-size:12px;color:var(--text-muted)">Nenhum anexo. Use o botao Upload acima.</div>'
      return
    }

    listEl.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px">' + files.map(function (f) {
      var isImg = (f.file_type || '').startsWith('image/')
      var size = f.file_size > 1048576 ? (f.file_size / 1048576).toFixed(1) + ' MB' : (f.file_size / 1024).toFixed(0) + ' KB'
      var date = f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : ''

      if (isImg) {
        return '<div style="text-align:center;width:80px">'
          + '<a href="' + _esc(f.file_url) + '" target="_blank" style="display:block">'
          + '<img src="' + _esc(f.file_url) + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1.5px solid var(--border)" />'
          + '</a>'
          + '<div style="font-size:9px;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + _esc(f.file_name) + '">' + _esc(f.file_name) + '</div>'
          + '<div style="font-size:8px;color:var(--text-muted)">' + size + ' · ' + date + '</div>'
          + '</div>'
      }
      return '<a href="' + _esc(f.file_url) + '" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:8px;text-decoration:none;min-width:180px">'
        + '<svg width="16" height="16" fill="none" stroke="var(--text-muted)" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:11px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(f.file_name) + '</div>'
        + '<div style="font-size:9px;color:var(--text-muted)">' + size + ' · ' + date + '</div>'
        + '</div></a>'
    }).join('') + '</div>'
  }

  window.MedicalRecordEditorUI = {
    mount,
    unmount,
    _saveNew,
    _setFilter,
    _loadMore,
    _startEdit,
    _cancelEdit,
    _saveEdit,
    _confirmDelete,
    _switchTab,
    _applyTemplate,
    _onSearchRecords,
    _showRequestDocModal,
    _requestDoc,
    _handleAttachmentUpload,
    _loadAttachments,
  }

})()
