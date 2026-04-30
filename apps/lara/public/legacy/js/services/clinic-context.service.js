;(function () {
  'use strict'
  if (window._clinicaiClinicContextLoaded) return
  window._clinicaiClinicContextLoaded = true

  let _cache = null        // dados da clínica em memória
  let _loading = null      // Promise em andamento (evita chamadas duplas)

  /**
   * Carrega as configurações da clínica via ClinicSettingsService.
   * Se já estiver em cache, retorna imediatamente sem nova chamada.
   * Chamadas simultâneas aguardam a mesma Promise (sem duplicar requests).
   */
  async function load() {
    if (_cache)    return _cache
    if (_loading)  return _loading

    const svc = window.ClinicSettingsService
    if (!svc) {
      console.warn('[ClinicContext] ClinicSettingsService não disponível')
      return {}
    }

    _loading = svc.load().then(data => {
      _cache   = data || {}
      _loading = null
      document.dispatchEvent(new CustomEvent('clinicai:clinic-context-ready', { detail: _cache }))
      return _cache
    }).catch(err => {
      console.warn('[ClinicContext] Falha ao carregar configurações:', err)
      _loading = null
      _cache   = {}
      return _cache
    })

    return _loading
  }

  /**
   * Retorna os dados em cache de forma síncrona.
   * Se ainda não carregou, retorna {}.
   * Use após o evento 'clinicai:clinic-context-ready' ou após await load().
   */
  function get() {
    return _cache || {}
  }

  /**
   * Atalho para acessar um campo das configurações da clínica.
   * Suporta notação de ponto: getSetting('address.cidade')
   *
   * @param {string} key
   * @param {*} fallback
   */
  function getSetting(key, fallback = null) {
    const data = _cache || {}
    if (!key) return fallback
    const parts = key.split('.')
    let val = data
    for (const part of parts) {
      if (val == null || typeof val !== 'object') return fallback
      val = val[part]
    }
    return val !== undefined && val !== null ? val : fallback
  }

  /**
   * Força recarga do Supabase descartando o cache.
   * Útil após salvar configurações.
   */
  async function reload() {
    _cache   = null
    _loading = null
    return load()
  }

  window.ClinicContext = Object.freeze({ load, get, getSetting, reload })
})()
