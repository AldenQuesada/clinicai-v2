/**
 * ClinicAI — Structured logger
 *
 * Substitui console.log/warn/error espalhados por uma API com:
 *  - Níveis (debug/info/warn/error) com filtro
 *  - Contexto estruturado (objeto JSON em vez de string concatenada)
 *  - Buffer ring (últimos N logs em memória para inspeção via Logger.dump())
 *  - Hook opcional `Logger.onError(handler)` para envio remoto
 *  - Persistência do nível em localStorage (clinicai_log_level)
 *
 * Uso:
 *   Logger.info('appointment:saved', { id: 'appt_123', valor: 300 })
 *   Logger.warn('sync:failed', { id, error: e.message })
 *   Logger.error('save:exception', { stack: e.stack })
 *   Logger.setLevel('debug')   // mostra tudo
 *   Logger.dump()              // últimos 100 logs em memória
 */
// @ts-nocheck — wrapper IIFE
(function () {
  'use strict'
  if (typeof window === 'undefined') return

  var LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
  var BUFFER_SIZE = 100

  var _buffer = []
  var _level = 'warn'
  var _errorHandler = null

  try {
    var stored = localStorage.getItem('clinicai_log_level')
    if (stored && LEVELS[stored] !== undefined) _level = stored
  } catch (e) { /* localStorage indisponível */ }

  function _shouldLog(level) {
    return LEVELS[level] >= LEVELS[_level]
  }

  function _push(level, msg, ctx) {
    var entry = {
      level: level,
      msg: msg,
      ctx: ctx || null,
      ts: new Date().toISOString(),
    }
    _buffer.push(entry)
    if (_buffer.length > BUFFER_SIZE) _buffer.shift()
    return entry
  }

  function _log(level, msg, ctx) {
    var entry = _push(level, msg, ctx)
    if (!_shouldLog(level)) return
    var prefix = '[' + level.toUpperCase() + '] ' + msg
    var fn = console[level] || console.log
    if (ctx) fn.call(console, prefix, ctx)
    else fn.call(console, prefix)
    if (level === 'error' && _errorHandler) {
      try { _errorHandler(entry) } catch (e) { /* nunca trava o caller */ }
    }
  }

  /**
   * @param {string} msg
   * @param {object} [ctx]
   */
  function debug(msg, ctx) { _log('debug', msg, ctx) }
  function info(msg, ctx)  { _log('info', msg, ctx) }
  function warn(msg, ctx)  { _log('warn', msg, ctx) }
  function error(msg, ctx) { _log('error', msg, ctx) }

  /**
   * @param {'debug'|'info'|'warn'|'error'} level
   */
  function setLevel(level) {
    if (LEVELS[level] === undefined) return
    _level = level
    try { localStorage.setItem('clinicai_log_level', level) } catch (e) { /* */ }
  }

  function getLevel() { return _level }

  function onError(handler) { _errorHandler = handler }

  function dump() { return _buffer.slice() }

  function clear() { _buffer.length = 0 }

  window.Logger = {
    debug: debug, info: info, warn: warn, error: error,
    setLevel: setLevel, getLevel: getLevel,
    onError: onError, dump: dump, clear: clear,
  }
})()
