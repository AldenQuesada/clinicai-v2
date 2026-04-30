// agenda-mensagens.js - Banco de Mensagens WhatsApp
(function () {
  'use strict';

  const STORAGE_KEY = 'clinicai_wa_messages';

  const MSG_TYPES = [
    { key: 'confirmacao',  label: 'Confirmação',             color: '#059669', bg: '#D1FAE5', icon: '✓' },
    { key: 'lembrete',     label: 'Lembrete',                color: '#D97706', bg: '#FEF3C7', icon: '⏰' },
    { key: 'engajamento',  label: 'Engajamento',             color: '#2563EB', bg: '#DBEAFE', icon: '⚡' },
    { key: 'boas_vindas',  label: 'Boas-Vindas',             color: '#7C3AED', bg: '#EDE9FE', icon: '👋' },
    { key: 'consent_img',  label: 'Consentimento de Imagem', color: '#DC2626', bg: '#FEE2E2', icon: '📸' },
    { key: 'consent_info', label: 'Consentimento Informado', color: '#374151', bg: '#F3F4F6', icon: '📋' },
    { key: 'report_imagem', label: 'Report Facial — Imagem', color: '#C8A97E', bg: '#FFF8F0', icon: '📊' },
    { key: 'report_html',   label: 'Report Facial — HTML',   color: '#C8A97E', bg: '#FFF8F0', icon: '📎' },
  ];

  const VARIABLES = [
    { key: '{{nome}}',         label: 'Nome do paciente'     },
    { key: '{{data}}',         label: 'Data da consulta'     },
    { key: '{{hora}}',         label: 'Hora da consulta'     },
    { key: '{{endereco}}',     label: 'Endereço da clínica'  },
    { key: '{{link_maps}}',    label: 'Link Google Maps'     },
    { key: '{{profissional}}', label: 'Nome do profissional' },
    { key: '{{procedimento}}', label: 'Procedimento'         },
    { key: '{{clinica}}',      label: 'Nome da clínica'      },
  ];

  // day = dias em relação à consulta (negativo = antes, 0 = mesmo dia, positivo = depois)
  const DEFAULT_MESSAGES = [
    {
      id: 'default_1', type: 'confirmacao',
      name: 'Confirmação de Consulta', day: -2,
      message: 'Olá, {{nome}}! 😊\n\nPassando para confirmar sua consulta na *{{clinica}}*.\n\n📅 *Data:* {{data}}\n⏰ *Hora:* {{hora}}\n👨‍⚕️ *Profissional:* {{profissional}}\n💆 *Procedimento:* {{procedimento}}\n\n📍 *Endereço:* {{endereco}}\n🗺️ *Como chegar:* {{link_maps}}\n\nPor favor, confirme sua presença respondendo *SIM* ou *NÃO*.\n\nAté logo!',
      active: true,
    },
    {
      id: 'default_2', type: 'lembrete',
      name: 'Lembrete 24h Antes', day: -1,
      message: 'Oi, {{nome}}! 👋\n\nLembrando que amanhã é o seu horário na *{{clinica}}*!\n\n⏰ *{{hora}}* com *{{profissional}}*\n📍 {{endereco}}\n\nQualquer dúvida, estamos à disposição. Nos vemos em breve! 🌟',
      active: true,
    },
    {
      id: 'default_3', type: 'boas_vindas',
      name: 'Boas-Vindas no Dia', day: 0,
      message: 'Seja bem-vindo(a), {{nome}}! 🌸\n\nEstamos te esperando na *{{clinica}}*.\n\n⏰ Seu horário é às *{{hora}}* com *{{profissional}}*.\n\nQualquer dúvida, pode falar conosco! ✨',
      active: true,
    },
    {
      id: 'default_4', type: 'engajamento',
      name: 'Pós-Procedimento', day: 1,
      message: 'Olá, {{nome}}! 💜\n\nEsperamos que esteja se sentindo bem após o *{{procedimento}}*.\n\nLembre-se de seguir os cuidados indicados por *{{profissional}}*.\n\nQualquer dúvida, estamos aqui! 🏥\n\n— *{{clinica}}*',
      active: true,
    },
    {
      id: 'default_report_img', type: 'report_imagem',
      name: 'Report Facial — Imagem', day: 0,
      message: 'Resultado do seu Protocolo de Harmonia Facial\n\n*{{clinica}}*\nHarmonia que revela. Precisão que dura.',
      active: true,
    },
    {
      id: 'default_report_html', type: 'report_html',
      name: 'Report Facial — HTML', day: 0,
      message: 'Plano de Harmonia Facial personalizado para *{{nome}}*\n\n*{{clinica}}*\nHarmonia que revela. Precisão que dura.',
      active: true,
    },
  ];

  let _state = {
    view: 'list',   // 'list' | 'edit'
    editId: null,
    editMsg: { type: 'confirmacao', name: '', day: 0, message: '', active: true },
    previewVars: {
      nome: 'Maria Silva',
      data: '28/03/2026',
      hora: '14:30',
      profissional: 'Dra. Ana Costa',
      procedimento: 'Limpeza de Pele',
      clinica: 'ClinicAI',
      endereco: 'Rua das Flores, 123 - São Paulo',
      link_maps: 'goo.gl/maps/exemplo',
    },
  };

  // ── Storage (localStorage + Supabase sync) ────────────────────────────────────

  // Cache em memória: null = ainda não carregado nesta sessão
  var _msgsCache = null;

  function _getMessages() {
    // Usa cache em memória se disponível (evita parse repetido)
    if (_msgsCache !== null) return _msgsCache.slice();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_MESSAGES));
      const msgs = JSON.parse(raw);
      return msgs.map(function(m) { return Object.assign({ day: 0 }, m); });
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_MESSAGES)); }
  }

  function _saveMessages(msgs) {
    // 1. Salva localStorage imediatamente (UX responsiva, funciona offline)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs)); } catch (e) {}
    // 2. Atualiza cache em memória
    _msgsCache = msgs.slice();
    // 3. Sincroniza com Supabase fire-and-forget
    _syncToSupabase(msgs);
  }

  // ── Supabase sync — via AnamnesisRepository ───────────────────────────────────

  async function _loadFromSupabase() {
    if (!window.AnamnesisRepository) return null;
    try {
      var res = await window.AnamnesisRepository.getWaTemplates();
      if (!res.ok) return null;
      var rows = res.data || [];
      if (!rows.length) return null;
      // Normaliza para o formato interno do módulo
      return rows.map(function(r) {
        return {
          id:      r.id,
          type:    r.type,
          name:    r.name,
          message: r.message,
          day:     r.day     !== undefined ? r.day : 0,
          active:  r.active  !== undefined ? r.active : true,
        };
      });
    } catch (e) {
      console.warn('[agenda-mensagens] _loadFromSupabase:', e.message);
      return null;
    }
  }

  function _syncToSupabase(msgs) {
    if (!window.AnamnesisRepository) return;
    // Upsert de cada template — fire-and-forget
    msgs.forEach(function(msg) {
      var isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(msg.id || ''));
      window.AnamnesisRepository.upsertWaTemplate(msg).then(function(res) {
        // Atualiza id local se era temporário (msg_TIMESTAMP) e Supabase retornou UUID
        if (res.ok && res.data && res.data.ok && res.data.id && !isUUID) {
          try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            const idx    = stored.findIndex(function(m) { return m.id === msg.id; });
            if (idx >= 0) {
              stored[idx].id = res.data.id;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
              if (_msgsCache) { var ci = _msgsCache.findIndex(function(m) { return m.id === msg.id; }); if (ci >= 0) _msgsCache[ci].id = res.data.id; }
            }
          } catch (e) {}
        }
      }).catch(function(e) {
        console.warn('[agenda-mensagens] _syncToSupabase:', e.message);
      });
    });
  }

  function _deleteFromSupabase(msgId) {
    if (!window.AnamnesisRepository) return;
    var isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(msgId || ''));
    if (!isUUID) return;  // ID temporário: nunca chegou ao Supabase
    window.AnamnesisRepository.deleteWaTemplate(msgId)
      .catch(function(e) { console.warn('[agenda-mensagens] _deleteFromSupabase:', e.message); });
  }

  function _getClinicSettings() {
    try { return JSON.parse(localStorage.getItem('clinicai_clinic_settings') || '{}'); }
    catch (e) { return {}; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _typeInfo(key) {
    return MSG_TYPES.find(t => t.key === key) || MSG_TYPES[0];
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _applyVars(text) {
    const cs = _getClinicSettings();
    const clinicaNome = cs.nome || _state.previewVars.clinica;
    const parts = [cs.rua, cs.numero, cs.bairro, cs.cidade].filter(Boolean);
    const clinicaEnd = parts.length ? parts.join(', ') : _state.previewVars.endereco;
    const v = Object.assign({}, _state.previewVars, { clinica: clinicaNome, endereco: clinicaEnd });
    return text
      .replace(/\{\{nome\}\}/g, v.nome)
      .replace(/\{\{data\}\}/g, v.data)
      .replace(/\{\{hora\}\}/g, v.hora)
      .replace(/\{\{profissional\}\}/g, v.profissional)
      .replace(/\{\{procedimento\}\}/g, v.procedimento)
      .replace(/\{\{clinica\}\}/g, v.clinica)
      .replace(/\{\{endereco\}\}/g, v.endereco)
      .replace(/\{\{link_maps\}\}/g, v.link_maps);
  }

  function _formatPreview(text) {
    return _esc(_applyVars(text || ''))
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function _dayLabel(day) {
    if (day === 0) return 'Dia da Consulta';
    if (day === -1) return '1 dia antes';
    if (day === 1) return '1 dia depois';
    if (day < 0) return Math.abs(day) + ' dias antes';
    return day + ' dias depois';
  }

  function _gapLabel(a, b) {
    const diff = b - a;
    if (diff === 0) return 'mesmo dia';
    if (diff === 1) return '+ 1 dia';
    return '+ ' + diff + ' dias';
  }

  function _timeNow() {
    const d = new Date();
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function render() {
    const root = document.getElementById('agendaMensagensRoot');
    if (!root) return;
    root.innerHTML = _state.view === 'list' ? _renderList() : _renderEdit();
    featherIn(root);
  }

  // ── Timeline (List) ───────────────────────────────────────────────────────────

  function _renderList() {
    const msgs = _getMessages().slice().sort(function (a, b) { return a.day - b.day; });

    const items = msgs.length === 0
      ? `<div style="text-align:center;padding:60px 0;color:#9CA3AF">
           <div style="font-size:40px;margin-bottom:12px">💬</div>
           <div style="font-weight:600;margin-bottom:4px">Nenhuma mensagem</div>
           <div style="font-size:13px">Crie sua primeira mensagem no funil</div>
         </div>`
      : msgs.map(function (msg, i) {
          const t = _typeInfo(msg.type);
          const rawMsg = msg.message || '';
          const preview = _esc(rawMsg.replace(/\n/g, ' ').substring(0, 80)) + (rawMsg.length > 80 ? '...' : '');
          const isLast = i === msgs.length - 1;
          const nextMsg = msgs[i + 1];
          const gap = !isLast ? _gapLabel(msg.day, nextMsg.day) : null;

          return `
            <!-- Timeline item -->
            <div style="display:flex;gap:0">

              <!-- Left: dot + line -->
              <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:48px">
                <div style="width:36px;height:36px;border-radius:50%;background:${t.bg};border:2px solid ${t.color};display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;margin-top:2px">${t.icon}</div>
                ${!isLast ? `<div style="width:2px;flex:1;min-height:28px;background:linear-gradient(to bottom,${t.color}40,#E5E7EB);margin-top:4px"></div>` : ''}
              </div>

              <!-- Right: card + gap label -->
              <div style="flex:1;padding-bottom:${isLast ? '0' : '4px'}">

                <!-- Card -->
                <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;margin-left:8px;margin-bottom:${isLast ? '0' : '0'}">
                  <!-- Objective header -->
                  <div style="background:${t.bg};padding:8px 14px;display:flex;align-items:center;justify-content:space-between">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="font-size:12px;font-weight:800;color:${t.color};text-transform:uppercase;letter-spacing:.5px">${t.label}</span>
                      ${msg.active
                        ? '<span style="padding:1px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,0,0,.06);color:' + t.color + '">Ativo</span>'
                        : '<span style="padding:1px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,0,0,.06);color:#9CA3AF">Inativo</span>'}
                    </div>
                    <span style="font-size:11px;font-weight:600;color:${t.color};opacity:.75">${_dayLabel(msg.day)}</span>
                  </div>

                  <!-- Body -->
                  <div style="padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:700;font-size:13px;color:#111827;margin-bottom:3px">${_esc(msg.name)}</div>
                      <div style="font-size:12px;color:#6B7280;line-height:1.4">${preview}</div>
                    </div>
                    <!-- Edit icon button -->
                    <button onclick="window._waMsgEdit('${msg.id}')" title="Editar mensagem" style="width:38px;height:38px;border:none;border-radius:10px;background:${t.bg};cursor:pointer;display:flex;align-items:center;justify-content:center;color:${t.color};flex-shrink:0;transition:opacity .15s" onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'">
                      <i data-feather="edit-3" style="width:16px;height:16px"></i>
                    </button>
                  </div>
                </div>

                <!-- Gap connector between items -->
                ${!isLast ? `
                  <div style="margin-left:8px;padding:6px 0 4px;display:flex;align-items:center;gap:8px">
                    <div style="flex:1;height:1px;background:#E5E7EB"></div>
                    <span style="font-size:11px;font-weight:600;color:#9CA3AF;white-space:nowrap">${gap}</span>
                    <div style="flex:1;height:1px;background:#E5E7EB"></div>
                  </div>
                ` : ''}

              </div>
            </div>`;
        }).join('');

    return `
      <div>
        <div class="page-title-row">
          <div class="page-title-left">
            <h1 class="page-title">Funil de Mensagens</h1>
            <p class="page-subtitle">Sequência automática de WhatsApp — do agendamento ao pós-consulta</p>
          </div>
          <div class="page-title-actions">
            <button onclick="window._waMsgNew()" style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">
              <i data-feather="plus" style="width:16px;height:16px"></i> Nova Mensagem
            </button>
          </div>
        </div>

        <!-- Legend -->
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px">
          ${MSG_TYPES.map(function (t) {
            return `<span style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${t.bg};color:${t.color}">${t.icon} ${t.label}</span>`;
          }).join('')}
        </div>

        <!-- Timeline -->
        <div style="max-width:680px">
          ${items}
        </div>
      </div>`;
  }

  // ── Edit View ─────────────────────────────────────────────────────────────────

  function _renderEdit() {
    const isNew = !_state.editId;
    const msg = _state.editMsg;
    const t = _typeInfo(msg.type);
    const previewHtml = _formatPreview(msg.message);
    const timeStr = _timeNow();

    const typeOptions = MSG_TYPES.map(function (tp) {
      return `<option value="${tp.key}" ${msg.type === tp.key ? 'selected' : ''}>${tp.icon} ${tp.label}</option>`;
    }).join('');

    const varChips = VARIABLES.map(function (v) {
      return `<button type="button" onclick="window._waMsgInsertVar('${v.key}')" title="${_esc(v.label)}" style="padding:4px 10px;border-radius:6px;border:1px solid #E5E7EB;background:#F9FAFB;font-size:11px;font-weight:600;color:#374151;cursor:pointer" onmouseover="this.style.background='#EDE9FE';this.style.color='#7C3AED';this.style.borderColor='#C4B5FD'" onmouseout="this.style.background='#F9FAFB';this.style.color='#374151';this.style.borderColor='#E5E7EB'">${_esc(v.key)}</button>`;
    }).join('');

    const previewVarInputs = Object.entries(_state.previewVars).map(function (entry) {
      const k = entry[0]; const v = entry[1];
      return `<div>
        <label style="font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px">{{${k}}}</label>
        <input type="text" value="${_esc(v)}" style="width:100%;padding:6px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box" oninput="window._waMsgUpdatePreviewVar('${k}',this.value)">
      </div>`;
    }).join('');

    const bubbleHtml = msg.message
      ? `<div style="display:flex;justify-content:flex-end;margin-bottom:4px">
           <div style="background:#DCF8C6;border-radius:12px 2px 12px 12px;padding:8px 10px;max-width:90%;box-shadow:0 1px 2px rgba(0,0,0,.12)">
             <div style="font-size:12px;color:#303030;line-height:1.6;word-break:break-word">${previewHtml}</div>
             <div style="font-size:10px;color:#667781;text-align:right;margin-top:4px;display:flex;align-items:center;justify-content:flex-end;gap:2px">
               ${timeStr}
               <svg width="14" height="9" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L5.5 10L15 1" stroke="#53BDEB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 10L15 1" stroke="#53BDEB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
             </div>
           </div>
         </div>`
      : `<div style="text-align:center;padding:40px 12px 0;color:#aaa;font-size:12px"><div style="font-size:24px;margin-bottom:6px">💬</div><div>Pré-visualização ao vivo</div></div>`;

    const dayOptions = [
      { v: -7,  l: '7 dias antes' }, { v: -5, l: '5 dias antes' },
      { v: -3,  l: '3 dias antes' }, { v: -2, l: '2 dias antes' },
      { v: -1,  l: '1 dia antes'  }, { v: 0,  l: 'Dia da consulta' },
      { v: 1,   l: '1 dia depois' }, { v: 3,  l: '3 dias depois' },
      { v: 7,   l: '7 dias depois'}, { v: 14, l: '14 dias depois' },
      { v: 30,  l: '30 dias depois'},
    ].map(function (o) {
      return `<option value="${o.v}" ${msg.day === o.v ? 'selected' : ''}>${o.l}</option>`;
    }).join('');

    return `
      <div style="padding-bottom:40px">

        <!-- ── Barra de ações sticky ── -->
        <div style="position:sticky;top:0;z-index:20;background:#F7F8FC;border-bottom:1px solid #E5E7EB;padding:12px 0 12px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <button onclick="window._waMsgBackToList()" title="Voltar ao funil" style="width:36px;height:36px;border:none;border-radius:10px;background:#fff;border:1px solid #E5E7EB;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#374151;flex-shrink:0">
              <i data-feather="arrow-left" style="width:15px;height:15px"></i>
            </button>
            <div style="min-width:0">
              <div style="font-size:15px;font-weight:800;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isNew ? 'Nova Mensagem' : 'Editar Mensagem'}</div>
              <div style="font-size:11px;color:#9CA3AF">${_esc(msg.name) || 'Preencha o formulário abaixo'}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            ${!isNew ? `<button onclick="window._waMsgDeleteCurrent()" style="padding:8px 14px;border:1px solid #FEE2E2;border-radius:9px;background:#fff;color:#DC2626;font-size:12px;font-weight:600;cursor:pointer">Excluir</button>` : ''}
            <button onclick="window._waMsgBackToList()" style="padding:9px 16px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
            <button onclick="window._waMsgSave()" style="display:flex;align-items:center;gap:7px;padding:9px 20px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(124,58,237,.25)">
              <i data-feather="check" style="width:15px;height:15px"></i> Salvar
            </button>
          </div>
        </div>

        <!-- ── Layout 2 colunas ── -->
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start">

          <!-- LEFT: formulário -->
          <div style="display:flex;flex-direction:column;gap:14px;min-width:0">

            <!-- Objetivo + Nome + Quando + Status -->
            <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px">
              <div>
                <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px">Objetivo</label>
                <select id="waMsgType" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;cursor:pointer" onchange="window._waMsgFieldType(this.value)">
                  ${typeOptions}
                </select>
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px">Nome da Mensagem</label>
                <input id="waMsgName" type="text" value="${_esc(msg.name)}" placeholder="Ex: Confirmação de Consulta" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" oninput="window._waMsgFieldName(this.value)">
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px">Quando enviar</label>
                <select id="waMsgDay" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;cursor:pointer" onchange="window._waMsgFieldDay(parseInt(this.value))">
                  ${dayOptions}
                </select>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between">
                <label style="font-size:12px;font-weight:700;color:#374151">Status</label>
                <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="window._waMsgToggleActive()">
                  <div style="width:42px;height:24px;border-radius:12px;background:${msg.active ? '#7C3AED' : '#D1D5DB'};position:relative;transition:background .2s">
                    <div style="width:18px;height:18px;background:#fff;border-radius:50%;position:absolute;top:3px;${msg.active ? 'right:3px' : 'left:3px'};transition:all .2s;box-shadow:0 1px 3px rgba(0,0,0,.25)"></div>
                  </div>
                  <span style="font-size:12px;font-weight:600;color:${msg.active ? '#059669' : '#9CA3AF'}">${msg.active ? 'Ativo' : 'Inativo'}</span>
                </div>
              </div>
            </div>

            <!-- Variáveis -->
            <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:18px">
              <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:3px">Variáveis Dinâmicas</div>
              <div style="font-size:11px;color:#9CA3AF;margin-bottom:10px">Clique para inserir no cursor do texto</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">${varChips}</div>
            </div>

            <!-- Textarea -->
            <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:18px">
              <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:3px">Mensagem</label>
              <div style="font-size:11px;color:#9CA3AF;margin-bottom:8px">Use *texto* para negrito. As variáveis são substituídas na simulação ao vivo.</div>
              <textarea id="waMsgText" rows="10" placeholder="Digite sua mensagem..." style="width:100%;padding:11px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;line-height:1.6;resize:vertical;outline:none;box-sizing:border-box;font-family:inherit" oninput="window._waMsgFieldMessage(this.value)">${_esc(msg.message)}</textarea>
              <div id="waMsgCharCount" style="font-size:11px;color:#9CA3AF;margin-top:4px;text-align:right">${msg.message.length} caracteres</div>
            </div>

            <!-- Dados simulação (colapsável) -->
            <details style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:14px 18px">
              <summary style="font-size:12px;font-weight:700;color:#374151;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between">
                Dados para Simulação
                <span style="font-size:11px;font-weight:400;color:#9CA3AF">expandir ▾</span>
              </summary>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px">
                ${previewVarInputs}
              </div>
            </details>

            <!-- Botões no fim do formulário -->
            <div style="display:flex;justify-content:flex-end;gap:10px;padding-top:4px;padding-bottom:8px">
              <button onclick="window._waMsgBackToList()" style="padding:10px 18px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">← Voltar</button>
              <button onclick="window._waMsgSave()" style="display:flex;align-items:center;gap:7px;padding:10px 24px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(124,58,237,.25)">
                <i data-feather="check" style="width:15px;height:15px"></i> Salvar Mensagem
              </button>
            </div>

          </div>

          <!-- RIGHT: telefone (sem sticky, inline) -->
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:700;color:#374151;text-align:center;margin-bottom:10px">Simulação WhatsApp</div>

            <!-- Phone shell -->
            <div style="width:270px;margin:0 auto;background:#1C1C1E;border-radius:40px;padding:12px;box-shadow:0 16px 48px rgba(0,0,0,.3),inset 0 0 0 1px rgba(255,255,255,.08)">
              <!-- Notch -->
              <div style="background:#000;border-radius:14px;margin:0 auto 8px;width:90px;height:22px;display:flex;align-items:center;justify-content:center;gap:6px">
                <div style="width:6px;height:6px;background:#222;border-radius:50%"></div>
                <div style="width:28px;height:4px;background:#222;border-radius:2px"></div>
              </div>
              <!-- Screen -->
              <div style="background:#fff;border-radius:26px;overflow:hidden;display:flex;flex-direction:column">
                <!-- WA header -->
                <div style="background:#075E54;padding:8px 10px;display:flex;align-items:center;gap:8px">
                  <div style="width:28px;height:28px;border-radius:50%;background:${t.bg};border:2px solid ${t.color};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">${t.icon}</div>
                  <div style="flex:1">
                    <div style="font-size:11px;font-weight:700;color:#fff">ClinicAI</div>
                    <div style="font-size:9px;color:#B2DFDB">online</div>
                  </div>
                </div>
                <!-- Chat -->
                <div id="waMsgBubbleWrap" style="background:#E5DDD5;padding:10px;min-height:280px;max-height:380px;overflow-y:auto">
                  ${bubbleHtml}
                </div>
                <!-- Input -->
                <div style="background:#F0F0F0;padding:6px 8px;display:flex;align-items:center;gap:5px">
                  <div style="flex:1;background:#fff;border-radius:16px;padding:6px 10px;font-size:10px;color:#B0B0B0">Mensagem</div>
                  <div style="width:28px;height:28px;background:#128C7E;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <!-- Badges abaixo do telefone -->
            <div style="text-align:center;margin-top:12px;display:flex;flex-direction:column;gap:5px;align-items:center">
              <span id="waMsgTypeBadge" style="padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:${t.bg};color:${t.color}">${t.icon} ${t.label}</span>
              <span id="waMsgDayBadge" style="font-size:11px;font-weight:600;color:#9CA3AF">${_dayLabel(msg.day)}</span>
            </div>
          </div>

        </div>
      </div>`;
  }

  // ── Live update helpers ───────────────────────────────────────────────────────

  function _updateBubble() {
    const wrap = document.getElementById('waMsgBubbleWrap');
    if (!wrap) return;
    const msg = _state.editMsg.message;
    const timeStr = _timeNow();
    if (msg) {
      wrap.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:4px">
        <div style="background:#DCF8C6;border-radius:12px 2px 12px 12px;padding:8px 10px;max-width:90%;box-shadow:0 1px 2px rgba(0,0,0,.12)">
          <div style="font-size:12px;color:#303030;line-height:1.6;word-break:break-word">${_formatPreview(msg)}</div>
          <div style="font-size:10px;color:#667781;text-align:right;margin-top:4px;display:flex;align-items:center;justify-content:flex-end;gap:2px">
            ${timeStr}
            <svg width="14" height="9" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L5.5 10L15 1" stroke="#53BDEB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 10L15 1" stroke="#53BDEB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        </div>
      </div>`;
    } else {
      wrap.innerHTML = `<div style="text-align:center;padding:60px 12px 0;color:#aaa;font-size:12px"><div style="font-size:28px;margin-bottom:8px">💬</div><div>Pré-visualização ao vivo</div></div>`;
    }
  }

  // ── Field handlers ────────────────────────────────────────────────────────────

  window._waMsgFieldName = function (val) {
    _state.editMsg.name = val;
  };

  window._waMsgFieldType = function (val) {
    _state.editMsg.type = val;
    const t = _typeInfo(val);
    const badge = document.getElementById('waMsgTypeBadge');
    if (badge) { badge.textContent = t.icon + ' ' + t.label; badge.style.background = t.bg; badge.style.color = t.color; }
  };

  window._waMsgFieldDay = function (val) {
    _state.editMsg.day = val;
    const badge = document.getElementById('waMsgDayBadge');
    if (badge) badge.textContent = _dayLabel(val);
  };

  window._waMsgFieldMessage = function (val) {
    _state.editMsg.message = val;
    const cc = document.getElementById('waMsgCharCount');
    if (cc) cc.textContent = val.length + ' caracteres';
    _updateBubble();
  };

  window._waMsgUpdatePreviewVar = function (key, val) {
    _state.previewVars[key] = val;
    _updateBubble();
  };

  window._waMsgToggleActive = function () {
    _state.editMsg.active = !_state.editMsg.active;
    render();
  };

  window._waMsgInsertVar = function (varKey) {
    const ta = document.getElementById('waMsgText');
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + varKey + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + varKey.length;
    ta.focus();
    _state.editMsg.message = ta.value;
    const cc = document.getElementById('waMsgCharCount');
    if (cc) cc.textContent = ta.value.length + ' caracteres';
    _updateBubble();
  };

  // ── Actions ───────────────────────────────────────────────────────────────────

  window._waMsgNew = function () {
    _state.view = 'edit';
    _state.editId = null;
    _state.editMsg = { type: 'confirmacao', name: '', day: 0, message: '', active: true };
    render();
  };

  window._waMsgEdit = function (id) {
    const msgs = _getMessages();
    const msg = msgs.find(function (m) { return m.id === id; });
    if (!msg) return;
    _state.view = 'edit';
    _state.editId = id;
    _state.editMsg = Object.assign({ day: 0 }, msg);
    render();
  };

  window._waMsgBackToList = function () {
    _state.view = 'list';
    _state.editId = null;
    render();
  };

  window._waMsgDeleteCurrent = function () {
    if (!_state.editId) return;
    if (!confirm('Excluir esta mensagem do funil?')) return;
    var deletedId = _state.editId;
    var msgs = _getMessages().filter(function (m) { return m.id !== deletedId; });
    _saveMessages(msgs);
    _deleteFromSupabase(deletedId);
    _state.view = 'list';
    _state.editId = null;
    render();
  };

  window._waMsgSave = function () {
    const msg = _state.editMsg;
    if (!msg.name.trim()) { if (window._showToast) _showToast('Atenção', 'Informe um nome para a mensagem.', 'warn'); return; }
    if (!msg.message.trim()) { if (window._showToast) _showToast('Atenção', 'A mensagem nao pode estar vazia.', 'warn'); return; }
    const msgs = _getMessages();
    if (_state.editId) {
      const idx = msgs.findIndex(function (m) { return m.id === _state.editId; });
      if (idx >= 0) msgs[idx] = Object.assign({}, msg, { id: _state.editId });
    } else {
      msgs.push(Object.assign({}, msg, { id: 'msg_' + Date.now() }));
    }
    _saveMessages(msgs);
    _state.view = 'list';
    _state.editId = null;
    render();
  };

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    _state.view = 'list';

    // Tenta carregar do Supabase na primeira visita da sessão
    if (_msgsCache === null) {
      _loadFromSupabase().then(function(rows) {
        if (rows && rows.length) {
          // Supabase tem dados: usa como fonte de verdade
          _msgsCache = rows;
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch (e) {}
        } else {
          // Supabase vazio ou offline: sobe os templates locais para o Supabase
          var localMsgs = _getMessages();
          _msgsCache = localMsgs;
          if (rows !== null) {
            // rows === [] (Supabase respondeu mas está vazio): sincroniza defaults
            _syncToSupabase(localMsgs);
          }
        }
        render();
      });
      // Renderiza imediatamente com dados locais enquanto carrega
      render();
    } else {
      render();
    }
  }

  window.renderAgendaMensagens = init;

  // ── Namespace agregador congelado (contrato canonico do projeto) ─
  // Os window._waMsg* permanecem para compatibilidade com onclick inline.
  window.AgendaMensagens = Object.freeze({
    render: init
  });

  // Hook navigateTo (app.js já carregado neste ponto)
  (function () {
    const origNav = window.navigateTo;
    if (typeof origNav === 'function') {
      window.navigateTo = function (pageId) {
        origNav(pageId);
        if (pageId === 'agenda-messages') {
          setTimeout(function () { init(); }, 0);
        }
      };
    }
  })();

})();
