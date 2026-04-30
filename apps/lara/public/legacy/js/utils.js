/**
 * ClinicAI — Shared Utilities
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FONTE ÚNICA DA VERDADE PARA HELPERS GLOBAIS                 ║
 * ║                                                              ║
 * ║  Este arquivo carrega PRIMEIRO (antes de todos os módulos).  ║
 * ║  Qualquer helper usado por 2+ arquivos pertence aqui.        ║
 * ║                                                              ║
 * ║  ⚠ NUNCA redefina estas funções em outros arquivos:          ║
 * ║    setText · formatCurrency · formatDate                     ║
 * ║    store.set · store.get                                     ║
 * ║                                                              ║
 * ║  Para persistir dados — USE SEMPRE store.set():              ║
 * ║    store.set(KEY, data)  →  localStorage + Supabase (atomic) ║
 * ║    NUNCA use localStorage.setItem() direto para synced keys  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

;(function () {
  'use strict'

  // Guard: detecta carregamento duplo e avisa no console
  if (window._clinicaiUtilsLoaded) {
    console.error('[ClinicAI/utils] utils.js carregado mais de uma vez. Verifique o index.html.')
    return
  }
  window._clinicaiUtilsLoaded = true

  // ── setText ───────────────────────────────────────────────────
  // Atualiza o textContent de um elemento pelo ID.
  // Silencioso se o elemento não existir (sem throw).
  function setText(id, value) {
    const el = document.getElementById(id)
    if (el) el.textContent = value
  }

  // ── formatCurrency ────────────────────────────────────────────
  // Formata número como moeda BRL (R$ 1.234,56).
  // Trata null/undefined/NaN como R$ 0,00.
  function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0)
  }

  // ── formatDate ────────────────────────────────────────────────
  // Converte string ISO para DD/MM/AA. Retorna '--' se inválido.
  function formatDate(iso) {
    if (!iso) return '--'
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  }

  // ── store ─────────────────────────────────────────────────────
  // Camada de persistência atômica: localStorage + Supabase numa
  // única chamada. Torna fisicamente impossível esquecer o sync.
  //
  // USO:
  //   store.set('clinicai_rooms', rooms)   // salva e sincroniza
  //   store.get('clinicai_rooms', [])      // lê com fallback seguro
  //
  // ⚠ Para chaves sincronizadas com Supabase, NUNCA use
  //   localStorage.setItem() diretamente — sempre store.set().
  const store = {
    /**
     * Persiste `data` no localStorage E faz push para o Supabase.
     * A operação é atômica do ponto de vista do código chamador:
     * uma linha, zero chance de esquecer o sync.
     *
     * Além dos dados, registra `_ts_{key}` com o timestamp ISO do momento
     * da escrita. Este timestamp é usado por sbLoadAll() para resolver
     * conflitos local vs. remoto via Last-Write-Wins (LWW):
     *   - Se Supabase.updated_at > _ts_{key}  → remoto é mais novo → usa Supabase
     *   - Se _ts_{key} >= Supabase.updated_at → local é mais novo  → mantém local
     * Isso garante que deleções, edições e mudanças de outro dispositivo
     * sejam resolvidas corretamente — sem "fantasmas" que voltam do servidor.
     *
     * @param {string} key   - Chave do localStorage (deve estar em SYNC_KEYS)
     * @param {*}      data  - Dado a persistir (objeto, array ou primitivo)
     */
    set(key, data) {
      const serialized = typeof data === 'string' ? data : JSON.stringify(data)
      const ts = new Date().toISOString()
      localStorage.setItem(key, serialized)
      localStorage.setItem(`_ts_${key}`, ts)   // marca "local foi escrito agora"
      // sbSave é definido em supabase.js que carrega depois de utils.js.
      // Verificamos em runtime (não em tempo de definição) — sempre disponível.
      if (typeof window.sbSave === 'function') {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data
        window.sbSave(key, parsed)
      }
    },

    /**
     * Lê e desserializa um valor do localStorage.
     * Nunca lança — retorna `fallback` se ausente ou JSON inválido.
     *
     * @param {string} key      - Chave do localStorage
     * @param {*}      fallback - Valor padrão se chave inexistir
     * @returns {*}
     */
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key)
        return raw !== null ? JSON.parse(raw) : fallback
      } catch {
        return fallback
      }
    },
  }

  // ── featherIn ─────────────────────────────────────────────────
  // Substituição cirúrgica de ícones Feather: processa apenas
  // os [data-feather] dentro do container especificado, em vez de
  // varrer o DOM inteiro como feather.replace() faz.
  //
  // Comportamento de atributos idêntico ao feather.replace():
  //   attrs (padrão) < atributos inline no elemento <i>
  //   Ex.: <i data-feather="x" width="20"> → width="20" prevalece
  //
  // USO:
  //   featherIn(el)                      // usa attrs padrão
  //   featherIn(el, { 'stroke-width': 1.8, width: 16, height: 16 })
  //   featherIn('#meu-container', attrs) // selector string
  //   featherIn(null, attrs)             // fallback global (evitar)
  //
  // SEGURANÇA: nunca lança — retorna silenciosamente se feather
  //   não estiver carregado ou o container não existir no DOM.
  //
  function featherIn(container, attrs) {
    if (typeof feather === 'undefined') return

    // Aceita Element, selector string ou null/undefined
    const el = (container instanceof Element || container instanceof ShadowRoot)
      ? container
      : (typeof container === 'string' ? document.querySelector(container) : null)

    // Sem container válido → fallback global (safety net, raro)
    if (!el) { feather.replace(attrs || {}); return }

    const nodes = el.querySelectorAll('[data-feather]')
    if (!nodes.length) return

    const base = attrs || {}
    nodes.forEach(node => {
      const name = node.getAttribute('data-feather')
      if (!name || !feather.icons[name]) return

      // Coleta atributos inline do elemento (comportamento de feather.replace)
      const elAttrs = {}
      Array.from(node.attributes).forEach(a => { elAttrs[a.name] = a.value })
      delete elAttrs['data-feather']

      // attrs padrão < atributos inline do elemento (= feather.replace)
      const tmp = document.createElement('span')
      tmp.innerHTML = feather.icons[name].toSvg({ ...base, ...elAttrs })
      const svg = tmp.firstElementChild
      if (svg && node.parentNode) node.parentNode.replaceChild(svg, node)
    })
  }

  // ── Exposição global ──────────────────────────────────────────
  Object.assign(window, { setText, formatCurrency, formatDate, store, featherIn })

})()

