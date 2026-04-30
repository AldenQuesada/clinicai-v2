/**
 * ClinicAI - Retoques Dashboard UI
 *
 * Pagina dedicada de gestao de campanhas de retoque pos-procedimento.
 * Renderiza em #retoques-dashboard-root.
 *
 * Secoes:
 *   1. KPIs (sugeridos / atrasados / agendados / realizados / taxa conversao)
 *   2. Filtros (status, periodo, profissional)
 *   3. Tabela de campanhas com acoes (vincular agendamento, marcar realizado, cancelar)
 *   4. Regras de mensageria (lista wa_agenda_automations com tag retoque_sugerido)
 *      + botao "Nova regra" que abre FAEditor com prefill
 *   5. A/B (placeholder informativo enquanto nao houver multiplos templates)
 *
 * Mount/init via window.RetoquesDashboard.init() — chamado do nav handler.
 */
;(function () {
  'use strict'

  if (window._retoquesDashboardLoaded) return
  window._retoquesDashboardLoaded = true

  var GOLD = '#C8A97E'
  var TEXT = '#F5F0E8'
  var DARK = '#0A0A0A'

  var _state = {
    rows: [],
    filter: { status: '', professionalId: '', from: '', to: '' },
    rules: [],
    loading: false,
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' })[c] }) }
  function _fmtDate(s) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('pt-BR') } catch (e) { return s } }
  function _statusLabel(s) { return (window.RetoquesConfig && window.RetoquesConfig.STATUS_LABELS[s]) || s }
  function _statusColor(s) { return (window.RetoquesConfig && window.RetoquesConfig.STATUS_COLORS[s]) || GOLD }

  function _toast(msg, type) {
    if (window.toast) return window.toast(msg, type || 'info')
    if (window.showToast) return window.showToast(msg, type || 'info')
  }

  // ── Carregamento de dados ───────────────────────────────────
  function _loadAll() {
    if (!window.RetoquesService) return Promise.resolve()
    _state.loading = true
    _render()
    return window.RetoquesService.list(_state.filter).then(function (rows) {
      _state.rows = rows
      _state.loading = false
      return _loadRules().then(function () { _render() })
    }).catch(function (e) {
      console.warn('[RetoquesDashboard] load:', e)
      _state.loading = false
      _render()
    })
  }

  function _loadRules() {
    var sb = window._sbShared
    if (!sb) { _state.rules = []; return Promise.resolve() }
    // Busca regras com trigger_type=on_tag e tag_filter contendo retoque_sugerido,
    // OU com nome/categoria sinalizando retoque (heuristica para regras manuais).
    return sb.from('wa_agenda_automations')
      .select('id, name, description, trigger_type, trigger_config, channel, is_active, content_template, sort_order')
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error || !res.data) { _state.rules = []; return }
        var tag = (window.RetoquesConfig && window.RetoquesConfig.TAG_SUGGESTED) || 'retoque_sugerido'
        _state.rules = res.data.filter(function (r) {
          var cfg = r.trigger_config || {}
          var hay = JSON.stringify(cfg).toLowerCase() + ' ' + (r.name || '').toLowerCase() + ' ' + (r.description || '').toLowerCase()
          return hay.indexOf('retoque') >= 0 || hay.indexOf(tag) >= 0
        })
      }).catch(function () { _state.rules = [] })
  }

  // ── KPIs ────────────────────────────────────────────────────
  function _calcKpis() {
    var rows = _state.rows
    var sugg = rows.filter(function (r) { return r.status === 'suggested' || r.status === 'contacted' || r.status === 'confirmed' }).length
    var overdue = rows.filter(function (r) { return r.is_overdue }).length
    var scheduled = rows.filter(function (r) { return r.status === 'scheduled' }).length
    var completed = rows.filter(function (r) { return r.status === 'completed' }).length
    var cancelled = rows.filter(function (r) { return r.status === 'cancelled' || r.status === 'missed' }).length
    var total = rows.length
    var convRate = total > 0 ? Math.round((completed / total) * 100) : 0
    return { sugg: sugg, overdue: overdue, scheduled: scheduled, completed: completed, cancelled: cancelled, total: total, convRate: convRate }
  }

  function _kpiCard(label, value, sub, color) {
    return '<div style="flex:1 1 180px;background:rgba(245,240,232,0.04);border:1px solid rgba(200,169,126,0.15);border-radius:12px;padding:16px 18px">' +
      '<div style="font-size:10px;color:rgba(200,169,126,0.6);letter-spacing:0.1em;text-transform:uppercase;font-weight:700;margin-bottom:8px">' + _esc(label) + '</div>' +
      '<div style="font-size:28px;font-weight:700;color:' + (color || TEXT) + ';font-family:Montserrat,sans-serif;line-height:1">' + _esc(value) + '</div>' +
      (sub ? '<div style="font-size:11px;color:rgba(245,240,232,0.5);margin-top:4px">' + _esc(sub) + '</div>' : '') +
    '</div>'
  }

  // ── Filtros ─────────────────────────────────────────────────
  function _renderFilters() {
    var statuses = window.RetoquesConfig ? Object.values(window.RetoquesConfig.STATUS) : []
    var f = _state.filter
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">' +
      '<select id="retDashStatus" style="padding:8px 12px;background:rgba(245,240,232,0.04);border:1px solid rgba(200,169,126,0.2);border-radius:8px;color:' + TEXT + ';font-size:12px;font-family:Montserrat,sans-serif">' +
        '<option value="">Todos os status</option>' +
        statuses.map(function (s) {
          return '<option value="' + s + '"' + (f.status === s ? ' selected' : '') + '>' + _statusLabel(s) + '</option>'
        }).join('') +
      '</select>' +
      '<input type="date" id="retDashFrom" value="' + (f.from || '') + '" placeholder="De" style="padding:8px 12px;background:rgba(245,240,232,0.04);border:1px solid rgba(200,169,126,0.2);border-radius:8px;color:' + TEXT + ';font-size:12px;font-family:Montserrat,sans-serif">' +
      '<input type="date" id="retDashTo" value="' + (f.to || '') + '" placeholder="Ate" style="padding:8px 12px;background:rgba(245,240,232,0.04);border:1px solid rgba(200,169,126,0.2);border-radius:8px;color:' + TEXT + ';font-size:12px;font-family:Montserrat,sans-serif">' +
      '<button id="retDashApply" style="padding:8px 16px;background:' + GOLD + ';color:' + DARK + ';border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:Montserrat,sans-serif">Filtrar</button>' +
      '<button id="retDashClear" style="padding:8px 12px;background:transparent;color:rgba(245,240,232,0.6);border:1px solid rgba(245,240,232,0.15);border-radius:8px;font-size:11px;cursor:pointer;font-family:Montserrat,sans-serif">Limpar</button>' +
    '</div>'
  }

  // ── Tabela de campanhas ─────────────────────────────────────
  function _renderTable() {
    if (_state.loading) return '<div style="padding:40px;text-align:center;color:rgba(200,169,126,0.5)">Carregando campanhas...</div>'
    if (!_state.rows.length) {
      return '<div style="padding:40px;text-align:center;color:rgba(200,169,126,0.4);font-family:Cormorant Garamond,serif;font-size:18px;font-style:italic">Nenhuma sugestao de retoque encontrada para os filtros atuais.</div>'
    }
    var headers = ['Paciente', 'Procedimento', 'Profissional', 'Sugerido em', 'Alvo', 'Status', 'Acoes']
    var th = headers.map(function (h) {
      return '<th style="padding:10px 12px;text-align:left;font-size:10px;color:rgba(200,169,126,0.6);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;border-bottom:1px solid rgba(200,169,126,0.15)">' + h + '</th>'
    }).join('')
    var rows = _state.rows.map(function (r) {
      var statusBg = _statusColor(r.status)
      var overdueIcon = r.is_overdue ? '<span title="Atrasado" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#EF4444;margin-right:6px;vertical-align:middle"></span>' : ''
      var daysLabel = ''
      if (r.days_until_target != null) {
        if (r.days_until_target > 0) daysLabel = '<span style="color:rgba(245,240,232,0.4);font-size:10px;margin-left:4px">(em ' + r.days_until_target + 'd)</span>'
        else if (r.days_until_target === 0) daysLabel = '<span style="color:#F59E0B;font-size:10px;margin-left:4px">(hoje)</span>'
        else daysLabel = '<span style="color:#EF4444;font-size:10px;margin-left:4px">(' + Math.abs(r.days_until_target) + 'd atras)</span>'
      }
      return '<tr style="border-bottom:1px solid rgba(200,169,126,0.06)">' +
        '<td style="padding:12px;font-size:12px;color:' + TEXT + '">' + overdueIcon + _esc(r.lead_name || r.lead_id) + '</td>' +
        '<td style="padding:12px;font-size:12px;color:rgba(245,240,232,0.75)">' + _esc(r.procedure_label) + '</td>' +
        '<td style="padding:12px;font-size:11px;color:rgba(245,240,232,0.6)">' + _esc(r.professional_name || '—') + '</td>' +
        '<td style="padding:12px;font-size:11px;color:rgba(245,240,232,0.6)">' + _fmtDate(r.suggested_at) + '</td>' +
        '<td style="padding:12px;font-size:11px;color:rgba(245,240,232,0.75)">' + _fmtDate(r.suggested_target_date) + daysLabel + '</td>' +
        '<td style="padding:12px"><span style="display:inline-block;padding:3px 10px;border-radius:4px;background:' + statusBg + '20;border:1px solid ' + statusBg + ';color:' + statusBg + ';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">' + _statusLabel(r.status) + '</span></td>' +
        '<td style="padding:12px"><div style="display:flex;gap:4px">' +
          (r.scheduled_appointment_id ? '<span style="font-size:10px;color:#10B981;padding:4px 8px;border:1px solid rgba(16,185,129,0.3);border-radius:6px">Vinculado</span>' :
            '<button data-link-id="' + r.id + '" data-lead-id="' + r.lead_id + '" style="padding:4px 10px;font-size:10px;background:transparent;border:1px solid rgba(200,169,126,0.3);border-radius:6px;color:' + GOLD + ';cursor:pointer;font-family:Montserrat,sans-serif">Vincular</button>') +
          (r.status === 'completed' || r.status === 'cancelled' || r.status === 'missed' ? '' :
            '<button data-complete-id="' + r.id + '" style="padding:4px 10px;font-size:10px;background:transparent;border:1px solid rgba(16,185,129,0.3);border-radius:6px;color:#10B981;cursor:pointer;font-family:Montserrat,sans-serif" title="Marcar como realizado">Realizado</button>' +
            '<button data-cancel-id="' + r.id + '" style="padding:4px 10px;font-size:10px;background:transparent;border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#EF4444;cursor:pointer;font-family:Montserrat,sans-serif">Cancelar</button>') +
        '</div></td>' +
      '</tr>'
    }).join('')
    return '<div style="overflow-x:auto;background:rgba(245,240,232,0.02);border:1px solid rgba(200,169,126,0.1);border-radius:12px"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' + th + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>'
  }

  // ── Regras de mensageria ────────────────────────────────────
  function _renderRules() {
    var rulesHtml = _state.rules.length ? _state.rules.map(function (r) {
      var trig = r.trigger_type || '—'
      var preview = (r.content_template || '').slice(0, 80) + ((r.content_template || '').length > 80 ? '...' : '')
      var statusBg = r.is_active ? '#10B981' : 'rgba(245,240,232,0.3)'
      return '<div style="background:rgba(245,240,232,0.03);border:1px solid rgba(200,169,126,0.1);border-radius:10px;padding:14px 16px;margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<div style="font-weight:700;color:' + TEXT + ';font-size:13px">' + _esc(r.name || 'Sem nome') + '</div>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<span style="font-size:9px;color:' + statusBg + ';padding:2px 8px;border:1px solid ' + statusBg + ';border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">' + (r.is_active ? 'Ativa' : 'Inativa') + '</span>' +
            '<button data-edit-rule="' + r.id + '" style="padding:4px 10px;font-size:10px;background:transparent;border:1px solid rgba(200,169,126,0.3);border-radius:6px;color:' + GOLD + ';cursor:pointer;font-family:Montserrat,sans-serif">Editar</button>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:10px;color:rgba(200,169,126,0.5);margin-bottom:6px">Trigger: <code>' + _esc(trig) + '</code> · Canal: ' + _esc(r.channel || '—') + '</div>' +
        (preview ? '<div style="font-size:11px;color:rgba(245,240,232,0.6);font-style:italic">' + _esc(preview) + '</div>' : '') +
      '</div>'
    }).join('') : '<div style="padding:24px;text-align:center;color:rgba(200,169,126,0.4);font-style:italic;font-size:12px">Nenhuma regra configurada para retoques. Crie a primeira para automatizar lembretes.</div>'

    return '<div style="margin-top:32px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<div>' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:22px;font-style:italic;color:' + GOLD + '">Regras de mensageria</div>' +
          '<div style="font-size:11px;color:rgba(245,240,232,0.5);margin-top:2px">Disparam automaticamente quando uma sugestao de retoque e criada (tag <code>retoque_sugerido</code>) ou em datas relativas (D-2, D+0).</div>' +
        '</div>' +
        '<button id="retDashNewRule" style="padding:10px 18px;background:' + GOLD + ';color:' + DARK + ';border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:Montserrat,sans-serif">+ Nova regra</button>' +
      '</div>' +
      rulesHtml +
    '</div>'
  }

  // ── A/B placeholder ─────────────────────────────────────────
  function _renderAB() {
    var rules = _state.rules.filter(function (r) { return r.is_active })
    var has2 = rules.length >= 2
    return '<div style="margin-top:32px;padding:20px;background:rgba(245,240,232,0.02);border:1px solid rgba(200,169,126,0.1);border-radius:12px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-style:italic;color:' + GOLD + ';margin-bottom:8px">A/B Test</div>' +
      (has2
        ? '<div style="font-size:12px;color:rgba(245,240,232,0.7);line-height:1.5">' + rules.length + ' regras ativas. O sistema rotaciona automaticamente quando ha campo <code>ab_variant_template</code> preenchido. Compare taxas de resposta no relatorio mensal.</div>'
        : '<div style="font-size:12px;color:rgba(245,240,232,0.5);line-height:1.5">A/B test fica disponivel quando houver <strong>2+ regras ativas</strong> ou um template com variante <code>ab_variant_template</code>. Crie uma regra com 2 versoes da mensagem e o sistema mede qual converte mais.</div>') +
    '</div>'
  }

  // ── Render principal ─────────────────────────────────────────
  function _render() {
    var root = document.getElementById('retoques-dashboard-root')
    if (!root) return
    var k = _calcKpis()
    root.innerHTML =
      '<div style="padding:24px 32px;color:' + TEXT + ';font-family:Montserrat,sans-serif;background:' + DARK + ';min-height:100vh">' +

        // Header
        '<div style="margin-bottom:24px">' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:32px;font-weight:300;font-style:italic;color:' + GOLD + ';letter-spacing:0.02em">Retoques pos-procedimento</div>' +
          '<div style="font-size:12px;color:rgba(245,240,232,0.55);margin-top:4px">Acompanhamento de sugestoes, agendamentos e taxa de retorno por paciente.</div>' +
        '</div>' +

        // KPIs
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">' +
          _kpiCard('Sugeridos ativos', k.sugg, 'aguardando contato/resposta', GOLD) +
          _kpiCard('Atrasados', k.overdue, 'data alvo passou sem agendar', '#EF4444') +
          _kpiCard('Agendados', k.scheduled, 'virou appointment real', '#3B82F6') +
          _kpiCard('Realizados', k.completed, 'retoque concluido', '#10B981') +
          _kpiCard('Cancelados/perdidos', k.cancelled, '', 'rgba(245,240,232,0.5)') +
          _kpiCard('Conversao', k.convRate + '%', 'realizados / total', k.convRate >= 50 ? '#10B981' : '#F59E0B') +
        '</div>' +

        // Filtros
        _renderFilters() +

        // Tabela
        _renderTable() +

        // Regras
        _renderRules() +

        // A/B
        _renderAB() +

      '</div>'

    _bind()
  }

  function _bind() {
    var root = document.getElementById('retoques-dashboard-root')
    if (!root) return
    var statusEl = root.querySelector('#retDashStatus')
    var fromEl = root.querySelector('#retDashFrom')
    var toEl = root.querySelector('#retDashTo')
    var applyBtn = root.querySelector('#retDashApply')
    var clearBtn = root.querySelector('#retDashClear')
    var newRuleBtn = root.querySelector('#retDashNewRule')

    if (applyBtn) applyBtn.addEventListener('click', function () {
      _state.filter.status = (statusEl && statusEl.value) || ''
      _state.filter.from = (fromEl && fromEl.value) || ''
      _state.filter.to = (toEl && toEl.value) || ''
      _loadAll()
    })
    if (clearBtn) clearBtn.addEventListener('click', function () {
      _state.filter = { status: '', professionalId: '', from: '', to: '' }
      _loadAll()
    })

    // Acoes nas linhas
    root.querySelectorAll('[data-link-id]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-link-id')
        var leadId = b.getAttribute('data-lead-id')
        if (window.RetoquesLinkModal) {
          window.RetoquesLinkModal.open(id, leadId, function (ok) { if (ok) _loadAll() })
        } else {
          _toast('Modal de vinculo nao carregado', 'warn')
        }
      })
    })
    root.querySelectorAll('[data-complete-id]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-complete-id')
        if (!window.RetoquesService) return
        window.RetoquesService.updateStatus(id, 'completed').then(function () {
          _toast('Marcado como realizado', 'success')
          _loadAll()
        }).catch(function (e) { _toast('Falha: ' + (e.message || ''), 'error') })
      })
    })
    root.querySelectorAll('[data-cancel-id]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Cancelar esta sugestao de retoque?')) return
        var id = b.getAttribute('data-cancel-id')
        if (!window.RetoquesService) return
        window.RetoquesService.updateStatus(id, 'cancelled').then(function () {
          _toast('Cancelado', 'success')
          _loadAll()
        }).catch(function (e) { _toast('Falha: ' + (e.message || ''), 'error') })
      })
    })

    // Editar regra (delega ao FAEditor existente)
    root.querySelectorAll('[data-edit-rule]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-edit-rule')
        if (window.FAEditor && window.FAEditor.open) {
          window.FAEditor.open(id, { onSave: function () { _loadAll() } })
        } else {
          _toast('Editor de regras nao carregado', 'warn')
        }
      })
    })

    // Nova regra (com prefill apontando para tag retoque_sugerido)
    if (newRuleBtn) newRuleBtn.addEventListener('click', function () {
      if (!window.FAEditor || !window.FAEditor.open) {
        _toast('Editor de regras nao disponivel nesta pagina', 'warn')
        return
      }
      var tag = (window.RetoquesConfig && window.RetoquesConfig.TAG_SUGGESTED) || 'retoque_sugerido'
      window.FAEditor.open(null, {
        prefill: {
          trigger_type: 'on_tag',
          trigger_config: { tag: tag, entity_type: 'paciente' },
          category: 'paciente',
        },
        onSave: function () { _loadAll() },
      })
    })
  }

  // ── API publica ─────────────────────────────────────────────
  window.RetoquesDashboard = {
    init: function () { _loadAll() },
  }

  // Auto-init: ouve evento de troca de pagina (singular: page-change) +
  // fallback via polling, padrao copiado do birthday.ui.js (nem todos os
  // navegadores disparam o evento de forma consistente).
  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('clinicai:page-change', function (e) {
      if (e.detail === 'retoques-dashboard') window.RetoquesDashboard.init()
    })
    var _check = setInterval(function () {
      var page = document.getElementById('page-retoques-dashboard')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(_check)
        window.RetoquesDashboard.init()
      }
    }, 500)
    setTimeout(function () { clearInterval(_check) }, 30000)
  })
})()
