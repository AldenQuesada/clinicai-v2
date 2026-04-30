/**
 * ProcsPaymentsBlock — módulo reutilizável pra:
 *   - Lista editável de procedimentos (nome, valor, cortesia, desconto)
 *   - Bloco de pagamentos (forma, valor, parcelas, status, comentário)
 *   - Sync automático do total
 *
 * Usado hoje em:
 *   - Modal de Orçamentos (js/orcamentos.js)
 *
 * Futuro: extrair agenda-modal.js pra usar este módulo também.
 *
 * API:
 *   var block = ProcsPaymentsBlock.create(opts)
 *   block.mount(hostEl)
 *   var state = block.getState() // { procs, payments, desconto, subtotal, total }
 *   block.setState({ procs, payments, desconto })
 *   block.destroy()
 */
;(function () {
  'use strict'
  if (window.ProcsPaymentsBlock) return

  var FORMAS_PAGAMENTO = [
    { value: 'pix',           label: 'PIX' },
    { value: 'dinheiro',      label: 'Dinheiro' },
    { value: 'debito',        label: 'Débito' },
    { value: 'credito',       label: 'Crédito' },
    { value: 'parcelado',     label: 'Parcelado' },
    { value: 'entrada_saldo', label: 'Entrada + Saldo' },
    { value: 'boleto',        label: 'Boleto' },
    { value: 'link',          label: 'Link Pagamento' },
    { value: 'convenio',      label: 'Convênio' },
  ]

  function _temParcelas(forma) {
    return forma === 'credito' || forma === 'parcelado'
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    })
  }

  function _money(v) {
    var n = parseFloat(v) || 0
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  var _idCounter = 0

  function create(opts) {
    opts = opts || {}
    var instId = '_ppb_' + (++_idCounter)
    var state = {
      procs: Array.isArray(opts.initialProcs) ? opts.initialProcs.map(_cloneProc) : [],
      payments: Array.isArray(opts.initialPayments) ? opts.initialPayments.map(_clonePay) : [],
      desconto: parseFloat(opts.initialDesconto) || 0,
    }
    var hostEl = null
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {}
    var availableProcs = Array.isArray(opts.availableProcs) ? opts.availableProcs : []

    function _cloneProc(p) {
      return {
        nome: String(p.nome || ''),
        valor: parseFloat(p.valor) || 0,
        cortesia: !!p.cortesia,
        cortesiaMotivo: String(p.cortesiaMotivo || ''),
      }
    }
    function _clonePay(p) {
      return {
        forma: String(p.forma || ''),
        valor: parseFloat(p.valor) || 0,
        status: p.status === 'pago' ? 'pago' : 'aberto',
        parcelas: parseInt(p.parcelas) || 1,
        valorParcela: parseFloat(p.valorParcela) || 0,
        comentario: String(p.comentario || ''),
      }
    }

    function _subtotal() {
      return state.procs.reduce(function (s, p) {
        return s + (p.cortesia ? 0 : (parseFloat(p.valor) || 0))
      }, 0)
    }
    function _total() {
      return Math.max(0, _subtotal() - (parseFloat(state.desconto) || 0))
    }
    function _totalPagamentos() {
      return state.payments.reduce(function (s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
    }

    function _procSelectOptions(selected) {
      var html = '<option value="">— Adicionar procedimento —</option>'
      var cats = {}
      availableProcs.forEach(function (p) {
        var cat = p.categoria || 'Outros'
        if (!cats[cat]) cats[cat] = []
        cats[cat].push(p)
      })
      Object.keys(cats).sort().forEach(function (cat) {
        html += '<optgroup label="' + _esc(cat) + '">'
        cats[cat].forEach(function (p) {
          var sel = p.nome === selected ? ' selected' : ''
          html += '<option value="' + _esc(p.nome) + '" data-valor="' + (p.valor || 0) + '"' + sel + '>' +
            _esc(p.nome) + (p.valor > 0 ? ' — ' + _money(p.valor) : '') + '</option>'
        })
        html += '</optgroup>'
      })
      return html
    }

    function _formaOptions(selected) {
      var html = '<option value="">Forma...</option>'
      FORMAS_PAGAMENTO.forEach(function (f) {
        var sel = f.value === selected ? ' selected' : ''
        html += '<option value="' + f.value + '"' + sel + '>' + f.label + '</option>'
      })
      return html
    }

    function _renderProcs() {
      if (!state.procs.length) {
        return '<div style="padding:18px;background:#F9FAFB;border:1px dashed #E5E7EB;border-radius:10px;text-align:center;font-size:12px;color:#9CA3AF">Nenhum procedimento adicionado ainda.</div>'
      }
      return state.procs.map(function (p, i) {
        var cortesiaTxt = p.cortesia ? '✓ Cortesia' : 'Pago'
        var cortesiaBg = p.cortesia ? '#DBEAFE' : '#F3F4F6'
        var cortesiaFg = p.cortesia ? '#1E40AF' : '#6B7280'
        return (
          '<div class="ppb-proc-card" data-proc-idx="' + i + '" style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:10px;margin-bottom:8px">' +
            '<div style="display:flex;gap:6px;align-items:center">' +
              '<input type="text" data-ppb="proc-nome" data-idx="' + i + '" value="' + _esc(p.nome) + '" placeholder="Nome do procedimento" style="flex:1;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;outline:none"/>' +
              '<input type="number" step="0.01" data-ppb="proc-valor" data-idx="' + i + '" value="' + (p.valor || '') + '" placeholder="R$" style="width:90px;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;outline:none"/>' +
              '<button type="button" data-ppb="proc-toggle-cortesia" data-idx="' + i + '" style="padding:7px 10px;background:' + cortesiaBg + ';color:' + cortesiaFg + ';border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">' + cortesiaTxt + '</button>' +
              '<button type="button" data-ppb="proc-remove" data-idx="' + i + '" style="padding:7px 9px;background:#FEE2E2;color:#DC2626;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;line-height:1">×</button>' +
            '</div>' +
            (p.cortesia ?
              '<input type="text" data-ppb="proc-cortesia-motivo" data-idx="' + i + '" value="' + _esc(p.cortesiaMotivo) + '" placeholder="Motivo da cortesia (ex: indicação, campanha)" style="margin-top:7px;width:100%;box-sizing:border-box;padding:6px 9px;border:1px solid #DBEAFE;border-radius:7px;font-size:11px;color:#1E40AF;outline:none;background:#EFF6FF"/>'
              : '') +
          '</div>'
        )
      }).join('')
    }

    function _renderPayments() {
      if (!state.payments.length) {
        return '<div style="padding:12px;background:#F9FAFB;border:1px dashed #E5E7EB;border-radius:10px;text-align:center;font-size:12px;color:#9CA3AF">Nenhuma forma de pagamento definida.</div>'
      }
      var canRemove = state.payments.length > 1
      return state.payments.map(function (p, i) {
        var pago = p.status === 'pago'
        var bg = pago ? '#F0FDF4' : '#fff'
        var bd = pago ? '#86EFAC' : '#E5E7EB'
        var btnTxt = pago ? '✓ Pago' : '○ Aberto'
        var btnBg = pago ? '#16A34A' : '#F3F4F6'
        var btnFg = pago ? '#fff' : '#6B7280'
        var tem = _temParcelas(p.forma)
        var valorStr = p.valor ? parseFloat(p.valor).toFixed(2) : ''
        var valorParcelaStr = p.valorParcela ? parseFloat(p.valorParcela).toFixed(2) : ''
        var removeBtn = canRemove
          ? '<button type="button" data-ppb="pay-remove" data-idx="' + i + '" style="padding:5px 8px;background:#FEE2E2;color:#DC2626;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;line-height:1">×</button>'
          : ''
        var parcelasHtml = tem
          ? '<div style="display:flex;gap:5px;align-items:center;margin-top:6px">' +
              '<label style="font-size:10px;font-weight:700;color:#6B7280">Parcelas</label>' +
              '<input type="number" min="1" max="24" data-ppb="pay-parcelas" data-idx="' + i + '" value="' + (p.parcelas || 1) + '" style="width:56px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>' +
              '<span style="font-size:10px;color:#6B7280">× R$</span>' +
              '<input type="number" step="0.01" data-ppb="pay-valorparcela" data-idx="' + i + '" value="' + valorParcelaStr + '" style="width:88px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>' +
            '</div>'
          : ''
        return (
          '<div class="ppb-pay-row" data-pay-idx="' + i + '" style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:8px;padding:8px;margin-bottom:6px">' +
            '<div style="display:flex;gap:5px;align-items:center">' +
              '<select data-ppb="pay-forma" data-idx="' + i + '" style="flex:1;padding:6px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;background:#fff;outline:none">' + _formaOptions(p.forma) + '</select>' +
              '<input type="number" step="0.01" data-ppb="pay-valor" data-idx="' + i + '" placeholder="0,00" value="' + valorStr + '" style="width:90px;padding:6px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none"/>' +
              '<button type="button" data-ppb="pay-toggle" data-idx="' + i + '" style="padding:6px 10px;background:' + btnBg + ';color:' + btnFg + ';border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">' + btnTxt + '</button>' +
              removeBtn +
            '</div>' +
            parcelasHtml +
            '<input type="text" data-ppb="pay-comentario" data-idx="' + i + '" placeholder="Comentário (opcional)" value="' + _esc(p.comentario) + '" style="width:100%;margin-top:6px;box-sizing:border-box;padding:6px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none"/>' +
          '</div>'
        )
      }).join('')
    }

    function _renderTotalStatus() {
      var totalEsperado = _total()
      var totalAlocado = _totalPagamentos()
      var diff = +(totalEsperado - totalAlocado).toFixed(2)
      var color, text
      if (Math.abs(diff) < 0.01) {
        color = '#16A34A'
        text = 'Alocado: ' + _money(totalAlocado) + ' / ' + _money(totalEsperado)
      } else if (diff > 0) {
        color = '#DC2626'
        text = 'Falta alocar ' + _money(diff) + ' (' + _money(totalAlocado) + ' / ' + _money(totalEsperado) + ')'
      } else {
        color = '#DC2626'
        text = 'Excesso de ' + _money(Math.abs(diff)) + ' (' + _money(totalAlocado) + ' / ' + _money(totalEsperado) + ')'
      }
      return '<span style="color:' + color + ';font-weight:700">' + text + '</span>'
    }

    function _render() {
      if (!hostEl) return
      var subtotal = _subtotal()
      var desc = parseFloat(state.desconto) || 0
      var total = _total()
      hostEl.innerHTML =
        '<div class="ppb-wrap" style="display:flex;flex-direction:column;gap:14px">' +

          // ─ Procedimentos ─
          '<div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
              '<div style="font-size:12px;font-weight:800;color:#111">Procedimentos</div>' +
              (availableProcs.length
                ? '<select data-ppb="proc-add-select" style="padding:6px 8px;border:1px solid #E5E7EB;border-radius:7px;font-size:11px;background:#fff;min-width:200px;outline:none">' + _procSelectOptions('') + '</select>'
                : '<button type="button" data-ppb="proc-add" style="padding:6px 10px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">+ Adicionar</button>'
              ) +
            '</div>' +
            '<div data-ppb-region="procs">' + _renderProcs() + '</div>' +
            (availableProcs.length
              ? '<button type="button" data-ppb="proc-add-blank" style="margin-top:6px;padding:5px 10px;background:#fff;border:1px dashed #7C3AED;color:#7C3AED;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">+ Livre (digitar)</button>'
              : ''
            ) +
          '</div>' +

          // ─ Subtotal + Desconto + Total ─
          '<div style="padding:10px 12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;display:flex;flex-direction:column;gap:6px">' +
            '<div style="display:flex;justify-content:space-between;font-size:12px;color:#6B7280">' +
              '<span>Subtotal</span><span data-ppb-region="subtotal" style="font-weight:700;color:#111">' + _money(subtotal) + '</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6B7280">' +
              '<span>Desconto</span>' +
              '<input type="number" step="0.01" data-ppb="desconto" value="' + (desc || '') + '" placeholder="0,00" style="width:110px;padding:5px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;outline:none;text-align:right"/>' +
            '</div>' +
            '<div style="height:1px;background:#E5E7EB"></div>' +
            '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;color:#111">' +
              '<span>Total</span><span data-ppb-region="total">' + _money(total) + '</span>' +
            '</div>' +
          '</div>' +

          // ─ Pagamentos ─
          '<div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
              '<div style="font-size:12px;font-weight:800;color:#111">Pagamento' + (opts.paymentsLabel ? ' — ' + opts.paymentsLabel : '') + '</div>' +
              '<button type="button" data-ppb="pay-add" style="padding:6px 10px;background:#10B981;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">+ Forma</button>' +
            '</div>' +
            '<div data-ppb-region="payments">' + _renderPayments() + '</div>' +
            '<div data-ppb-region="pay-status" style="margin-top:6px;font-size:11px;text-align:right">' + _renderTotalStatus() + '</div>' +
          '</div>' +
        '</div>'
    }

    function _refreshTotals() {
      if (!hostEl) return
      var st = hostEl.querySelector('[data-ppb-region="subtotal"]')
      var to = hostEl.querySelector('[data-ppb-region="total"]')
      var ps = hostEl.querySelector('[data-ppb-region="pay-status"]')
      if (st) st.textContent = _money(_subtotal())
      if (to) to.textContent = _money(_total())
      if (ps) ps.innerHTML = _renderTotalStatus()
    }

    function _handle(e) {
      var el = e.target.closest('[data-ppb]')
      if (!el || !hostEl.contains(el)) return
      var act = el.getAttribute('data-ppb')
      var idx = parseInt(el.getAttribute('data-idx'), 10)

      if (act === 'proc-add' || act === 'proc-add-blank') {
        state.procs.push({ nome: '', valor: 0, cortesia: false, cortesiaMotivo: '' })
        _render(); onChange(getState()); return
      }
      if (act === 'proc-add-select') {
        var opt = el.options[el.selectedIndex]
        if (!opt || !opt.value) return
        var valor = parseFloat(opt.getAttribute('data-valor')) || 0
        state.procs.push({ nome: opt.value, valor: valor, cortesia: false, cortesiaMotivo: '' })
        el.selectedIndex = 0
        _render(); onChange(getState()); return
      }
      if (act === 'proc-remove' && !isNaN(idx)) {
        state.procs.splice(idx, 1); _render(); onChange(getState()); return
      }
      if (act === 'proc-toggle-cortesia' && !isNaN(idx)) {
        state.procs[idx].cortesia = !state.procs[idx].cortesia
        if (!state.procs[idx].cortesia) state.procs[idx].cortesiaMotivo = ''
        _render(); onChange(getState()); return
      }
      if (act === 'proc-nome' && !isNaN(idx)) {
        state.procs[idx].nome = el.value
        onChange(getState()); return
      }
      if (act === 'proc-valor' && !isNaN(idx)) {
        state.procs[idx].valor = parseFloat(el.value) || 0
        _refreshTotals(); onChange(getState()); return
      }
      if (act === 'proc-cortesia-motivo' && !isNaN(idx)) {
        state.procs[idx].cortesiaMotivo = el.value
        onChange(getState()); return
      }
      if (act === 'desconto') {
        state.desconto = parseFloat(el.value) || 0
        _refreshTotals(); onChange(getState()); return
      }
      if (act === 'pay-add') {
        state.payments.push({ forma: '', valor: _total() - _totalPagamentos(), status: 'aberto', parcelas: 1, valorParcela: 0, comentario: '' })
        _render(); onChange(getState()); return
      }
      if (act === 'pay-remove' && !isNaN(idx)) {
        if (state.payments.length <= 1) return
        state.payments.splice(idx, 1); _render(); onChange(getState()); return
      }
      if (act === 'pay-toggle' && !isNaN(idx)) {
        state.payments[idx].status = state.payments[idx].status === 'pago' ? 'aberto' : 'pago'
        _render(); onChange(getState()); return
      }
      if (act === 'pay-forma' && !isNaN(idx)) {
        state.payments[idx].forma = el.value
        var p = state.payments[idx]
        if (_temParcelas(p.forma) && p.parcelas > 0) {
          p.valorParcela = +((p.valor || 0) / p.parcelas).toFixed(2)
        } else {
          p.valorParcela = p.valor
        }
        _render(); onChange(getState()); return
      }
      if (act === 'pay-valor' && !isNaN(idx)) {
        var pp = state.payments[idx]
        pp.valor = parseFloat(el.value) || 0
        if (_temParcelas(pp.forma) && pp.parcelas > 0) pp.valorParcela = +(pp.valor / pp.parcelas).toFixed(2)
        else pp.valorParcela = pp.valor
        _refreshTotals(); onChange(getState()); return
      }
      if (act === 'pay-parcelas' && !isNaN(idx)) {
        var n = parseInt(el.value) || 1
        if (n < 1) n = 1; if (n > 24) n = 24
        state.payments[idx].parcelas = n
        var q = state.payments[idx]
        if (_temParcelas(q.forma) && n > 0) q.valorParcela = +((q.valor || 0) / n).toFixed(2)
        _refreshTotals(); onChange(getState()); return
      }
      if (act === 'pay-valorparcela' && !isNaN(idx)) {
        state.payments[idx].valorParcela = parseFloat(el.value) || 0
        onChange(getState()); return
      }
      if (act === 'pay-comentario' && !isNaN(idx)) {
        state.payments[idx].comentario = el.value
        onChange(getState()); return
      }
    }

    function getState() {
      return {
        procs:    state.procs.map(_cloneProc),
        payments: state.payments.map(_clonePay),
        desconto: parseFloat(state.desconto) || 0,
        subtotal: _subtotal(),
        total:    _total(),
      }
    }

    function setState(s) {
      if (!s) return
      if (Array.isArray(s.procs))    state.procs    = s.procs.map(_cloneProc)
      if (Array.isArray(s.payments)) state.payments = s.payments.map(_clonePay)
      if (s.desconto != null)        state.desconto = parseFloat(s.desconto) || 0
      if (hostEl) _render()
    }

    function mount(el) {
      if (!el) return
      if (hostEl) destroy()
      hostEl = el
      _render()
      hostEl.addEventListener('input',  _handle)
      hostEl.addEventListener('change', _handle)
      hostEl.addEventListener('click',  _handle)
    }

    function destroy() {
      if (!hostEl) return
      hostEl.removeEventListener('input', _handle)
      hostEl.removeEventListener('change', _handle)
      hostEl.removeEventListener('click', _handle)
      hostEl.innerHTML = ''
      hostEl = null
    }

    return { mount: mount, getState: getState, setState: setState, destroy: destroy, instId: instId }
  }

  window.ProcsPaymentsBlock = Object.freeze({ create: create })
})()
