/* ============================================================
   ClinicAI — Gerador de Links WhatsApp
   Módulo: Growth & MKT
   ============================================================ */

'use strict';

const waLinks = (() => {

  /* ── Chaves localStorage ───────────────────────────────── */
  const NUMBERS_KEY = 'clinicai_wa_numbers';
  const HISTORY_KEY = 'clinicai_wa_history';
  const MAX_HISTORY = 20;

  /* ── Estado ────────────────────────────────────────────── */
  let numbers       = [];
  let history       = [];
  let selectedNumId = null;
  let generatedLink = null;
  let editingNumId  = null;

  /* ── Init ──────────────────────────────────────────────── */
  function init() {
    _loadData();
    _render();
  }

  /* ── Storage ───────────────────────────────────────────── */
  function _loadData() {
    try { numbers = JSON.parse(localStorage.getItem(NUMBERS_KEY)) || _defaultNumbers(); }
    catch { numbers = _defaultNumbers(); }
    try { history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { history = []; }
    if (numbers.length) selectedNumId = numbers[0].id;
  }

  function _saveNumbers() { try { store.set(NUMBERS_KEY, numbers) } catch (e) { if (e.name === 'QuotaExceededError') console.warn('ClinicAI: localStorage cheio.') } }
  function _saveHistory() { try { store.set(HISTORY_KEY, history) } catch (e) { if (e.name === 'QuotaExceededError') console.warn('ClinicAI: localStorage cheio.') } }

  function _defaultNumbers() {
    return [
      { id: 1, label: 'Atendimento Principal', phone: '5511999990010', active: true },
      { id: 2, label: 'SDR — Full Face',        phone: '5511999990020', active: true },
      { id: 3, label: 'SDR — Protocolos',       phone: '5511999990030', active: true },
    ];
  }

  /* ── Render principal ──────────────────────────────────── */
  function _render() {
    const root = document.getElementById('waLinksRoot');
    if (!root) return;

    root.innerHTML = `
      <div class="page-title-row">
        <div class="page-title-left">
          <h1 class="page-title">Gerador de Links WhatsApp</h1>
          <p class="page-subtitle">Crie links personalizados para campanhas, bio de redes sociais e mensagens para pacientes</p>
        </div>
      </div>

      <div class="wal-layout">

        <!-- ── Coluna principal ── -->
        <div class="wal-col-main">

          <!-- Criar link -->
          <div class="wal-card" id="walFormCard">
            <div class="wal-card-header">
              <div class="wal-card-title">
                <i data-feather="link"></i>
                Criar Novo Link
              </div>
            </div>
            <div class="wal-card-body">

              <!-- Seleção de número -->
              <div class="wal-field-group">
                <label class="wal-label">Número da Clínica</label>
                <div class="wal-num-grid" id="walNumGrid">
                  ${_renderNumCards()}
                </div>
              </div>

              <!-- Mensagem -->
              <div class="wal-field-group">
                <label class="wal-label">
                  Mensagem <span class="wal-label-opt">(opcional — pré-preenchida no WhatsApp)</span>
                </label>
                <div class="wal-textarea-wrap">
                  <textarea id="walMsg" class="wal-textarea" rows="5"
                    placeholder="Ex: Olá! Vim pelo Instagram e gostaria de saber mais sobre os procedimentos disponíveis 😊"
                    oninput="waLinks.onMsgInput(this)"></textarea>
                  <div class="wal-char-counter"><span id="walCharCount">0</span> / 1000</div>
                </div>
              </div>

              <div class="wal-form-actions">
                <button class="wal-btn-generate" onclick="waLinks.generate()">
                  <i data-feather="zap"></i> Gerar Link
                </button>
                <button class="wal-btn-clear" onclick="waLinks.clearForm()">
                  <i data-feather="x"></i> Limpar
                </button>
              </div>
            </div>
          </div>

          <!-- Resultado (hidden until generated) -->
          <div class="wal-card wal-result-card ${generatedLink ? '' : 'wal-hidden'}" id="walResultCard">
            <div class="wal-card-header wal-result-header">
              <div class="wal-card-title">
                <i data-feather="check-circle"></i>
                Link Gerado!
              </div>
              <button class="wal-btn-novo" onclick="waLinks.novoLink()">
                <i data-feather="plus"></i> Novo Link
              </button>
            </div>
            <div class="wal-card-body" id="walResultBody">
              ${generatedLink ? _renderResult() : ''}
            </div>
          </div>

        </div>

        <!-- ── Coluna lateral ── -->
        <div class="wal-col-side">

          <!-- Números cadastrados -->
          <div class="wal-card">
            <div class="wal-card-header">
              <div class="wal-card-title">
                <i data-feather="smartphone"></i>
                Números Cadastrados
              </div>
              <button class="wal-btn-add" onclick="waLinks.showAddNumber()">
                <i data-feather="plus"></i> Adicionar
              </button>
            </div>
            <div class="wal-card-body" id="walNumList">
              ${_renderNumbersList()}
            </div>
            <!-- Form inline de adição/edição -->
            <div class="wal-num-form ${editingNumId !== null ? '' : 'wal-hidden'}" id="walNumForm">
              <div class="wal-num-form-inner">
                <div class="wal-field-group">
                  <label class="wal-label">Nome / Rótulo</label>
                  <input type="text" id="walNumLabel" class="wal-input" placeholder="Ex: SDR Full Face" />
                </div>
                <div class="wal-field-group">
                  <label class="wal-label">Número (com DDD e código do país)</label>
                  <input type="text" id="walNumPhone" class="wal-input" placeholder="5511999990000" />
                  <span class="wal-input-hint">Somente números — ex: 5511999990000</span>
                </div>
                <div class="wal-num-form-actions">
                  <button class="wal-btn-cancel-sm" onclick="waLinks.cancelNumForm()">Cancelar</button>
                  <button class="wal-btn-save-sm" onclick="waLinks.saveNumber()">Salvar</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Histórico -->
          <div class="wal-card">
            <div class="wal-card-header">
              <div class="wal-card-title">
                <i data-feather="clock"></i>
                Histórico de Links
              </div>
              ${history.length > 0
                ? `<button class="wal-btn-clear-hist" onclick="waLinks.clearHistory()" title="Limpar histórico"><i data-feather="trash-2"></i></button>`
                : ''}
            </div>
            <div class="wal-card-body" id="walHistoryList">
              ${_renderHistory()}
            </div>
          </div>

        </div>
      </div>`;

    _reIcons();
  }

  /* ── Cards de seleção de número ───────────────────────── */
  function _renderNumCards() {
    const active = numbers.filter(n => n.active);
    if (!active.length) return `<p class="wal-empty-sm">Nenhum número cadastrado.</p>`;
    return active.map(n => `
      <div class="wal-num-card ${selectedNumId === n.id ? 'selected' : ''}"
        onclick="waLinks.selectNum(${n.id})">
        <div class="wal-num-card-radio">
          <span class="wal-radio ${selectedNumId === n.id ? 'checked' : ''}"></span>
        </div>
        <div class="wal-num-card-info">
          <span class="wal-num-card-label">${_esc(n.label)}</span>
          <span class="wal-num-card-phone">${_formatPhone(n.phone)}</span>
        </div>
        <div class="wal-num-card-icon">
          <i data-feather="message-circle"></i>
        </div>
      </div>`).join('');
  }

  /* ── Lista de números (sidebar) ───────────────────────── */
  function _renderNumbersList() {
    if (!numbers.length) return `<p class="wal-empty-sm">Nenhum número cadastrado ainda.</p>`;
    return `<ul class="wal-num-list">` + numbers.map(n => `
      <li class="wal-num-list-item">
        <div class="wal-num-list-info">
          <span class="wal-num-list-label">${_esc(n.label)}</span>
          <span class="wal-num-list-phone">${_formatPhone(n.phone)}</span>
        </div>
        <div class="wal-num-list-actions">
          <button class="wal-icon-btn" onclick="waLinks.editNumber(${n.id})" title="Editar">
            <i data-feather="edit-2"></i>
          </button>
          <button class="wal-icon-btn wal-icon-del" onclick="waLinks.deleteNumber(${n.id})" title="Excluir">
            <i data-feather="trash-2"></i>
          </button>
        </div>
      </li>`).join('') + `</ul>`;
  }

  /* ── Resultado do link ────────────────────────────────── */
  function _renderResult() {
    if (!generatedLink) return '';
    const num = numbers.find(n => n.id === generatedLink.numId);
    const numLabel = num ? num.label : 'Número';
    const shortLink = `https://wa.me/${generatedLink.phone}`;
    const fullLink  = generatedLink.link;

    return `
      <div class="wal-result-info">
        <span class="wal-result-num"><i data-feather="smartphone"></i>${_esc(numLabel)} · ${_formatPhone(generatedLink.phone)}</span>
        ${generatedLink.message ? `<p class="wal-result-msg">"${_esc(generatedLink.message.substring(0, 80))}${generatedLink.message.length > 80 ? '…' : ''}"</p>` : '<p class="wal-result-msg wal-muted">Sem mensagem pré-preenchida</p>'}
      </div>

      <div class="wal-link-box" id="walLinkBox">
        <span class="wal-link-text" id="walLinkText">${_esc(fullLink)}</span>
        <button class="wal-btn-copy" id="walCopyBtn" onclick="waLinks.copyLink('${_escAttr(fullLink)}', 'walCopyBtn')" title="Copiar link">
          <i data-feather="copy"></i> Copiar
        </button>
      </div>

      <div class="wal-result-actions">
        <a class="wal-btn-open" href="${_escAttr(fullLink)}" target="_blank" rel="noopener">
          <i data-feather="external-link"></i> Abrir no WhatsApp
        </a>
        ${generatedLink.message
          ? `<button class="wal-btn-copy-plain" onclick="waLinks.copyLink('${_escAttr(shortLink)}', 'walCopyPlain')" id="walCopyPlain">
               <i data-feather="link-2"></i> Copiar link simples
             </button>`
          : ''}
      </div>`;
  }

  /* ── Histórico ────────────────────────────────────────── */
  function _renderHistory() {
    if (!history.length) {
      return `<div class="wal-empty-sm wal-empty-center">Nenhum link gerado ainda.</div>`;
    }
    return `<ul class="wal-history-list">` + history.map(h => {
      const num = numbers.find(n => n.id === h.numId);
      const label = num ? num.label : _formatPhone(h.phone);
      return `
        <li class="wal-history-item">
          <div class="wal-history-info">
            <span class="wal-history-label">${_esc(label)}</span>
            ${h.message
              ? `<span class="wal-history-msg">${_esc(h.message.substring(0, 55))}${h.message.length > 55 ? '…' : ''}</span>`
              : `<span class="wal-history-msg wal-muted">Sem mensagem</span>`}
            <span class="wal-history-time">${_timeAgo(h.createdAt)}</span>
          </div>
          <button class="wal-icon-btn wal-icon-copy" onclick="waLinks.copyLink('${_escAttr(h.link)}', this)"
            title="Copiar">
            <i data-feather="copy"></i>
          </button>
        </li>`;
    }).join('') + `</ul>`;
  }

  /* ── Ações de seleção de número ───────────────────────── */
  function selectNum(id) {
    selectedNumId = id;
    const grid = document.getElementById('walNumGrid');
    if (grid) { grid.innerHTML = _renderNumCards(); _reIcons(grid); }
  }

  function onMsgInput(el) {
    const count = document.getElementById('walCharCount');
    if (count) count.textContent = el.value.length;
    if (el.value.length > 1000) el.value = el.value.substring(0, 1000);
  }

  /* ── Gerar link ───────────────────────────────────────── */
  function generate() {
    if (!selectedNumId) {
      _toast('Selecione um número da clínica', 'warn');
      return;
    }
    const num = numbers.find(n => n.id === selectedNumId);
    if (!num) return;

    const msg = (document.getElementById('walMsg')?.value || '').trim();
    const phone = num.phone.replace(/\D/g, '');
    const link = msg
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/${phone}`;

    generatedLink = {
      id: Date.now(),
      numId: num.id,
      phone,
      message: msg,
      link,
      createdAt: Date.now(),
    };

    // Adicionar ao histórico
    history.unshift({ ...generatedLink });
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    _saveHistory();

    // Mostrar resultado
    const resultCard = document.getElementById('walResultCard');
    const resultBody = document.getElementById('walResultBody');
    if (resultCard) resultCard.classList.remove('wal-hidden');
    if (resultBody) { resultBody.innerHTML = _renderResult(); _reIcons(resultBody); }

    // Atualizar histórico no sidebar
    const histList = document.getElementById('walHistoryList');
    if (histList) { histList.innerHTML = _renderHistory(); _reIcons(histList); }

    // Scroll para o resultado
    resultCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Copiar link ──────────────────────────────────────── */
  function copyLink(link, btnOrId) {
    navigator.clipboard.writeText(link).then(() => {
      const btn = typeof btnOrId === 'string'
        ? document.getElementById(btnOrId)
        : btnOrId;
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-feather="check"></i> Copiado!';
        btn.classList.add('wal-copied');
        _reIcons();
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('wal-copied'); _reIcons(); }, 2000);
      }
    }).catch(() => {
      // Fallback para navegadores sem clipboard API
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      _toast('Link copiado!', 'success');
    });
  }

  /* ── Novo link / Limpar ───────────────────────────────── */
  function novoLink() {
    generatedLink = null;
    const resultCard = document.getElementById('walResultCard');
    if (resultCard) resultCard.classList.add('wal-hidden');
    const msgEl = document.getElementById('walMsg');
    if (msgEl) { msgEl.value = ''; }
    const count = document.getElementById('walCharCount');
    if (count) count.textContent = '0';
    msgEl?.focus();
  }

  function clearForm() {
    const msgEl = document.getElementById('walMsg');
    if (msgEl) { msgEl.value = ''; }
    const count = document.getElementById('walCharCount');
    if (count) count.textContent = '0';
    generatedLink = null;
    const resultCard = document.getElementById('walResultCard');
    if (resultCard) resultCard.classList.add('wal-hidden');
  }

  /* ── Gerenciar números ────────────────────────────────── */
  function showAddNumber() {
    editingNumId = 0; // 0 = novo
    const form = document.getElementById('walNumForm');
    const labelEl = document.getElementById('walNumLabel');
    const phoneEl = document.getElementById('walNumPhone');
    if (form) form.classList.remove('wal-hidden');
    if (labelEl) labelEl.value = '';
    if (phoneEl) phoneEl.value = '';
    labelEl?.focus();
  }

  function editNumber(id) {
    const num = numbers.find(n => n.id === id);
    if (!num) return;
    editingNumId = id;
    const form  = document.getElementById('walNumForm');
    const labelEl = document.getElementById('walNumLabel');
    const phoneEl = document.getElementById('walNumPhone');
    if (form) form.classList.remove('wal-hidden');
    if (labelEl) labelEl.value = num.label;
    if (phoneEl) phoneEl.value = num.phone;
    labelEl?.focus();
  }

  function saveNumber() {
    const label = document.getElementById('walNumLabel')?.value.trim();
    const phone = document.getElementById('walNumPhone')?.value.replace(/\D/g, '');

    if (!label) { _toast('Informe um nome para o número', 'warn'); return; }
    if (!phone || phone.length < 10) { _toast('Informe um número válido (com DDD)', 'warn'); return; }

    if (editingNumId === 0) {
      const newId = numbers.length > 0 ? Math.max(...numbers.map(n => n.id)) + 1 : 1;
      numbers.push({ id: newId, label, phone, active: true });
      if (!selectedNumId) selectedNumId = newId;
    } else {
      const num = numbers.find(n => n.id === editingNumId);
      if (num) Object.assign(num, { label, phone });
    }

    _saveNumbers();
    cancelNumForm();
    _reRender();
  }

  function deleteNumber(id) {
    numbers = numbers.filter(n => n.id !== id);
    if (selectedNumId === id) selectedNumId = numbers[0]?.id || null;
    _saveNumbers();
    _reRender();
  }

  function cancelNumForm() {
    editingNumId = null;
    const form = document.getElementById('walNumForm');
    if (form) form.classList.add('wal-hidden');
  }

  /* ── Histórico ────────────────────────────────────────── */
  function clearHistory() {
    if (!confirm('Limpar todo o histórico de links gerados?')) return;
    history = [];
    _saveHistory();
    const histList = document.getElementById('walHistoryList');
    if (histList) { histList.innerHTML = _renderHistory(); _reIcons(); }
    // atualizar botão de limpar
    const header = histList?.closest('.wal-card')?.querySelector('.wal-card-header');
    if (header) {
      const clearBtn = header.querySelector('.wal-btn-clear-hist');
      if (clearBtn) clearBtn.remove();
    }
  }

  /* ── Full re-render ────────────────────────────────────── */
  function _reRender() {
    generatedLink = null;
    _render();
  }

  /* ── Helpers ───────────────────────────────────────────── */
  function _formatPhone(phone) {
    const p = String(phone).replace(/\D/g, '');
    if (p.length === 13) return `+${p.slice(0,2)} (${p.slice(2,4)}) ${p.slice(4,9)}-${p.slice(9)}`;
    if (p.length === 12) return `+${p.slice(0,2)} (${p.slice(2,4)}) ${p.slice(4,8)}-${p.slice(8)}`;
    return phone;
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

  function _escAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _reIcons(container) {
    featherIn(
      container || document.getElementById('waLinksRoot'),
      { 'stroke-width': 1.8, width: 15, height: 15 }
    )
  }

  function _toast(msg, type = 'info') {
    const colors = { success: '#10B981', warn: '#F59E0B', info: '#3B82F6' };
    const toast = document.createElement('div');
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: 'fixed', bottom: '24px', right: '24px', zIndex: '9999',
      padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
      color: '#fff', background: colors[type] || colors.info,
      boxShadow: '0 4px 16px rgba(0,0,0,.15)', transition: 'opacity .3s',
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
  }

  /* ── Inicializar quando a página é carregada ───────────── */
  // O navigateTo do app.js ativa a página, então observamos a visibilidade
  function _attachObserver() {
    const page = document.getElementById('page-growth-wa-links');
    if (!page) return;
    const obs = new MutationObserver(() => {
      if (page.classList.contains('active') && !document.getElementById('walNumGrid')) {
        _loadData();
        _render();
      }
    });
    obs.observe(page, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── Public API ────────────────────────────────────────── */
  return {
    init: _attachObserver,
    selectNum,
    onMsgInput,
    generate,
    copyLink,
    novoLink,
    clearForm,
    showAddNumber,
    editNumber,
    saveNumber,
    deleteNumber,
    cancelNumForm,
    clearHistory,
  };
})();

document.addEventListener('DOMContentLoaded', () => waLinks.init());
