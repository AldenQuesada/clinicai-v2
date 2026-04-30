/**
 * ClinicAI — LeadsQueixa (utilitario compartilhado)
 *
 * Extracao, normalizacao e matching de queixas faciais a partir das
 * multiplas fontes de lead (quiz array, import string livre, aninhado).
 *
 * API:
 *   LeadsQueixa.extract(lead)       -> array de slugs canonicos
 *   LeadsQueixa.aggregate(leads)    -> [{slug, label, count}] ordenado por count
 *   LeadsQueixa.matches(lead, slugs) -> boolean (qualquer match)
 *   LeadsQueixa.CATALOG             -> lista canonica
 */
;(function () {
  'use strict'
  if (window.LeadsQueixa) return

  // Lista canonica de queixas. Adicionar aqui se aparecerem novos termos.
  // patterns sao trechos procurados no texto (ja normalizado sem acento/lowercase).
  var CATALOG = [
    { slug: 'pe_galinha',        label: 'Pe de galinha',        patterns: ['pe de galinha', 'p de galinha'] },
    { slug: 'rugas_testa',       label: 'Rugas na testa',       patterns: ['ruga na testa', 'rugas na testa', 'ruga da testa', 'rugas da testa'] },
    { slug: 'bigode_chines',     label: 'Bigode chines',        patterns: ['bigode chines', 'bigode'] },
    { slug: 'codigo_barras',     label: 'Codigo de barras',     patterns: ['codigo de barra', 'cod de barra', 'barra da boca'] },
    { slug: 'flacidez',          label: 'Flacidez',             patterns: ['flacide', 'flacidez'] },
    { slug: 'linhas_expressao',  label: 'Linhas de expressao',  patterns: ['linha de expressao', 'linhas de expressao', 'marcas de expressao'] },
    { slug: 'olheiras',          label: 'Olheiras',             patterns: ['olheira'] },
    { slug: 'papada',            label: 'Papada',               patterns: ['papada', 'duplo queixo', 'queixo duplo'] },
    { slug: 'sulco_nasogeniano', label: 'Sulco nasogeniano',    patterns: ['sulco naso', 'nasogenian', 'sulco do nariz'] },
    { slug: 'palpebras_caidas',  label: 'Palpebras caidas',     patterns: ['palpebra', 'flacidez de palpebra', 'ptose palpebra'] },
    { slug: 'sorriso_gengival',  label: 'Sorriso gengival',     patterns: ['sorriso gengival', 'sorriso com gengiva', 'gengiva ao sorrir'] },
    { slug: 'bruxismo',          label: 'Bruxismo / masseter',  patterns: ['bruxism', 'masseter'] },
    { slug: 'labios_finos',      label: 'Labios finos',         patterns: ['labio fino', 'labios finos', 'boca fina'] },
    { slug: 'nariz_ponta',       label: 'Nariz (ponta caida)',  patterns: ['nariz', 'ponta caida', 'ponta do nariz'] },
    { slug: 'pescoco',           label: 'Pescoco / bandas',     patterns: ['pescoco', 'bandas do pescoco'] },
    { slug: 'acne',              label: 'Acne / marcas',        patterns: ['acne', 'marca de acne', 'cicatriz de acne'] },
    { slug: 'manchas',           label: 'Manchas / melasma',    patterns: ['mancha', 'melasma'] },
    { slug: 'contorno_facial',   label: 'Contorno facial',      patterns: ['contorno facial', 'definicao do contorno'] },
  ]

  function _norm(s) {
    return (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u201c\u201d\u2018\u2019"'`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Junta todas as fontes possiveis de queixa em uma string normalizada
  function _gatherText(lead) {
    if (!lead) return ''
    var cf = lead.customFields || lead.data || {}
    var nd = (lead.data && lead.data.data) || cf.data || {}
    var qp = (lead.data && lead.data.quiz_payload) || cf.quiz_payload || {}
    var parts = []

    var qfArr = lead.queixas_faciais || cf.queixas_faciais || nd.queixas_faciais || []
    if (Array.isArray(qfArr)) {
      qfArr.forEach(function (x) {
        if (typeof x === 'string') parts.push(x)
        else if (x && typeof x === 'object') parts.push(x.label || x.nome || x.name || '')
      })
    }
    parts.push(
      cf.queixaPrincipal || '',
      cf.queixa || '',
      cf.queixas || '',
      nd.queixa || '',
      nd.queixas || '',
      qp.queixas || '',
      qp.queixa || '',
      lead.queixa || '',
      lead.queixas || ''
    )
    return _norm(parts.join(' | '))
  }

  function extract(lead) {
    var txt = _gatherText(lead)
    if (!txt) return []
    var hits = []
    CATALOG.forEach(function (entry) {
      for (var i = 0; i < entry.patterns.length; i++) {
        if (txt.indexOf(entry.patterns[i]) !== -1) {
          hits.push(entry.slug)
          break
        }
      }
    })
    return hits
  }

  function aggregate(leads) {
    if (!Array.isArray(leads)) return []
    var counts = {}
    leads.forEach(function (l) {
      extract(l).forEach(function (slug) {
        counts[slug] = (counts[slug] || 0) + 1
      })
    })
    return CATALOG
      .map(function (c) { return { slug: c.slug, label: c.label, count: counts[c.slug] || 0 } })
      .filter(function (x) { return x.count > 0 })
      .sort(function (a, b) { return b.count - a.count })
  }

  function matches(lead, slugs) {
    if (!slugs || !slugs.length) return true
    var leadSlugs = extract(lead)
    for (var i = 0; i < slugs.length; i++) {
      if (leadSlugs.indexOf(slugs[i]) !== -1) return true
    }
    return false
  }

  function label(slug) {
    var e = CATALOG.find(function (c) { return c.slug === slug })
    return e ? e.label : slug
  }

  window.LeadsQueixa = Object.freeze({
    CATALOG:   CATALOG,
    extract:   extract,
    aggregate: aggregate,
    matches:   matches,
    label:     label,
  })
})()
