/* ============================================================
   ClinicAI — Tasks Panel v2
   - Lista de profissionais com multi-select
   - WhatsApp com link pré-preenchido (automático/manual)
   - Painel minimizável na borda direita
   - Filtros rápidos: Crítico | Urgente | Normal
   - Integração Supabase: tarefas auto-geradas por regras/dispatch
   ============================================================ */

'use strict';

const tasksPanel = (() => {

  /* ── Profissionais (carregados do Supabase) ────────────── */
  // Substituído do array hardcoded para dados dinâmicos.
  // Shape: { id: uuid, name: string, role: string, phone: string|null }
  let _professionals   = [];
  const PROF_CACHE_KEY = 'clinicai_professionals_cache';
  const PROF_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  /* ── Estado ────────────────────────────────────────────── */
  let tasks          = [];
  let currentTab     = 'pending';
  let editingId      = null;
  let confirmingId   = null;
  let confirmTimer   = null;
  let deletingId     = null;
  let deleteTimer    = null;
  let activeFilters  = new Set();   // 'critico' | 'urgente' | 'normal'
  let selectedResps  = new Set();   // IDs de profissionais selecionados no modal
  let isMini         = false;

  // Supabase sync state
  let _sbPollTimer   = null;
  let _sbRealtime    = null;
  let _sbLoaded      = false;

  const STORAGE_KEY  = 'clinicai_tasks_v2';
  const SB_POLL_MS   = 60_000;  // 60s

  /* ── Init ──────────────────────────────────────────────── */
  function init() {
    _load();
    _updateBadge();
    _renderFilters();
    document.addEventListener('keydown', e => { if (e.key === 'Escape') _handleEsc(); });

    // Carrega profissionais + tarefas do Supabase (fire-and-forget)
    _loadProfessionals().catch(e => console.warn('[tasksPanel] professionals load:', e));
    _loadFromSupabase().catch(e => console.warn('[tasksPanel] Supabase load:', e));
    _startTasksRealtime();

    // Polling leve — recarrega a cada 60s
    if (_sbPollTimer) clearInterval(_sbPollTimer);
    _sbPollTimer = setInterval(function() {
      _loadFromSupabase().catch(function(e) { console.warn("[tasks]", e.message || e) });
    }, SB_POLL_MS);
  }

  function _handleEsc() {
    const modalOpen = document.getElementById('taskModalOverlay')?.classList.contains('open');
    if (modalOpen) closeModal();
    else close();
  }

  /* ── Profissionais — Supabase ──────────────────────────── */

  async function _loadProfessionals() {
    // Tenta servir do cache localStorage primeiro (TTL 5 min)
    try {
      const cached = localStorage.getItem(PROF_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.ts && (Date.now() - parsed.ts) < PROF_CACHE_TTL && Array.isArray(parsed.data)) {
          _professionals = parsed.data;
          return;
        }
      }
    } catch {}

    if (!window._sbShared) return;

    try {
      const { data, error } = await window._sbShared.rpc('sdr_get_professionals');
      if (error || !data?.ok) {
        console.warn('[tasksPanel] sdr_get_professionals:', error?.message || data?.error);
        return;
      }
      _professionals = data.data || [];
      // Persiste cache com timestamp
      try {
        localStorage.setItem(PROF_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: _professionals }));
      } catch {}
    } catch (e) {
      console.warn('[tasksPanel] _loadProfessionals:', e.message);
    }
  }

  /* ── Storage ───────────────────────────────────────────── */
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      tasks = raw ? JSON.parse(raw) : _sampleTasks();
    } catch {
      tasks = _sampleTasks();
    }
  }

  function _save() {
    try {
      // Nunca persiste tarefas vindas do Supabase — elas têm fonte própria
      const localOnly = tasks.filter(function(t) { return t._source !== 'supabase'; });
      store.set(STORAGE_KEY, localOnly);
    } catch (e) {
      if (e.name === 'QuotaExceededError') console.warn('ClinicAI: localStorage cheio, tarefas não salvas.');
    }
  }

  function _sampleTasks() {
    const now = Date.now();
    return [
      { id:1, title:'Revisar análise facial de Carla Mendes',    responsibleIds:[1],   urgency:'urgente', whatsapp:true,  done:false, createdAt:now-3600000,  doneAt:null },
      { id:2, title:'Confirmar consultas de amanhã (5)',          responsibleIds:[2],   urgency:'normal',  whatsapp:false, done:false, createdAt:now-7200000,  doneAt:null },
      { id:3, title:'Enviar follow-up para leads qualificados',   responsibleIds:[3],   urgency:'urgente', whatsapp:true,  done:false, createdAt:now-10800000, doneAt:null },
      { id:4, title:'Atualizar script Full Face — Oferta Março',  responsibleIds:[3,2], urgency:'normal',  whatsapp:false, done:false, createdAt:now-14400000, doneAt:null },
      { id:5, title:'Ligar para paciente com retorno atrasado',   responsibleIds:[1,2], urgency:'critico', whatsapp:true,  done:false, createdAt:now-18000000, doneAt:null },
      { id:6, title:'Verificar estoque de toxina botulínica',     responsibleIds:[4],   urgency:'urgente', whatsapp:false, done:false, createdAt:now-21600000, doneAt:null },
      { id:7, title:'Revisar relatório financeiro de fevereiro',  responsibleIds:[5],   urgency:'normal',  whatsapp:false, done:false, createdAt:now-86400000, doneAt:null },
    ];
  }

  /* ── Supabase: carrega tarefas ─────────────────────────── */
  async function _loadFromSupabase() {
    if (!window._sbShared) return;

    try {
      const { data, error } = await window._sbShared.rpc('sdr_get_tasks', {
        p_status: null,
        p_limit:  100,
        p_offset: 0,
      });

      if (error || !data?.ok) {
        console.warn('[tasksPanel] sdr_get_tasks:', error?.message || data?.error);
        return;
      }

      const incoming = (data.data || []).map(_normalizeSupabaseTask);

      // Substitui slice Supabase no array, preserva tarefas locais
      tasks = [
        ...tasks.filter(function(t) { return t._source !== 'supabase'; }),
        ...incoming,
      ];

      _sbLoaded = true;
      _updateBadge();
      _updateStripCount();
      _render();
    } catch (e) {
      console.warn('[tasksPanel] _loadFromSupabase:', e.message);
    }
  }

  function _normalizeSupabaseTask(t) {
    return {
      id:             t.id,
      title:          t.title || t.description || '(sem título)',
      urgency:        _deriveUrgency(t.due_at),
      whatsapp:       false,
      responsibleIds: [],
      done:           t.status === 'done',
      createdAt:      t.created_at ? new Date(t.created_at).getTime() : Date.now(),
      doneAt:         (t.status === 'done' && t.updated_at) ? new Date(t.updated_at).getTime() : null,
      description:    t.description || null,
      type:           t.type        || null,
      due_at:         t.due_at      || null,
      lead_id:        t.lead_id     || null,
      triggered_by:   t.triggered_by || null,
      _source:        'supabase',
      _sbStatus:      t.status,
    };
  }

  function _deriveUrgency(due_at) {
    if (!due_at) return 'normal';
    const diff = new Date(due_at).getTime() - Date.now();
    if (diff <= 0)         return 'critico';  // vencida
    if (diff < 3_600_000)  return 'critico';  // < 1h
    if (diff < 86_400_000) return 'urgente';  // < 24h
    return 'normal';
  }

  /* ── Supabase: realtime ────────────────────────────────── */
  function _startTasksRealtime() {
    const sb = window._sbShared;
    if (!sb?.channel) return;
    const profile = window.getCurrentProfile?.();
    if (!profile?.clinic_id) return;

    try {
      _sbRealtime = sb
        .channel('tasks:' + profile.clinic_id)
        .on('postgres_changes', {
          event:  'INSERT',
          schema: 'public',
          table:  'tasks',
          filter: 'clinic_id=eq.' + profile.clinic_id,
        }, function(payload) {
          var t = payload.new;
          if (!t || !t.id) return;
          // Evita duplicata
          if (tasks.find(function(x) { return x.id === t.id; })) return;
          tasks.unshift(_normalizeSupabaseTask(t));
          _updateBadge();
          _updateStripCount();
          _render();
        })
        .on('postgres_changes', {
          event:  'UPDATE',
          schema: 'public',
          table:  'tasks',
          filter: 'clinic_id=eq.' + profile.clinic_id,
        }, function(payload) {
          var updated = payload.new;
          if (!updated || !updated.id) return;
          var idx = tasks.findIndex(function(x) { return x.id === updated.id; });
          if (idx === -1) return;
          tasks[idx] = _normalizeSupabaseTask(updated);
          _updateBadge();
          _updateStripCount();
          _render();
        })
        .subscribe();
    } catch (e) {
      console.warn('[tasksPanel] realtime:', e.message);
    }
  }

  /* ── Panel open/close ──────────────────────────────────── */
  function open() {
    document.getElementById('tasksPanel')?.classList.add('open');
    document.getElementById('tasksOverlay')?.classList.add('open');
    document.body.classList.add('tasks-panel-active');
    // Sair do modo mini ao abrir via botão do header
    if (isMini) _exitMini();
    _render();
    _reIcons();
  }

  function close() {
    document.getElementById('tasksPanel')?.classList.remove('open');
    document.getElementById('tasksOverlay')?.classList.remove('open');
    document.body.classList.remove('tasks-panel-active');
    _cancelConfirm();
    if (isMini) _exitMini();
  }

  /* ── Minimize / Expand ─────────────────────────────────── */
  function toggleMini() {
    isMini ? _exitMini() : _enterMini();
  }

  function _enterMini() {
    isMini = true;
    document.getElementById('tasksPanel')?.classList.add('mini');
    document.body.classList.remove('tasks-panel-active');
    const icon = document.getElementById('tasksMiniIcon');
    if (icon) { icon.setAttribute('data-feather', 'chevron-left'); _reIcons(); }
    _updateStripCount();
  }

  function _exitMini() {
    isMini = false;
    document.getElementById('tasksPanel')?.classList.remove('mini');
    document.body.classList.add('tasks-panel-active');
    const icon = document.getElementById('tasksMiniIcon');
    if (icon) { icon.setAttribute('data-feather', 'chevron-right'); _reIcons(); }
    _render();
  }

  function _updateStripCount() {
    const count = tasks.filter(t => !t.done).length;
    const el = document.getElementById('tasksStripCount');
    if (el) el.textContent = count;
  }

  /* ── Tabs ──────────────────────────────────────────────── */
  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tasks-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tab)
    );
    activeFilters.clear();
    _renderFilters();
    _render();
  }

  /* ── Filtros rápidos ───────────────────────────────────── */
  function toggleFilter(urgency) {
    activeFilters.has(urgency) ? activeFilters.delete(urgency) : activeFilters.add(urgency);
    _renderFilters();
    _render();
  }

  function _renderFilters() {
    const el = document.getElementById('tasksFilters');
    if (!el) return;
    if (currentTab !== 'pending') { el.innerHTML = ''; return; }

    const filters = [
      { key:'critico',  label:'Crítico',  cls:'flt-critico'  },
      { key:'urgente',  label:'Urgente',  cls:'flt-urgente'  },
      { key:'normal',   label:'Normal',   cls:'flt-normal'   },
    ];

    el.innerHTML = filters.map(f => `
      <button class="tasks-filter-btn ${f.cls} ${activeFilters.has(f.key) ? 'active' : ''}"
        onclick="tasksPanel.toggleFilter('${f.key}')">
        ${f.label}
        ${activeFilters.has(f.key) ? '<i data-feather="x"></i>' : ''}
      </button>`).join('');

    _reIcons();
  }

  /* ── Render ────────────────────────────────────────────── */
  function _render() {
    const list = document.getElementById('tasksList');
    if (!list) return;

    let pending = tasks.filter(t => !t.done);
    const history = tasks.filter(t => t.done);

    const pendingEl = document.getElementById('pendingCount');
    const historyEl = document.getElementById('historyCount');
    if (pendingEl) pendingEl.textContent = pending.length;
    if (historyEl) historyEl.textContent = history.length;

    if (currentTab === 'pending') {
      // Aplicar filtros
      const filtered = activeFilters.size > 0
        ? pending.filter(t => activeFilters.has(t.urgency))
        : pending;

      if (pending.length === 0) {
        list.innerHTML = `<div class="tasks-empty"><div class="tasks-empty-icon">✅</div><p>Todas as tarefas concluídas!</p><p class="tasks-empty-sub">Ótimo trabalho — sem pendências.</p></div>`;
      } else if (filtered.length === 0) {
        list.innerHTML = `<div class="tasks-empty"><div class="tasks-empty-icon">🔍</div><p>Nenhuma tarefa com esse filtro.</p></div>`;
      } else {
        list.innerHTML = filtered.map(_cardPending).join('');
      }
    } else {
      if (history.length === 0) {
        list.innerHTML = `<div class="tasks-empty"><div class="tasks-empty-icon">📋</div><p>Nenhuma tarefa concluída ainda.</p></div>`;
      } else {
        list.innerHTML = `<div class="tasks-history-label">Tarefas Concluídas</div>` + history.map(_cardHistory).join('');
      }
    }

    _reIcons();
  }

  /* ── Card helpers ──────────────────────────────────────── */
  function _getResps(task) {
    if (task.responsibleIds && task.responsibleIds.length) {
      return task.responsibleIds
        .map(function(id) { return _professionals.find(function(p) { return String(p.id) === String(id); }); })
        .filter(Boolean);
    }
    // backward compat: campo string antigo
    if (task.responsible && task.responsible !== '—') {
      return [{ id: '0', name: task.responsible, role: '', phone: null }];
    }
    return [];
  }

  function _waLink(phone, taskTitle, urgency) {
    const msg = `Olá! 👋\nVocê tem uma tarefa pendente no *ClinicAI*:\n\n📋 *${taskTitle}*\n⚠️ Urgência: *${_urgLabel(urgency)}*\n\nPor favor, verifique e conclua assim que possível.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  function _waButtons(resps, task) {
    if (!resps.length) return '';
    return resps.map(r => {
      if (!r.phone) return '';
      const link = _waLink(r.phone, task.title, task.urgency);
      return `<a class="task-wa-btn" href="${link}" target="_blank" rel="noopener" title="WhatsApp: ${_esc(r.name)}">
        <i data-feather="message-circle"></i>${_esc(r.name)}
      </a>`;
    }).join('');
  }

  function _autoBadge(t) {
    if (t._source !== 'supabase') return '';
    const typeLabels = {
      follow_up: 'Follow-up',
      call:      'Ligação',
      alert:     'Alerta',
    };
    const label = typeLabels[t.type] || 'Auto';
    return `<span class="task-auto-badge" title="Gerada automaticamente pelo sistema">${label}</span>`;
  }

  function _dueBadge(t) {
    if (!t.due_at) return '';
    const diff = new Date(t.due_at).getTime() - Date.now();
    if (diff <= 0) return `<span class="task-due-badge task-due-overdue">Vencida</span>`;
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return `<span class="task-due-badge task-due-critico">< 1h</span>`;
    if (h < 24) return `<span class="task-due-badge task-due-urgente">${h}h</span>`;
    const d = Math.floor(h / 24);
    return `<span class="task-due-badge task-due-normal">${d}d</span>`;
  }

  /* ── Cards ─────────────────────────────────────────────── */
  function _cardPending(t) {
    const isConfirming = confirmingId === t.id;
    const isDeleting   = deletingId   === t.id;
    const resps        = _getResps(t);
    const isAuto       = t._source === 'supabase';

    return `
<div class="task-card${isConfirming ? ' task-card-confirming' : ''} task-urg-border-${t.urgency}" data-id="${_esc(String(t.id))}">
  <div class="task-card-row">

    <div class="task-check-col">
      ${isConfirming
        ? `<div class="task-confirm-inline">
             <span class="task-confirm-question">Concluir?</span>
             <div class="task-confirm-btns">
               <button class="task-confirm-yes" onclick="tasksPanel.confirmDone(${_jsId(t.id)})">✓ Sim</button>
               <button class="task-confirm-no"  onclick="tasksPanel.cancelConfirm()">✕</button>
             </div>
           </div>`
        : `<button class="task-circle-btn" onclick="tasksPanel.requestConfirm(${_jsId(t.id)})" title="Marcar como feita">
             <i data-feather="circle"></i>
           </button>`
      }
    </div>

    <div class="task-body">
      <div class="task-title-row">
        <p class="task-card-title">${_esc(t.title)}</p>
        ${_autoBadge(t)}
      </div>
      ${t.description && t.description !== t.title
        ? `<p class="task-card-desc">${_esc(t.description)}</p>`
        : ''
      }

      <div class="task-card-meta">
        ${resps.length ? `<span class="task-meta-resps"><i data-feather="users"></i>${resps.map(r => `<span class="task-resp-chip"><strong>${_esc(r.name)}</strong><em>${_esc(r.role)}</em></span>`).join('')}</span>` : ''}
        <span class="task-urgency-badge task-urg-${t.urgency}">${_urgLabel(t.urgency)}</span>
        ${_dueBadge(t)}
        <span class="task-meta-time">${_timeAgo(t.createdAt)}</span>
      </div>

      ${t.whatsapp && resps.length
        ? `<div class="task-wa-row">${_waButtons(resps, t)}</div>`
        : ''
      }
    </div>

    <div class="task-actions">
      ${isAuto
        ? `<button class="task-action-btn task-action-disabled" title="Tarefa automática — não editável" disabled>
             <i data-feather="lock"></i>
           </button>`
        : `<button class="task-action-btn" onclick="tasksPanel.openModal(${_jsId(t.id)})" title="Editar">
             <i data-feather="edit-2"></i>
           </button>`
      }
      ${isAuto
        ? ''
        : isDeleting
          ? `<div class="task-delete-confirm">
               <span>Excluir?</span>
               <button class="task-confirm-yes" onclick="tasksPanel.confirmDelete(${_jsId(t.id)})">Sim</button>
               <button class="task-confirm-no"  onclick="tasksPanel.cancelDeleteConfirm()">Não</button>
             </div>`
          : `<button class="task-action-btn task-action-del" onclick="tasksPanel.requestDeleteConfirm(${_jsId(t.id)})" title="Excluir">
               <i data-feather="trash-2"></i>
             </button>`
      }
    </div>

  </div>
</div>`;
  }

  function _cardHistory(t) {
    const isDeleting = deletingId === t.id;
    const resps      = _getResps(t);
    const isAuto     = t._source === 'supabase';

    return `
<div class="task-card task-card-done" data-id="${_esc(String(t.id))}">
  <div class="task-card-row">

    <div class="task-check-col">
      <button class="task-circle-btn task-circle-done" onclick="tasksPanel.undoTask(${_jsId(t.id)})" title="Desfazer">
        <i data-feather="check-circle"></i>
      </button>
    </div>

    <div class="task-body">
      <div class="task-title-row">
        <p class="task-card-title task-title-struck">${_esc(t.title)}</p>
        ${_autoBadge(t)}
      </div>
      <div class="task-card-meta">
        ${resps.length ? `<span class="task-meta-resps"><i data-feather="users"></i>${resps.map(r => `<span class="task-resp-chip"><strong>${_esc(r.name)}</strong><em>${_esc(r.role)}</em></span>`).join('')}</span>` : ''}
        <span class="task-urgency-badge task-urg-${t.urgency}">${_urgLabel(t.urgency)}</span>
        ${t.doneAt ? `<span class="task-meta-time task-meta-done">Concluída ${_timeAgo(t.doneAt)}</span>` : ''}
      </div>
    </div>

    <div class="task-actions">
      ${isAuto
        ? ''
        : isDeleting
          ? `<div class="task-delete-confirm">
               <span>Excluir?</span>
               <button class="task-confirm-yes" onclick="tasksPanel.confirmDelete(${_jsId(t.id)})">Sim</button>
               <button class="task-confirm-no"  onclick="tasksPanel.cancelDeleteConfirm()">Não</button>
             </div>`
          : `<button class="task-action-btn task-action-del" onclick="tasksPanel.requestDeleteConfirm(${_jsId(t.id)})" title="Excluir">
               <i data-feather="trash-2"></i>
             </button>`
      }
    </div>

  </div>
</div>`;
  }

  /* ── Dupla confirmação ─────────────────────────────────── */
  function requestConfirm(id) {
    if (confirmingId !== null && confirmingId !== id) _cancelConfirm();
    confirmingId = id;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(_cancelConfirm, 5000);
    _render();
  }

  function confirmDone(id) {
    clearTimeout(confirmTimer);
    confirmingId = null;
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.done   = true;
    t.doneAt = Date.now();

    if (t._source === 'supabase') {
      // Atualiza Supabase fire-and-forget
      _sbUpdateStatus(id, 'done');
    } else {
      _save();
    }

    _updateBadge();
    _updateStripCount();
    _render();
  }

  function cancelConfirm() { _cancelConfirm(); _render(); }

  function _cancelConfirm() {
    clearTimeout(confirmTimer);
    confirmingId = null;
  }

  function undoTask(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.done   = false;
    t.doneAt = null;

    if (t._source === 'supabase') {
      _sbUpdateStatus(id, 'pending');
    } else {
      _save();
    }

    _updateBadge();
    _updateStripCount();
    _render();
  }

  function deleteTask(id) {
    const t = tasks.find(x => x.id === id);
    if (t && t._source === 'supabase') {
      // Tarefas automáticas não podem ser excluídas manualmente
      console.warn('[tasksPanel] deleteTask: tarefa automática não pode ser excluída.');
      _cancelDeleteConfirm();
      _render();
      return;
    }
    if (confirmingId === id) _cancelConfirm();
    _cancelDeleteConfirm();
    tasks = tasks.filter(x => x.id !== id);
    _save();
    _updateBadge();
    _updateStripCount();
    _render();
  }

  /* ── Supabase: atualiza status (fire-and-forget) ───────── */
  function _sbUpdateStatus(taskId, status) {
    if (!window._sbShared) return;
    window._sbShared.rpc('sdr_update_task_status', {
      p_task_id: taskId,
      p_status:  status,
    }).then(function(res) {
      if (res.error || !res.data?.ok) {
        console.warn('[tasksPanel] sdr_update_task_status:', res.error?.message || res.data?.error);
      }
    }).catch(function(e) {
      console.warn('[tasksPanel] sdr_update_task_status:', e.message);
    });
  }

  /* ── Double-check delete ───────────────────────────────── */
  function requestDeleteConfirm(id) {
    const t = tasks.find(x => x.id === id);
    if (t && t._source === 'supabase') return; // silencioso
    if (deletingId !== null && deletingId !== id) _cancelDeleteConfirm();
    deletingId = id;
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(_cancelDeleteConfirm, 5000);
    _render();
  }

  function confirmDelete(id) {
    clearTimeout(deleteTimer);
    deletingId = null;
    deleteTask(id);
  }

  function cancelDeleteConfirm() { _cancelDeleteConfirm(); _render(); }

  function _cancelDeleteConfirm() {
    clearTimeout(deleteTimer);
    deletingId = null;
  }

  /* ── Grid inline de responsáveis ───────────────────────── */
  function _buildRespGrid() {
    const grid = document.getElementById('taskRespGrid');
    if (!grid) return;

    if (_professionals.length === 0) {
      grid.innerHTML = '<div style="font-size:12px;color:#9CA3AF;padding:8px 0">Carregando profissionais...</div>';
      return;
    }

    grid.innerHTML = _professionals.map(function(p) {
      const initials = String(p.name || '?').trim().split(/\s+/).map(function(w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
      const sel = selectedResps.has(String(p.id));
      return `
        <div class="task-resp-card${sel ? ' task-resp-card-sel' : ''}"
             onclick="tasksPanel.toggleRespItem('${_esc(String(p.id))}')">
          <div class="task-resp-avatar">${initials}</div>
          <div class="task-resp-info">
            <span class="task-resp-name">${_esc(p.name)}</span>
            <span class="task-resp-role">${_esc(p.role || '')}</span>
          </div>
          ${sel ? `<div class="task-resp-sel-icon"><i data-feather="check"></i></div>` : ''}
        </div>`;
    }).join('');
    _reIcons();
  }

  function toggleRespItem(id) {
    const sid = String(id);
    selectedResps.has(sid) ? selectedResps.delete(sid) : selectedResps.add(sid);
    _buildRespGrid();
  }

  /* ── Modal ─────────────────────────────────────────────── */
  function openModal(id = null) {
    // Bloqueia edição de tarefas automáticas
    if (id !== null) {
      const t = tasks.find(x => x.id === id);
      if (t && t._source === 'supabase') return;
    }

    editingId = id;
    selectedResps.clear();
    const overlay = document.getElementById('taskModalOverlay');
    const titleEl = document.getElementById('taskModalTitle');
    if (!overlay) return;

    if (id !== null) {
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      if (titleEl) titleEl.textContent = 'Editar Tarefa';
      document.getElementById('taskInput').value = t.title;
      document.getElementById('taskUrgency').value = t.urgency;
      document.getElementById('taskWhatsapp').checked = t.whatsapp;
      // Carregar responsáveis
      if (t.responsibleIds) t.responsibleIds.forEach(function(i) { selectedResps.add(String(i)); });
    } else {
      if (titleEl) titleEl.textContent = 'Nova Tarefa';
      document.getElementById('taskInput').value = '';
      document.getElementById('taskUrgency').value = 'normal';
      document.getElementById('taskWhatsapp').checked = false;
    }

    overlay.classList.add('open');
    _buildRespGrid();
    _reIcons();
    setTimeout(() => document.getElementById('taskInput')?.focus(), 80);
  }

  function closeModal() {
    document.getElementById('taskModalOverlay')?.classList.remove('open');
    editingId = null;
  }

  function saveTask() {
    const titleEl = document.getElementById('taskInput');
    const title   = titleEl?.value.trim();
    if (!title) {
      titleEl?.classList.add('task-input-error');
      titleEl?.focus();
      return;
    }
    titleEl?.classList.remove('task-input-error');

    const urgency  = document.getElementById('taskUrgency')?.value || 'normal';
    const whatsapp = document.getElementById('taskWhatsapp')?.checked || false;
    const responsibleIds = [...selectedResps];

    if (editingId !== null) {
      const t = tasks.find(x => x.id === editingId);
      if (t) Object.assign(t, { title, urgency, whatsapp, responsibleIds });
    } else {
      // IDs locais: numérico. Nunca conflita com UUIDs do Supabase.
      const localTasks   = tasks.filter(function(x) { return x._source !== 'supabase'; });
      const numericIds   = localTasks.map(function(x) { return parseInt(x.id); }).filter(function(n) { return !isNaN(n); });
      const newId        = numericIds.length > 0 ? Math.max.apply(null, numericIds) + 1 : 1;
      tasks.unshift({ id: newId, title, urgency, whatsapp, responsibleIds, done: false, createdAt: Date.now(), doneAt: null });
    }

    _save();
    _updateBadge();
    _updateStripCount();
    closeModal();

    if (currentTab !== 'pending') switchTab('pending');
    else { activeFilters.clear(); _renderFilters(); _render(); }
  }

  /* ── Badge header ──────────────────────────────────────── */
  function _updateBadge() {
    const count = tasks.filter(t => !t.done).length;
    const badge = document.getElementById('tasksBadge');
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }

  /* ── Helpers ───────────────────────────────────────────── */
  function _urgLabel(u) {
    return { normal:'Normal', urgente:'Urgente', critico:'Crítico' }[u] || u;
  }

  function _timeAgo(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1)  return 'agora';
    if (m < 60) return `há ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h}h`;
    return `há ${Math.floor(h / 24)}d`;
  }

  function _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Serializa ID para uso inline no HTML (números ou strings UUID seguras)
  function _jsId(id) {
    if (typeof id === 'number') return id;
    // UUID: passa como string entre aspas
    return `'${String(id).replace(/'/g, '')}'`;
  }

  function _reIcons(container) {
    featherIn(
      container || document.getElementById('tasksPanel'),
      { 'stroke-width': 1.8, width: 14, height: 14 }
    )
  }

  /* ── Public API ────────────────────────────────────────── */
  return {
    init,
    open, close,
    toggleMini,
    switchTab,
    toggleFilter,
    requestConfirm, confirmDone, cancelConfirm,
    requestDeleteConfirm, confirmDelete, cancelDeleteConfirm,
    undoTask, deleteTask,
    toggleRespItem,
    openModal, closeModal, saveTask,
  };
})();

document.addEventListener('DOMContentLoaded', () => tasksPanel.init());
