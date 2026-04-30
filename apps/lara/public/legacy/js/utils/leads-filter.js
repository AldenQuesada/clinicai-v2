/**
 * ClinicAI — LeadsFilter (modulo compartilhado)
 *
 * Logica de filtragem, ordenacao e estatisticas de leads.
 * Usado por leads.js (page-leads-all) e leads-context.js (funis).
 *
 * Zero estado proprio — recebe dados, retorna resultados.
 * Nao acessa DOM — quem chama decide o que fazer com o resultado.
 *
 * API:
 *   LeadsFilter.filter(leads, opts)  → { filtered, stats }
 *   LeadsFilter.dateRange(periodType, customFrom, customTo)  → { from, to }
 *   LeadsFilter.loadTagLeadIds(tagSlug)  → Promise<Set|null>
 */
;(function() {
  'use strict'
  if (window.LeadsFilter) return

  // ── Constantes ──────────────────────────────────────────────
  var PAGE_SIZE = 50
  var TEMP_TAG_IDS = new Set([
    'lead_frio', 'lead_morno', 'lead_quente',
    'lead.frio', 'lead.morno', 'lead.quente'
  ])

  // ── dateRange: calcula janela de datas por tipo de periodo ──
  function dateRange(periodType, customFrom, customTo) {
    if (!periodType || periodType === 'all') return { from: null, to: null }

    var now = new Date()
    var from = null
    var to   = null

    if (periodType === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (periodType === 'week') {
      var dow = now.getDay()
      var diffMon = (dow === 0) ? 6 : dow - 1
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffMon)
    } else if (periodType === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (periodType === 'custom') {
      if (customFrom) from = new Date(customFrom)
      if (customTo)   to   = new Date(new Date(customTo).getTime() + 86399999)
    }

    return { from: from, to: to }
  }

  // ── filter: filtra, ordena e calcula stats ──────────────────
  // opts: { period, search, tempVal, tagLeadIds }
  function filter(leads, opts) {
    opts = opts || {}
    var period  = opts.period || { type: 'all' }
    var search  = (opts.search || '').toLowerCase().trim()
    var tempVal = opts.tempVal || ''
    var tagLeadIds = opts.tagLeadIds || null

    var range = dateRange(period.type, period.from, period.to)

    var excludePhases = opts.excludePhases || null
    var includePhases = opts.includePhases || null

    var filtered = leads.filter(function(l) {
      // Soft-delete e desativados — sobrevivem no localStorage cache mas
      // sumiram do Supabase (deleted_at) ou foram desativados (is_active=false)
      if (l.deleted_at) return false
      if (l.is_active === false || l.active === false) return false
      // Phase filter
      var phase = l.phase || 'lead'
      if (excludePhases && excludePhases.indexOf(phase) !== -1) return false
      if (includePhases && includePhases.indexOf(phase) === -1) return false
      // Data
      var created  = new Date(l.created_at || l.createdAt)
      var validDt  = !isNaN(created.getTime())
      if (!validDt) {
        if (period.type === 'today' || period.type === 'custom') return false
      } else {
        if (range.from && created < range.from) return false
        if (range.to   && created > range.to)   return false
      }
      // Tags
      if (tagLeadIds && !tagLeadIds.has(l.id)) return false
      // Temperatura
      if (tempVal && (l.temperature || 'cold') !== tempVal) return false
      // Busca
      if (search) {
        var nome  = (l.name || l.nome || '').toLowerCase()
        var phone = (l.phone || l.whatsapp || l.telefone || '').toLowerCase()
        if (!nome.includes(search) && !phone.includes(search)) return false
      }
      // Queixas (multi-select via slugs canonicos)
      if (opts.queixaSlugs && opts.queixaSlugs.length && window.LeadsQueixa) {
        if (!window.LeadsQueixa.matches(l, opts.queixaSlugs)) return false
      }
      // Funnel (fullface | procedimentos) — segregacao de paginas Leads Full Face vs Procedimentos
      if (opts.funnelSlug) {
        var lf = l.funnel || 'procedimentos'
        if (lf !== opts.funnelSlug) return false
      }
      return true
    })

    // Ordena por data mais recente primeiro
    filtered.sort(function(a, b) {
      var da = new Date(a.created_at || a.createdAt || 0)
      var db = new Date(b.created_at || b.createdAt || 0)
      return db - da
    })

    // Stats
    var stats = { total: filtered.length, hot: 0, warm: 0, cold: 0 }
    filtered.forEach(function(l) {
      var t = l.temperature || 'cold'
      if (stats[t] !== undefined) stats[t]++
    })

    return { filtered: filtered, stats: stats }
  }

  // ── loadTagLeadIds: busca IDs de leads com uma tag ──────────
  async function loadTagLeadIds(tagSlug) {
    if (!tagSlug) return null

    if (window.TagsRepository) {
      try {
        var tagRes = await TagsRepository.getTagBySlug(tagSlug)
        if (tagRes.ok && tagRes.data && tagRes.data.id) {
          var aRes = await TagsRepository.getEntityIdsByTag(tagRes.data.id, 'lead')
          return new Set(aRes.ok ? (aRes.data || []) : [])
        }
        return new Set()
      } catch { return null }
    }

    if (window._sbShared) {
      try {
        var r1 = await window._sbShared.from('tags').select('id').eq('slug', tagSlug).single()
        if (r1.data && r1.data.id) {
          var r2 = await window._sbShared.from('tag_assignments').select('entity_id')
            .eq('tag_id', r1.data.id).eq('entity_type', 'lead')
          return new Set((r2.data || []).map(function(r) { return r.entity_id }))
        }
        return new Set()
      } catch { return null }
    }

    return null
  }

  // ── loadTagOptions: carrega opcoes para select de tags ──────
  async function loadTagOptions() {
    var items = []

    if (window.TagEngine) {
      items = TagEngine.getTags()
        .filter(function(t) {
          return t.group_id === 'pre_agendamento'
            && t.ativo !== false
            && !TEMP_TAG_IDS.has(t.id)
        })
        .sort(function(a, b) { return (a.ordem || 0) - (b.ordem || 0) })
        .map(function(t) { return { slug: t.id, label: t.nome } })
    } else if (window.TagsRepository) {
      try {
        var res = await TagsRepository.listLeadTags()
        items = res.ok ? (res.data || []) : []
      } catch {}
    }

    return items
  }

  // ── sort: ordena por campo + direcao ─────────────────────────
  var SORT_FNS = {
    name: function(a, b) {
      return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })
    },
    temperature: function(a, b) {
      var order = { hot: 0, warm: 1, cold: 2 }
      return (order[a.temperature] || 2) - (order[b.temperature] || 2)
    },
    date: function(a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    },
    phase: function(a, b) {
      return (a.phase || '').localeCompare(b.phase || '')
    },
  }

  function sort(leads, field, direction) {
    if (!field || !SORT_FNS[field]) return leads
    var fn = SORT_FNS[field]
    var sorted = leads.slice().sort(fn)
    if (direction === 'desc' && field !== 'date') sorted.reverse()
    if (direction === 'asc' && field === 'date') sorted.reverse()
    return sorted
  }

  // ── API ─────────────────────────────────────────────────────
  window.LeadsFilter = Object.freeze({
    PAGE_SIZE:      PAGE_SIZE,
    TEMP_TAG_IDS:   TEMP_TAG_IDS,
    filter:         filter,
    sort:           sort,
    dateRange:      dateRange,
    loadTagLeadIds: loadTagLeadIds,
    loadTagOptions: loadTagOptions,
  })

})()
