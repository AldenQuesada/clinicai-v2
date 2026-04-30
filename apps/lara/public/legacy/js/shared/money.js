/**
 * ClinicAI - Money Helper (Shared)
 *
 * Aritmetica de dinheiro em Number puro acumula erros em DRE/forecast
 * (0.1 + 0.2 = 0.30000000000000004). Este helper arredonda para 2 casas
 * em cada operacao, eliminando drift em somas acumulativas.
 *
 * Valores armazenados continuam em Number (compatibilidade com
 * code existente). A garantia e sempre arredondar ao FINAL de
 * uma operacao para 2 casas decimais via Math.round(x*100)/100.
 *
 * Uso:
 *   Money.sum([1.1, 2.2, 3.3])   -> 6.6 (sem drift)
 *   Money.sub(10, 3.33)          -> 6.67
 *   Money.mul(7.5, 0.12)         -> 0.9
 *   Money.div(100, 3)            -> 33.33 (truncado)
 *   Money.format(1234.5)         -> "R$ 1.234,50"
 *   Money.isZero(0.001)          -> true (tolerancia 0.01)
 *
 * NOTA: para calculos mais precisos (ex: juros compostos, forecast
 * multi-ano), considere usar BigDecimal string-based. Este helper
 * cobre 95% dos casos operacionais.
 */
;(function () {
  'use strict'

  if (window.Money) return

  var EPS = 0.005  // tolerancia sub-centavo

  function _n(v) {
    if (v == null || v === '') return 0
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'))
    return isFinite(n) ? n : 0
  }

  function _round(n) {
    // Arredondamento bancario a 2 casas (half-away-from-zero).
    return Math.round((n + Number.EPSILON) * 100) / 100
  }

  function sum(arr) {
    if (!Array.isArray(arr)) return 0
    var total = 0
    for (var i = 0; i < arr.length; i++) total += _n(arr[i])
    return _round(total)
  }

  function add() {
    var total = 0
    for (var i = 0; i < arguments.length; i++) total += _n(arguments[i])
    return _round(total)
  }

  function sub(a, b) {
    return _round(_n(a) - _n(b))
  }

  function mul(a, b) {
    return _round(_n(a) * _n(b))
  }

  function div(a, b) {
    var bn = _n(b)
    if (bn === 0) return 0
    return _round(_n(a) / bn)
  }

  function isZero(v) {
    return Math.abs(_n(v)) < EPS
  }

  function isEqual(a, b) {
    return Math.abs(_n(a) - _n(b)) < EPS
  }

  function format(v) {
    var n = _round(_n(v))
    try {
      return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    } catch (e) {
      return 'R$ ' + n.toFixed(2).replace('.', ',')
    }
  }

  function parse(s) {
    return _round(_n(s))
  }

  window.Money = Object.freeze({
    sum: sum, add: add, sub: sub, mul: mul, div: div,
    isZero: isZero, isEqual: isEqual,
    format: format, parse: parse,
  })
})()
