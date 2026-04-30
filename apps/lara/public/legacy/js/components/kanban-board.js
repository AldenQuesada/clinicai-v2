/**
 * ClinicAI — KanbanBoard Component (Sprint 8)
 *
 * Renderiza um kanban completo (7 Dias ou Evolução).
 * Cada coluna = um pipeline_stage. Cada card = um LeadCard.
 *
 * Comportamento por pipeline:
 *   seven_days  → somente leitura. Leads avançam automaticamente às 00:00
 *                 via sdr_advance_day_buckets(). Sem drag-and-drop.
 *   evolution   → drag-and-drop nativo. Persistência via sdr_move_lead().
 *                 Confirma mudança de fase quando o stage implica nova fase.
 *
 * Uso:
 *   const board = KanbanBoard.create(container, {
 *     pipeline: 'seven_days',   // ou 'evolution'
 *     phase:    'lead',         // filtro de fase (null = todos)
 *     onLeadMoved: (leadId, fromStage, toStage) => {}
 *   })
 *
 *   board.load()     — carrega dados do Supabase e renderiza
 *   board.refresh()  — recarrega sem recriar estrutura
 *   board.destroy()  — limpa event listeners e DOM
 *
 * Depende de:
 *   SdrService  (sdr.service.js)
 *   LeadCard    (lead-card.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiKanbanBoardLoaded) return
  window._clinicaiKanbanBoardLoaded = true

  // ── Mapa stage → fase implicada (pipeline evolution) ─────────

  const EVOLUTION_STAGE_PHASE = {
    novo:                 'lead',
    em_conversa:          'lead',
    em_negociacao:        'lead',
  }

  const PHASE_LABELS = {
    lead:        'Lead',
    agendado:    'Agendado',
    reagendado:  'Reagendado',
    compareceu:  'Compareceu',
    paciente:    'Paciente',
    orcamento:   'Orçamento',
    perdido:     'Perdido',
  }

  // ── Instância do Board ────────────────────────────────────────

  function _createBoard(container, opts) {
    const pipeline   = opts.pipeline || 'seven_days'
    const phase      = opts.phase    || null
    const onMoved    = opts.onLeadMoved || null
    const funnel     = opts.funnel || null  // 'fullface' | 'procedimentos' | null (todos)

    let _boardEl     = null
    let _dragState   = null
    let _listeners   = []
    let _temperature = opts.temperature || null  // null = todos
    let _sortOrder   = 'desc'  // desc = mais recentes primeiro

    function _filterStages(stages) {
      var hasFunnel = funnel === 'fullface' || funnel === 'procedimentos'
      var hasTemp   = !!_temperature
      if (!hasFunnel && !hasTemp) return stages
      return stages.map(function(s) {
        var leads = s.leads || []
        if (hasFunnel) {
          leads = leads.filter(function(l) {
            var f = l.funnel || l.funil || 'procedimentos'  // null → procedimentos
            return f === funnel
          })
        }
        if (hasTemp) {
          leads = leads.filter(function(l) { return l.temperature === _temperature })
        }
        return Object.assign({}, s, { leads: leads })
      })
    }

    // ── Helpers ───────────────────────────────────────────────

    function _on(el, event, handler) {
      el.addEventListener(event, handler)
      _listeners.push({ el, event, handler })
    }

    function _getFn() {
      return pipeline === 'seven_days'
        ? () => window.SdrService.getKanban7Dias(phase)
        : () => window.SdrService.getKanbanEvolution(phase)
    }

    // ── Render de coluna ──────────────────────────────────────

    function _renderColumn(stage) {
      const col = document.createElement('div')
      col.className = 'kanban-column'
      col.dataset.stageSlug = stage.slug

      const count = (stage.leads || []).length

      var sortIcon = _sortOrder === 'desc'
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>'

      col.innerHTML = `
        <div class="kanban-column-header">
          <div class="kanban-column-color" style="background:${stage.color}"></div>
          <span class="kanban-column-label">${stage.label}</span>
          <span class="kanban-column-count">${count}</span>
          <button class="kanban-sort-btn" title="Ordenar" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#9ca3af;padding:2px;display:flex;align-items:center">${sortIcon}</button>
        </div>
        <div class="kanban-column-body" data-stage="${stage.slug}">
          ${count === 0 ? '<div class="kanban-column-empty">Sem leads</div>' : ''}
        </div>
      `

      const body = col.querySelector('.kanban-column-body')

      // Ordenar leads: desc = mais recentes primeiro
      var sortedLeads = (stage.leads || []).slice().sort(function(a, b) {
        var tA = a.createdAt || a.created_at || ''
        var tB = b.createdAt || b.created_at || ''
        return _sortOrder === 'desc' ? (tB > tA ? 1 : -1) : (tA > tB ? 1 : -1)
      })

      // Adiciona os cards
      sortedLeads.forEach(lead => {
        const card = window.LeadCard.create(lead, {
          onTagClick:  (id) => _handleTagClick(id, lead),
          onMoveStage: (id) => _handleMoveClick(id, lead),
        })
        // seven_days: somente leitura — sem drag-and-drop (avanço só pelo cron 00:00)
        if (pipeline !== 'seven_days') {
          card.draggable = true
          _bindDragCard(card, lead, stage.slug)
        } else {
          card.style.cursor = 'default'
        }
        body.appendChild(card)
      })

      // Drop zone — apenas no pipeline evolution
      if (pipeline !== 'seven_days') {
        _bindDropZone(col, body, stage.slug)
      }

      // Sort toggle
      var sortBtn = col.querySelector('.kanban-sort-btn')
      if (sortBtn) {
        _on(sortBtn, 'click', function() {
          _sortOrder = _sortOrder === 'desc' ? 'asc' : 'desc'
          _refresh()
        })
      }

      return col
    }

    // ── Drag & Drop ───────────────────────────────────────────

    function _bindDragCard(card, lead, fromStage) {
      _on(card, 'dragstart', e => {
        _dragState = { leadId: lead.id, lead, fromStage }
        card.style.opacity = '0.5'
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', lead.id)
      })

      _on(card, 'dragend', () => {
        card.style.opacity = '1'
        _dragState = null
        _clearDropHighlights()
      })
    }

    function _bindDropZone(col, body, stageSlug) {
      _on(body, 'dragover', e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!col.classList.contains('drag-over')) {
          col.classList.add('drag-over')
        }
      })

      _on(body, 'dragleave', e => {
        // Só remove se saiu da coluna (não de um card filho)
        if (!col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over')
        }
      })

      _on(body, 'drop', async e => {
        e.preventDefault()
        col.classList.remove('drag-over')

        if (!_dragState) return
        const { leadId, lead, fromStage } = _dragState

        if (fromStage === stageSlug) return // Mesma coluna — ignora

        // Move no Supabase
        const result = await window.SdrService.moveLead(leadId, pipeline, stageSlug)

        if (!result.ok) {
          console.warn('[KanbanBoard] moveLead falhou:', result.error)
          // Feedback visual: toast se disponível, senão borda vermelha temporária
          if (window._showToast) {
            window._showToast('Erro ao mover lead', result.error || 'Não foi possível mover o card', 'error')
          } else {
            col.style.borderColor = '#ef4444'
            setTimeout(() => { col.style.borderColor = '' }, 1500)
          }
          return
        }

        // Move o card no DOM
        const card = _boardEl.querySelector(`[data-lead-id="${leadId}"]`)
        if (card) {
          body.querySelector('.kanban-column-empty')?.remove()
          body.appendChild(card)
          _updateColumnCount(col, body)

          // Atualiza contagem da coluna de origem
          const fromCol = _boardEl.querySelector(`[data-stage-slug="${fromStage}"]`)
          if (fromCol) {
            const fromBody = fromCol.querySelector('.kanban-column-body')
            _updateColumnCount(fromCol, fromBody)
          }

          // Evolution: verifica se o stage implica mudança de fase
          if (pipeline === 'evolution') {
            const impliedPhase = EVOLUTION_STAGE_PHASE[stageSlug]
            const currentPhase = lead.phase || 'lead'
            if (impliedPhase && impliedPhase !== currentPhase) {
              _showPhaseConfirm(card, impliedPhase, leadId, lead)
            }
          }
        }

        onMoved?.(leadId, fromStage, stageSlug)
      })
    }

    function _clearDropHighlights() {
      _boardEl?.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'))
    }

    function _updateColumnCount(col, body) {
      const cards = body.querySelectorAll('.lead-card')
      const countEl = col.querySelector('.kanban-column-count')
      if (countEl) countEl.textContent = cards.length

      if (cards.length === 0 && !body.querySelector('.kanban-column-empty')) {
        body.innerHTML = '<div class="kanban-column-empty">Sem leads</div>'
      }
    }

    // ── Confirmação de mudança de fase ───────────────────────

    let _confirmEl = null
    let _confirmTimer = null

    function _hidePhaseConfirm() {
      if (_confirmTimer) { clearTimeout(_confirmTimer); _confirmTimer = null }
      if (_confirmEl) { _confirmEl.remove(); _confirmEl = null }
    }

    function _showPhaseConfirm(card, toPhase, leadId, lead) {
      _hidePhaseConfirm()

      const label = PHASE_LABELS[toPhase] || toPhase

      const el = document.createElement('div')
      el.className = 'kb-phase-confirm'
      el.innerHTML = `
        <div class="kb-phase-confirm-text">
          Mudar fase para <strong>${label}</strong> tambem?
        </div>
        <div class="kb-phase-confirm-btns">
          <button class="kb-phase-confirm-btn kb-phase-yes">Sim</button>
          <button class="kb-phase-confirm-btn kb-phase-no">Nao</button>
        </div>
      `

      card.after(el)
      _confirmEl = el

      el.querySelector('.kb-phase-yes').addEventListener('click', async () => {
        _hidePhaseConfirm()
        const r = await window.SdrService.changePhase(leadId, toPhase, 'evolution_drag')
        if (r.ok) {
          lead.phase = toPhase
          card.dataset.phase = toPhase
        } else {
          console.warn('[KanbanBoard] changePhase falhou:', r.error)
        }
      })

      el.querySelector('.kb-phase-no').addEventListener('click', () => {
        _hidePhaseConfirm()
      })

      // Auto-dismiss em 8 segundos
      _confirmTimer = setTimeout(_hidePhaseConfirm, 15000)
    }

    // ── Ações dos cards ───────────────────────────────────────

    function _handleTagClick(leadId, lead) {
      opts.onTagClick?.(leadId, lead)
    }

    function _handleMoveClick(leadId, lead) {
      opts.onMoveStage?.(leadId, lead)
    }

    // ── API da instância ──────────────────────────────────────

    async function load() {
      const getFn = _getFn()
      const result = await getFn()

      if (!result.ok) {
        container.innerHTML = `<div style="color:#ef4444;padding:16px;font-size:13px">Erro ao carregar kanban: ${result.error}</div>`
        return
      }

      const stages = _filterStages(result.data?.stages || [])

      // Cria o board
      _boardEl = document.createElement('div')
      _boardEl.className = 'kanban-board'

      stages.forEach(stage => {
        const col = _renderColumn(stage)
        _boardEl.appendChild(col)
      })

      container.innerHTML = ''
      container.appendChild(_boardEl)
    }

    async function refresh() {
      if (!_boardEl) { await load(); return }

      const getFn = _getFn()
      const result = await getFn()
      if (!result.ok) return

      const stages = _filterStages(result.data?.stages || [])

      stages.forEach(stage => {
        const col  = _boardEl.querySelector(`[data-stage-slug="${stage.slug}"]`)
        if (!col) return

        const body = col.querySelector('.kanban-column-body')
        body.innerHTML = (stage.leads?.length === 0)
          ? '<div class="kanban-column-empty">Sem leads</div>'
          : ''

        var refreshSorted = (stage.leads || []).slice().sort(function(a, b) {
          var tA = a.createdAt || a.created_at || ''
          var tB = b.createdAt || b.created_at || ''
          return _sortOrder === 'desc' ? (tB > tA ? 1 : -1) : (tA > tB ? 1 : -1)
        })
        refreshSorted.forEach(lead => {
          const card = window.LeadCard.create(lead, {
            onTagClick:  (id) => _handleTagClick(id, lead),
            onMoveStage: (id) => _handleMoveClick(id, lead),
          })
          if (pipeline !== 'seven_days') {
            card.draggable = true
            _bindDragCard(card, lead, stage.slug)
          } else {
            card.style.cursor = 'default'
          }
          body.appendChild(card)
        })

        const countEl = col.querySelector('.kanban-column-count')
        if (countEl) countEl.textContent = stage.leads?.length || 0
      })
    }

    // Auto-refresh quando usuario volta a tab (dados podem ter mudado)
    var _visHandler = function() {
      if (!document.hidden && _boardEl) refresh()
    }
    document.addEventListener('visibilitychange', _visHandler)

    function destroy() {
      _listeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler))
      _listeners = []
      _boardEl = null
      document.removeEventListener('visibilitychange', _visHandler)
    }

    async function setTemperature(temp) {
      _temperature = temp || null
      await refresh()
    }

    return Object.freeze({ load, refresh, destroy, setTemperature })
  }

  // ── Exposição global ──────────────────────────────────────────
  window.KanbanBoard = Object.freeze({
    create: _createBoard,
  })

})()
