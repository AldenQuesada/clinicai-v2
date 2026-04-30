/**
 * ClinicAI — Cashflow Service
 * Camada de negocio para fluxo de caixa
 */
;(function () {
  'use strict'
  if (window._clinicaiCashflowSvcLoaded) return
  window._clinicaiCashflowSvcLoaded = true

  function _repo() { return window.CashflowRepository || null }

  // ── Constantes ────────────────────────────────────────────

  var PAYMENT_METHODS = [
    { id: 'pix',         label: 'PIX'             },
    { id: 'cash',        label: 'Dinheiro'        },
    { id: 'card_credit', label: 'Cartao Credito'  },
    { id: 'card_debit',  label: 'Cartao Debito'   },
    { id: 'transfer',    label: 'Transferencia'   },
    { id: 'boleto',      label: 'Boleto'          },
    { id: 'installment', label: 'Parcelado'       },
    { id: 'courtesy',    label: 'Cortesia'        },
    { id: 'convenio',    label: 'Convenio'        },
    { id: 'link',        label: 'Link Pagamento'  },
    { id: 'fee',         label: 'Taxa'            },
    { id: 'chargeback',  label: 'Estorno'         },
    { id: 'other',       label: 'Outro'           },
  ]

  var CATEGORIES = [
    { id: 'consulta',     label: 'Consulta/Procedimento' },
    { id: 'produto',      label: 'Venda de Produto'      },
    { id: 'despesa_fixa', label: 'Despesa Fixa'          },
    { id: 'despesa_var',  label: 'Despesa Variavel'      },
    { id: 'imposto',      label: 'Imposto/Taxa'          },
    { id: 'outro',        label: 'Outro'                 },
  ]

  // Mapeia formaPagamento do agenda-modal para payment_method do cashflow
  var APPT_PAYMENT_MAP = {
    'pix':           'pix',
    'dinheiro':      'cash',
    'debito':        'card_debit',
    'credito':       'card_credit',
    'parcelado':     'installment',
    'entrada_saldo': 'pix', // entrada vai como PIX, saldo trata em outra entrada
    'boleto':        'boleto',
    'link':          'link',
    'cortesia':      'courtesy',
    'convenio':      'convenio',
  }

  // ── Helpers ───────────────────────────────────────────────

  function fmtCurrency(value) {
    var v = Number(value || 0)
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function fmtDate(dateStr) {
    if (!dateStr) return ''
    var d = typeof dateStr === 'string' ? new Date(dateStr + 'T00:00:00') : new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('pt-BR')
  }

  function methodLabel(id) {
    var m = PAYMENT_METHODS.find(function(x) { return x.id === id })
    return m ? m.label : id
  }

  function todayISO() {
    var d = new Date()
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
  }

  function monthRange(year, month) {
    var y = year || new Date().getFullYear()
    var m = (month || (new Date().getMonth() + 1))
    var start = y + '-' + String(m).padStart(2, '0') + '-01'
    var lastDay = new Date(y, m, 0).getDate()
    var end = y + '-' + String(m).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')
    return { start: start, end: end }
  }

  // ── API publica ───────────────────────────────────────────

  async function listEntries(filters) {
    var repo = _repo()
    if (!repo) return { ok: false, data: [], error: 'CashflowRepository nao disponivel' }
    return repo.list(filters)
  }

  async function getSummary(startDate, endDate) {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.summary(startDate, endDate)
  }

  async function createEntry(entry) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'CashflowRepository nao disponivel' }
    return repo.create(entry)
  }

  async function updateEntry(id, patch) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'CashflowRepository nao disponivel' }
    return repo.update(id, patch)
  }

  async function deleteEntry(id) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'CashflowRepository nao disponivel' }
    return repo.remove(id)
  }

  async function linkAppointment(entryId, appointmentId, patientId) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'CashflowRepository nao disponivel' }
    return repo.linkAppointment(entryId, appointmentId, patientId)
  }

  async function searchCandidates(amount, date, toleranceDays) {
    var repo = _repo()
    if (!repo) return { ok: false, data: [], error: 'CashflowRepository nao disponivel' }
    return repo.searchAppointments(amount, date, toleranceDays)
  }

  async function autoReconcile(startDate, endDate) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'CashflowRepository nao disponivel' }
    return repo.autoReconcile(startDate, endDate)
  }

  async function getSuggestions(startDate, endDate) {
    var repo = _repo()
    if (!repo) return { ok: false, data: [], error: 'CashflowRepository nao disponivel' }
    return repo.getSuggestions(startDate, endDate)
  }

  async function rejectSuggestion(entryId) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'CashflowRepository nao disponivel' }
    return repo.rejectSuggestion(entryId)
  }

  async function getIntelligence(year, month) {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.getIntelligence(year, month)
  }

  async function getDre(year, month) {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.getDre(year, month)
  }

  async function getConfig() {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.getConfig()
  }

  async function saveConfig(data) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'CashflowRepository nao disponivel' }
    return repo.saveConfig(data)
  }

  async function getSegments(year, month) {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.getSegments(year, month)
  }

  async function getPatientsLtv(limit, onlyActive) {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.getPatientsLtv(limit, onlyActive)
  }

  async function getVipSumidos(minDays, maxDays, limit) {
    var repo = _repo()
    if (!repo) return { ok: false, data: [], error: 'CashflowRepository nao disponivel' }
    return repo.getVipSumidos(minDays, maxDays, limit)
  }

  async function getTrends(year, month) {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.getTrends(year, month)
  }

  async function getDasEstimate(year, month) {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.getDasEstimate(year, month)
  }

  async function getForecast(monthsAhead) {
    var repo = _repo()
    if (!repo) return { ok: false, data: {}, error: 'CashflowRepository nao disponivel' }
    return repo.getForecast(monthsAhead)
  }

  // ── Hook: cria entry a partir de appointment finalizado ──

  /**
   * Cria entrada(s) de fluxo de caixa a partir de um agendamento finalizado.
   * Chamado pelo finalize-modal apos salvar o appointment.
   *
   * Lê do schema canônico (pagamentos[]) com fallback pra pagamentoDetalhes
   * legacy via ApptSchema.getPagamentos.
   *
   * @param {object} appt
   * @returns {Promise<{ok, ids[]}>}
   */
  async function createFromAppointment(appt) {
    if (!appt || !appt.id) return { ok: false, error: 'Appointment invalido' }

    // ═ Schema canônico: pagamentos[] ═
    var S = window.ApptSchema
    var pagamentos = S ? S.getPagamentos(appt) : (appt.pagamentos || [])
    var valorPago = Number(appt.valorPago || 0)

    if (!pagamentos.length || valorPago <= 0) {
      return { ok: true, ids: [], skipped: 'sem pagamento' }
    }

    var formaPagamento = (S && S.deriveFormaPagamento(pagamentos)) || appt.formaPagamento || ''
    if (!formaPagamento) return { ok: true, ids: [], skipped: 'sem forma' }

    var method = APPT_PAYMENT_MAP[formaPagamento] || 'other'
    var dateStr = appt.date || appt.dataAgendamento || todayISO()
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      var parts = dateStr.split('/')
      dateStr = parts[2] + '-' + parts[1] + '-' + parts[0]
    }

    var ids = []
    // det é compat legacy pro código antigo abaixo; novos caminhos preferem pagamentos[]
    var det = appt.pagamentoDetalhes || (pagamentos[0] || {})

    // Caso especial: entrada + saldo → cria 2 entries
    if (formaPagamento === 'entrada_saldo' && det.entrada && det.saldo) {
      var r1 = await createEntry({
        transaction_date: dateStr,
        direction:        'credit',
        amount:           Number(det.entrada),
        payment_method:   APPT_PAYMENT_MAP[det.formaEntrada] || 'pix',
        description:      'Entrada — ' + (appt.pacienteName || 'Paciente'),
        category:         'consulta',
        source:           'finalize_modal',
        external_id:      appt.id + '__entrada',
        patient_id:       appt.patient_id || appt.pacienteId || null,
        appointment_id:   appt.id,
        match_confidence: 'manual',
      })
      if (r1.ok && r1.data && r1.data.id) ids.push(r1.data.id)

      var r2 = await createEntry({
        transaction_date: det.vencimentoSaldo || dateStr,
        direction:        'credit',
        amount:           Number(det.saldo),
        payment_method:   APPT_PAYMENT_MAP[det.formaSaldo] || 'boleto',
        description:      'Saldo — ' + (appt.pacienteName || 'Paciente'),
        category:         'consulta',
        source:           'finalize_modal',
        external_id:      appt.id + '__saldo',
        patient_id:       appt.patient_id || appt.pacienteId || null,
        appointment_id:   appt.id,
        match_confidence: 'pending_bank_confirmation',
      })
      if (r2.ok && r2.data && r2.data.id) ids.push(r2.data.id)
      return { ok: true, ids: ids }
    }

    // Caso especial: parcelado → cria N entries (uma por parcela)
    if ((formaPagamento === 'parcelado' || formaPagamento === 'credito') && det.parcelas && det.parcelas > 1) {
      var n = parseInt(det.parcelas, 10)
      var valorParcela = Number(det.valorParcela || (valorPago / n))
      var firstDate = det.primeiroVencimento || dateStr
      var fd = new Date(firstDate + 'T00:00:00')
      for (var i = 0; i < n; i++) {
        var d = new Date(fd.getFullYear(), fd.getMonth() + i, fd.getDate())
        var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
        var rp = await createEntry({
          transaction_date:  iso,
          direction:         'credit',
          amount:            valorParcela,
          payment_method:    'card_credit',
          description:       'Parcela ' + (i + 1) + '/' + n + ' — ' + (appt.pacienteName || 'Paciente'),
          category:          'consulta',
          source:            'finalize_modal',
          external_id:       appt.id + '__parc' + (i + 1),
          patient_id:        appt.patient_id || appt.pacienteId || null,
          appointment_id:    appt.id,
          installment_number: i + 1,
          installment_total:  n,
          match_confidence:  i === 0 ? 'manual' : 'pending_bank_confirmation',
        })
        if (rp.ok && rp.data && rp.data.id) ids.push(rp.data.id)
      }
      return { ok: true, ids: ids }
    }

    // Caso default: 1 entry
    var r = await createEntry({
      transaction_date: dateStr,
      direction:        formaPagamento === 'cortesia' ? 'credit' : 'credit',
      amount:           formaPagamento === 'cortesia' ? 0 : valorPago,
      payment_method:   method,
      description:      (appt.procedimento || 'Atendimento') + ' — ' + (appt.pacienteName || 'Paciente'),
      category:         'consulta',
      source:           'finalize_modal',
      external_id:      appt.id,
      patient_id:       appt.patient_id || appt.pacienteId || null,
      appointment_id:   appt.id,
      procedure_name:   appt.procedimento || null,
      professional_id:  appt.professional_id || null,
      match_confidence: 'manual',
    })
    if (r.ok && r.data && r.data.id) ids.push(r.data.id)
    return { ok: true, ids: ids }
  }

  // ── Expose ────────────────────────────────────────────────

  window.CashflowService = Object.freeze({
    PAYMENT_METHODS:      PAYMENT_METHODS,
    CATEGORIES:           CATEGORIES,
    APPT_PAYMENT_MAP:     APPT_PAYMENT_MAP,
    fmtCurrency:          fmtCurrency,
    fmtDate:              fmtDate,
    methodLabel:          methodLabel,
    todayISO:             todayISO,
    monthRange:           monthRange,
    listEntries:          listEntries,
    getSummary:           getSummary,
    createEntry:          createEntry,
    updateEntry:          updateEntry,
    deleteEntry:          deleteEntry,
    linkAppointment:      linkAppointment,
    searchCandidates:     searchCandidates,
    autoReconcile:        autoReconcile,
    getSuggestions:       getSuggestions,
    rejectSuggestion:     rejectSuggestion,
    getIntelligence:      getIntelligence,
    getDre:               getDre,
    getConfig:            getConfig,
    saveConfig:           saveConfig,
    getSegments:          getSegments,
    getPatientsLtv:       getPatientsLtv,
    getVipSumidos:        getVipSumidos,
    getTrends:            getTrends,
    getDasEstimate:       getDasEstimate,
    getForecast:          getForecast,
    createFromAppointment: createFromAppointment,
  })
})()
