/**
 * ClinicAI - Report Luxury Pricing
 *
 * Calcula investimento integrado e isolado a partir de FM._annotations
 * usando FM.TREATMENTS.unitPrice como tabela de precos.
 *
 * Logica de "isolado vs integrado":
 *   - Isolado: soma direta dos precos unitarios (sem desconto)
 *   - Integrado: soma com desconto configurado (default 40%)
 *   - O desconto representa o "premio do protocolo" — racional clinico:
 *     visitas economizadas, anestesia compartilhada, planejamento unico.
 */
;(function () {
  'use strict'
  if (window._reportLuxuryPricingLoaded) return
  window._reportLuxuryPricingLoaded = true

  var DEFAULT_INTEGRATED_DISCOUNT = 0.40   // 40% desconto vs isolado

  function _treatments() {
    return (window._FM && window._FM.TREATMENTS) || []
  }

  function _findTreatment(id) {
    return _treatments().find(function (t) { return t.id === id })
  }

  // Soma {treatmentId -> totalUnits} a partir das anotacoes
  function _aggregate(annotations) {
    var byTreatment = {}
    ;(annotations || []).forEach(function (a) {
      var key = a.treatment
      if (!byTreatment[key]) byTreatment[key] = { units: 0, count: 0 }
      byTreatment[key].units += (a.ml || 0)
      byTreatment[key].count += 1
    })
    return byTreatment
  }

  // Retorna estrutura completa para o report:
  //   { isolated, integrated, savings, savingsPct, lines: [...] }
  function _calculate(annotations, opts) {
    opts = opts || {}
    var discount = opts.discount != null ? opts.discount : DEFAULT_INTEGRATED_DISCOUNT
    var manualOverride = opts.manualIntegratedTotal  // se setado, usa direto

    var agg = _aggregate(annotations)
    var lines = []
    var isolated = 0

    Object.keys(agg).forEach(function (id) {
      var t = _findTreatment(id)
      if (!t) return
      var units = agg[id].units
      var subtotal = (t.unitPrice || 0) * units
      isolated += subtotal
      lines.push({
        id: id,
        label: t.label,
        units: units,
        unitLabel: t.priceUnit,
        unitPrice: t.unitPrice,
        subtotal: subtotal,
      })
    })

    // Lifting do isolado em multiplos de 100 (precificacao psicologica)
    isolated = Math.round(isolated / 100) * 100

    var integrated = manualOverride != null
      ? manualOverride
      : Math.round((isolated * (1 - discount)) / 100) * 100

    var savings = isolated - integrated
    var savingsPct = isolated > 0 ? Math.round((savings / isolated) * 100) : 0

    return {
      isolated: isolated,
      integrated: integrated,
      savings: savings,
      savingsPct: savingsPct,
      lines: lines,
      annotationCount: (annotations || []).length,
    }
  }

  function _formatBRL(n) {
    if (n == null) return '—'
    try {
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
    } catch (e) {
      return 'R$ ' + Math.round(n).toLocaleString('pt-BR')
    }
  }

  // Sugestao de parcelamento. 3x/6x sem juros sao padrao de mercado.
  function _suggestInstallments(total) {
    if (!total || total <= 0) return []
    var opts = []
    if (total >= 600)  opts.push({ n: 3,  value: total / 3 })
    if (total >= 1200) opts.push({ n: 6,  value: total / 6 })
    if (total >= 2400) opts.push({ n: 10, value: total / 10 })
    if (total >= 4800) opts.push({ n: 12, value: total / 12 })
    return opts
  }

  window.ReportLuxuryPricing = {
    calculate: _calculate,
    formatBRL: _formatBRL,
    suggestInstallments: _suggestInstallments,
    DEFAULT_INTEGRATED_DISCOUNT: DEFAULT_INTEGRATED_DISCOUNT,
  }
})()
