/**
 * ClinicAI — TagPopover Component (Sprint 8)
 *
 * Popover flutuante para atribuir/remover tags de um lead.
 * Abre próximo ao elemento âncora, fecha ao clicar fora ou pressionar Esc.
 *
 * Uso:
 *   TagPopover.open(anchorEl, leadId, { onChanged: (tags) => {} })
 *   TagPopover.close()
 *
 * Fluxo:
 *   1. Busca tags disponíveis (tabela tags via Supabase, filtrado por RLS)
 *   2. Busca tags atuais do lead (sdr_get_tags)
 *   3. Renderiza grupos por category com toggle
 *   4. Ao clicar: sdr_assign_tag ou sdr_remove_tag
 *   5. Atualiza o LeadCard sem re-render completo
 *
 * Depende de:
 *   window._sbShared — Supabase client
 *   window.SdrService — assign/remove/getTags
 */

;(function () {
  'use strict'

  if (window._clinicaiTagPopoverLoaded) return
  window._clinicaiTagPopoverLoaded = true

  var _popoverEl      = null
  var _currentLeadId  = null
  var _outsideHandler = null
  var _keyHandler     = null
  var _onChanged      = null
  var _currentTags    = []   // tags atribuídas no momento — permite update otimista

  // ── Cache de tags disponíveis (evita fetch a cada abertura) ──
  var _tagsCache = null
  var _tagsCacheTs = 0
  var CACHE_TTL = 60000 // 1 minuto

  var _TEMP_SLUGS = new Set(['lead.frio', 'lead.morno', 'lead.quente', 'lead_frio', 'lead_morno', 'lead_quente'])

  function _sb() { return window._sbShared || null }

  // ── Fetch das tags disponíveis ───────────────────────────────
  // Fonte primária: TagEngine (localStorage) — mesma fonte de "Tags e Fluxos"
  // Fallback: Supabase (caso TagEngine não esteja disponível)
  async function _loadAvailableTags() {
    const now = Date.now()
    if (_tagsCache && (now - _tagsCacheTs) < CACHE_TTL) return _tagsCache

    if (window.TagEngine) {
      const raw = TagEngine.getTags()
        .filter(function(t) {
          return t.group_id === 'pre_agendamento'
            && t.ativo !== false
            && !_TEMP_SLUGS.has(t.id)
        })
        .sort(function(a, b) { return (a.ordem || 0) - (b.ordem || 0) })
        .map(function(t) {
          return {
            slug:         t.id,
            label:        t.nome,
            color:        t.cor || '#6366f1',
            category:     'pre_agendamento',
            is_exclusive: false,
            sort_order:   t.ordem || 0,
          }
        })
      _tagsCache   = raw
      _tagsCacheTs = now
      return _tagsCache
    }

    // Fallback: Supabase
    const sb = _sb()
    if (!sb) return []

    const { data, error } = await sb
      .from('tags')
      .select('id, slug, label, color, category, is_exclusive, sort_order')
      .eq('entity_type', 'lead')
      .neq('category', 'temperatura')
      .order('category')
      .order('sort_order')

    if (error) {
      console.warn('[TagPopover] Erro ao carregar tags:', error.message)
      return []
    }

    _tagsCache   = (data || []).filter(function(t) { return !_TEMP_SLUGS.has(t.slug) })
    _tagsCacheTs = now
    return _tagsCache
  }

  // ── Agrupa por categoria ──────────────────────────────────────
  function _groupByCategory(tags) {
    const groups = {}
    tags.forEach(t => {
      if (!groups[t.category]) groups[t.category] = []
      groups[t.category].push(t)
    })
    return groups
  }

  function _categoryLabel(slug) {
    const map = {
      pre_agendamento: 'Tags do Lead',
      temperatura:     'Temperatura',
      prioridade:      'Prioridade',
      status_contato:  'Status do Contato',
    }
    return map[slug] || slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  // ── Render do popover ─────────────────────────────────────────
  function _render(availableTags, assignedSlugs) {
    const groups = _groupByCategory(availableTags)

    const catKeys    = Object.keys(groups)
    const multiGroup = catKeys.length > 1

    const groupsHtml = catKeys.map(cat => {
      const tagsHtml = groups[cat].map(t => {
        const active = assignedSlugs.has(t.slug)
        return `
          <button
            class="tp-tag-btn ${active ? 'active' : ''}"
            data-slug="${t.slug}"
            data-exclusive="${t.is_exclusive}"
            style="
              --tag-color: ${t.color};
              border-color: ${active ? t.color : '#e5e7eb'};
              background:   ${active ? t.color + '18' : '#fff'};
              color:        ${active ? t.color : '#374151'};
            "
          >
            <span class="tp-tag-dot" style="background:${t.color}"></span>
            ${t.label}
            ${active ? `<svg class="tp-tag-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${t.color}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
          </button>`
      }).join('')

      return `
        <div class="tp-group">
          ${multiGroup ? `<div class="tp-group-label">${_categoryLabel(cat)}</div>` : ''}
          <div class="tp-group-tags">${tagsHtml}</div>
        </div>`
    }).join('')

    return `
      <div class="tag-popover">
        <div class="tp-header">
          <span class="tp-title">Tags do Lead</span>
          <button class="tp-close-btn" id="tagPopoverClose">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="tp-body">
          ${groupsHtml || '<div class="tp-empty">Nenhuma tag disponível</div>'}
        </div>
      </div>`
  }

  // ── Posiciona o popover perto do âncora ───────────────────────
  function _position(anchor) {
    const rect    = anchor.getBoundingClientRect()
    const pop     = _popoverEl
    const popW    = 260
    const popH    = pop.offsetHeight || 320
    const winW    = window.innerWidth
    const winH    = window.innerHeight
    const scrollY = window.scrollY || document.documentElement.scrollTop

    let left = rect.left + rect.width / 2 - popW / 2
    let top  = rect.bottom + scrollY + 8

    // Não sair pela direita
    if (left + popW > winW - 12) left = winW - popW - 12
    if (left < 8) left = 8

    // Se não couber embaixo, abre pra cima
    if (rect.bottom + popH + 8 > winH) {
      top = rect.top + scrollY - popH - 8
    }

    pop.style.left = left + 'px'
    pop.style.top  = top  + 'px'
  }

  // ── Toggle de tag ─────────────────────────────────────────────
  async function _toggleTag(slug, isActive, leadId, btn) {
    btn.disabled = true
    btn.style.opacity = '0.6'

    if (!window.SdrService) {
      console.error('[TagPopover] SdrService não disponível — tag não alterada')
      btn.disabled = false
      btn.style.opacity = '1'
      return
    }

    let result
    if (isActive) {
      result = await window.SdrService.removeTag(slug, 'lead', leadId)
    } else {
      result = await window.SdrService.assignTag(slug, 'lead', leadId)
    }

    btn.disabled = false
    btn.style.opacity = '1'

    if (!result.ok) {
      console.warn('[TagPopover] toggle falhou:', result.error)
      return
    }

    const newActive = !isActive
    const thisTag   = (_tagsCache || []).find(t => t.slug === slug)

    // ── 1. Update otimista — imediato, sem rede ───────────────────
    // Atualiza botão clicado visualmente
    if (thisTag && _popoverEl) {
      btn.classList.toggle('active', newActive)
      btn.style.borderColor = newActive ? thisTag.color : '#e5e7eb'
      btn.style.background  = newActive ? thisTag.color + '18' : '#fff'
      btn.style.color       = newActive ? thisTag.color : '#374151'
      btn.innerHTML = `<span class="tp-tag-dot" style="background:${thisTag.color}"></span>${thisTag.label}${newActive ? `<svg class="tp-tag-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${thisTag.color}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}`
    }

    // Constrói lista otimista a partir de _currentTags + tag toggled
    let optimisticTags
    if (newActive && thisTag) {
      optimisticTags = _currentTags.filter(t => t.slug !== slug).concat([thisTag])
    } else {
      optimisticTags = _currentTags.filter(t => t.slug !== slug)
    }
    _currentTags = optimisticTags

    // Notifica imediatamente — célula da tabela atualiza sem esperar rede
    _onChanged?.(optimisticTags)

    // ── 2. Confirmação via rede — sincroniza estado real ──────────
    const tagsResult = await window.SdrService.getTags('lead', leadId)

    let confirmedTags
    if (tagsResult.ok) {
      confirmedTags = tagsResult.data || []
    } else {
      // Fallback: estado visual do popover
      const activeSlugs = new Set(
        Array.from((_popoverEl || document.createElement('div')).querySelectorAll('.tp-tag-btn.active'))
          .map(function(b) { return b.dataset.slug })
      )
      confirmedTags = (_tagsCache || []).filter(function(t) { return activeSlugs.has(t.slug) })
    }
    _currentTags = confirmedTags

    const assignedSlugs = new Set(confirmedTags.map(t => t.slug))

    // Sincroniza todos os demais botões do popover com o estado confirmado
    if (_popoverEl) {
      _popoverEl.querySelectorAll('.tp-tag-btn').forEach(function(b) {
        const bSlug = b.dataset.slug
        if (bSlug === slug) return // já atualizado acima
        const bActive = assignedSlugs.has(bSlug)
        const bTag    = (_tagsCache || []).find(t => t.slug === bSlug)
        if (!bTag) return
        b.classList.toggle('active', bActive)
        b.style.borderColor = bActive ? bTag.color : '#e5e7eb'
        b.style.background  = bActive ? bTag.color + '18' : '#fff'
        b.style.color       = bActive ? bTag.color : '#374151'
        b.innerHTML = `<span class="tp-tag-dot" style="background:${bTag.color}"></span>${bTag.label}${bActive ? `<svg class="tp-tag-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${bTag.color}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}`
      })
    }

    // Atualiza LeadCard no kanban
    const cardEl = document.querySelector(`.lead-card[data-lead-id="${leadId}"]`)
    if (cardEl && window.LeadCard) {
      window.LeadCard.updateTags(cardEl, confirmedTags)
    }

    // Notifica com lista confirmada (corrige possíveis divergências do otimista)
    _onChanged?.(confirmedTags)
  }

  // ── Abrir ─────────────────────────────────────────────────────
  async function open(anchor, leadId, opts) {
    opts = opts || {}

    // Fecha popover anterior ANTES de setar o novo callback
    // (close() zera _onChanged — precisa setar depois)
    close()
    _currentLeadId = leadId
    _onChanged = opts.onChanged || null

    // Cria container
    _popoverEl = document.createElement('div')
    _popoverEl.style.cssText = 'position:absolute;z-index:9000;width:260px'
    _popoverEl.innerHTML = `<div class="tag-popover"><div class="tp-body" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">Carregando...</div></div>`
    document.body.appendChild(_popoverEl)
    _position(anchor)

    // Carrega dados em paralelo
    const [available, currentResult] = await Promise.all([
      _loadAvailableTags(),
      window.SdrService
        ? window.SdrService.getTags('lead', leadId)
        : Promise.resolve({ ok: true, data: [] }),
    ])

    const currentTags   = currentResult.ok ? (currentResult.data || []) : []
    _currentTags = currentTags   // inicializa estado para updates otimistas
    const assignedSlugs = new Set(currentTags.map(t => t.slug))

    _popoverEl.innerHTML = _render(available, assignedSlugs)
    _position(anchor)

    // Bind: fechar
    _popoverEl.querySelector('#tagPopoverClose')?.addEventListener('click', close)

    // Bind: toggle tags
    _popoverEl.querySelectorAll('.tp-tag-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation()
        var slug     = btn.dataset.slug
        var isActive = btn.classList.contains('active')
        _toggleTag(slug, isActive, leadId, btn)
      })
    })

    // Fecha ao clicar fora
    _outsideHandler = function(e) {
      if (_popoverEl && !_popoverEl.contains(e.target) && e.target !== anchor) {
        close()
      }
    }
    setTimeout(function() {
      document.addEventListener('mousedown', _outsideHandler)
    }, 50)

    // Fecha com Esc
    _keyHandler = function(e) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', _keyHandler)
  }

  // ── Fechar ────────────────────────────────────────────────────
  function close() {
    if (_popoverEl) {
      _popoverEl.remove()
      _popoverEl = null
    }
    if (_outsideHandler) {
      document.removeEventListener('mousedown', _outsideHandler)
      _outsideHandler = null
    }
    if (_keyHandler) {
      document.removeEventListener('keydown', _keyHandler)
      _keyHandler = null
    }
    _currentLeadId = null
    _onChanged     = null
    _currentTags   = []
  }

  function clearCache() { _tagsCache = null; _tagsCacheTs = 0 }

  // ── Exposição global ──────────────────────────────────────────
  window.TagPopover = Object.freeze({ open, close, clearCache })

})()
