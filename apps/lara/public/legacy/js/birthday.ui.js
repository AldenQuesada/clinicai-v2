/**
 * ClinicAI — Birthday UI (main)
 *
 * State management, render orchestration, dashboard + upcoming list.
 * Delega templates para birthday-templates.ui.js e events para birthday-events.ui.js.
 *
 * Depende de: BirthdayService, BirthdayTemplatesUI, BirthdayEvents
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayUILoaded) return
  window._clinicaiBirthdayUILoaded = true

  // ── Helpers ────────────────────────────────────────────────
  function _esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }
  function _ico(name, size) {
    if (typeof feather !== 'undefined' && feather.icons && feather.icons[name])
      return feather.icons[name].toSvg({ width: size || 16, height: size || 16, 'stroke-width': 1.8 })
    return ''
  }

  // ── State ──────────────────────────────────────────────────
  var _tab = 'dashboard'
  var _segFilter = null
  var _loading = false
  var _selectedCampaign = null
  var _vipOnly = false
  var _ltvByPatient = {}  // patient_id -> rfm_class + monetary

  function getState() {
    return { tab: _tab, segFilter: _segFilter, loading: _loading, selectedCampaign: _selectedCampaign }
  }
  function setState(key, val) {
    if (key === 'tab') _tab = val
    if (key === 'segFilter') _segFilter = val
    if (key === 'loading') _loading = val
    if (key === 'selectedCampaign') _selectedCampaign = val
  }

  // ── Carrega LTV/RFM dos pacientes (cache local) ────────────
  async function _loadLtv() {
    if (!window.CashflowService || !window.CashflowService.getPatientsLtv) return
    try {
      var res = await window.CashflowService.getPatientsLtv(500, false)
      if (!res || !res.ok) return
      var data = res.data || {}
      var pats = data.patients || []
      _ltvByPatient = {}
      pats.forEach(function(p) {
        if (p.patient_id) {
          _ltvByPatient[p.patient_id] = {
            rfm_class: p.rfm_class,
            monetary:  p.monetary,
            recency_days: p.recency_days,
          }
        }
      })
      render()  // re-render com badges
    } catch (e) { console.warn('[BirthdayUI] _loadLtv:', e) }
  }

  function setVipFilter(enabled) {
    _vipOnly = !!enabled
    render()
  }

  function _isVip(patientId) {
    var l = _ltvByPatient[patientId]
    return l && (l.rfm_class === 'vip' || l.rfm_class === 'em_risco')
  }

  // ── Main render ────────────────────────────────────────────
  function render() {
    var root = document.getElementById('birthday-root')
    if (!root) return
    var svc = window.BirthdayService
    if (!svc) return

    var html = '<div class="bday-module">'

    // Header
    html += '<div class="bday-header">'
    html += '<div class="bday-title">' + _ico('gift', 22) + ' <span>Aniversarios</span></div>'
    html += '<div class="bday-tabs">'
    html += _tabBtn('dashboard', 'bar-chart-2', 'Painel')
    html += _tabBtn('timeline', 'git-branch', 'Timeline')
    html += _tabBtn('campaigns', 'users', 'Campanhas')
    html += _tabBtn('rules', 'book-open', 'Regras')
    html += '</div>'
    var paused = window.BirthdayService.isPaused()
    if (paused) {
      html += '<button class="bday-pause-btn bday-pause-active" id="bdayResumeBtn">' + _ico('play', 14) + ' Retomar todas</button>'
    } else {
      html += '<button class="bday-pause-btn" id="bdayPauseBtn">' + _ico('pause', 14) + ' Pausar todas</button>'
    }
    html += '<button class="bday-scan-btn" id="bdayScanBtn">' + _ico('refresh-cw', 14) + ' Escanear</button>'
    html += '</div>'

    if (_loading) {
      html += '<div class="bday-loading">' + _ico('loader', 18) + ' Carregando...</div></div>'
      root.innerHTML = html
      if (window.BirthdayEvents) window.BirthdayEvents.attach()
      return
    }

    if (_tab === 'dashboard') html += _renderDashboard()
    else if (_tab === 'timeline') html += window.BirthdayTemplatesUI ? window.BirthdayTemplatesUI.render() : ''
    else if (_tab === 'campaigns') html += _renderCampaigns()
    else if (_tab === 'rules') html += _renderRules()

    html += '</div>'
    root.innerHTML = html
    if (window.BirthdayEvents) window.BirthdayEvents.attach()
  }

  function _tabBtn(key, icon, label) {
    return '<button class="bday-tab' + (_tab === key ? ' active' : '') + '" data-tab="' + key + '">' + _ico(icon, 14) + ' ' + label + '</button>'
  }

  // ── Dashboard ──────────────────────────────────────────────
  function _renderDashboard() {
    var s = window.BirthdayService.getStats()
    var upcoming = window.BirthdayService.getUpcoming()
    var html = ''

    // KPIs
    html += '<div class="bday-kpis">'
    html += _kpi(s.upcoming_30d || 0, 'Prox. 30 dias', '#2563EB', 'calendar')
    html += _kpi(s.total_campaigns || 0, 'Campanhas', '#10B981', 'send')
    html += _kpi(s.sending || 0, 'Enviando', '#F59E0B', 'loader')
    html += _kpi(s.responded || 0, 'Responderam', '#8B5CF6', 'message-circle')
    html += _kpi((s.response_rate || 0) + '%', 'Taxa resp.', '#C9A96E', 'trending-up')
    html += _kpi(s.with_open_budget || 0, 'Orc. aberto', '#EF4444', 'alert-circle')
    html += '</div>'

    // Segment breakdown
    html += '<div class="bday-segments">'
    html += _segCard(s.segment_paciente || 0, 'Paciente', '#10B981')
    html += _segCard(s.segment_paciente_orcamento || 0, 'Paciente + Orc.', '#F59E0B')
    html += _segCard(s.segment_orcamento || 0, 'Orcamento', '#2563EB')
    html += '</div>'

    // Filtro VIP (LTV) — keia por patient_id explicito.
    // A RPC wa_birthday_upcoming (migration 20260700000420) resolve patient_id via
    // leads.patient_id OU via phone right(8). Se patient_id ausente, lead nunca foi
    // paciente — nao tem LTV historico (feedback_paciente_definition).
    var vipCount = upcoming.filter(function(u) { return u.patient_id && _isVip(u.patient_id) }).length
    html += '<div style="display:flex;align-items:center;gap:10px;margin:14px 0;padding:10px 14px;background:' + (_vipOnly ? '#fffbeb' : '#f9fafb') + ';border:1px solid ' + (_vipOnly ? '#fde68a' : '#e5e7eb') + ';border-radius:10px">'
    html += '<input type="checkbox" id="bdayVipOnly" ' + (_vipOnly ? 'checked' : '') + ' style="width:16px;height:16px;cursor:pointer;accent-color:#f59e0b">'
    html += '<label for="bdayVipOnly" style="cursor:pointer;font-size:12px;font-weight:600;color:#374151">Apenas VIPs / Em Risco (LTV)</label>'
    html += '<span style="font-size:11px;color:#9ca3af">' + vipCount + ' de ' + upcoming.length + ' aniversariantes sao VIP</span>'
    html += '<span style="margin-left:auto;font-size:10px;color:#9ca3af">Foco em quem ja gerou receita historicamente</span>'
    html += '</div>'

    // Filtra upcoming se VIP-only
    var filtered = _vipOnly
      ? upcoming.filter(function(u) { return u.patient_id && _isVip(u.patient_id) })
      : upcoming

    // Upcoming list
    html += '<div class="bday-section-title">' + _ico('calendar', 16) + ' Proximos aniversarios</div>'
    html += '<div class="bday-upcoming-list">'

    if (!filtered.length) {
      if (_vipOnly && upcoming.length > 0) {
        html += '<div class="bday-empty">Nenhum aniversariante VIP no periodo. Desmarque o filtro pra ver todos.</div>'
      } else {
        html += '<div class="bday-empty">Nenhum aniversario nos proximos 60 dias</div>'
      }
    } else {
      filtered.forEach(function (u) {
        html += _renderUpcomingCard(u)
      })
    }
    html += '</div>'
    return html
  }

  function _kpi(val, label, color, icon) {
    return '<div class="bday-kpi">'
      + '<div class="bday-kpi-icon" style="background:' + color + '15;color:' + color + '">' + _ico(icon, 16) + '</div>'
      + '<span class="bday-kpi-val" style="color:' + color + '">' + val + '</span>'
      + '<span class="bday-kpi-lbl">' + label + '</span></div>'
  }

  function _segCard(val, label, color) {
    return '<div class="bday-seg-card" style="border-top:3px solid ' + color + '">'
      + '<span class="bday-seg-val">' + val + '</span>'
      + '<span class="bday-seg-lbl">' + label + '</span></div>'
  }

  function _renderUpcomingCard(u) {
    var bd = u.birth_date ? new Date(u.birth_date + 'T12:00:00') : null
    var dayLabel = bd ? (bd.getDate().toString().padStart(2, '0') + '/' + (bd.getMonth() + 1).toString().padStart(2, '0')) : '-'
    var urgency = u.days_until <= 3 ? 'bday-critical' : u.days_until <= 7 ? 'bday-urgent' : u.days_until <= 14 ? 'bday-soon' : ''

    var html = '<div class="bday-up-card ' + urgency + '">'
    html += '<div class="bday-up-avatar">' + _esc((u.name || '?')[0].toUpperCase()) + '</div>'
    html += '<div class="bday-up-info">'
    html += '<span class="bday-up-name">' + _esc(u.name) + '</span>'
    html += '<span class="bday-up-detail">' + dayLabel + ' &middot; ' + (u.age_turning || '?') + ' anos</span>'
    html += '</div>'

    html += '<div class="bday-up-tags">'
    if (u.has_open_budget) {
      var fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      var totalStr = fmtBRL.format(Number(u.budget_total || 0))
      html += '<span class="bday-tag bday-tag-budget">' + _ico('file-text', 11) + ' Orc. ' + _esc(totalStr) + '</span>'
    }
    html += '</div>'

    html += '<div class="bday-up-countdown">'
    html += '<span class="bday-up-days-num">' + u.days_until + '</span>'
    html += '<span class="bday-up-days-label">dias</span>'
    html += '</div>'

    html += '<div class="bday-up-status">'
    if (u.has_campaign) {
      html += '<span class="bday-badge bday-badge-ok">' + _ico('check', 12) + '</span>'
    } else {
      html += '<span class="bday-badge bday-badge-wait">' + _ico('clock', 12) + '</span>'
    }
    html += '</div>'
    html += '</div>'
    return html
  }

  // ── Campaigns ──────────────────────────────────────────────
  function _renderCampaigns() {
    var campaigns = _segFilter
      ? window.BirthdayService.getCampaignsBySegment(_segFilter)
      : window.BirthdayService.getCampaigns()
    var html = ''

    // Filters + actions
    html += '<div class="bday-camp-topbar">'
    html += '<div class="bday-camp-filters">'
    html += _filterBtn('', 'Todos')
    html += _filterBtn('paciente', 'Paciente')
    html += _filterBtn('paciente_orcamento', 'Paciente + Orc.')
    html += _filterBtn('orcamento', 'Orcamento')
    html += '</div>'
    html += '<button class="bday-rules-btn" id="bdayAutoExclude">' + _ico('shield', 13) + ' Aplicar regras</button>'
    html += '</div>'

    // Stats bar
    var s = window.BirthdayService.getStats()
    if (s.excluded > 0) {
      html += '<div class="bday-excluded-bar">' + _ico('alert-triangle', 13) + ' '
        + s.excluded + ' lead' + (s.excluded > 1 ? 's' : '') + ' exclu\u00eddo' + (s.excluded > 1 ? 's' : '')
        + ' (' + (s.excluded_auto || 0) + ' auto, ' + (s.excluded_manual || 0) + ' manual)</div>'
    }

    html += '<div class="bday-camp-list">'
    if (!campaigns.length) {
      html += '<div class="bday-empty">Nenhuma campanha' + (_segFilter ? ' neste segmento' : '') + '</div>'
    } else {
      campaigns.forEach(function (c) {
        html += _renderCampaignCard(c)
      })
    }
    html += '</div>'
    return html
  }

  function _filterBtn(seg, label) {
    var active = (_segFilter || '') === seg
    return '<button class="bday-seg-filter' + (active ? ' active' : '') + '" data-seg="' + seg + '">' + label + '</button>'
  }

  function _renderCampaignCard(c) {
    var statusMap = { pending: 'Pendente', sending: 'Enviando', paused: 'Pausada', completed: 'Concluida', responded: 'Respondeu', cancelled: 'Cancelada' }
    var segMap = { paciente: 'Paciente', orcamento: 'Orcamento', paciente_orcamento: 'Pac + Orc' }
    var bd = c.birth_date ? new Date(c.birth_date + 'T12:00:00') : null
    var dayLabel = bd ? (bd.getDate().toString().padStart(2, '0') + '/' + (bd.getMonth() + 1).toString().padStart(2, '0')) : '-'
    var progress = c.total_messages > 0 ? Math.round((c.sent_messages / c.total_messages) * 100) : 0

    var isExcluded = c.is_excluded === true
    var reasonMap = {
      open_budget: 'Or\u00e7amento em aberto',
      recent_procedure: 'Procedimento recente',
      upcoming_appointment: 'Agendamento pr\u00f3ximo',
      human_channel: 'Atendimento humano',
      no_opt_in: 'WhatsApp desativado',
      no_phone: 'Sem telefone',
      manual: 'Desativado manualmente'
    }

    var html = '<div class="bday-camp-card' + (isExcluded ? ' bday-camp-excluded' : '') + '">'

    // Toggle switch
    html += '<label class="bday-switch"><input type="checkbox" ' + (!isExcluded ? 'checked' : '') + ' data-toggle-lead="' + c.id + '"><span class="bday-slider"></span></label>'

    // Avatar + info
    html += '<div class="bday-camp-avatar">' + _esc((c.lead_name || '?')[0].toUpperCase()) + '</div>'
    html += '<div class="bday-camp-info">'
    html += '<span class="bday-camp-name">' + _esc(c.lead_name) + '</span>'
    html += '<span class="bday-camp-meta">' + dayLabel + ' &middot; ' + (c.age_turning || '?') + 'a &middot; ' + (segMap[c.segment] || c.segment) + '</span>'
    if (c.queixas && c.queixas !== 'aquelas coisinhas') {
      html += '<span class="bday-camp-queixas">' + _ico('clipboard', 10) + ' ' + _esc(c.queixas).substring(0, 50) + '</span>'
    }
    if (isExcluded && c.exclude_reason) {
      html += '<span class="bday-camp-reason">' + _ico('alert-triangle', 10) + ' ' + (reasonMap[c.exclude_reason] || c.exclude_reason)
        + (c.excluded_by === 'auto' ? ' (auto)' : '') + '</span>'
    }
    html += '</div>'

    // Progress
    html += '<div class="bday-camp-progress">'
    html += '<div class="bday-progress-bar"><div class="bday-progress-fill" style="width:' + progress + '%"></div></div>'
    html += '<span class="bday-progress-label">' + (c.sent_messages || 0) + '/' + (c.total_messages || 0) + '</span>'
    html += '</div>'

    // Right: budget alert + status
    html += '<div class="bday-camp-end">'
    if (c.has_open_budget) {
      html += '<span class="bday-tag bday-tag-budget">' + _ico('alert-circle', 11) + ' R$ ' + (c.budget_total || 0) + '</span>'
    }
    html += '<span class="bday-camp-status bday-st-' + c.status + '">' + (statusMap[c.status] || c.status) + '</span>'
    html += '</div>'

    html += '</div>'
    return html
  }

  // ── Rules ──────────────────────────────────────────────────
  function _renderRules() {
    var html = ''

    // Fluxo mensal
    html += '<div class="bday-rules-section">'
    html += '<div class="bday-rules-title">' + _ico('git-branch', 18) + ' Fluxo mensal</div>'
    html += '<div class="bday-rules-steps">'
    html += _ruleStep(1, 'scanner', 'Scanner di\u00e1rio', 'Cron roda \u00e0s 7h, cria campanhas para aniversariantes nos pr\u00f3ximos 31 dias.')
    html += _ruleStep(2, 'shield', 'Auto-exclus\u00e3o', 'Regras inteligentes excluem leads com or\u00e7amento aberto, procedimento recente, agendamento ou atendimento ativo.')
    html += _ruleStep(3, 'user-check', 'Revis\u00e3o manual', 'Secret\u00e1ria revisa o painel na aba Campanhas: ativa/desativa leads individuais.')
    html += _ruleStep(4, 'send', 'Envio autom\u00e1tico', 'Mensagens D-30, D-29, D-28 s\u00e3o enviadas via WhatsApp nos hor\u00e1rios configurados.')
    html += _ruleStep(5, 'check-circle', 'Guards mid-sequence', 'Antes de cada mensagem, verifica se o lead j\u00e1 engajou. Se sim, cancela as restantes.')
    html += '</div></div>'

    // Regras de auto-exclusao
    html += '<div class="bday-rules-section">'
    html += '<div class="bday-rules-title">' + _ico('shield', 18) + ' Regras de auto-exclus\u00e3o</div>'
    html += '<div class="bday-rules-table"><table>'
    html += '<thead><tr><th>Regra</th><th>Condi\u00e7\u00e3o</th><th>A\u00e7\u00e3o</th><th>Override?</th></tr></thead><tbody>'
    html += _ruleRow('Or\u00e7amento em aberto', 'Lead tem or\u00e7amento com status pendente/rascunho', 'OFF autom\u00e1tico', 'Sim')
    html += _ruleRow('Procedimento recente', 'Fez procedimento nos \u00faltimos 30 dias', 'OFF autom\u00e1tico', 'Sim')
    html += _ruleRow('Agendamento pr\u00f3ximo', 'Tem consulta agendada nos pr\u00f3ximos 7 dias', 'OFF autom\u00e1tico', 'Sim')
    html += _ruleRow('Atendimento ativo', 'Canal mudou de WhatsApp (presencial/telefone/email)', 'OFF autom\u00e1tico', 'Sim')
    html += _ruleRow('WhatsApp desativado', 'Lead com wa_opt_in = false', 'OFF bloqueado', 'N\u00e3o')
    html += _ruleRow('Sem telefone', 'Lead sem n\u00famero de telefone cadastrado', 'OFF bloqueado', 'N\u00e3o')
    html += '</tbody></table></div></div>'

    // Guards mid-sequence
    html += '<div class="bday-rules-section">'
    html += '<div class="bday-rules-title">' + _ico('alert-triangle', 18) + ' Guards mid-sequence</div>'
    html += '<p class="bday-rules-desc">Verificados <strong>antes de cada mensagem</strong> ser enviada. Se qualquer guard dispara, as mensagens restantes s\u00e3o canceladas automaticamente.</p>'
    html += '<div class="bday-rules-guards">'
    html += _guardCard('message-circle', 'Lead respondeu', 'Se o lead enviou qualquer mensagem no WhatsApp ap\u00f3s o in\u00edcio da campanha, a sequ\u00eancia para. Status: respondeu.', '#8B5CF6')
    html += _guardCard('file-text', 'Or\u00e7amento criado', 'Se a secret\u00e1ria criou um or\u00e7amento para o lead ap\u00f3s o in\u00edcio da campanha. Status: cancelada.', '#F59E0B')
    html += _guardCard('phone', 'Canal mudou', 'Se o lead passou a ser atendido por telefone, presencial ou email. Status: cancelada.', '#EF4444')
    html += '</div></div>'

    // Segmentos
    html += '<div class="bday-rules-section">'
    html += '<div class="bday-rules-title">' + _ico('layers', 18) + ' Segmentos</div>'
    html += '<div class="bday-rules-segs">'
    html += _segInfo('Paciente', 'Lead na fase paciente, sem or\u00e7amento aberto', '#10B981')
    html += _segInfo('Or\u00e7amento', 'Lead com or\u00e7amento pendente/rascunho', '#2563EB')
    html += _segInfo('Paciente + Or\u00e7amento', 'Paciente que tamb\u00e9m tem or\u00e7amento aberto', '#F59E0B')
    html += '</div></div>'

    // Templates
    html += '<div class="bday-rules-section">'
    html += '<div class="bday-rules-title">' + _ico('edit-3', 18) + ' Sequ\u00eancia de mensagens (edit\u00e1vel na aba Timeline)</div>'
    html += '<div class="bday-rules-timeline">'
    html += _tmplInfo('D-30', 'Oportunidade', '10h', 'Primeiro contato, apresenta a oferta de anivers\u00e1rio com link da p\u00e1gina interativa.')
    html += _tmplInfo('D-29', 'Lembrete', '10h', 'Urg\u00eancia: "s\u00f3 at\u00e9 amanh\u00e3". Refor\u00e7a as 3 op\u00e7\u00f5es.')
    html += _tmplInfo('D-28', '\u00daltima chance', '10h', 'Scarcity: "\u00faltimo dia, volta pro valor normal".')
    html += '</div>'
    html += '<p class="bday-rules-note">' + _ico('info', 13) + ' Voc\u00ea pode adicionar mais mensagens, mudar o D+ e a hora na aba Timeline.</p>'
    html += '</div>'

    // Variaveis
    html += '<div class="bday-rules-section">'
    html += '<div class="bday-rules-title">' + _ico('code', 18) + ' Vari\u00e1veis dispon\u00edveis nas mensagens</div>'
    html += '<div class="bday-rules-vars">'
    html += _varInfo('[nome]', 'Primeiro nome do lead')
    html += _varInfo('[queixas]', 'Queixas faciais/corporais do lead (do quiz)')
    html += _varInfo('[idade]', 'Idade que o lead vai fazer')
    html += _varInfo('[orcamento]', 'T\u00edtulo e valor do or\u00e7amento aberto')
    html += '</div></div>'

    // Landing page
    html += '<div class="bday-rules-section">'
    html += '<div class="bday-rules-title">' + _ico('external-link', 18) + ' P\u00e1gina interativa de presente</div>'
    html += '<p class="bday-rules-desc">Link inclu\u00eddo automaticamente nas mensagens:</p>'
    html += '<a class="bday-rules-link" href="https://painel.miriandpaula.com.br/aniversario.html" target="_blank">' + _ico('gift', 14) + ' painel.miriandpaula.com.br/aniversario.html</a>'
    html += '<p class="bday-rules-desc" style="margin-top:8px">A lead escolhe: desconto, parcelamento, mais procedimentos. 3 faixas de ml (1ml, 2ml, 3ml) com pre\u00e7os, parcelas e b\u00f4nus progressivos.</p>'
    html += '</div>'

    return html
  }

  // ── Rules helpers ──────────────────────────────────────────
  function _ruleStep(num, icon, title, desc) {
    return '<div class="bday-rule-step"><div class="bday-rule-step-num">' + num + '</div><div class="bday-rule-step-icon">' + _ico(icon, 16) + '</div><div class="bday-rule-step-content"><strong>' + title + '</strong><span>' + desc + '</span></div></div>'
  }
  function _ruleRow(rule, condition, action, override) {
    return '<tr><td><strong>' + rule + '</strong></td><td>' + condition + '</td><td>' + action + '</td><td>' + override + '</td></tr>'
  }
  function _guardCard(icon, title, desc, color) {
    return '<div class="bday-guard-card" style="border-left:3px solid ' + color + '"><div class="bday-guard-icon" style="color:' + color + '">' + _ico(icon, 18) + '</div><div><strong>' + title + '</strong><p>' + desc + '</p></div></div>'
  }
  function _segInfo(name, desc, color) {
    return '<div class="bday-seg-info"><span class="bday-seg-dot" style="background:' + color + '"></span><strong>' + name + '</strong><span>' + desc + '</span></div>'
  }
  function _tmplInfo(day, label, hour, desc) {
    return '<div class="bday-tmpl-info"><span class="bday-tmpl-badge">' + day + '</span><strong>' + label + '</strong><span class="bday-tmpl-hour">' + hour + '</span><span class="bday-tmpl-desc">' + desc + '</span></div>'
  }
  function _varInfo(code, desc) {
    return '<div class="bday-var-info"><code>' + code + '</code><span>' + desc + '</span></div>'
  }

  // ── Mount ──────────────────────────────────────────────────
  var _mounted = false
  async function mount() {
    if (_mounted) return
    _mounted = true
    _loading = true
    render()
    await Promise.all([
      window.BirthdayService.loadAll(),
      window.BirthdayTemplatesUI && window.BirthdayTemplatesUI.loadShortLinks
        ? window.BirthdayTemplatesUI.loadShortLinks()
        : Promise.resolve(),
    ])
    _loading = false
    render()
  }

  function unmount() { _mounted = false }

  // Auto-mount on page visibility
  document.addEventListener('DOMContentLoaded', function () {
    // Listen for sidebar navigation
    document.addEventListener('clinicai:page-change', function (e) {
      if (e.detail === 'birthday-campaigns') mount()
    })
    // Fallback: check periodically if page is active (for navigateTo compatibility)
    var _checkInterval = setInterval(function () {
      var page = document.getElementById('page-birthday-campaigns')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(_checkInterval)
        mount()
      }
    }, 500)
    // Clear after 30s to avoid infinite polling
    setTimeout(function () { clearInterval(_checkInterval) }, 30000)
  })

  // ── Expose ─────────────────────────────────────────────────
  window.BirthdayUI = Object.freeze({
    render: render,
    mount: mount,
    unmount: unmount,
    getState: getState,
    setState: setState,
    setVipFilter: setVipFilter,
    loadLtv: _loadLtv,
    esc: _esc,
    ico: _ico,
  })

  // Carrega LTV em background apos um pequeno delay (nao bloqueia init)
  setTimeout(function() { _loadLtv() }, 1500)
})()
