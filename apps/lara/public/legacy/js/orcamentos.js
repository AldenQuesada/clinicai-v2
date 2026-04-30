/**
 * ClinicAI — Orcamentos Module
 * Leads com phase=orcamento. Encapsulado em IIFE.
 */
;(function () {
  'use strict'

  var _PAGE_SIZE = 50
  var _all = []
  var _sortField = 'name'
  var _sortDir = 'asc'
  var _period = ''
  var _customFrom = null
  var _customTo = null
  var _selectedIds = new Set()
  var _cacheData = null
  var _cacheTs = 0
  var _CACHE_TTL = 30000

  function _esc(s) { return (s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;') }
  function _fmtPhone(p) {
    if (!p) return ''
    var d = p.replace(/\D/g, '')
    if (d.length === 13) return '(' + d.slice(2,4) + ') ' + d.slice(4,9) + '-' + d.slice(9)
    if (d.length === 12) return '(' + d.slice(2,4) + ') ' + d.slice(4,8) + '-' + d.slice(8)
    return p
  }
  function _sortArrow(field) {
    if (_sortField !== field) return ''
    return _sortDir === 'asc' ? ' &#9650;' : ' &#9660;'
  }

  // ── Load ────────────────────────────────────────────────────
  function load() {
    var page = document.getElementById('page-orcamentos')
    if (!page) return

    // Renderizar com dados locais imediatamente
    var local = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    if (local.length) {
      _cacheData = local
      _cacheTs = Date.now()
      _render()
    }

    // Buscar dados frescos do Supabase para garantir sync
    if (window.LeadsService && LeadsService.loadAll) {
      LeadsService.loadAll().then(function(fresh) {
        if (fresh && fresh.length) {
          _cacheData = fresh
          _cacheTs = Date.now()
          _render()
        }
      }).catch(function(e) {
        console.warn('[Orcamentos] loadAll falhou, usando cache local:', e)
      })
    }
  }

  function _render() {
    var allLeads = _cacheData || (window.ClinicLeadsCache ? ClinicLeadsCache.read() : [])
    var leads = allLeads.filter(function(l) { return l.phase === 'orcamento' && l.is_active !== false })

    // Filtro nome
    var search = (document.getElementById('orcFilterNome')?.value || '').toLowerCase().trim()
    if (search) {
      leads = leads.filter(function(l) {
        var nome = (l.name || l.nome || '').toLowerCase()
        var phone = (l.phone || '').toLowerCase()
        return nome.includes(search) || phone.includes(search)
      })
    }

    // Filtro periodo
    if (_period === 'custom' && _customFrom) {
      var from = new Date(_customFrom + 'T00:00:00')
      var to = _customTo ? new Date(_customTo + 'T23:59:59') : new Date()
      leads = leads.filter(function(l) {
        var d = l.created_at || l.createdAt
        if (!d) return false
        var dt = new Date(d)
        return dt >= from && dt <= to
      })
    } else if (_period && _period !== 'custom') {
      var cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(_period))
      leads = leads.filter(function(l) {
        var d = l.created_at || l.createdAt
        return d && new Date(d) >= cutoff
      })
    }

    // Sort
    leads.sort(function(a, b) {
      var va, vb
      if (_sortField === 'name') {
        va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase()
      } else if (_sortField === 'lastContact') {
        va = a.last_contacted_at || a.created_at || ''; vb = b.last_contacted_at || b.created_at || ''
      } else {
        va = a.created_at || ''; vb = b.created_at || ''
      }
      if (va < vb) return _sortDir === 'asc' ? -1 : 1
      if (va > vb) return _sortDir === 'asc' ? 1 : -1
      return 0
    })

    _all = leads

    // KPIs — Total, Abertos, Aprovados, Taxa de Conversao
    var abertos = 0, aprovados = 0
    leads.forEach(function(l) {
      var orcs = (l.customFields || {}).orcamentos || []
      var temAprovado = orcs.some(function(o) { return o.status === 'aprovado' })
      if (temAprovado) aprovados++; else abertos++
    })
    var taxa = leads.length ? Math.round((aprovados / leads.length) * 100) : 0

    var periodoLabel = { '7': '7 dias', '30': '30 dias', '90': '90 dias', '365': '1 ano' }
    var periodoSub = _period === 'custom' && _customFrom
      ? _customFrom.split('-').reverse().join('/') + (_customTo ? ' a ' + _customTo.split('-').reverse().join('/') : '')
      : _period ? periodoLabel[_period] || _period + 'd' : 'todos'

    var kpiTotal = document.getElementById('kpiOrcTotal')
    if (kpiTotal) kpiTotal.textContent = leads.length
    var kpiTotalSub = document.getElementById('kpiOrcTotalSub')
    if (kpiTotalSub) kpiTotalSub.textContent = periodoSub

    var kpiAbertos = document.getElementById('kpiOrcAbertos')
    if (kpiAbertos) kpiAbertos.textContent = abertos
    var kpiAbertosSub = document.getElementById('kpiOrcAbertosSub')
    if (kpiAbertosSub) kpiAbertosSub.textContent = 'pendentes'

    var kpiAprovados = document.getElementById('kpiOrcAprovados')
    if (kpiAprovados) kpiAprovados.textContent = aprovados
    var kpiAprovadosSub = document.getElementById('kpiOrcAprovadosSub')
    if (kpiAprovadosSub) kpiAprovadosSub.textContent = 'fechados'

    var kpiTaxa = document.getElementById('kpiOrcTaxa')
    if (kpiTaxa) kpiTaxa.textContent = taxa + '%'
    var kpiTaxaSub = document.getElementById('kpiOrcTaxaSub')
    if (kpiTaxaSub) kpiTaxaSub.textContent = 'ticket medio'

    // Valores financeiros (inline nos cards)
    var valorTotal = 0, valorRecuperado = 0, valorAberto = 0
    leads.forEach(function(l) {
      var orcs = (l.customFields || {}).orcamentos || []
      orcs.forEach(function(o) {
        var v = parseFloat(o.valor) || 0
        valorTotal += v
        if (o.status === 'aprovado') valorRecuperado += v
        else valorAberto += v
      })
    })

    var fmtR = function(v) { return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) }
    var ticketMedio = leads.length ? Math.round(valorTotal / leads.length) : 0

    var elValTotal = document.getElementById('kpiOrcValorTotal')
    if (elValTotal) elValTotal.textContent = fmtR(valorTotal)

    var elValAb = document.getElementById('kpiOrcValorAb')
    if (elValAb) elValAb.textContent = fmtR(valorAberto)

    var elValRec = document.getElementById('kpiOrcValorRec')
    if (elValRec) elValRec.textContent = fmtR(valorRecuperado)

    var elTicket = document.getElementById('kpiOrcTicket')
    if (elTicket) elTicket.textContent = fmtR(ticketMedio)

    // Sort arrows
    var headers = { orcSortName: 'name', orcSortDate: 'date', orcSortContact: 'lastContact' }
    var labels = { name: 'Nome', date: 'Data', lastContact: 'Contato' }
    for (var hId in headers) {
      var hEl = document.getElementById(hId)
      if (hEl) hEl.innerHTML = labels[headers[hId]] + _sortArrow(headers[hId])
    }

    // Render
    var tbody = document.getElementById('orcTableBody')
    if (!tbody) return
    tbody.innerHTML = ''
    _selectedIds = new Set()

    if (!leads.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF">Nenhum orcamento encontrado</td></tr>'
      _updateLoadMore()
      return
    }

    _renderRows(leads.slice(0, _PAGE_SIZE))
    _updateLoadMore()
  }

  function _renderRows(rows) {
    var tbody = document.getElementById('orcTableBody')
    if (!tbody) return

    rows.forEach(function(l) {
      var nome = l.name || l.nome || ''
      var phone = l.phone || ''
      var waLink = phone ? 'https://wa.me/' + phone.replace(/\D/g, '') : '#'
      // Procedimentos e valor do orcamento
      var cf = l.customFields || {}
      var orcamentos = cf.orcamentos || []
      var procs = orcamentos.map(function(o) { return o.procedimento || '' }).filter(Boolean)
      var procsHtml = procs.length
        ? procs.slice(0, 2).map(function(p) { return '<span style="font-size:10px;background:#FEF3C7;border-radius:4px;padding:2px 6px;color:#92400E;white-space:nowrap">' + _esc(p) + '</span>' }).join(' ') + (procs.length > 2 ? ' <span style="font-size:10px;color:#9CA3AF">+' + (procs.length - 2) + '</span>' : '')
        : '<span style="color:#D1D5DB">—</span>'
      var valorTotal = orcamentos.reduce(function(sum, o) { return sum + (parseFloat(o.valor) || 0) }, 0)
      var valorHtml = valorTotal > 0
        ? '<span style="font-size:12px;font-weight:600;color:#059669">R$ ' + valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + '</span>'
        : '<span style="color:#D1D5DB">—</span>'

      var dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'

      var lastContact = l.last_contacted_at || l.created_at || ''
      var contactStr = lastContact ? new Date(lastContact).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'

      var phoneHtml = _fmtPhone(phone)
      if (phone) {
        phoneHtml = '<a href="' + waLink + '" target="_blank" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:4px;color:#6B7280;text-decoration:none;font-size:11px">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
          _fmtPhone(phone) + '</a>'
      }

      var checked = _selectedIds.has(l.id) ? ' checked' : ''

      var tr = document.createElement('tr')
      tr.dataset.oid = l.id
      tr.style.cssText = 'border-bottom:1px solid #F9FAFB;cursor:pointer;transition:background .1s'
      tr.onmouseenter = function() { tr.style.background = '#FAFAFA' }
      tr.onmouseleave = function() { tr.style.background = '' }
      tr.onclick = function(e) {
        if (e.target.closest('button,input,a')) return
        if (window.viewLead) viewLead(l.id)
      }

      // Botao compartilhar: so aparece se tem orcamento registrado (local ou Supabase)
      var hasBudget = orcamentos.length > 0
      var shareBtnHtml = hasBudget
        ? '<button title="Compartilhar orcamento com paciente" onclick="event.stopPropagation();typeof openShareOrcamentoModal===\'function\'&&openShareOrcamentoModal({leadId:\'' + _esc(l.id) + '\'})" style="background:none;border:1px solid #E5E7EB;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;color:#0F766E;display:inline-flex;align-items:center;gap:4px;margin-right:6px">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
            'Compartilhar' +
          '</button>'
        : ''

      tr.innerHTML =
        '<td style="padding:10px 6px 10px 14px"><input type="checkbox" class="orc-row-cb" data-id="' + _esc(l.id) + '"' + checked + ' style="width:14px;height:14px;accent-color:#F59E0B;cursor:pointer" onclick="event.stopPropagation()"></td>' +
        '<td style="padding:10px 12px"><div style="font-size:13px;font-weight:600;color:#111827">' + _esc(nome) + '</div><div style="margin-top:2px">' + phoneHtml + '</div></td>' +
        '<td style="padding:10px 12px;font-size:11px;vertical-align:middle">' + procsHtml + '</td>' +
        '<td style="padding:10px 12px;vertical-align:middle">' + valorHtml + '</td>' +
        '<td style="padding:10px 12px;font-size:12px;color:#374151;vertical-align:middle">' + dateStr + '</td>' +
        '<td style="padding:10px 12px;font-size:12px;color:#374151;vertical-align:middle">' + contactStr + '</td>' +
        '<td style="padding:10px 8px;text-align:center;vertical-align:middle;white-space:nowrap">' +
          shareBtnHtml +
          '<button onclick="event.stopPropagation();typeof viewLead===\'function\'&&viewLead(\'' + _esc(l.id) + '\')" style="background:none;border:1px solid #E5E7EB;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;color:#374151">Ver</button>' +
        '</td>'

      tbody.appendChild(tr)

      var cb = tr.querySelector('.orc-row-cb')
      if (cb) cb.addEventListener('change', function() {
        if (cb.checked) _selectedIds.add(l.id); else _selectedIds.delete(l.id)
      })
    })
  }

  function _updateLoadMore() {
    var btn = document.getElementById('orcLoadMore')
    if (!btn) return
    var rendered = document.getElementById('orcTableBody')?.querySelectorAll('tr[data-oid]').length || 0
    var remaining = _all.length - rendered
    if (remaining > 0) {
      btn.textContent = 'Carregar mais ' + remaining + (remaining === 1 ? ' orcamento' : ' orcamentos')
      btn.style.display = ''
    } else {
      btn.style.display = 'none'
    }
  }

  function loadMore() {
    var rendered = document.getElementById('orcTableBody')?.querySelectorAll('tr[data-oid]').length || 0
    var next = _all.slice(rendered, rendered + _PAGE_SIZE)
    if (next.length) _renderRows(next)
    _updateLoadMore()
  }

  function sortBy(field) {
    if (_sortField === field) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'
    else { _sortField = field; _sortDir = 'asc' }
    if (_all.length) _render()
    else load()
  }

  function periodClick(btn) {
    _period = btn.dataset.period
    var bar = document.getElementById('orcPeriodBar')
    if (bar) bar.querySelectorAll('.ao-period-btn').forEach(function(b) { b.classList.remove('active') })
    btn.classList.add('active')

    // Mostrar/esconder date pickers
    var customDates = document.getElementById('orcCustomDates')
    if (customDates) customDates.style.display = _period === 'custom' ? 'flex' : 'none'

    if (_period !== 'custom') {
      _customFrom = null
      _customTo = null
      _render()
    }
  }

  function applyCustomPeriod() {
    _customFrom = document.getElementById('orcDateFrom')?.value || null
    _customTo = document.getElementById('orcDateTo')?.value || null
    if (!_customFrom) { _toastWarn('Selecione a data inicial'); return }
    _render()
  }

  function toggleAll(masterCb) {
    if (masterCb.checked) {
      _selectedIds = new Set(_all.map(function(l) { return l.id }))
    } else {
      _selectedIds = new Set()
    }
    document.querySelectorAll('.orc-row-cb').forEach(function(cb) {
      cb.checked = _selectedIds.has(cb.dataset.id)
    })
  }

  function exportCsv() {
    var data = _all.length ? _all : []
    if (!data.length) { _toastWarn('Nenhum orcamento para exportar'); return }
    var sep = ';'
    var rows = [['Nome', 'Telefone', 'Email', 'Status', 'Tags', 'Data Cadastro'].join(sep)]
    data.forEach(function(l) {
      var tags = Array.isArray(l.tags) ? l.tags.join(', ') : ''
      var dataCad = l.created_at || l.createdAt || ''
      if (dataCad) try { dataCad = new Date(dataCad).toLocaleDateString('pt-BR') } catch(e) {}
      rows.push([
        (l.name || '').replace(/;/g, ','),
        _fmtPhone(l.phone || ''),
        (l.email || '').replace(/;/g, ','),
        l.status || '',
        tags.replace(/;/g, ','),
        dataCad
      ].map(function(c) { return '"' + String(c || '').replace(/"/g, '""') + '"' }).join(sep))
    })
    var csv = rows.join('\n')
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'orcamentos_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
  }

  // ── Sparklines (mini graficos nos KPI cards) ────────────────
  var _sparkRendered = false

  function _orcSparkline(canvasId, data, color) {
    var canvas = document.getElementById(canvasId)
    if (!canvas || typeof Chart === 'undefined') return
    var ctx = canvas.getContext('2d')
    var gradient = ctx.createLinearGradient(0, 0, 0, 36)
    gradient.addColorStop(0, color.replace(')', ', 0.25)').replace('rgb', 'rgba'))
    gradient.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'))
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(function(_, i) { return i }),
        datasets: [{ data: data, borderColor: color, borderWidth: 1.8, fill: true, backgroundColor: gradient, tension: 0.4, pointRadius: 0, pointHoverRadius: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 600 }
      }
    })
  }

  function _renderOrcSparklines(leads) {
    if (_sparkRendered) return
    _sparkRendered = true

    // Distribuicao por semana (ultimos 8 semanas)
    var weeks = [0,0,0,0,0,0,0,0]
    var now = Date.now()
    leads.forEach(function(l) {
      var d = l.created_at || l.createdAt
      if (!d) return
      var age = Math.floor((now - new Date(d).getTime()) / (7 * 86400000))
      if (age >= 0 && age < 8) weeks[7 - age]++
    })

    // Aprovados por semana
    var approvedWeeks = [0,0,0,0,0,0,0,0]
    leads.forEach(function(l) {
      var orcs = (l.customFields || {}).orcamentos || []
      if (!orcs.some(function(o) { return o.status === 'aprovado' })) return
      var d = l.created_at || l.createdAt
      if (!d) return
      var age = Math.floor((now - new Date(d).getTime()) / (7 * 86400000))
      if (age >= 0 && age < 8) approvedWeeks[7 - age]++
    })

    // Taxa por semana
    var taxaWeeks = weeks.map(function(t, i) { return t ? Math.round((approvedWeeks[i] / t) * 100) : 0 })

    _orcSparkline('orcSparkTotal', weeks, 'rgb(59, 130, 246)')
    _orcSparkline('orcSparkAbertos', weeks.map(function(t, i) { return t - approvedWeeks[i] }), 'rgb(245, 158, 11)')
    _orcSparkline('orcSparkAprovados', approvedWeeks, 'rgb(16, 185, 129)')
    _orcSparkline('orcSparkTaxa', taxaWeeks, 'rgb(124, 58, 237)')
  }

  function _renderOrcTrends(leads, abertos, aprovados, taxa) {
    // Comparar ultimos 30 dias vs 30 dias anteriores
    var now = Date.now()
    var d30 = 30 * 86400000
    var recentes = 0, anteriores = 0
    leads.forEach(function(l) {
      var d = l.created_at || l.createdAt
      if (!d) return
      var age = now - new Date(d).getTime()
      if (age <= d30) recentes++
      else if (age <= d30 * 2) anteriores++
    })

    var diff = recentes - anteriores
    var pct = anteriores ? Math.round((diff / anteriores) * 100) : 0

    _setTrend('kpiOrcTotalTrend', 'kpiOrcTotalTrendVal', diff, (diff >= 0 ? '+' : '') + diff)
    _setTrend('kpiOrcAbertosTrend', 'kpiOrcAbertosTrendVal', -abertos, abertos + ' pendentes')
    _setTrend('kpiOrcAprovadosTrend', 'kpiOrcAprovadosTrendVal', aprovados, aprovados + ' fechados')
    _setTrend('kpiOrcTaxaTrend', 'kpiOrcTaxaTrendVal', taxa - 50, taxa + '%')
  }

  function _setTrend(containerId, valId, direction, text) {
    var el = document.getElementById(containerId)
    var valEl = document.getElementById(valId)
    if (!el || !valEl) return
    el.style.display = ''
    valEl.textContent = text
    el.className = 'kpi-trend ' + (direction > 0 ? 'kpi-trend-up' : direction < 0 ? 'kpi-trend-down' : 'kpi-trend-neutral')
  }

  // ── Popup Premium: Novo Orcamento ───────────────────────────
  var _norcBlock = null

  async function _norcLoadProcs() {
    if (window.ProcedimentosRepository) {
      try {
        var res = await ProcedimentosRepository.getAll(true)
        if (res.ok && Array.isArray(res.data)) {
          return res.data.map(function (p) {
            return {
              nome: p.nome,
              valor: parseFloat(p.preco) || 0,
              categoria: p.categoria || 'Procedimentos',
            }
          })
        }
      } catch (e) { /* fallback */ }
    }
    // Fallback: technologies legadas
    var techs = typeof getTechnologies === 'function' ? getTechnologies() : []
    return techs.map(function (t) { return { nome: t.nome, valor: 0, categoria: 'Tecnologias' } })
  }

  function openNewOrcamentoModal() {
    var existing = document.getElementById('novoOrcModal')
    if (existing) existing.remove()

    // Carregar leads para busca (via cache unificado)
    var allLeads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []

    var m = document.createElement('div')
    m.id = 'novoOrcModal'
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px'
    m.addEventListener('click', function(e) { if (e.target === m) m.remove() })

    m.innerHTML =
      '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:18px;width:100%;max-width:580px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.25)">' +

        // ── Header com icone ──────────────────────────────────
        '<div style="padding:22px 28px 18px;border-bottom:1px solid #F3F4F6">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
            '<div style="display:flex;align-items:center;gap:12px">' +
              '<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#F59E0B,#D97706);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(245,158,11,0.3)">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
              '</div>' +
              '<div>' +
                '<h2 style="margin:0;font-size:18px;font-weight:800;color:#111">Novo Orcamento</h2>' +
                '<p style="margin:2px 0 0;font-size:12px;color:#9CA3AF">Registre o orcamento do paciente</p>' +
              '</div>' +
            '</div>' +
            '<button onclick="document.getElementById(\'novoOrcModal\').remove()" style="width:32px;height:32px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;font-size:16px;color:#6B7280;display:flex;align-items:center;justify-content:center">x</button>' +
          '</div>' +
        '</div>' +

        // ── Corpo ─────────────────────────────────────────────
        '<div style="flex:1;overflow-y:auto;padding:20px 28px">' +

          // Secao: Paciente (verde suave)
          '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:16px;margin-bottom:16px">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
              '<div style="width:28px;height:28px;border-radius:8px;background:#DCFCE7;display:flex;align-items:center;justify-content:center">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
              '</div>' +
              '<span style="font-size:12px;font-weight:800;color:#15803D;text-transform:uppercase;letter-spacing:.04em">Paciente</span>' +
            '</div>' +
            '<div style="position:relative">' +
              '<input id="norcPaciente" type="text" placeholder="Buscar paciente por nome..." autocomplete="off" oninput="norcSearchPatient(this.value)" style="width:100%;padding:10px 14px;border:1.5px solid #BBF7D0;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;background:#fff"/>' +
              '<input id="norcPacienteId" type="hidden" value=""/>' +
              '<input id="norcPacientePhone" type="hidden" value=""/>' +
              '<div id="norcPatientDrop" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #E5E7EB;border-radius:8px;max-height:200px;overflow-y:auto;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,0.1)"></div>' +
            '</div>' +
            '<div id="norcPatientSelected" style="display:none;margin-top:8px;padding:8px 12px;background:#fff;border-radius:8px;border:1px solid #BBF7D0;display:none">' +
              '<div style="font-size:12px;font-weight:600;color:#15803D" id="norcPatientName"></div>' +
              '<div style="font-size:11px;color:#6B7280" id="norcPatientPhone"></div>' +
            '</div>' +
          '</div>' +

          // Secao: Procedimentos + Pagamentos (modulo compartilhado)
          '<div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:16px;margin-bottom:16px">' +
            '<div id="norcBlockHost"></div>' +
          '</div>' +

          // Secao: Validade (vermelho suave)
          '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px 16px;margin-bottom:16px">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#DC2626;text-transform:uppercase;letter-spacing:.04em">Validade do orçamento</div>' +
                '<div style="font-size:10px;color:#9CA3AF;margin-top:2px">Depois desta data, o orçamento expira automaticamente</div>' +
              '</div>' +
              '<input id="norcValidade" type="date" style="padding:9px 12px;border:1.5px solid #FECACA;border-radius:8px;font-size:13px;outline:none;background:#fff"/>' +
            '</div>' +
          '</div>' +

          // Secao: Observacoes (azul suave)
          '<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:16px">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
              '<div style="width:28px;height:28px;border-radius:8px;background:#DBEAFE;display:flex;align-items:center;justify-content:center">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
              '</div>' +
              '<span style="font-size:12px;font-weight:800;color:#1D4ED8;text-transform:uppercase;letter-spacing:.04em">Observacoes</span>' +
            '</div>' +
            '<textarea id="norcObs" rows="2" placeholder="Notas sobre o orcamento, objecoes do paciente..." style="width:100%;padding:9px 12px;border:1.5px solid #BFDBFE;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;resize:vertical;font-family:inherit;background:#fff"></textarea>' +
          '</div>' +

        '</div>' +

        // ── Footer ────────────────────────────────────────────
        '<div style="padding:16px 28px 22px;border-top:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center">' +
          '<button onclick="document.getElementById(\'novoOrcModal\').remove()" style="padding:10px 20px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>' +
          '<button onclick="norcSave()" style="padding:10px 24px;background:linear-gradient(135deg,#F59E0B,#D97706);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(245,158,11,0.3);display:flex;align-items:center;gap:8px">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            'Criar Orcamento' +
          '</button>' +
        '</div>' +

      '</div>'

    document.body.appendChild(m)

    // Default validade: 30 dias
    var d30 = new Date(); d30.setDate(d30.getDate() + 30)
    var valEl = document.getElementById('norcValidade')
    if (valEl) valEl.value = d30.toISOString().slice(0, 10)

    // Montar bloco de procedimentos + pagamentos (modulo compartilhado)
    var host = document.getElementById('norcBlockHost')
    if (host && window.ProcsPaymentsBlock) {
      _norcLoadProcs().then(function (procs) {
        if (_norcBlock) _norcBlock.destroy()
        _norcBlock = window.ProcsPaymentsBlock.create({
          availableProcs: procs,
          initialProcs: [],
          initialPayments: [{ forma: '', valor: 0, status: 'aberto', parcelas: 1, valorParcela: 0, comentario: '' }],
          paymentsLabel: 'condição proposta',
        })
        _norcBlock.mount(host)
      }).catch(function (e) { console.warn('[orc] load procs falhou:', e) })
    }
  }

  // ── Busca paciente no popup ────────────────────────────────
  function norcSearchPatient(q) {
    var drop = document.getElementById('norcPatientDrop')
    if (!drop) return
    if (!q.trim()) { drop.style.display = 'none'; return }

    var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    var matches = leads.filter(function(l) {
      return (l.nome || l.name || '').toLowerCase().includes(q.toLowerCase())
    }).slice(0, 8)

    if (!matches.length) { drop.style.display = 'none'; return }

    drop.innerHTML = matches.map(function(l) {
      var nome = l.nome || l.name || 'Paciente'
      var phone = l.phone || l.whatsapp || ''
      var phase = l.phase || 'lead'
      var phaseColors = { lead:'#3B82F6', agendado:'#8B5CF6', compareceu:'#10B981', paciente:'#059669', orcamento:'#F59E0B' }
      var phaseLabels = { lead:'Lead', agendado:'Agendado', compareceu:'Compareceu', paciente:'Paciente', orcamento:'Orcamento' }
      return '<div data-id="' + (l.id || '') + '" data-nome="' + _esc(nome) + '" data-phone="' + _esc(phone) + '" ' +
        'style="padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between" ' +
        'onmouseover="this.style.background=\'#F0FDF4\'" onmouseout="this.style.background=\'\'">' +
          '<div>' +
            '<div style="font-weight:600;color:#111">' + _esc(nome) + '</div>' +
            (phone ? '<div style="font-size:11px;color:#9CA3AF">' + _fmtPhone(phone) + '</div>' : '') +
          '</div>' +
          '<span style="font-size:9px;font-weight:700;color:' + (phaseColors[phase] || '#6B7280') + ';background:' + (phaseColors[phase] || '#6B7280') + '15;padding:2px 8px;border-radius:20px">' + (phaseLabels[phase] || phase) + '</span>' +
        '</div>'
    }).join('')

    drop.onclick = function(e) {
      var el = e.target.closest('[data-id]')
      if (!el) return
      document.getElementById('norcPaciente').value = el.dataset.nome
      document.getElementById('norcPacienteId').value = el.dataset.id
      document.getElementById('norcPacientePhone').value = el.dataset.phone || ''
      drop.style.display = 'none'
      // Mostrar card selecionado
      var sel = document.getElementById('norcPatientSelected')
      if (sel) {
        sel.style.display = 'block'
        document.getElementById('norcPatientName').textContent = el.dataset.nome
        document.getElementById('norcPatientPhone').textContent = _fmtPhone(el.dataset.phone || '')
      }
    }
    drop.style.display = 'block'
  }

  // ── Salvar orcamento ───────────────────────────────────────
  function norcSave() {
    var pacienteId = document.getElementById('norcPacienteId').value
    var pacienteNome = document.getElementById('norcPaciente').value.trim()
    var validade = (document.getElementById('norcValidade') || {}).value || ''
    var obs = (document.getElementById('norcObs') || {}).value.trim() || ''

    if (!pacienteNome) { _highlightField('norcPaciente', 'Selecione o paciente'); return }
    if (!_norcBlock) { if (window._showToast) _showToast('Aguarde', 'Carregando procedimentos...', 'warning'); return }

    var st = _norcBlock.getState()
    // Filtra procs validos (tem nome)
    var validProcs = (st.procs || []).filter(function (p) { return p.nome && p.nome.trim() })
    if (!validProcs.length) {
      if (window._showToast) _showToast('Validacao', 'Adicione ao menos 1 procedimento', 'warning')
      return
    }
    // Pagamentos com forma escolhida
    var validPayments = (st.payments || []).filter(function (p) { return p.forma })

    var total = st.total
    var subtotal = st.subtotal
    var descontoValor = parseFloat(st.desconto) || 0

    // Titulo = nomes dos procs concatenados (max 80 chars)
    var titulo = validProcs.map(function (p) { return p.nome }).join(' + ')
    if (titulo.length > 80) titulo = titulo.slice(0, 77) + '...'

    var allLeads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    var lead = pacienteId ? allLeads.find(function (l) { return l.id === pacienteId }) : null

    if (lead) {
      if (!lead.customFields) lead.customFields = {}
      if (!Array.isArray(lead.customFields.orcamentos)) lead.customFields.orcamentos = []

      lead.customFields.orcamentos.push({
        id: 'orc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        titulo: titulo,
        procedimentos: validProcs,   // array completo c/ cortesia + motivo
        pagamentos: validPayments,   // array de formas com parcelas/status
        subtotal: subtotal,
        desconto: descontoValor,
        total: total,
        validade: validade,
        observacoes: obs,
        status: 'pendente',
        created_at: new Date().toISOString(),
      })

      if (lead.phase !== 'paciente') {
        lead.phase = 'orcamento'
      }

      if (window.LeadsService && LeadsService.saveLocal) {
        LeadsService.saveLocal(allLeads)
      }
      if (window.LeadsService && LeadsService.syncOne) {
        LeadsService.syncOne(lead)
      }

      if (window.BudgetsService) {
        BudgetsService.upsert({
          lead_id:     pacienteId,
          title:       titulo,
          status:      'draft',
          subtotal:    subtotal,
          discount:    descontoValor,
          total:       total,
          valid_until: validade || null,
          items: validProcs.map(function (p) {
            return {
              description: p.nome + (p.cortesia ? ' (Cortesia' + (p.cortesiaMotivo ? ' — ' + p.cortesiaMotivo : '') + ')' : ''),
              quantity:    1,
              unit_price:  p.cortesia ? 0 : p.valor,
            }
          }),
          payments_json: validPayments,  // custom, pode persistir em jsonb futuro
        })
      }
    }

    document.getElementById('novoOrcModal').remove()
    if (_norcBlock) { _norcBlock.destroy(); _norcBlock = null }

    if (window._showToast) {
      _showToast('Orcamento criado', titulo + ' — R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 'success')
    }

    if (typeof load === 'function') load(true)
  }

  function _highlightField(id, msg) {
    var el = document.getElementById(id)
    if (!el) return
    el.style.borderColor = '#EF4444'
    el.focus()
    el.placeholder = msg
    setTimeout(function() { el.style.borderColor = '#E5E7EB' }, 2500)
  }

  // ════════════════════════════════════════════════════════════
  // Compartilhar orcamento com paciente (WhatsApp)
  //
  // Fluxo:
  //   1. Resolve budgetId — se recebeu leadId, busca o budget mais
  //      recente via BudgetsService.getBudgets(leadId).
  //   2. Gera/recupera share_token idempotente via RPC
  //      budget_ensure_share_token(budgetId).
  //   3. Monta URL publica que roteia via Edge Function m-og-preview
  //      (mesmo padrao do voucher B2B). Crawler recebe OG tag
  //      personalizada, browser recebe 302 para orcamento.html.
  //   4. Abre modal com URL copiavel + botao "Abrir WhatsApp" com
  //      mensagem pre-preenchida identificando o orcamento.
  // ════════════════════════════════════════════════════════════

  function _sharePublicUrl(token) {
    // Cloudflare Worker og.miriandpaula.com.br serve OG personalizado (type=orcamento)
    // e redireciona browser pra m.miriandpaula.com.br/orcamento?t=<token>.
    return 'https://og.miriandpaula.com.br/?type=orcamento&x=' + encodeURIComponent(token)
  }

  function _fmtBRL(v) {
    var n = Number(v) || 0
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
  }

  function _fmtDateBR(iso) {
    if (!iso) return ''
    try {
      var d = new Date(String(iso).length === 10 ? iso + 'T00:00:00' : iso)
      if (isNaN(d.getTime())) return ''
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch (_) { return '' }
  }

  function _toast(msg, kind) {
    if (window._showToast) window._showToast(kind === 'error' ? 'Erro' : 'Orcamento', msg, kind || 'info')
    else console.log('[orcamentos]', kind || 'info', msg)
  }

  async function _copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true } catch (_) {}
    }
    // Fallback antigo
    try {
      var ta = document.createElement('textarea')
      ta.value = text; ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;left:-9999px;top:0'
      document.body.appendChild(ta); ta.select()
      var ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return !!ok
    } catch (_) { return false }
  }

  // Resolve budgetId a partir do leadId (pega o mais recente)
  async function _resolveBudgetFromLead(leadId) {
    if (!window.BudgetsService || !BudgetsService.getBudgets) {
      return { ok: false, error: 'BudgetsService indisponivel. Verifique conexao.' }
    }
    var r = await BudgetsService.getBudgets(leadId)
    if (!r.ok) return { ok: false, error: r.error || 'Erro ao buscar orcamentos' }
    var list = Array.isArray(r.data) ? r.data : []
    if (!list.length) return { ok: false, error: 'Este paciente ainda nao tem orcamento salvo no sistema.' }
    // O mais recente primeiro (sdr_get_budgets ja vem ordenado desc)
    return { ok: true, budget: list[0], all: list }
  }

  // Monta preview "estilo WhatsApp" do que o paciente vera
  function _sharePreviewHtml(budget, nome) {
    var titulo = budget.title || 'Seu orcamento personalizado'
    var valor = _fmtBRL(budget.total || 0)
    var validade = _fmtDateBR(budget.valid_until)
    var nPrimeiro = (nome || '').trim().split(/\s+/)[0] || 'voce'
    return '<div style="background:#E5F5ED;border-radius:12px;padding:12px 14px;max-width:320px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif">' +
      '<div style="font-size:11px;color:#0A6E4A;font-weight:600;margin-bottom:4px">Clínica Mirian de Paula</div>' +
      '<div style="font-size:13px;color:#111;line-height:1.5">' +
        'Olá ' + _esc(nPrimeiro) + '! Preparamos com carinho seu orçamento:<br>' +
        '<strong>' + _esc(titulo) + '</strong><br>' +
        'Investimento: <strong>' + _esc(valor) + '</strong>' +
        (validade ? '<br>Válido até ' + _esc(validade) : '') +
      '</div>' +
      '<div style="background:#fff;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:11px;color:#0F766E;border:1px solid #D1FAE5">' +
        '<div style="font-weight:600">Seu orçamento personalizado</div>' +
        '<div style="color:#6B7280;margin-top:2px">m.miriandpaula.com.br</div>' +
      '</div>' +
      '<div style="font-size:10px;color:#9CA3AF;text-align:right;margin-top:4px">agora</div>' +
    '</div>'
  }

  // Entry point — aceita { budgetId } OU { leadId }
  async function openShareOrcamentoModal(opts) {
    opts = opts || {}
    var existing = document.getElementById('shareOrcModal')
    if (existing) existing.remove()

    // Shell do modal com loading
    var m = document.createElement('div')
    m.id = 'shareOrcModal'
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px'
    m.addEventListener('click', function (e) { if (e.target === m) m.remove() })
    m.innerHTML =
      '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:18px;width:100%;max-width:520px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.25)">' +
        '<div style="padding:22px 28px 18px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#10B981,#0F766E);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(16,185,129,0.3)">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
            '</div>' +
            '<div>' +
              '<h2 style="margin:0;font-size:18px;font-weight:800;color:#111">Compartilhar orçamento</h2>' +
              '<p style="margin:2px 0 0;font-size:12px;color:#9CA3AF">Link privado com preview personalizado no WhatsApp</p>' +
            '</div>' +
          '</div>' +
          '<button onclick="document.getElementById(\'shareOrcModal\').remove()" style="width:32px;height:32px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;font-size:16px;color:#6B7280;display:flex;align-items:center;justify-content:center">x</button>' +
        '</div>' +
        '<div id="shareOrcBody" style="flex:1;overflow-y:auto;padding:20px 28px">' +
          '<div style="text-align:center;padding:30px 0;color:#6B7280;font-size:13px">Gerando link compartilhavel...</div>' +
        '</div>' +
      '</div>'
    document.body.appendChild(m)

    // Resolver budget
    var budgetId = opts.budgetId || null
    var budgetRec = opts.budget || null
    var lead = null

    try {
      if (!budgetId && opts.leadId) {
        var res = await _resolveBudgetFromLead(opts.leadId)
        if (!res.ok) {
          _renderShareError(res.error || 'Nao foi possivel encontrar o orcamento')
          return
        }
        budgetRec = res.budget
        budgetId = budgetRec.id
      }
      if (!budgetId) {
        _renderShareError('Orcamento nao identificado.')
        return
      }

      // Busca lead pra telefone / nome
      var allLeads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      if (opts.leadId) lead = allLeads.find(function (l) { return l.id === opts.leadId })

      // Gera share_token via RPC
      if (!window._sbShared || typeof _sbShared.rpc !== 'function') {
        _renderShareError('Supabase nao disponivel. Verifique sua conexao.')
        return
      }
      var r = await _sbShared.rpc('budget_ensure_share_token', { p_budget_id: budgetId })
      if (r.error) {
        _renderShareError('Erro ao gerar link: ' + (r.error.message || r.error))
        return
      }
      var token = r.data
      if (!token) {
        _renderShareError('Erro ao gerar token. Tente novamente.')
        return
      }

      _renderShareSuccess(budgetRec || { id: budgetId, title: null, total: null, valid_until: null }, lead, token)
    } catch (e) {
      _renderShareError('Erro inesperado: ' + (e.message || e))
    }
  }

  function _renderShareError(msg) {
    var body = document.getElementById('shareOrcBody')
    if (!body) return
    body.innerHTML =
      '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:18px 20px;color:#991B1B;font-size:13px;line-height:1.5">' +
        '<div style="font-weight:600;margin-bottom:4px">Não foi possível compartilhar</div>' +
        '<div>' + _esc(msg) + '</div>' +
      '</div>' +
      '<div style="text-align:right;margin-top:16px">' +
        '<button onclick="document.getElementById(\'shareOrcModal\').remove()" style="padding:9px 18px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Fechar</button>' +
      '</div>'
  }

  function _renderShareSuccess(budget, lead, token) {
    var body = document.getElementById('shareOrcBody')
    if (!body) return

    var nome = (lead && (lead.name || lead.nome)) || ''
    var primeiroNome = (nome.split(/\s+/)[0] || 'voce').trim()
    var titulo = budget.title || 'seu orcamento personalizado'
    var url = _sharePublicUrl(token)
    var phone = lead ? (lead.phone || lead.whatsapp || '') : ''
    var phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits && !phoneDigits.startsWith('55')) phoneDigits = '55' + phoneDigits

    var msg = 'Olá ' + primeiroNome + '! Aqui está o orçamento ' +
      (titulo ? '"' + titulo + '"' : '') + ' que preparamos para você.\n\n' +
      url + '\n\nQualquer dúvida, é só me chamar. — Mirian'
    var waHref = phoneDigits
      ? 'https://wa.me/' + phoneDigits + '?text=' + encodeURIComponent(msg)
      : 'https://wa.me/?text=' + encodeURIComponent(msg)

    body.innerHTML =
      // Preview "como chega no WhatsApp"
      '<div style="margin-bottom:18px">' +
        '<div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;text-align:center">Prévia da mensagem no WhatsApp</div>' +
        _sharePreviewHtml(budget, nome) +
      '</div>' +

      // URL copiavel
      '<div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:14px 16px;margin-bottom:14px">' +
        '<div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Link do orçamento</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<input id="shareOrcUrl" type="text" readonly value="' + _esc(url) + '" onclick="this.select()" style="flex:1;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#111;outline:none"/>' +
          '<button id="shareOrcCopyBtn" onclick="shareOrcCopy()" style="padding:9px 14px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
            'Copiar' +
          '</button>' +
        '</div>' +
        (phoneDigits
          ? '<div style="font-size:11px;color:#6B7280;margin-top:8px">Enviaremos para: <strong>' + _esc(_fmtPhone(phone)) + '</strong></div>'
          : '<div style="font-size:11px;color:#B45309;margin-top:8px;background:#FEF3C7;border-radius:6px;padding:6px 8px">Paciente sem telefone cadastrado — botão WhatsApp abrirá em branco.</div>') +
      '</div>' +

      // Botoes de acao
      '<div style="display:flex;gap:10px;justify-content:space-between;align-items:center">' +
        '<button onclick="document.getElementById(\'shareOrcModal\').remove()" style="padding:10px 18px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Fechar</button>' +
        '<a href="' + _esc(waHref) + '" target="_blank" rel="noopener" onclick="setTimeout(function(){document.getElementById(\'shareOrcModal\')&&document.getElementById(\'shareOrcModal\').remove()},300)" style="padding:10px 20px;background:linear-gradient(135deg,#10B981,#0F766E);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(16,185,129,0.3)">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.868-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.13 12.13 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785L12 21.785a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>' +
          'Abrir no WhatsApp' +
        '</a>' +
      '</div>'
  }

  // Handler global do botao copiar (precisa ser no escopo window — modal usa onclick=)
  async function shareOrcCopy() {
    var input = document.getElementById('shareOrcUrl')
    var btn = document.getElementById('shareOrcCopyBtn')
    if (!input) return
    var ok = await _copyToClipboard(input.value)
    if (ok) {
      if (btn) {
        var orig = btn.innerHTML
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copiado'
        btn.style.background = '#059669'
        setTimeout(function () { btn.innerHTML = orig; btn.style.background = '#111827' }, 1800)
      }
      _toast('Link copiado', 'success')
    } else {
      if (input.select) input.select()
      _toast('Copie manualmente (Ctrl+C)', 'warning')
    }
  }

  // ── Exports ─────────────────────────────────────────────────
  window.loadOrcamentos = load
  window.orcLoadMore = loadMore
  window.orcSortBy = sortBy
  window.orcPeriodClick = periodClick
  window.orcApplyCustomPeriod = applyCustomPeriod
  window.orcToggleAll = toggleAll
  window.exportOrcamentosCsv = exportCsv
  window.openNewOrcamentoModal = openNewOrcamentoModal
  window.norcSearchPatient = norcSearchPatient
  window.norcSave = norcSave
  window.openShareOrcamentoModal = openShareOrcamentoModal
  window.shareOrcCopy = shareOrcCopy

})()
