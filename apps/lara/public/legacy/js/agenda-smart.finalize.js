/**
 * ClinicAI - Agenda Smart - Finalize Modal
 * Extraido de agenda-smart.js (seam 6 - 2026-04-24). Fluxo de finalizacao
 * do atendimento: modal com procedimentos + pagamentos (consulta ou
 * procedimento), validacoes AgendaValidator, sync Supabase, route consulta
 * vs procedimento.
 *
 * Dependencias via window.*:
 *   getAppointments, saveAppointments, getTechnologies, AgendaValidator,
 *   AppointmentsService, _showToast, renderAgenda
 *   _consentRecent, _enviarConsentimento, _fmtBRL, _fmtD, _getPhone,
 *   _logAuto, _showInlineAlert (expostos por agenda-smart.js - seam 6)
 *   openApptDetail (smart.js)
 */
;(function () {
  'use strict'

// ── Finalization Modal ────────────────────────────────────────────
let _finalProcs = []
let _finalAppt  = null

function openFinalizeModal(id) {
  _finalProcs = []
  _finalAppt  = null
  if (!window.getAppointments) return
  const appt = getAppointments().find(a=>a.id===id)
  if (!appt) return
  _finalAppt = appt
  // Pre-carrega procedimentos ja agendados (se houver) para iniciar o desconto
  if (Array.isArray(appt.procedimentos) && appt.procedimentos.length > 0) {
    _finalProcs = appt.procedimentos.map(function(p) { return { nome: p.nome, valor: parseFloat(p.valor) || 0 } })
  }
  _buildFinModal(id, appt)
  // Async: enriquece catalog com partner_pricing se lead tem partner VPI ativo.
  // Fallback silencioso: modal renderiza com preco base e depois re-aplica se RPC responder.
  _finLoadPartnerPricing(appt)
}

// Enrichment assincrono: VPI partner pricing. Chama RPC, atualiza
// window._finProcCatalog com campos partner_*; se o usuario ja
// selecionou um procedimento, re-aplica finProcAutoPrice pra
// atualizar o valor na tela.
function _finLoadPartnerPricing(appt) {
  try {
    var repo = window.AppointmentsService
    if (!repo) return
    var leadId = appt && (appt.pacienteId || appt.patient_id || '')
    if (!leadId) return
    repo.listProceduresWithPartnerPricing(leadId).then(function (res) {
      if (!res.ok) { console.warn('[VPI partner pricing] RPC erro:', res.error); return }
      var data = res.data || {}
      var isPartner = !!data.is_partner_active
      window._finIsPartnerActive = isPartner
      var list = Array.isArray(data.procedures) ? data.procedures : []
      var cat = window._finProcCatalog || {}
      list.forEach(function (p) {
        var key = p.nome
        if (!key) return
        if (!cat[key]) cat[key] = { preco: p.preco || 0, preco_promo: p.preco_promo || 0 }
        cat[key].partner_pricing          = p.partner_pricing || null
        cat[key].partner_eligible         = !!p.partner_eligible
        cat[key].partner_preco_total      = p.partner_preco_total || null
        cat[key].partner_parcelas         = p.partner_parcelas || null
        cat[key].partner_valor_por_parcela = p.partner_valor_por_parcela || null
        cat[key].preco_efetivo            = p.preco_efetivo != null ? p.preco_efetivo : cat[key].preco
      })
      window._finProcCatalog = cat
      // Re-aplica preco no select atual (se houver selecao)
      if (typeof finProcAutoPrice === 'function') finProcAutoPrice()
      // Badge indicando modo parceiro
      _finRenderPartnerBadge(isPartner)
    }).catch(function (e) { console.warn('[VPI partner pricing] falha:', e && e.message) })
  } catch (e) { console.warn('[VPI partner pricing] abortado:', e && e.message) }
}

function _finRenderPartnerBadge(isPartner) {
  var modal = document.getElementById('smartFinalizeModal')
  if (!modal) return
  var existing = modal.querySelector('#finPartnerBadge')
  if (!isPartner) { if (existing) existing.remove(); return }
  if (existing) return
  var header = modal.querySelector('.modal-subtitle')
  if (!header) return
  var span = document.createElement('span')
  span.id = 'finPartnerBadge'
  span.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:10px;padding:2px 8px;border-radius:99px;background:linear-gradient(135deg,#FEF3C7,#FCD34D);color:#78350F;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:1px solid #F59E0B'
  span.innerHTML = '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2"/></svg> Parceira VPI'
  header.appendChild(span)
}

// Calcula valor da consulta em aberto (paga ainda nao quitada)
function _finConsultaAberta(appt) {
  if (!appt) return 0
  if (appt.tipoConsulta !== 'avaliacao' || appt.tipoAvaliacao !== 'paga') return 0
  var pagamentos = Array.isArray(appt.pagamentos) ? appt.pagamentos : []
  if (pagamentos.length === 0) {
    return (appt.statusPagamento === 'pago') ? 0 : (parseFloat(appt.valor) || 0)
  }
  return pagamentos
    .filter(function(p) { return p.status !== 'pago' })
    .reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
}

function _buildFinModal(id, appt) {
  let m = document.getElementById('smartFinalizeModal')
  if (!m) { m = document.createElement('div'); m.id = 'smartFinalizeModal'; document.body.appendChild(m) }

  const pmOpts = PAYMENT_METHODS.map(pm=>`<option value="${pm.id}" ${appt.formaPagamento===pm.id?'selected':''}>${pm.label}</option>`).join('')
  const isAvalPaga = appt.tipoConsulta==='avaliacao' && appt.tipoAvaliacao==='paga'

  // Build procedures catalog (nome → preco)
  var _finProcCatalog = {}
  try {
    var _techs = typeof getTechnologies === 'function' ? getTechnologies() : []
    var _procs = typeof getProcedimentos === 'function' ? getProcedimentos() : JSON.parse(localStorage.getItem('clinic_procedimentos') || '[]')
    _techs.forEach(function(t) { if (t.nome) _finProcCatalog[t.nome] = { preco: t.preco||0, preco_promo: t.preco_promo||0 } })
    _procs.forEach(function(p) { var n = p.nome||p.name; if (n) _finProcCatalog[n] = { preco: p.preco||0, preco_promo: p.preco_promo||0 } })
  } catch(e) { /* silencioso */ }
  window._finProcCatalog = _finProcCatalog
  var _finProcOpts = '<datalist id="apptProcList">' + Object.keys(_finProcCatalog).map(function(n){return '<option value="'+n+'"/>'}).join('') + '</datalist>'

  m.style.cssText = ''
  m.className = ''
  m.innerHTML = _finProcOpts + `
    <div class="modal-overlay modal-lg open dialog" onclick="if(event.target===this)closeFinalizeModal()">
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-header-info">
            <div class="modal-header-icon" style="background:#10B98115;color:#10B981">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div class="modal-title">Finalizar Atendimento</div>
              <div class="modal-subtitle">${appt.pacienteNome} · ${appt.data?window._fmtD(appt.data):''} ${appt.horaInicio||''}</div>
            </div>
          </div>
          <button class="modal-close" onclick="closeFinalizeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:18px">

        <!-- ════ COLUNA ESQUERDA: Procedimentos + Financeiro ════ -->
        <div style="display:flex;flex-direction:column;gap:16px">

          <!-- Procedimentos -->
          <div>
            <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:7px">Procedimentos Realizados</div>
            <div id="finProcList">${_renderFinProcs()}</div>
            <div style="display:flex;gap:6px;margin-top:6px;align-items:center">
              <select id="finProcNome" onchange="finProcAutoPrice()" style="flex:1;padding:8px 10px;border:1.5px solid #7C3AED40;border-radius:8px;font-size:12px;outline:none;box-sizing:border-box;background:#fff">
                <option value="">Selecione o procedimento...</option>
                ${_buildFinProcOptions()}
              </select>
              <input id="finProcValor" type="text" readonly placeholder="R$" style="width:75px;padding:8px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;text-align:right;background:#F9FAFB;color:#10B981;font-weight:600;box-sizing:border-box">
              <button onclick="addFinProc()" style="padding:8px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">+</button>
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#F59E0B;cursor:pointer;margin-top:6px">
              <input type="checkbox" id="finDescontoCb" onchange="var r=document.getElementById('finDescontoRow');r.style.display=this.checked?'block':'none'" style="accent-color:#F59E0B;width:13px;height:13px"> Aplicar desconto
            </label>
            <div id="finDescontoRow" style="display:none;margin-top:4px">
              <input id="finDescontoVal" type="number" placeholder="Valor do desconto (R$)" step="0.01" style="width:100%;padding:7px 9px;border:1px solid #F59E0B40;border-radius:7px;font-size:12px;box-sizing:border-box">
            </div>
            <div id="finProcTotal" style="margin-top:8px;padding:8px 10px;background:#F5F3FF;border-radius:8px;font-size:13px;font-weight:700;color:#5B21B6;display:none"></div>
            <div id="finConsultaAlert" style="margin-top:8px;display:none"></div>
          </div>

          <!-- Financeiro -->
          <div style="background:#F9FAFB;padding:13px;border-radius:10px">
            <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:10px">Financeiro</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
              <div>
                <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Valor Total (R$)</label>
                <input id="finValor" type="number" step="0.01" placeholder="0,00" value="${appt.valor||''}" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:13px;font-weight:700" oninput="finPayChanged()">
              </div>
              <div>
                <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Forma de Pagamento</label>
                <select id="finFormaPag" onchange="finPayChanged()" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">${pmOpts}</select>
              </div>
            </div>
            <div id="finPayDetails" style="margin-top:10px"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px">
              <div>
                <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Valor Pago (R$)</label>
                <input id="finPago" type="number" step="0.01" placeholder="0,00" value="${appt.valorPago||''}" oninput="finUpdateBalance()" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:13px">
              </div>
              <div>
                <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Status</label>
                <select id="finStatusPag" onchange="finPayChanged()" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">
                  <option value="pendente" ${appt.statusPagamento==='pendente'?'selected':''}>Pendente</option>
                  <option value="parcial"  ${appt.statusPagamento==='parcial'?'selected':''}>Parcial</option>
                  <option value="pago"     ${appt.statusPagamento==='pago'?'selected':''}>Pago</option>
                </select>
              </div>
            </div>
            <div id="finBalInfo" style="margin-top:7px;font-size:11px;font-weight:600"></div>
          </div>

          ${isAvalPaga?`<div style="padding:9px 12px;background:#FFFBEB;border-radius:8px;border:1.5px solid #F59E0B"><div style="font-size:11px;font-weight:700;color:#92400E">Avaliacao Paga — confirme o pagamento antes de finalizar</div></div>`:''}

        </div>

        <!-- ════ COLUNA DIREITA: Fluxos + Routing + Obs ════ -->
        <div style="display:flex;flex-direction:column;gap:16px">

          <!-- Bloco 3: Fluxos pos-atendimento -->
          <div style="background:#F0FDF4;padding:13px;border-radius:10px;border:1px solid #D1FAE5">
            <div style="font-size:11px;font-weight:800;color:#065F46;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Fluxos Pos-Atendimento</div>
            <div id="finFlowChecks" style="display:flex;flex-direction:column;gap:7px" onchange="_finAutoRoute()">
              ${_buildFinFlowChecks()}
            </div>
          </div>

        <!-- Bloco 4: Routing de tags (próximo estado do paciente) -->
        <div style="background:#F5F3FF;padding:13px;border-radius:10px;border:1px solid #DDD6FE">
          <div style="font-size:11px;font-weight:800;color:#4C1D95;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Bloco 4 — Proximo Estado do Paciente</div>
          <div id="finRouteHint" style="display:none;font-size:11px;color:#D97706;font-weight:600;margin-bottom:8px;padding:6px 8px;background:#FFFBEB;border-radius:6px;border:1px solid #FDE68A"></div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid transparent" id="finRouteLabel_paciente">
              <input type="radio" name="finRoute" value="paciente" style="margin-top:2px;accent-color:#10B981" onchange="finRouteChange()">
              <div><div style="font-weight:700;color:#059669">Paciente</div><div style="font-size:10px;color:#9CA3AF">Fez procedimento. Fluxo de pós-atendimento.</div></div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid transparent" id="finRouteLabel_pac_orc">
              <input type="radio" name="finRoute" value="pac_orcamento" style="margin-top:2px;accent-color:#8B5CF6" onchange="finRouteChange()">
              <div><div style="font-weight:700;color:#7C3AED">Paciente + Orçamento</div><div style="font-size:10px;color:#9CA3AF">Fez procedimento E saiu com orçamento para outro tratamento.</div></div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid transparent" id="finRouteLabel_orc">
              <input type="radio" name="finRoute" value="orcamento" style="margin-top:2px;accent-color:#F59E0B" onchange="finRouteChange()">
              <div><div style="font-weight:700;color:#D97706">Orçamento</div><div style="font-size:10px;color:#9CA3AF">Só consulta, saiu com orçamento. Sem procedimento feito.</div></div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid transparent" id="finRouteLabel_nenhum">
              <input type="radio" name="finRoute" value="nenhum" checked style="margin-top:2px;accent-color:#9CA3AF" onchange="finRouteChange()">
              <div><div style="font-weight:700;color:#374151">Apenas finalizar</div><div style="font-size:10px;color:#9CA3AF">Sem roteamento adicional.</div></div>
            </label>
          </div>
        </div>

          <!-- Bloco fallback: Consentimento do Procedimento -->
          <div id="finConsentBlock" style="background:#FEF3C7;padding:11px 13px;border-radius:10px;border:1px solid #FCD34D">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#92400E"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              <span style="font-size:10px;font-weight:800;color:#92400E;text-transform:uppercase;letter-spacing:.04em">Consentimento do Procedimento</span>
            </div>
            <div style="font-size:11px;color:#78350F;line-height:1.45;margin-bottom:8px">Agora enviado no <b>check-in (na clinica)</b>. Se o paciente pulou esse status, use o fallback:</div>
            <button type="button" id="finConsentBtn" onclick="_finSendConsentProc('${id}')" style="width:100%;padding:8px 12px;background:#F59E0B;border:none;border-radius:7px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Enviar consentimento agora
            </button>
          </div>

          <!-- Queixas do paciente -->
          <div id="finComplaintsSection" style="margin-bottom:12px">
            <label style="font-size:10px;font-weight:700;color:#7C3AED;display:block;margin-bottom:6px">QUEIXAS TRATADAS NESTA CONSULTA</label>
            <div id="finComplaintsList" style="font-size:11px;color:#9CA3AF">Carregando queixas...</div>
          </div>

          <div>
            <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:4px">Observa&#231;&#245;es Finais</label>
            <textarea id="finObs" rows="3" placeholder="Notas sobre o atendimento..." style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;resize:none;font-family:inherit">${appt.obsFinal||''}</textarea>
          </div>

        </div>
        <!-- ════ FIM COLUNA DIREITA ════ -->

      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-ghost" onclick="closeFinalizeModal()">Cancelar</button>
        <button class="modal-btn modal-btn-primary" onclick="confirmFinalize('${id}')" style="flex:2">Confirmar Finaliza&#231;&#227;o</button>
      </div>
    </div></div>`

  // Renderiza alerta de consulta + atualiza total inicial
  setTimeout(function() { _finUpdateTotal() }, 0)

  // Carregar queixas do paciente async
  setTimeout(async function() {
    var el = document.getElementById('finComplaintsList')
    if (!el || !window.ComplaintsPanel) { if (el) el.innerHTML = '<span style="font-size:10px;color:#9CA3AF">Sistema de queixas nao disponivel</span>'; return }

    var patientId = appt.pacienteId || appt.patient_id || ''
    // Fallback: buscar lead ID pelo nome
    if (!patientId) {
      try {
        var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
        var nome = (appt.pacienteNome || appt.patient_name || '').toLowerCase()
        var lead = leads.find(function(l) { return (l.name||l.nome||'').toLowerCase() === nome })
        if (lead) patientId = lead.id
      } catch(e) {}
    }
    if (!patientId) { el.innerHTML = '<span style="font-size:10px;color:#9CA3AF">Paciente sem ID</span>'; return }

    try {
      var complaints = await ComplaintsPanel.loadComplaints(patientId)
      var pendentes = (complaints || []).filter(function(c) { return c.status === 'pendente' || c.status === 'em_tratamento' })

      if (!pendentes.length) { el.innerHTML = '<span style="font-size:10px;color:#9CA3AF">Nenhuma queixa pendente</span>'; return }

      // Carregar procedimentos
      var procs = []
      try {
        if (window.AppointmentsService) { var r = await window.AppointmentsService.listProcedures(); procs = (r.ok && r.data) || [] }
      } catch(e) {}
      var procOpts = '<option value="">Procedimento...</option>' + procs.map(function(p) { return '<option value="' + p.nome.replace(/"/g,'&quot;') + '">' + p.nome.replace(/</g,'&lt;') + '</option>' }).join('') + '<option value="__outro__">Outro</option>'
      var retouchOpts = '<option value="7">1 semana</option><option value="15">15 dias</option><option value="30">1 m&#234;s</option><option value="60">2 meses</option><option value="90">3 meses</option><option value="120" selected>4 meses</option><option value="150">5 meses</option><option value="180">6 meses</option><option value="365">1 ano</option>'

      var html = ''
      pendentes.forEach(function(c) {
        html += '<div style="padding:6px 0;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;gap:8px">'
          + '<input type="checkbox" class="finComplaintCb" data-cid="' + c.id + '" style="width:14px;height:14px;accent-color:#7C3AED" />'
          + '<span style="font-size:11px;color:#111;font-weight:500;flex:1">' + (c.complaint||'').replace(/</g,'&lt;') + '</span>'
          + '<select class="finComplaintProc" data-cid="' + c.id + '" style="padding:4px 6px;border:1px solid #E5E7EB;border-radius:4px;font-size:10px;max-width:140px">' + procOpts + '</select>'
          + '<select class="finComplaintRetouch" data-cid="' + c.id + '" style="padding:4px 6px;border:1px solid #E5E7EB;border-radius:4px;font-size:10px;width:80px">' + retouchOpts + '</select>'
          + '</div>'
      })
      el.innerHTML = html
    } catch (e) {
      el.innerHTML = '<span style="font-size:10px;color:#EF4444">Erro: ' + e.message + '</span>'
    }
  }, 100)
}

function _buildFinFlowChecks() {
  var checks = []
  var _lbl = 'display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;cursor:pointer'
  var _chk = 'width:14px;height:14px;accent-color:#10B981'

  // Dynamic: load on_finalize + d_after rules from AutomationsEngine cache
  if (window.AgendaAutomationsService) {
    var rules = AgendaAutomationsService.getActive().filter(function(r) {
      return r.trigger_type === 'on_finalize' || r.trigger_type === 'd_after'
    })
    rules.forEach(function(r) {
      var icon = r.channel === 'whatsapp' ? 'WhatsApp' : r.channel === 'alert' ? 'Alerta' : r.channel === 'task' ? 'Tarefa' : 'Auto'
      var label = r.name
      if (r.trigger_type === 'd_after') {
        var cfg = r.trigger_config || {}
        label += ' (D+' + (cfg.days||1) + ')'
      }
      checks.push({
        id: 'finAuto_' + r.id.replace(/-/g,'').slice(0,8),
        ruleId: r.id,
        label: icon + ': ' + label,
        checked: r.is_active,
        fromEngine: true,
      })
    })
  }

  // Fallback fixed checks if engine not loaded
  if (!checks.length) {
    checks = [
      { id:'finWAPos',          label:'Enviar WhatsApp p\u00f3s-atendimento (cuidados)', checked:true },
      { id:'finAvalGoogle',     label:'Solicitar avalia\u00e7\u00e3o Google',                  checked:true },
      { id:'finGerarRetorno',   label:'Gerar retorno / pr\u00f3ximo agendamento',         checked:true },
      { id:'finEnviarOrcamento',label:'Enviar or\u00e7amento',                            checked:true },
    ]
  }

  // Always ensure "Enviar orcamento" exists and is checked by default
  var hasOrc = checks.some(function(c) { return c.id === 'finEnviarOrcamento' || /orcamento/i.test(c.label) })
  if (!hasOrc) {
    checks.push({ id:'finEnviarOrcamento', label:'Enviar orcamento', checked:true })
  }

  // SEMPRE: check dedicado VPI — decisao de convidar pra virar embaixadora.
  // Default TRUE: todo paciente que finaliza procedimento vira candidata.
  // Desmarca manualmente quem nao deve receber convite (ex: paciente conhecida
  // que ja recusou, teste interno, etc). autoEnroll cria em pending_consent
  // e WA convite pede ACEITO pra virar ativa (LGPD).
  checks.push({
    id: 'finVPIEnroll',
    label: 'Incluir no Programa de Indica\u00e7\u00e3o (VPI) \u2014 convite WA D+1',
    checked: true,
  })

  return checks.map(function(c) {
    return '<label style="' + _lbl + '">' +
      '<input type="checkbox" id="' + c.id + '" ' + (c.checked?'checked ':'') +
      (c.ruleId ? 'data-rule-id="' + c.ruleId + '" ' : '') +
      'style="' + _chk + '"> ' + c.label + '</label>'
  }).join('')
}

function _renderFinProcs() {
  if (!_finalProcs.length) return '<div style="font-size:11px;color:#9CA3AF;padding:4px 0">Nenhum procedimento adicionado</div>'
  return _finalProcs.map(function(p,i) {
    var descontoInfo = ''
    if (p.desconto > 0) {
      var pct = p.precoOriginal > 0 ? Math.round((p.desconto / p.precoOriginal) * 100) : 0
      descontoInfo = '<div style="font-size:10px;color:#F59E0B;font-weight:600">Desc: -R$ ' + window._fmtBRL(p.desconto) + ' (' + pct + '%)</div>'
    }
    var valorFinal = ((p.precoOriginal || 0) - (p.desconto || 0)) * (p.qtd || 1)
    // Badge dourado "Preco Parceiro VPI" + economia em relacao ao preco publico
    var partnerInfo = ''
    if (p.partnerPricing && p.partnerParcelas && p.partnerValorParc) {
      var economia = Math.max(0, (p.precoBasePublico||0) - (p.precoOriginal||0)) * (p.qtd||1)
      partnerInfo = '<div style="margin-top:3px;display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:99px;background:linear-gradient(135deg,#FEF3C7,#FCD34D);color:#78350F;font-size:10px;font-weight:700;border:1px solid #F59E0B">' +
        '<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2"/></svg>' +
        'Preco Parceiro VPI &mdash; ' + p.partnerParcelas + 'x R$ ' + window._fmtBRL(p.partnerValorParc) +
        (economia > 0 ? ' <span style="color:#047857">(economia R$ ' + window._fmtBRL(economia) + ')</span>' : '') +
      '</div>'
    }
    return '<div style="display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid #F3F4F6">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:600;color:#374151">' + (window.escHtml||String)(p.nome) + ' <span style="color:#9CA3AF;font-weight:400">x' + p.qtd + '</span></div>' +
        (p.precoOriginal > 0 ? '<div style="font-size:11px;color:#10B981;font-weight:600">R$ ' + window._fmtBRL(p.precoOriginal) + '/un</div>' : '') +
        partnerInfo +
        descontoInfo +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        (valorFinal > 0 ? '<div style="font-size:13px;font-weight:800;color:#5B21B6">R$ ' + window._fmtBRL(valorFinal) + '</div>' : '') +
        '<div style="display:flex;gap:3px;margin-top:2px">' +
          '<button onclick="finProcDesconto(' + i + ')" style="background:none;border:1px solid #E5E7EB;border-radius:4px;cursor:pointer;color:#F59E0B;font-size:10px;padding:1px 5px;font-weight:600" title="Desconto">%</button>' +
          '<button onclick="removeFinProc(' + i + ')" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:16px;line-height:1;padding:0 2px">x</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  }).join('')
}

function addFinProc() {
  var sel = document.getElementById('finProcNome')
  var n = (sel?.value||'').trim()
  if (!n) return
  var info = _findProcInCatalog(n) || {}
  // Preco efetivo: parceiro VPI se elegivel, senao base
  var partnerApplied = !!(info.partner_eligible && info.partner_preco_total > 0)
  var preco = partnerApplied ? info.partner_preco_total : (info.preco || 0)
  var precoBase = info.preco || 0
  _finalProcs.push({
    nome: n,
    qtd: 1,
    precoOriginal: preco,
    desconto: 0,
    partnerPricing: partnerApplied,
    partnerParcelas: partnerApplied ? (info.partner_parcelas||5) : null,
    partnerValorParc: partnerApplied ? (info.partner_valor_por_parcela||0) : null,
    precoBasePublico: precoBase,
  })
  document.getElementById('finProcList').innerHTML = _renderFinProcs()
  if (sel) sel.value = ''
  var valEl = document.getElementById('finProcValor')
  if (valEl) valEl.value = ''
  _finUpdateTotal()
  _finAutoRoute()
}

function removeFinProc(i) {
  _finalProcs.splice(i,1)
  document.getElementById('finProcList').innerHTML = _renderFinProcs()
  _finUpdateTotal()
  _finAutoRoute()
}

// Fallback: envia consentimento do procedimento do modal de finalizacao.
// Usado quando paciente pulou na_clinica (que dispara o envio automatico).
function _finSendConsentProc(apptId) {
  var appts = []
  var _apptKey = window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments'
  try { appts = JSON.parse(localStorage.getItem(_apptKey) || '[]') } catch(e) {}
  var appt = appts.find(function(a) { return a.id === apptId })
  if (!appt) {
    if (window._showToast) window._showToast('Erro', 'Agendamento nao encontrado', 'error')
    return
  }
  if (window._consentRecent(apptId, 'procedimento')) {
    if (window._showToast) window._showToast('Ja enviado', 'Consentimento enviado recentemente (aguarde 10min pra reenviar)', 'info')
    return
  }
  // Estado visual: disabled + texto de envio
  var btn = document.getElementById('finConsentBtn')
  if (btn) {
    btn.disabled = true
    btn.style.opacity = '0.7'
    btn.style.cursor = 'default'
    btn.innerHTML = '<span style="font-size:11px">Enviando...</span>'
  }
  window._enviarConsentimento(appt, 'procedimento')
  // _enviarConsentimento e fire-and-forget (promise interna). Aguarda um tick
  // pro toast aparecer e reflete estado "enviado".
  setTimeout(function() {
    if (btn) {
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Consentimento enviado'
      btn.style.background = '#10B981'
    }
  }, 400)
}

// Auto-route logic:
// - Procedimento pago     → paciente
// - Procedimento cortesia → orcamento (registra proc, mas nao e paciente ate pagar)
// - Procedimento + orcamento check → pac_orcamento (se pago) ou orcamento (se cortesia)
// - Sem procedimento      → orcamento (consulta + orcamento)
function _finAutoRoute() {
  var hasProc = _finalProcs.length > 0
  var forma = document.getElementById('finFormaPag')?.value || ''
  var isCortesia = forma === 'cortesia'

  var hasOrc = false
  // Check for orcamento in fixed or dynamic checks
  var orcCheck = document.getElementById('finEnviarOrcamento')
  if (orcCheck && orcCheck.checked) hasOrc = true
  document.querySelectorAll('#finFlowChecks input[type=checkbox]').forEach(function(cb) {
    if (cb.labels && cb.labels[0] && /orcamento/i.test(cb.labels[0].textContent) && cb.checked) hasOrc = true
  })

  var target = 'nenhum'
  if (hasProc && isCortesia) {
    // Cortesia: procedimento registrado mas vai pra orcamento (nao e paciente ate pagar)
    target = 'orcamento'
  } else if (hasProc && hasOrc) {
    target = 'pac_orcamento'
  } else if (hasProc) {
    target = 'paciente'
  } else {
    // Sem procedimento = consulta, vai pra orcamento
    target = 'orcamento'
  }

  var radio = document.querySelector('input[name="finRoute"][value="' + target + '"]')
  if (radio) { radio.checked = true; finRouteChange() }

  // Show hint about cortesia routing
  var hint = document.getElementById('finRouteHint')
  if (hint) {
    if (hasProc && isCortesia) {
      hint.style.display = 'block'
      hint.textContent = 'Cortesia: procedimento registrado, mas so vira Paciente quando pagar.'
    } else {
      hint.style.display = 'none'
    }
  }
}

function _buildFinProcOptions() {
  var cat = window._finProcCatalog || {}
  var byCategoria = {}
  // Agrupar por categoria
  try {
    var procs = typeof getProcedimentos === 'function' ? getProcedimentos() : JSON.parse(localStorage.getItem('clinic_procedimentos') || '[]')
    procs.forEach(function(p) {
      var c = p.categoria || 'outro'
      if (!byCategoria[c]) byCategoria[c] = []
      byCategoria[c].push(p.nome || p.name || '')
    })
  } catch(e) {}

  // Se nao tem categorias, usar catalogo flat
  if (!Object.keys(byCategoria).length) {
    return Object.keys(cat).map(function(n) { return '<option value="' + n.replace(/"/g,'&quot;') + '">' + n.replace(/</g,'&lt;') + '</option>' }).join('')
  }

  var html = ''
  var catLabels = { injetavel:'Injet\u00e1veis', tecnologia:'Tecnologias', manual:'Manuais', integrativo:'Integrativos' }
  Object.keys(byCategoria).forEach(function(c) {
    html += '<optgroup label="' + (catLabels[c] || c.charAt(0).toUpperCase() + c.slice(1)) + '">'
    byCategoria[c].forEach(function(n) { html += '<option value="' + n.replace(/"/g,'&quot;') + '">' + n.replace(/</g,'&lt;') + '</option>' })
    html += '</optgroup>'
  })
  return html
}

function _findProcInCatalog(nome) {
  var cat = window._finProcCatalog || {}
  if (cat[nome]) return cat[nome]
  var nLow = (nome||'').toLowerCase()
  var keys = Object.keys(cat)
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === nLow) return cat[keys[i]]
  }
  for (var j = 0; j < keys.length; j++) {
    if (keys[j].toLowerCase().indexOf(nLow) >= 0 || nLow.indexOf(keys[j].toLowerCase()) >= 0) return cat[keys[j]]
  }
  return null
}

function finProcAutoPrice() {
  var n = (document.getElementById('finProcNome')?.value||'').trim()
  var info = _findProcInCatalog(n)
  var valEl = document.getElementById('finProcValor')
  if (!valEl) return
  if (info && info.partner_eligible && info.partner_preco_total > 0) {
    // Preco parceiro VPI
    valEl.value = 'R$ ' + window._fmtBRL(info.partner_preco_total)
    valEl.title = 'Preco Parceiro VPI: ' + (info.partner_parcelas||5) + 'x R$' + window._fmtBRL(info.partner_valor_por_parcela||0)
    valEl.style.background = '#FFFBEB'
    valEl.style.color = '#78350F'
  } else if (info && info.preco > 0) {
    valEl.value = 'R$ ' + window._fmtBRL(info.preco)
    valEl.title = ''
    valEl.style.background = '#F9FAFB'
    valEl.style.color = '#10B981'
  } else {
    valEl.value = ''
    valEl.title = ''
    valEl.style.background = '#F9FAFB'
    valEl.style.color = '#10B981'
  }
}

function finProcDesconto(i) {
  var p = _finalProcs[i]; if (!p) return
  var atual = p.desconto || 0
  var input = prompt('Valor do desconto (R$) para "' + p.nome + '":\n(Preco original: R$ ' + window._fmtBRL(p.precoOriginal) + ')', atual.toFixed(2))
  if (input === null) return
  var val = parseFloat(input.replace(',','.')) || 0
  if (val < 0) val = 0
  if (val > p.precoOriginal) val = p.precoOriginal
  _finalProcs[i].desconto = val
  document.getElementById('finProcList').innerHTML = _renderFinProcs()
  _finUpdateTotal()
}

function _finUpdateTotal() {
  var total = 0
  _finalProcs.forEach(function(p) { total += ((p.precoOriginal||0) - (p.desconto||0)) * (p.qtd||1) })
  var consultaAberta = _finConsultaAberta(_finalAppt)
  // Quando ha procedimentos adicionados, a consulta paga vira "cortesia"
  // (descontada do total dos procedimentos)
  var totalFinal = total
  if (_finalProcs.length > 0 && consultaAberta > 0) {
    totalFinal = Math.max(0, total - consultaAberta)
  }
  var el = document.getElementById('finProcTotal')
  if (el) {
    if (_finalProcs.length && total > 0) {
      el.style.display = 'block'
      var info = 'Total Procedimentos: R$ ' + window._fmtBRL(total)
      if (consultaAberta > 0) {
        info += '<br><span style="font-size:11px;color:#16A34A">- Consulta R$ ' + window._fmtBRL(consultaAberta) + ' (cortesia ao fechar procedimento)</span>'
        info += '<br><span style="color:#5B21B6">= Total a cobrar: R$ ' + window._fmtBRL(totalFinal) + '</span>'
      }
      el.innerHTML = info
    } else {
      el.style.display = 'none'
    }
  }
  // Auto-fill financial total (com desconto da consulta aplicado)
  var finValor = document.getElementById('finValor')
  if (finValor && totalFinal > 0) finValor.value = totalFinal.toFixed(2)
  _finRenderConsultaAlert()
}

// Mostra alerta quando finalizando consulta paga sem procedimento adicionado
function _finRenderConsultaAlert() {
  var holder = document.getElementById('finConsultaAlert')
  if (!holder) return
  var consultaAberta = _finConsultaAberta(_finalAppt)
  if (consultaAberta > 0 && _finalProcs.length === 0) {
    holder.style.display = 'block'
    holder.innerHTML =
      '<div style="padding:10px 12px;background:#FEF3C7;border:1.5px solid #F59E0B;border-radius:8px">' +
        '<div style="font-size:12px;font-weight:800;color:#92400E;margin-bottom:3px">Cobrar consulta antes de finalizar</div>' +
        '<div style="font-size:11px;color:#92400E">Consulta paga em aberto: R$ ' + window._fmtBRL(consultaAberta) + '. Adicione um procedimento para descontar ou registre o pagamento abaixo.</div>' +
      '</div>'
    var finValor = document.getElementById('finValor')
    if (finValor && (!finValor.value || parseFloat(finValor.value) === 0)) {
      finValor.value = consultaAberta.toFixed(2)
    }
  } else {
    holder.style.display = 'none'
    holder.innerHTML = ''
  }
}

// ── Dynamic payment fields per method ─────────────────────────────
function finPayChanged() {
  var forma = document.getElementById('finFormaPag')?.value || ''
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var el = document.getElementById('finPayDetails')
  if (!el) return

  var s = 'font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px'
  var inp = 'width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px'
  var html = ''

  if (forma === 'credito') {
    html = '<div style="background:#EFF6FF;padding:10px;border-radius:8px;border:1px solid #BFDBFE">' +
      '<div style="font-size:10px;font-weight:800;color:#1D4ED8;margin-bottom:8px">CARTAO DE CREDITO</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:6px">' +
        '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="radio" name="finCredTipo" value="avista" checked onchange="finCredChanged()"> A Vista</label>' +
        '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="radio" name="finCredTipo" value="parcelado" onchange="finCredChanged()"> Parcelado</label>' +
      '</div>' +
      '<div id="finCredParc" style="display:none">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div><label style="'+s+'">Parcelas</label><select id="finCredNParc" onchange="finCredCalc()" style="'+inp+'">' +
            [2,3,4,5,6,7,8,9,10,11,12].map(function(n){return '<option value="'+n+'">'+n+'x</option>'}).join('') +
          '</select></div>' +
          '<div><label style="'+s+'">Valor Parcela</label><input id="finCredValParc" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700"></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'parcelado') {
    html = '<div style="background:#FFF7ED;padding:10px;border-radius:8px;border:1px solid #FED7AA">' +
      '<div style="font-size:10px;font-weight:800;color:#C2410C;margin-bottom:8px">PARCELAMENTO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Parcelas</label><select id="finParcN" onchange="finParcCalc()" style="'+inp+'">' +
          [2,3,4,5,6,7,8,9,10,11,12].map(function(n){return '<option value="'+n+'">'+n+'x</option>'}).join('') +
        '</select></div>' +
        '<div><label style="'+s+'">Valor Parcela</label><input id="finParcVal" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700"></div>' +
        '<div><label style="'+s+'">1o Vencimento</label><input id="finParcData" type="date" style="'+inp+'"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'entrada_saldo') {
    html = '<div style="background:#F0FDF4;padding:10px;border-radius:8px;border:1px solid #BBF7D0">' +
      '<div style="font-size:10px;font-weight:800;color:#166534;margin-bottom:8px">ENTRADA + SALDO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Valor Entrada (R$)</label><input id="finEntradaVal" type="number" step="0.01" placeholder="0,00" oninput="finEntradaCalc()" style="'+inp+'"></div>' +
        '<div><label style="'+s+'">Forma Entrada</label><select id="finEntradaForma" style="'+inp+'">' +
          '<option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="debito">Debito</option><option value="credito">Credito</option></select></div>' +
        '<div><label style="'+s+'">Saldo Restante</label><input id="finSaldoVal" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700;color:#DC2626"></div>' +
        '<div><label style="'+s+'">Forma Saldo</label><select id="finSaldoForma" style="'+inp+'">' +
          '<option value="boleto">Boleto</option><option value="pix">PIX</option><option value="credito">Credito</option><option value="parcelado">Parcelado</option></select></div>' +
        '<div style="grid-column:span 2"><label style="'+s+'">Vencimento Saldo</label><input id="finSaldoData" type="date" style="'+inp+'"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'boleto') {
    html = '<div style="background:#FFFBEB;padding:10px;border-radius:8px;border:1px solid #FDE68A">' +
      '<div style="font-size:10px;font-weight:800;color:#92400E;margin-bottom:8px">BOLETO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Parcelas</label><select id="finBoletoN" onchange="finBoletoCalc()" style="'+inp+'">' +
          [1,2,3,4,5,6].map(function(n){return '<option value="'+n+'">'+(n===1?'A vista':n+'x')+'</option>'}).join('') +
        '</select></div>' +
        '<div><label style="'+s+'">Valor Parcela</label><input id="finBoletoVal" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700"></div>' +
        '<div><label style="'+s+'">1o Vencimento</label><input id="finBoletoData" type="date" style="'+inp+'"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'dinheiro') {
    html = '<div style="background:#ECFDF5;padding:10px;border-radius:8px;border:1px solid #A7F3D0">' +
      '<div style="font-size:10px;font-weight:800;color:#065F46;margin-bottom:8px">DINHEIRO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Recebido (R$)</label><input id="finDinRecebido" type="number" step="0.01" oninput="finDinCalc()" style="'+inp+'"></div>' +
        '<div><label style="'+s+'">Troco</label><input id="finDinTroco" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700;color:#059669"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'cortesia') {
    html = '<div style="background:#FEF2F2;padding:10px;border-radius:8px;border:1px solid #FECACA">' +
      '<div style="font-size:10px;font-weight:800;color:#991B1B;margin-bottom:8px">CORTESIA</div>' +
      '<div><label style="'+s+'">Motivo da cortesia (obrigatorio)</label><input id="finCortesiaMotivo" type="text" placeholder="Ex: primeira consulta, parceria..." style="'+inp+'"></div>' +
    '</div>'
  }

  else if (forma === 'convenio') {
    html = '<div style="background:#EDE9FE;padding:10px;border-radius:8px;border:1px solid #C4B5FD">' +
      '<div style="font-size:10px;font-weight:800;color:#5B21B6;margin-bottom:8px">CONVENIO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Nome do Convenio</label><input id="finConvNome" type="text" placeholder="Ex: Unimed, Amil..." style="'+inp+'"></div>' +
        '<div><label style="'+s+'">N. Autorizacao</label><input id="finConvAuth" type="text" placeholder="Numero" style="'+inp+'"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'link') {
    html = '<div style="background:#F0F9FF;padding:10px;border-radius:8px;border:1px solid #BAE6FD">' +
      '<div style="font-size:10px;font-weight:800;color:#0369A1;margin-bottom:8px">LINK DE PAGAMENTO</div>' +
      '<div><label style="'+s+'">URL do Link</label><input id="finLinkUrl" type="url" placeholder="https://..." style="'+inp+'"></div>' +
    '</div>'
  }

  el.innerHTML = html

  // Auto-calc on render
  if (forma === 'credito') finCredChanged()
  if (forma === 'parcelado') finParcCalc()
  if (forma === 'boleto') finBoletoCalc()
  if (forma === 'cortesia') {
    var pago = document.getElementById('finPago'); if (pago) pago.value = '0'
    var stat = document.getElementById('finStatusPag'); if (stat) stat.value = 'pago'
  }

  finUpdateBalance()
  _finAutoRoute()
}

// ── Credit card: a vista / parcelado toggle ──
function finCredChanged() {
  var tipo = document.querySelector('input[name="finCredTipo"]:checked')?.value
  var parcDiv = document.getElementById('finCredParc')
  if (parcDiv) parcDiv.style.display = tipo === 'parcelado' ? 'block' : 'none'
  if (tipo === 'parcelado') finCredCalc()
}

function finCredCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var n = parseInt(document.getElementById('finCredNParc')?.value || '2')
  var el = document.getElementById('finCredValParc')
  if (el && total > 0) el.value = 'R$ ' + window._fmtBRL(total / n)
}

// ── Parcelado calc ──
function finParcCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var n = parseInt(document.getElementById('finParcN')?.value || '2')
  var el = document.getElementById('finParcVal')
  if (el && total > 0) el.value = 'R$ ' + window._fmtBRL(total / n)
}

// ── Boleto calc ──
function finBoletoCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var n = parseInt(document.getElementById('finBoletoN')?.value || '1')
  var el = document.getElementById('finBoletoVal')
  if (el && total > 0) el.value = 'R$ ' + window._fmtBRL(total / n)
}

// ── Entrada + Saldo calc ──
function finEntradaCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var entrada = parseFloat(document.getElementById('finEntradaVal')?.value || '0')
  var saldo = total - entrada
  var el = document.getElementById('finSaldoVal')
  if (el) el.value = saldo > 0 ? 'R$ ' + window._fmtBRL(saldo) : 'R$ 0,00'
  // Auto-fill valor pago = entrada
  var pago = document.getElementById('finPago')
  if (pago) { pago.value = entrada.toFixed(2); finUpdateBalance() }
}

// ── Dinheiro: troco ──
function finDinCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var recebido = parseFloat(document.getElementById('finDinRecebido')?.value || '0')
  var troco = recebido - total
  var el = document.getElementById('finDinTroco')
  if (el) el.value = troco > 0 ? 'R$ ' + window._fmtBRL(troco) : '—'
  // Auto-fill valor pago
  var pago = document.getElementById('finPago')
  if (pago && recebido > 0) { pago.value = Math.min(recebido, total).toFixed(2); finUpdateBalance() }
}

function finUpdateBalance() {
  const tot = parseFloat(document.getElementById('finValor')?.value||'0')
  const pag = parseFloat(document.getElementById('finPago')?.value||'0')
  const el  = document.getElementById('finBalInfo'); if (!el) return
  if (tot>0&&pag<tot) { el.textContent=`Saldo: ${window._fmtBRL(tot-pag)}`; el.style.color='#EF4444' }
  else if (tot>0&&pag>=tot) { el.textContent='Pagamento completo'; el.style.color='#10B981' }
  else el.textContent=''
}

function finRouteChange() {
  const val = document.querySelector('input[name="finRoute"]:checked')?.value
  const map = { paciente:'#10B981', pac_orcamento:'#7C3AED', orcamento:'#F59E0B', nenhum:'#E5E7EB' }
  ;['paciente','pac_orc','orc','nenhum'].forEach(k=>{
    const id = k === 'pac_orc' ? 'finRouteLabel_pac_orc' : k==='orc'?'finRouteLabel_orc':k==='nenhum'?'finRouteLabel_nenhum':'finRouteLabel_paciente'
    const el = document.getElementById(id)
    if (!el) return
    const key = k==='pac_orc'?'pac_orcamento':k==='orc'?'orcamento':k==='nenhum'?'nenhum':'paciente'
    el.style.border = val===key ? `1.5px solid ${map[key]}` : '1.5px solid transparent'
    el.style.background = val===key ? `${map[key]}10` : 'transparent'
  })
}

function closeFinalizeModal(force) {
  if (!force) {
    // Perguntar antes de fechar — dados podem ser perdidos
    var hasData = _finalProcs.length > 0 || parseFloat(document.getElementById('finValor')?.value||'0') > 0
    if (hasData) {
      if (!confirm('Tem dados preenchidos. Deseja sair sem finalizar?\n\nOs dados serao perdidos.')) return
    }
  }
  const m = document.getElementById('smartFinalizeModal'); if(m) m.style.display='none'
}

var _finalizingInProgress = false

// Converte um pagamento "classic" (forma + pagDetalhes object) pra
// uma linha do array pagamentos[] canônico.
function _detalhesToPagamento(forma, valorTotal, valorPago, statusPag, det) {
  if (!forma) return null
  det = det || {}
  var status = (statusPag === 'pago' || valorPago >= valorTotal) ? 'pago' : 'aberto'
  var parcelas = 1
  if (forma === 'credito' && det.tipo === 'parcelado') parcelas = parseInt(det.parcelas) || 1
  else if (forma === 'parcelado') parcelas = parseInt(det.parcelas) || 1
  else if (forma === 'boleto' && det.parcelas) parcelas = parseInt(det.parcelas) || 1
  var valorParcela = parcelas > 0 ? Math.round((valorTotal / parcelas) * 100) / 100 : valorTotal

  var pag = {
    forma: forma,
    valor: parseFloat(valorTotal) || 0,
    status: status,
    parcelas: parcelas,
    valorParcela: valorParcela,
    comentario: '',
  }
  if (forma === 'cortesia') pag.motivoCortesia = det.motivo || ''
  if (forma === 'convenio') { pag.convenioNome = det.convenioNome || ''; pag.autorizacao = det.autorizacao || '' }
  if (forma === 'link')     pag.linkUrl = det.linkUrl || ''
  if (forma === 'dinheiro') { pag.recebido = parseFloat(det.recebido) || 0; pag.troco = parseFloat(det.troco) || 0 }
  if (det.primeiroVencimento) pag.primeiroVencimento = det.primeiroVencimento

  // Caso entrada_saldo: retorna 2 linhas seria mais correto, mas aqui
  // mantemos 1 linha com metadata pra não quebrar o array. O render lê ambas.
  if (forma === 'entrada_saldo') {
    pag.entrada = parseFloat(det.entrada) || 0
    pag.saldo = parseFloat(det.saldo) || (valorTotal - pag.entrada)
    pag.formaEntrada = det.formaEntrada || 'pix'
    pag.formaSaldo = det.formaSaldo || 'boleto'
    pag.vencimentoSaldo = det.vencimentoSaldo || ''
  }
  return pag
}

function confirmFinalize(id) {
  // Idempotency guard: prevent double-click
  if (_finalizingInProgress) return
  _finalizingInProgress = true

  // Re-enable after 3s safety timeout (in case of error)
  setTimeout(function() { _finalizingInProgress = false }, 3000)

  if (!window.getAppointments) { _finalizingInProgress = false; return }
  const appts = getAppointments()
  const idx = appts.findIndex(a=>a.id===id); if(idx<0) { _finalizingInProgress = false; return }
  const appt = appts[idx]

  // Already finalized? Prevent re-processing
  if (appt.status === 'finalizado') { _finalizingInProgress = false; window._showInlineAlert('Consulta ja finalizada', 'Esta consulta ja foi finalizada anteriormente.'); return }

  const valor    = parseFloat(document.getElementById('finValor')?.value||'0')
  const pago     = parseFloat(document.getElementById('finPago')?.value||'0')
  const forma    = document.getElementById('finFormaPag')?.value
  const statusP  = document.getElementById('finStatusPag')?.value
  const obs      = document.getElementById('finObs')?.value?.trim()
  const waPos    = document.getElementById('finWAPos')?.checked
  const avalGoogle = document.getElementById('finAvalGoogle')?.checked
  // VPI enrollment: default true (padrao "convidar"). Checkbox inexistente
  // cai no fallback true pra nao quebrar comportamento prevvio se render falhar.
  const vpiEnroll = document.getElementById('finVPIEnroll')
  const vpiEnrollChecked = vpiEnroll ? !!vpiEnroll.checked : true
  const route    = document.querySelector('input[name="finRoute"]:checked')?.value || 'nenhum'

  // ── Validacao completa ──
  var erros = []
  if (forma !== 'cortesia' && valor <= 0) erros.push('Informe o valor total')
  if (forma !== 'cortesia' && forma !== 'link' && statusP === 'pago' && pago <= 0) erros.push('Status "Pago" mas valor pago e zero')
  if (forma === 'cortesia') {
    var motivo = document.getElementById('finCortesiaMotivo')?.value?.trim()
    if (!motivo) erros.push('Informe o motivo da cortesia')
  }
  if (forma === 'convenio') {
    if (!(document.getElementById('finConvNome')?.value?.trim())) erros.push('Informe o nome do convenio')
  }
  if (forma === 'entrada_saldo') {
    var entVal = parseFloat(document.getElementById('finEntradaVal')?.value||'0')
    if (entVal <= 0) erros.push('Informe o valor da entrada')
    if (!(document.getElementById('finSaldoData')?.value)) erros.push('Informe o vencimento do saldo')
  }
  if (forma === 'parcelado' || (forma === 'credito' && document.querySelector('input[name="finCredTipo"]:checked')?.value === 'parcelado')) {
    // ok, auto-calculated
  }
  if (forma === 'boleto' && parseInt(document.getElementById('finBoletoN')?.value||'1') > 1) {
    if (!(document.getElementById('finBoletoData')?.value)) erros.push('Informe o 1o vencimento do boleto')
  }
  var routeVal = document.querySelector('input[name="finRoute"]:checked')?.value || 'nenhum'
  if (routeVal === 'nenhum') erros.push('Selecione o proximo estado do paciente (Bloco 4)')

  if (erros.length) {
    _finalizingInProgress = false
    window._showInlineAlert('Corrija antes de finalizar', erros)
    return
  }

  // ── Confirmacao de seguranca ──
  var nomePac = appt.pacienteNome || 'Paciente'
  var routeLabel = { paciente:'Paciente', pac_orcamento:'Paciente + Or\u00e7amento', orcamento:'Or\u00e7amento', nenhum:'\u2014' }[routeVal] || routeVal
  var resumo = 'Tem certeza que quer finalizar a consulta de *' + nomePac + '*?\n\n'
    + 'Procedimentos: ' + (_finalProcs.length ? _finalProcs.map(function(p){return p.nome}).join(', ') : 'nenhum') + '\n'
    + 'Valor: R$ ' + window._fmtBRL(valor) + '\n'
    + 'Pagamento: ' + (forma||'—') + '\n'
    + 'Destino: ' + routeLabel

  if (!confirm(resumo)) { _finalizingInProgress = false; return }

  // Collect payment details per method
  var pagDetalhes = { forma }
  if (forma === 'credito') {
    var credTipo = document.querySelector('input[name="finCredTipo"]:checked')?.value || 'avista'
    pagDetalhes.tipo = credTipo
    if (credTipo === 'parcelado') {
      pagDetalhes.parcelas = parseInt(document.getElementById('finCredNParc')?.value||'2')
      pagDetalhes.valorParcela = valor / pagDetalhes.parcelas
    }
  } else if (forma === 'parcelado') {
    pagDetalhes.parcelas = parseInt(document.getElementById('finParcN')?.value||'2')
    pagDetalhes.valorParcela = valor / pagDetalhes.parcelas
    pagDetalhes.primeiroVencimento = document.getElementById('finParcData')?.value || ''
  } else if (forma === 'entrada_saldo') {
    pagDetalhes.entrada = parseFloat(document.getElementById('finEntradaVal')?.value||'0')
    pagDetalhes.formaEntrada = document.getElementById('finEntradaForma')?.value || 'pix'
    pagDetalhes.saldo = valor - pagDetalhes.entrada
    pagDetalhes.formaSaldo = document.getElementById('finSaldoForma')?.value || 'boleto'
    pagDetalhes.vencimentoSaldo = document.getElementById('finSaldoData')?.value || ''
  } else if (forma === 'boleto') {
    pagDetalhes.parcelas = parseInt(document.getElementById('finBoletoN')?.value||'1')
    pagDetalhes.valorParcela = valor / pagDetalhes.parcelas
    pagDetalhes.primeiroVencimento = document.getElementById('finBoletoData')?.value || ''
  } else if (forma === 'dinheiro') {
    pagDetalhes.recebido = parseFloat(document.getElementById('finDinRecebido')?.value||'0')
    pagDetalhes.troco = Math.max(0, pagDetalhes.recebido - valor)
  } else if (forma === 'cortesia') {
    pagDetalhes.motivo = document.getElementById('finCortesiaMotivo')?.value || ''
    if (!pagDetalhes.motivo.trim()) { _finalizingInProgress = false; window._showInlineAlert('Campo obrigatorio', 'Informe o motivo da cortesia'); return }
  } else if (forma === 'convenio') {
    pagDetalhes.convenioNome = document.getElementById('finConvNome')?.value || ''
    pagDetalhes.autorizacao = document.getElementById('finConvAuth')?.value || ''
  } else if (forma === 'link') {
    pagDetalhes.linkUrl = document.getElementById('finLinkUrl')?.value || ''
  }

  // Validação completa de finalização via AgendaValidator
  if (window.AgendaValidator) {
    const finValidData = {
      tipoConsulta:   appt.tipoConsulta,
      tipoAvaliacao:  appt.tipoAvaliacao,
      valor,
      statusPagamento: document.getElementById('finStatusPag')?.value || 'pendente',
    }
    const errs = AgendaValidator.validateFinalize(appt, finValidData)
    if (errs.length) {
      if (window.showValidationErrors) showValidationErrors(errs, 'Não foi possível finalizar')
      return
    }
  } else if (appt.tipoConsulta==='avaliacao'&&appt.tipoAvaliacao==='paga'&&statusP==='pendente') {
    _finalizingInProgress = false; window._showInlineAlert('Avaliacao paga', 'Registre o pagamento antes de finalizar.'); return
  }

  // Determinar status pagamento automático
  let spFinal = statusP
  if (pago>0 && valor>0 && pago>=valor) spFinal = 'pago'
  else if (pago>0) spFinal = 'parcial'

  // ═══ SCHEMA CANÔNICO ═══
  // Merge procedimentos: preserva agendamento (cortesia, retorno, motivo)
  // e marca os realizados com realizado=true + realizadoEm.
  const S = window.ApptSchema
  const procsAgendados = S ? S.getProcs(appt) : (appt.procedimentos || appt.procedimentosRealizados || [])
  const procsRealizados = _finalProcs.length ? _finalProcs.map(function(p) {
    return {
      nome:   p.nome || '',
      valor:  parseFloat(p.valor || p.preco || 0) || 0,
      qtd:    p.qtd || 1,
      realizado:   true,
      realizadoEm: new Date().toISOString(),
    }
  }) : procsAgendados
  const procsMerged = S ? S.mergeProcs(procsAgendados, procsRealizados) : procsRealizados

  // Merge pagamentos: converte pagDetalhes pro array canônico e faz append
  // Se o appt já tem pagamentos[] do agendamento, usa eles como base
  var pagamentosCanon = (appt.pagamentos && appt.pagamentos.length)
    ? appt.pagamentos.slice()
    : (S ? S.getPagamentos(appt) : [])
  // Adiciona o pagamento registrado na finalização
  var pagNovo = _detalhesToPagamento(forma, valor, pago, spFinal, pagDetalhes)
  if (pagNovo) {
    // Se já tem 1 linha sem forma (placeholder), substitui; senão, faz append
    if (pagamentosCanon.length === 1 && !pagamentosCanon[0].forma) {
      pagamentosCanon[0] = pagNovo
    } else {
      pagamentosCanon.push(pagNovo)
    }
  }

  // Agregados de cortesia (consumidos por relatórios Mira/cashflow)
  var valorCortesia = S ? S.deriveValorCortesia(procsMerged) : 0
  var qtdProcsCortesia = procsMerged.filter(function(p) { return p.cortesia }).length
  var motivoCortesia = procsMerged.filter(function(p) { return p.cortesia && p.cortesiaMotivo })
    .map(function(p) { return p.nome + ': ' + p.cortesiaMotivo }).join(' | ')

  const at = new Date().toISOString()
  const auditLog = [...(appt.historicoAlteracoes||[]), {
    action_type: 'finalizacao',
    old_value:   { status: appt.status, valor: appt.valor, statusPagamento: appt.statusPagamento },
    new_value:   { status: 'finalizado', valor, statusPagamento: spFinal, route },
    changed_by:  'secretaria',
    changed_at:  at,
    reason:      `Finalização — rota: ${route}`,
  }]

  appts[idx] = {
    ...appt,
    status:                 'finalizado',
    valor,
    valorPago:              pago,
    // Schema canônico (nomes únicos em todo o sistema):
    procedimentos:          procsMerged,
    pagamentos:             pagamentosCanon,
    valorCortesia:          valorCortesia,
    qtdProcsCortesia:       qtdProcsCortesia,
    motivoCortesia:         motivoCortesia,
    // Derivados legacy pra compat retroativa:
    formaPagamento:         S ? S.deriveFormaPagamento(pagamentosCanon) : forma,
    statusPagamento:        S ? S.deriveStatusPagamento(pagamentosCanon) : spFinal,
    // Campos específicos da finalização:
    obsFinal:               obs,
    routingFinal:           route,
    finalizadoEm:           at,
    historicoStatus:        [...(appt.historicoStatus||[]),{status:'finalizado',at,by:'manual'}],
    historicoAlteracoes:    auditLog,
    // Legacy: manter temporariamente pra não quebrar consumidores antigos
    procedimentosRealizados: procsMerged,
    pagamentoDetalhes:       pagDetalhes,
  }
  saveAppointments(appts)

  const apptFinal = appts[idx]

  // Sync pro Supabase: garante que professional_id, value, status e
  // demais campos saiam do localStorage pro banco. Sem isso, o appointment
  // finalizado vive so local e relatorios por profissional/financeiros
  // ficam vazios.
  if (window.AppointmentsService && window.AppointmentsService.syncOne) {
    window.AppointmentsService.syncOne(apptFinal).catch(function(e) {
      console.warn('[Agenda] syncOne finalize falhou:', e)
    })
  }

  // Cashflow: cria entrada(s) automaticamente se houve pagamento
  if (window.CashflowService && pago > 0) {
    window.CashflowService.createFromAppointment({
      id:             apptFinal.id,
      date:           apptFinal.date || apptFinal.dataAgendamento,
      patient_id:     apptFinal.pacienteId || apptFinal.patient_id,
      pacienteName:   apptFinal.pacienteNome || apptFinal.patient_name,
      procedimento:   (procs[0] && (procs[0].nome || procs[0])) || 'Atendimento',
      valorPago:      pago,
      formaPagamento: forma,
      pagamentoDetalhes: pagDetalhes,
    }).catch(function(e) { console.warn('[Agenda] Cashflow create falhou:', e) })
  }

  // Queixas: atualizar queixas marcadas como tratadas
  if (window.ComplaintsPanel) {
    var cbs = document.querySelectorAll('.finComplaintCb:checked')
    cbs.forEach(function(cb) {
      var cid = cb.dataset.cid
      var procSel = document.querySelector('.finComplaintProc[data-cid="' + cid + '"]')
      var retouchSel = document.querySelector('.finComplaintRetouch[data-cid="' + cid + '"]')
      var proc = procSel ? procSel.value : ''
      if (proc === '__outro__') proc = 'Outro'
      var retouch = retouchSel ? parseInt(retouchSel.value) : 120
      if (proc) {
        ComplaintsPanel.saveComplaint({
          p_id: cid,
          p_status: 'em_tratamento',
          p_treatment_procedure: proc,
          p_treatment_date: new Date().toISOString(),
          p_retouch_interval_days: retouch,
          p_professional_name: apptFinal.profissionalNome || apptFinal.professional_name || '',
          p_appointment_id: apptFinal.id,
        }).catch(function(e) { console.warn('[Agenda] Complaint update falhou:', e) })
      }
    })
  }

  // Consentimentos: verificar se procedimento realizado tem TCLE pendente
  if (window.LegalDocumentsService && procs.length) {
    var _procNames = procs.map(function(p) { return p.nome || p }).filter(Boolean)
    _procNames.forEach(function(procName) {
      LegalDocumentsService.autoSendForStatus('na_clinica', {
        pacienteNome: apptFinal.pacienteNome || apptFinal.patient_name || '',
        pacienteTelefone: window._getPhone(apptFinal),
        procedimento: procName,
        profissionalIdx: apptFinal.profissionalIdx,
        professional_id: apptFinal.professional_id,
        appointmentId: apptFinal.id,
      }).catch(function(e) { console.warn('[Agenda] Consent on finalize falhou:', e) })
    })
  }

  // Bloco 3: Fluxos pos
  if (waPos)     sendWATemplate(id, 'pos_atendimento')
  if (avalGoogle) {
    // Agendar pedido de avaliacao para 3 dias depois
    var avalDate = new Date(); avalDate.setDate(avalDate.getDate() + 3); avalDate.setHours(14, 0, 0, 0)
    var q = _getQueue()
    q.push({
      id:          'aut_aval_' + Date.now(),
      apptId:      id,
      trigger:     'd_plus_3',
      type:        'whatsapp_avaliacao',
      scheduledAt: avalDate.toISOString(),
      executed:    false,
      payload:     { pacienteNome: apptFinal.pacienteNome, pacienteId: apptFinal.pacienteId }
    })
    _saveQueue(q)
    window._logAuto(id, 'fluxo_avaliacao_google', 'agendado_d3')
  }
  if (vpiEnrollChecked) window._logAuto(id, 'vpi_enroll', 'pendente')

  // Bloco 4: Routing — muda fase do lead baseado no resultado da consulta
  // Regra de negocio:
  //   procedimento realizado → paciente
  //   avaliacao + orcamento → orcamento
  //   paciente + orcamento → paciente (ja fez procedimento)
  //   nenhum (nao fez, pressao alta, urgencia) → mantem fase atual
  if (apptFinal.pacienteId && window.SdrService && SdrService.changePhase) {
    if (route === 'paciente' || route === 'pac_orcamento') {
      SdrService.changePhase(apptFinal.pacienteId, 'paciente', 'finalizacao')
    } else if (route === 'orcamento') {
      SdrService.changePhase(apptFinal.pacienteId, 'orcamento', 'finalizacao')
    }
    // route === 'nenhum' → NAO muda fase (compareceu mas nao realizou procedimento)
  }
  if (apptFinal.pacienteId) {

    // Aplicar tags
    if (route === 'paciente' && window.TagEngine) {
      var vars = { nome:apptFinal.pacienteNome||'', data:apptFinal.data||'' }
      try {
        TagEngine.applyTag(apptFinal.pacienteId, 'paciente', 'consulta_realizada', 'finalizacao', vars)
        if (procs.length) TagEngine.applyTag(apptFinal.pacienteId, 'paciente', 'procedimento_realizado', 'finalizacao', vars)
      } catch(e) {}
    }
    if (route === 'pac_orcamento' && window.TagEngine) {
      var vars2 = { nome:apptFinal.pacienteNome||'' }
      try {
        TagEngine.applyTag(apptFinal.pacienteId, 'pac_orcamento', 'orcamento_aberto', 'finalizacao', vars2)
      } catch(e) {}
    }
    if (route === 'orcamento' && window.TagEngine) {
      var vars3 = { nome:apptFinal.pacienteNome||'' }
      try {
        TagEngine.applyTag(apptFinal.pacienteId, 'orcamento', 'orc_em_aberto', 'finalizacao', vars3)
      } catch(e) {}
    }
  }

  // Consent. procedimento: agora coberto pela regra on_status='na_clinica' em wa_agenda_automations
  // (movido de on_finalize pra DURING em 17/04). Fallback disponivel no modal finalize via botao
  // "Enviar consentimento agora" (_finSendConsentProc) quando paciente pulou o check-in.
  // Consent. pagamento: segue hardcoded (sem equivalente no banco — condicional a forma=boleto/parcelado/entrada_saldo).
  if (['boleto','parcelado','entrada_saldo'].includes(forma)) {
    window._enviarConsentimento(apptFinal, 'pagamento')
  }

  // ── Payment tracking: criar tarefas de follow-up para pagamentos pendentes ──
  if (spFinal !== 'pago' && valor > 0 && ['boleto','parcelado','entrada_saldo','link'].includes(forma)) {
    var det = pagDetalhes || {}
    var venc = det.primeiroVencimento || det.vencimentoSaldo || ''
    var prazoH = venc ? Math.max(24, Math.round((new Date(venc+'T12:00:00').getTime() - Date.now()) / 3600000)) : 168 // 7 dias default
    var descPag = forma === 'boleto' ? (det.parcelas||1) + 'x boleto' :
                  forma === 'parcelado' ? (det.parcelas||1) + 'x parcelado' :
                  forma === 'entrada_saldo' ? 'Entrada R$ ' + window._fmtBRL(det.entrada||0) + ' + saldo R$ ' + window._fmtBRL(det.saldo||0) :
                  'Link pagamento'
    var payTasks = JSON.parse(localStorage.getItem('clinic_op_tasks') || '[]')
    payTasks.push({
      id:           'task_pay_' + Date.now(),
      tipo:         'pagamento',
      titulo:       'Follow-up pagamento: ' + (apptFinal.pacienteNome||'Paciente') + ' — ' + descPag,
      descricao:    'Valor total: R$ ' + window._fmtBRL(valor) + ' | Pago: R$ ' + window._fmtBRL(pago) + ' | Saldo: R$ ' + window._fmtBRL(valor-pago) + (venc ? ' | Venc: ' + venc : ''),
      responsavel:  'secretaria',
      status:       'pendente',
      prioridade:   'alta',
      prazo:        new Date(Date.now() + prazoH * 3600000).toISOString(),
      apptId:       id,
      pacienteNome: apptFinal.pacienteNome,
      createdAt:    new Date().toISOString(),
    })
    try { localStorage.setItem('clinic_op_tasks', JSON.stringify(payTasks)) } catch(e) { /* quota */ }
  }

  // VPI — Programa de Indicacao (fire-and-forget, nunca quebra finalize)
  //
  // autoEnroll: convida paciente pra virar embaixadora. Respeita o check
  //   finVPIEnroll (default true) — secretaria pode desmarcar pra nao convidar.
  // closeIndication: SEMPRE roda — fecha indicacao pendente se paciente foi
  //   indicada por alguem (fluxo independente de virar embaixadora).
  if (window.VPIEngine) {
    if (vpiEnrollChecked) {
      try { VPIEngine.autoEnroll(apptFinal).catch(function(e){ console.warn('[VPI] autoEnroll:', e) }) } catch(e) {}
    } else {
      console.info('[VPI] autoEnroll skipped — checkbox desmarcado no finalize')
    }
    try { VPIEngine.closeIndication(apptFinal).catch(function(e){ console.warn('[VPI] closeIndication:', e) }) } catch(e) {}
  }

  // Retoques — popup sugerindo intervalo de retoque (fire-and-forget)
  if (window.RetoquesEngine) {
    try { RetoquesEngine.openSuggestionModal(apptFinal) } catch(e) { console.warn('[Retoques] openSuggestionModal:', e) }
  }

  _finalizingInProgress = false
  closeFinalizeModal(true)
  if (window._showToast) _showToast('Finalizado', apptFinal.pacienteNome + ' finalizado com sucesso', 'success')
  if (window.renderAgenda) renderAgenda()
  setTimeout(()=>window.openApptDetail(id), 80)
}


  // Expose - mantem API publica identica ao monolito original
  window.openFinalizeModal   = openFinalizeModal
  window.closeFinalizeModal  = closeFinalizeModal
  window.confirmFinalize     = confirmFinalize
  window.addFinProc          = addFinProc
  window.removeFinProc       = removeFinProc
  window.finUpdateBalance    = finUpdateBalance
  window.finProcAutoPrice    = finProcAutoPrice
  window.finProcDesconto     = finProcDesconto
  window._finSendConsentProc = _finSendConsentProc
  window.finPayChanged       = finPayChanged
  window.finCredChanged      = finCredChanged
  window.finCredCalc         = finCredCalc
  window.finParcCalc         = finParcCalc
  window.finBoletoCalc       = finBoletoCalc
  window.finEntradaCalc      = finEntradaCalc
  window.finDinCalc          = finDinCalc
  window.finRouteChange      = finRouteChange
  window.updatePayStatus     = updatePayStatus
  window.savePay             = savePay

  window.AgendaSmartFinalize = Object.freeze({
    open:    openFinalizeModal,
    close:   closeFinalizeModal,
    confirm: confirmFinalize,
    addProc: addFinProc,
    removeProc: removeFinProc
  })
})()
