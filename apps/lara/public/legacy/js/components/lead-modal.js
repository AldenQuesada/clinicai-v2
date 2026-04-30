/**
 * ClinicAI — LeadModal (extraído de leads.js no Sprint 9)
 *
 * Modal principal do paciente com:
 *   - Linha do tempo de protocolos (padrão + customizados)
 *   - Anamnese
 *   - Orçamentos
 *   - Impressão de ficha
 *   - Histórico de consultas
 *
 * Expõe globalmente:
 *   viewLead(id)
 *   showLeadModal(lead)
 *   showAnamneseModal(lead)
 *   saveAnamnese(leadId)
 *   showBudgetModal(leadId)     — async, carrega do Supabase
 *   saveBudget(leadId)          — async, salva no Supabase
 *   removeBudget(leadId, budgetId) — async, remove do Supabase
 *   updateBudgetBadge(leadId)   — atualiza badge assincronamente
 *   saveCustomProtocol()
 *   removeCustomProtocol(e, index)
 *   printPatient(lead)
 *   toggleHistory(idx)
 */

// ── Estado do modal ───────────────────────────────────────────

var _currentLeadId          = null
var _currentLead            = null
var _currentCustomProtocols = []
var _activeModalTab         = 'geral'

// Cache de orçamentos por leadId: null = precisa recarregar
var _budgetCache = {}

// Mapa de status → label/cores para exibição
var _BUDGET_STATUS = {
  draft:       { label: 'Aberto',      bg: '#FFF7ED', color: '#EA580C' },
  sent:        { label: 'Enviado',     bg: '#EFF6FF', color: '#2563EB' },
  viewed:      { label: 'Visualizado', bg: '#EFF6FF', color: '#2563EB' },
  followup:    { label: 'Follow-up',   bg: '#FEF9C3', color: '#A16207' },
  negotiation: { label: 'Negociando',  bg: '#FEF9C3', color: '#A16207' },
  approved:    { label: 'Aprovado',    bg: '#F0FDF4', color: '#16A34A' },
  lost:        { label: 'Recusado',    bg: '#FEF2F2', color: '#DC2626' },
}

function _budgetStatusInfo(s) {
  return _BUDGET_STATUS[s] || { label: s || 'Aberto', bg: '#F9FAFB', color: '#9CA3AF' }
}

// ── Protocolos padrão ─────────────────────────────────────────

var DEFAULT_PROTOCOLS = [
  {
    id: 'p3m',
    intervalMonths: 3,
    label: 'A cada 3 meses',
    color: '#3B82F6',
    bg: '#EFF6FF',
    dot: '#2563EB',
    procedures: [
      { name: 'Limpeza de Pele',       objetivo: 'Higienização profunda e renovação celular' },
      { name: 'Fotona Véu de Noiva',   objetivo: 'Luminosidade e textura da pele (mesma sessão)' },
    ],
  },
  {
    id: 'p6m',
    intervalMonths: 6,
    label: 'A cada 6 meses',
    color: '#7C3AED',
    bg: '#F5F3FF',
    dot: '#6D28D9',
    procedures: [
      { name: 'Toxina Botulínica', objetivo: 'Relaxamento muscular e prevenção de rugas' },
      { name: 'Fotona',           objetivo: 'Rejuvenescimento e firmeza da pele' },
    ],
  },
  {
    id: 'p1a',
    intervalMonths: 12,
    label: 'A cada 1 ano',
    color: '#C9A96E',
    bg: '#FFFBEB',
    dot: '#B45309',
    procedures: [
      { name: 'Bioestimulador de Colágeno', objetivo: 'Estimulação natural de colágeno' },
      { name: 'Bioremodelador',             objetivo: 'Remodelação e hidratação profunda' },
      { name: 'Fotona 4D',                  objetivo: 'Protocolo completo anti-envelhecimento' },
      { name: 'Smooth Eyes',                objetivo: 'Rejuvenescimento da região periorbital' },
      { name: 'Vector Lift',                objetivo: 'Lifting não cirúrgico com fios PDO' },
    ],
  },
]

function buildTimeline(customProtocols) {
  const all = [
    ...DEFAULT_PROTOCOLS,
    ...(customProtocols || []).map((p, i) => ({
      id: `custom_${i}`,
      intervalMonths: p.intervalMonths,
      label: p.intervalMonths < 12
        ? `A cada ${p.intervalMonths} ${p.intervalMonths === 1 ? 'mês' : 'meses'}`
        : `A cada ${p.intervalMonths / 12} ${p.intervalMonths === 12 ? 'ano' : 'anos'}`,
      color: '#10B981',
      bg: '#F0FDF4',
      dot: '#059669',
      custom: true,
      customIndex: i,
      procedures: [{ name: p.nome, objetivo: p.objetivo, valor: p.valor }],
    }))
  ].sort((a, b) => a.intervalMonths - b.intervalMonths)

  const cards = all.map((p, idx) => `
    <div style="display:flex;flex-direction:column;align-items:center;min-width:200px;flex:1;position:relative;">
      ${idx < all.length - 1 ? `
        <div style="position:absolute;top:14px;left:50%;width:100%;height:2px;background:linear-gradient(90deg,${p.dot},${all[idx+1].dot});z-index:0;"></div>
      ` : ''}
      <div style="width:28px;height:28px;border-radius:50%;background:${p.dot};border:3px solid #fff;box-shadow:0 0 0 2px ${p.dot}44;z-index:1;flex-shrink:0;margin-bottom:12px;display:flex;align-items:center;justify-content:center;">
        <div style="width:8px;height:8px;background:#fff;border-radius:50%"></div>
      </div>
      <div style="background:${p.bg};border:1.5px solid ${p.color}33;border-radius:12px;padding:14px;width:100%;box-sizing:border-box;position:relative;">
        ${p.custom ? `
          <button onclick="removeCustomProtocol(event,${p.customIndex})" style="position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px;line-height:1;padding:2px;" title="Remover">✕</button>
        ` : ''}
        <div style="font-size:11px;font-weight:700;color:${p.color};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">${p.label}</div>
        ${p.procedures.map(proc => `
          <div style="margin-bottom:6px">
            <div style="font-size:12px;font-weight:600;color:#1F2937">${proc.name}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:1px">${proc.objetivo}</div>
            ${proc.valor ? `<div style="font-size:11px;color:${p.color};font-weight:600;margin-top:2px">${formatCurrency(proc.valor)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')

  return `
    <div style="overflow-x:auto;padding-bottom:8px">
      <div style="display:flex;gap:0;min-width:${all.length * 200}px;align-items:flex-start;padding:4px 0 8px">
        ${cards}
      </div>
    </div>`
}

function _getLeadLocal(id) {
  try {
    const leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    return leads.find(l => l.id === id) || null
  } catch { return null }
}

function saveCustomProtocol() {
  const nome  = document.getElementById('cpNome')?.value?.trim()
  const meses = parseInt(document.getElementById('cpMeses')?.value || '3')
  const obj   = document.getElementById('cpObjetivo')?.value?.trim()
  const valor = parseFloat(document.getElementById('cpValor')?.value || '0')

  if (!nome) { _toastWarn('Informe o nome do procedimento'); return }

  _currentCustomProtocols.push({ nome, intervalMonths: meses, objetivo: obj || '', valor: valor || 0 })

  const lead = _getLeadLocal(_currentLeadId) || { id: _currentLeadId, customFields: {} }
  _syncLeadToCache({ ...lead, customFields: { ...lead.customFields, careProtocols: _currentCustomProtocols } })

  document.getElementById('addProtocolForm').style.display = 'none'
  document.getElementById('timelineContainer').innerHTML   = buildTimeline(_currentCustomProtocols)
  feather?.replace({ 'stroke-width': 1.8, width: 16, height: 16 })
}

function removeCustomProtocol(e, index) {
  e.stopPropagation()
  _currentCustomProtocols.splice(index, 1)

  const lead = _getLeadLocal(_currentLeadId) || { id: _currentLeadId, customFields: {} }
  _syncLeadToCache({ ...lead, customFields: { ...lead.customFields, careProtocols: _currentCustomProtocols } })

  document.getElementById('timelineContainer').innerHTML = buildTimeline(_currentCustomProtocols)
}

// ── Imprimir ficha ────────────────────────────────────────────

function printPatient(lead) {
  const w       = window.open('', '_blank', 'width=800,height=900')
  const budgets = lead.customFields?.orcamentos || []
  const anamnese = lead.customFields?.anamnese  || {}
  const appts   = (lead.appointments || []).sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))

  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"/>
    <title>Ficha — ${lead.name}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;padding:32px;color:#111;font-size:13px}
      h1{font-size:20px;margin:0 0 4px}
      .sub{color:#6B7280;font-size:13px;margin-bottom:20px}
      .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
      .card{background:#F9FAFB;border-radius:8px;padding:12px;text-align:center}
      .card .val{font-size:20px;font-weight:700}
      .card .lbl{font-size:11px;color:#6B7280;margin-top:2px}
      .section{margin-bottom:20px}
      .section h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;padding-bottom:6px;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{text-align:left;padding:6px 8px;background:#F9FAFB;font-weight:600;color:#374151}
      td{padding:6px 8px;border-bottom:1px solid #F3F4F6}
      @media print{body{padding:16px}button{display:none}}
    </style>
  </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
      <div>
        <h1>${lead.name}</h1>
        <div class="sub">${lead.phone}${lead.email ? ' · ' + lead.email : ''} · ${lead.source || ''}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#9CA3AF">
        Impresso em ${new Date().toLocaleDateString('pt-BR')}<br/>Clínica Mirian de Paula
      </div>
    </div>
    <div class="grid">
      <div class="card"><div class="val" style="color:#10B981">${formatCurrency(lead.patient?.totalRevenue)}</div><div class="lbl">Total Gasto</div></div>
      <div class="card"><div class="val" style="color:#3B82F6">${appts.length}</div><div class="lbl">Consultas</div></div>
      <div class="card"><div class="val" style="color:#7C3AED">${lead.leadScore || 0}</div><div class="lbl">Lead Score</div></div>
    </div>
    ${Object.keys(anamnese).length ? `
    <div class="section">
      <h2>Ficha de Anamnese</h2>
      <table>${Object.entries(anamnese).map(([k,v]) => `<tr><td style="font-weight:500;width:40%">${k}</td><td>${v}</td></tr>`).join('')}</table>
    </div>` : ''}
    <div class="section">
      <h2>Histórico de Consultas</h2>
      <table>
        <tr><th>Data</th><th>Procedimento</th><th>Status</th><th>Valor</th><th>Observações</th></tr>
        ${appts.map(a => `<tr>
          <td>${formatDate(a.scheduledAt)}</td>
          <td>${a.procedure?.name || 'Consulta'}</td>
          <td>${a.status}</td>
          <td>${a.procedure?.price ? formatCurrency(a.procedure.price) : '—'}</td>
          <td style="color:#6B7280">${a.notes || '—'}</td>
        </tr>`).join('')}
      </table>
    </div>
    ${budgets.length ? `
    <div class="section">
      <h2>Orçamentos</h2>
      <table>
        <tr><th>Procedimento</th><th>Valor</th><th>Status</th><th>Data</th></tr>
        ${budgets.map(b => `<tr>
          <td>${b.procedimento}</td><td>${formatCurrency(b.valor)}</td>
          <td>${b.status}</td><td>${b.data || '—'}</td>
        </tr>`).join('')}
      </table>
    </div>` : ''}
    ${lead.notes ? `<div class="section"><h2>Observações</h2><p style="color:#78350F">${lead.notes}</p></div>` : ''}
    <script>window.onload=()=>window.print()</script>
  </body></html>`)
  w.document.close()
}

// ── Anamnese ──────────────────────────────────────────────────

function showAnamneseModal(lead) {
  document.getElementById('anamneseModal')?.remove()
  const a = lead.customFields?.anamnese || {}

  const fields = [
    { key: 'alergias',      label: 'Alergias' },
    { key: 'medicamentos',  label: 'Medicamentos em uso' },
    { key: 'doencas',       label: 'Doenças preexistentes' },
    { key: 'cirurgias',     label: 'Cirurgias anteriores' },
    { key: 'procedimentos', label: 'Procedimentos estéticos anteriores' },
    { key: 'objetivos',     label: 'Objetivos do tratamento' },
    { key: 'observacoes',   label: 'Observações adicionais' },
  ]

  const m = document.createElement('div')
  m.id = 'anamneseModal'
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px">
      <div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto">
        <div style="padding:24px 24px 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:16px;font-weight:700;color:#111">Ficha de Anamnese</div>
            <div style="font-size:12px;color:#9CA3AF;margin-top:2px">${esc(lead.name)}</div>
          </div>
          <button onclick="document.getElementById('anamneseModal').remove()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:22px">✕</button>
        </div>
        <div style="padding:20px 24px">
          ${fields.map(f => `
            <div style="margin-bottom:14px">
              <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">${f.label}</label>
              <textarea id="ana_${f.key}" rows="2" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;">${a[f.key] || ''}</textarea>
            </div>
          `).join('')}
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
            <button onclick="document.getElementById('anamneseModal').remove()" style="padding:9px 18px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
            <button onclick="saveAnamnese('${lead.id}')" style="padding:9px 18px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Salvar Ficha</button>
          </div>
        </div>
      </div>
    </div>`
  document.body.appendChild(m)
}

function saveAnamnese(leadId) {
  const fields = ['alergias','medicamentos','doencas','cirurgias','procedimentos','objetivos','observacoes']
  const anamnese = {}
  fields.forEach(k => {
    const v = document.getElementById(`ana_${k}`)?.value?.trim()
    if (v) anamnese[k] = v
  })
  const lead = _getLeadLocal(leadId) || { id: leadId, customFields: {} }
  _syncLeadToCache({ ...lead, customFields: { ...lead.customFields, anamnese } })
  document.getElementById('anamneseModal')?.remove()
  const badge = document.getElementById('anamneseBadge')
  if (badge) { badge.textContent = '✓ Anamnese preenchida'; badge.style.background = '#F0FDF4'; badge.style.color = '#16A34A' }
}

// ── Orçamentos ────────────────────────────────────────────────

async function showBudgetModal(leadIdOrLead) {
  const leadId = (typeof leadIdOrLead === 'object') ? leadIdOrLead.id : leadIdOrLead
  document.getElementById('budgetModal')?.remove()

  // Renderiza skeleton imediatamente (UX responsiva)
  const m = document.createElement('div')
  m.id = 'budgetModal'
  m.innerHTML = _budgetModalShell(leadId, null, /* loading */ true)
  document.body.appendChild(m)

  // Carrega do Supabase
  let budgets = null
  if (window.BudgetsService) {
    const result = await window.BudgetsService.getBudgets(leadId)
    if (result.ok) {
      budgets = result.data
      _budgetCache[leadId] = budgets
    }
  }

  // Re-renderiza com dados reais
  document.getElementById('budgetModal')?.remove()
  const m2 = document.createElement('div')
  m2.id = 'budgetModal'
  m2.innerHTML = _budgetModalShell(leadId, budgets || [], /* loading */ false)
  document.body.appendChild(m2)
}

function _budgetModalShell(leadId, budgets, loading) {
  return `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px">
      <div style="background:#fff;border-radius:16px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto">
        <div style="padding:24px 24px 0;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:16px;font-weight:700;color:#111">Orçamentos</div>
          <button onclick="document.getElementById('budgetModal').remove()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:22px">✕</button>
        </div>
        <div style="padding:20px 24px">
          <div id="budgetList">
            ${loading
              ? '<div style="text-align:center;padding:30px;color:#9CA3AF;font-size:13px">Carregando...</div>'
              : _budgetListHtml(leadId, budgets)}
          </div>
          ${loading ? '' : _budgetFormHtml(leadId)}
        </div>
      </div>
    </div>`
}

function _budgetListHtml(leadId, budgets) {
  if (!budgets.length) {
    return '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px">Nenhum orçamento cadastrado</div>'
  }
  return budgets.map(function(b) {
    const s   = _budgetStatusInfo(b.status)
    const val = typeof formatCurrency === 'function' ? formatCurrency(b.total || 0) : 'R$ ' + (+(b.total || 0)).toFixed(2)
    const dt  = b.created_at ? new Date(b.created_at).toLocaleDateString('pt-BR') : ''
    const shareBtn = (typeof openShareOrcamentoModal === 'function')
      ? `<button title="Compartilhar com paciente" onclick="openShareOrcamentoModal({budgetId:'${b.id}',leadId:'${leadId}',budget:${JSON.stringify({id:b.id,title:b.title,total:b.total,valid_until:b.valid_until,status:b.status}).replace(/"/g,'&quot;')}})" style="background:none;border:1px solid #D1FAE5;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;color:#0F766E;display:inline-flex;align-items:center;gap:4px;font-weight:600">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Compartilhar
        </button>`
      : ''
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#F9FAFB;border-radius:8px;margin-bottom:8px;gap:10px">
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.title || 'Orçamento'}</div>
          ${dt ? `<div style="font-size:12px;color:#6B7280;margin-top:2px">${dt}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <div style="font-size:14px;font-weight:700;color:#10B981">${val}</div>
          <span style="background:${s.bg};color:${s.color};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${s.label}</span>
          ${shareBtn}
          <button onclick="removeBudget('${leadId}','${b.id}')" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px">✕</button>
        </div>
      </div>`
  }).join('')
}

function _budgetFormHtml(leadId) {
  return `
    <div style="border-top:1px solid #F3F4F6;padding-top:16px;margin-top:8px">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px">NOVO ORÇAMENTO</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px">PROCEDIMENTO</label>
          <input id="bProcedimento" type="text" placeholder="Ex: Full Face 5D" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px">VALOR (R$)</label>
          <input id="bValor" type="number" placeholder="0,00" min="0" step="0.01" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px">STATUS</label>
          <select id="bStatus" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
            <option value="draft">Aberto</option>
            <option value="approved">Aprovado</option>
            <option value="lost">Recusado</option>
            <option value="negotiation">Em Negociação</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px">VALIDADE</label>
          <input id="bValidUntil" type="date" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('budgetModal').remove()" style="padding:8px 16px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Fechar</button>
        <button id="bSaveBtn" onclick="saveBudget('${leadId}')" style="padding:8px 16px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Adicionar</button>
      </div>
    </div>`
}

async function saveBudget(leadId) {
  const proc   = document.getElementById('bProcedimento')?.value?.trim()
  const valor  = parseFloat(document.getElementById('bValor')?.value || '0')
  const status = document.getElementById('bStatus')?.value || 'draft'
  const valid  = document.getElementById('bValidUntil')?.value || null
  if (!proc) { _toastWarn('Informe o procedimento'); return }
  if (isNaN(valor) || valor < 0) { _toastWarn('Valor inválido'); return }

  const btn = document.getElementById('bSaveBtn')
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }

  if (window.BudgetsService) {
    const result = await window.BudgetsService.upsert({
      lead_id:     leadId,
      title:       proc,
      status:      status,
      valid_until: valid,
      items:       [{ description: proc, quantity: 1, unit_price: valor }],
    })
    if (!result.ok) {
      _toastErr('Erro ao salvar: ' + (result.error || 'Tente novamente'))
      if (btn) { btn.disabled = false; btn.textContent = 'Adicionar' }
      return
    }
    _budgetCache[leadId] = null  // invalida cache
  }

  document.getElementById('budgetModal')?.remove()
  showBudgetModal(leadId)
  _refreshBudgetBadge(leadId)
}

async function removeBudget(leadId, budgetId) {
  if (!confirm('Excluir este orçamento?')) return

  if (window.BudgetsService) {
    const result = await window.BudgetsService.delete(budgetId)
    if (!result.ok) {
      _toastErr('Erro ao excluir: ' + (result.error || 'Tente novamente'))
      return
    }
    _budgetCache[leadId] = null  // invalida cache
  }

  document.getElementById('budgetModal')?.remove()
  showBudgetModal(leadId)
  _refreshBudgetBadge(leadId)
}

function updateBudgetBadge(leadIdOrLead) {
  const leadId = (typeof leadIdOrLead === 'object') ? leadIdOrLead.id : leadIdOrLead
  _refreshBudgetBadge(leadId)
}

async function _refreshBudgetBadge(leadId) {
  const badge = document.getElementById('budgetBadge')
  if (!badge) return

  let budgets = _budgetCache[leadId]
  if (!budgets && window.BudgetsService) {
    const result = await window.BudgetsService.getBudgets(leadId)
    if (result.ok) {
      budgets = result.data
      _budgetCache[leadId] = budgets
    }
  }

  if (!Array.isArray(budgets)) return  // Supabase indisponível — mantém estado atual

  const openStatuses  = ['draft', 'sent', 'viewed', 'followup', 'negotiation']
  const open  = budgets.filter(function(b) { return openStatuses.indexOf(b.status) >= 0 })
  const total = open.reduce(function(s, b) { return s + (+(b.total || 0)) }, 0)
  const val   = typeof formatCurrency === 'function' ? formatCurrency(total) : 'R$ ' + total.toFixed(2)

  if (open.length) {
    badge.innerHTML         = '💰 ' + open.length + ' orçamento' + (open.length > 1 ? 's' : '') + ' em aberto · ' + val
    badge.style.background  = '#FFF7ED'
    badge.style.color       = '#EA580C'
    badge.style.borderColor = '#FED7AA'
  } else {
    badge.innerHTML         = '💰 Sem orçamentos em aberto'
    badge.style.background  = '#F9FAFB'
    badge.style.color       = '#9CA3AF'
    badge.style.borderColor = '#E5E7EB'
  }
  // Garante onclick atualizado com leadId puro
  badge.onclick = function () { showBudgetModal(leadId) }
}

// ── Histórico (toggle) ────────────────────────────────────────

function toggleHistory(idx) {
  const el   = document.getElementById(`hist_${idx}`)
  const icon = document.getElementById(`hist_icon_${idx}`)
  if (!el) return
  const open = el.style.display !== 'none'
  el.style.display = open ? 'none' : 'block'
  if (icon) icon.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)'
}

// ── Helpers do modal ─────────────────────────────────────────

function _calcAge(dobStr) {
  if (!dobStr) return null
  var d = new Date(dobStr), today = new Date()
  var age = today.getFullYear() - d.getFullYear()
  var m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
  return isNaN(age) ? null : age
}

function _maskCpf(cpf) {
  if (!cpf) return null
  var digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf
  return '•••.' + digits.substring(3,6) + '.' + digits.substring(6,9) + '-' + digits.substring(9)
}

function _lmField(label, value) {
  return '<div style="margin-bottom:16px">' +
    '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">' + label + '</div>' +
    '<div style="font-size:14px;color:#111827;font-weight:500">' + (value || '<span style="color:#D1D5DB">—</span>') + '</div>' +
  '</div>'
}

function _lmSection(title, content) {
  return '<div style="margin-bottom:26px">' +
    '<div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;padding-bottom:8px;border-bottom:1px solid #F3F4F6;margin-bottom:14px">' + title + '</div>' +
    content +
  '</div>'
}

function _lmGrid(cols, items) {
  return '<div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:0 20px">' + items.join('') + '</div>'
}

function _lmEmptyState(msg) {
  return '<div style="text-align:center;padding:28px 16px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:10px">' + msg + '</div>'
}

function _lmBadge(label, color, bg) {
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:' + bg + ';color:' + color + '">' + label + '</span>'
}

// ── Cabeçalho ─────────────────────────────────────────────────

function _lmHeader(lead) {
  var tempCfg  = { hot:{ label:'Quente', color:'#f87171', bg:'#fef2f2' }, warm:{ label:'Morno', color:'#f59e0b', bg:'#fffbeb' }, cold:{ label:'Frio', color:'#93c5fd', bg:'#eff6ff' } }
  var phaseCfg = { lead:{ label:'Lead', color:'#6366f1', bg:'#eef2ff' }, agendado:{ label:'Agendado', color:'#8b5cf6', bg:'#f5f3ff' }, reagendado:{ label:'Reagendado', color:'#a855f7', bg:'#faf5ff' }, compareceu:{ label:'Compareceu', color:'#06b6d4', bg:'#ecfeff' }, paciente:{ label:'Paciente', color:'#10b981', bg:'#f0fdf4' }, orcamento:{ label:'Orçamento', color:'#f59e0b', bg:'#fffbeb' }, perdido:{ label:'Perdido', color:'#ef4444', bg:'#fef2f2' } }
  var tc = tempCfg[lead.temperature] || tempCfg.cold
  var pc = phaseCfg[lead.phase] || { label: lead.phase || '', color:'#6B7280', bg:'#F9FAFB' }
  var phone  = lead.phone || lead.whatsapp || lead.telefone || ''
  var digits = phone.replace(/\D/g,'')
  var waHref = digits ? 'https://wa.me/' + (window.formatWaPhone ? formatWaPhone(digits) : '55'+digits) : ''

  return '<div style="padding:14px 24px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;background:#fff">' +
    '<div style="display:flex;gap:14px;align-items:center">' +
      '<div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#7C3AED,#C9A96E);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#fff">' + (lead.name||'?').charAt(0).toUpperCase() + '</div>' +
      '<div>' +
        '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">' +
          '<span style="font-size:17px;font-weight:700;color:#111">' + (lead.name||'—') + '</span>' +
          (pc.label ? _lmBadge(pc.label, pc.color, pc.bg) : '') +
          _lmBadge('<span style="width:6px;height:6px;border-radius:50%;background:' + tc.color + ';display:inline-block;margin-right:2px"></span>' + tc.label, tc.color, tc.bg) +
        '</div>' +
        '<div style="font-size:12px;color:#6B7280;margin-top:3px">' +
          (phone || '') + (lead.email ? (phone ? ' · ' : '') + lead.email : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:7px;align-items:center;flex-shrink:0">' +
      '<button onclick="document.getElementById(\'leadModal\').remove();if(typeof navigateTo===\'function\')navigateTo(\'agenda\')" style="display:inline-flex;align-items:center;gap:5px;background:#6366F1;color:#fff;border:none;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Agendar</button>' +
      (waHref ? '<a href="' + waHref + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:5px;background:#22c55e;color:#fff;text-decoration:none;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>WhatsApp</a>' : '') +
      '<button onclick="printPatient(' + JSON.stringify(lead).replace(/"/g,'&quot;') + ')" style="display:inline-flex;align-items:center;gap:5px;background:#F3F4F6;color:#374151;border:none;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Imprimir</button>' +
      '<button onclick="document.getElementById(\'leadModal\').remove();if(window.FaceMapping)FaceMapping.openFromModal(' + JSON.stringify(lead).replace(/"/g,'&quot;') + ')" style="display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,#C8A97E,#A8895E);color:#fff;border:none;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>Analise Facial</button>' +
      '<button onclick="document.getElementById(\'leadModal\').remove();if(typeof loadLeads===\'function\')loadLeads()" style="width:34px;height:34px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;color:#6B7280;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
    '</div>' +
  '</div>'
}

// ── Navegação lateral ─────────────────────────────────────────

function _lmNav(activeTab) {
  var tabs = [
    { id:'geral',      label:'Geral',      icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>' },
    { id:'clinico',    label:'Clínico',    icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' },
    { id:'anamnese',   label:'Anamnese',   icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>' },
    { id:'evolucao',   label:'Evolução',   icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>' },
    { id:'financeiro', label:'Financeiro', icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
    { id:'timeline',   label:'Linha do Tempo', icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    { id:'documentos', label:'Documentos', icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
    { id:'orcamentos', label:'Or\u00e7amentos', icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
    { id:'interacoes', label:'Intera\u00e7\u00f5es', icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' },
    { id:'protocolos', label:'Protocolos', icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  ]
  var items = tabs.map(function(t) {
    var active = t.id === activeTab
    return '<button id="lmNav_' + t.id + '" onclick="_lmSwitchTab(\'' + t.id + '\')" class="modal-sidebar-btn' + (active ? ' active' : '') + '">' +
      t.icon + t.label + '</button>'
  }).join('')
  return '<div class="modal-sidebar">' + items + '</div>'
}

function _lmSwitchTab(tabId) {
  _activeModalTab = tabId
  ;['geral','clinico','anamnese','evolucao','financeiro','timeline','documentos','orcamentos','interacoes','protocolos'].forEach(function(t) {
    var btn = document.getElementById('lmNav_' + t)
    if (!btn) return
    if (t === tabId) btn.classList.add('active')
    else btn.classList.remove('active')
  })
  var content = document.getElementById('lmContent')
  if (content && _currentLead) {
    content.innerHTML = _renderModalTab(tabId, _currentLead)
    content.scrollTop = 0
    if (tabId === 'financeiro') _refreshBudgetBadge(_currentLead.id)
  }
}

// ── Renderização de abas ──────────────────────────────────────

function _renderModalTab(tabId, lead) {
  var W = window.ProntuarioWow
  switch (tabId) {
    case 'geral':
      // Async — renderizar placeholder e atualizar quando pronto
      var geralPromise = _lmTabGeral(lead)
      if (geralPromise && typeof geralPromise.then === 'function') {
        geralPromise.then(function(html) {
          var el = document.getElementById('lmContent')
          if (el) el.innerHTML = html
          // Carregar complaints panel apos render
          if (window.ComplaintsPanel) {
            var cEl = document.getElementById('lmComplaintsCard')
            if (cEl) ComplaintsPanel.loadComplaints(lead.id).then(function(complaints) {
              cEl.innerHTML = ComplaintsPanel.renderCard(lead.id, complaints)
            })
          }
          // WOW #3: Alertas clinicos persistentes no topo do Geral
          if (W) {
            W.renderClinicalAlerts(lead.id).then(function(alertHtml) {
              if (alertHtml && el) el.insertAdjacentHTML('afterbegin', alertHtml)
            })
          }
        })
        return '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:12px">Carregando...</div>'
      }
      return geralPromise
    case 'clinico':    return _lmTabClinico(lead)
    case 'anamnese':   return _lmTabAnamnese(lead)
    case 'evolucao':
      // WOW #5 + #6: SOAP + Prescricao no topo da Evolucao
      var evoBase = _lmTabEvolucao(lead)
      if (W) {
        var soapHtml = W.renderSOAPForm('lmContent', lead.id)
        var rxHtml = W.renderPrescriptionForm('lmContent', lead.id, lead.name || lead.nome || '')
        return soapHtml + rxHtml + evoBase
      }
      return evoBase
    case 'financeiro':
      // WOW #7: Financeiro completo com grafico
      var finBase = _lmTabFinanceiro(lead)
      if (W) {
        ;(async function() {
          var el = document.getElementById('lmContent')
          if (!el) return
          var wowFin = await W.renderFinanceComplete(lead.id)
          // Insere grafico e KPIs WOW antes da tabela existente
          el.innerHTML = wowFin + '<div style="margin-top:20px;padding-top:16px;border-top:1.5px solid #E5E7EB"><div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px">Detalhamento</div>' + finBase + '</div>'
        })()
        return '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:12px">Carregando financeiro...</div>'
      }
      return finBase
    case 'timeline':
      // WOW #1: Timeline unificada enriquecida
      if (W) {
        ;(async function() {
          var el = document.getElementById('lmContent')
          if (!el) return
          var wowTl = await W.renderUnifiedTimeline(lead.id, lead.name || lead.nome || '')
          // Original timeline abaixo da WOW
          var origTl = await _lmTabTimeline(lead)
          el.innerHTML = wowTl + '<div style="margin-top:24px;padding-top:16px;border-top:1.5px solid #E5E7EB"><div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px">Agendamentos Detalhados</div>' + origTl + '</div>'
        })()
        return '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:12px">Carregando timeline...</div>'
      }
      var tlPromise = _lmTabTimeline(lead)
      if (tlPromise && typeof tlPromise.then === 'function') {
        tlPromise.then(function(html) { var el = document.getElementById('lmContent'); if (el) el.innerHTML = html })
        return '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:12px">Carregando linha do tempo...</div>'
      }
      return tlPromise
    case 'documentos':
      // WOW #7: Botao solicitar documento no topo
      var docBase = _lmTabDocumentos(lead)
      if (W) {
        var requestBtn = '<div style="margin-bottom:12px;display:flex;justify-content:flex-end">'
          + '<button onclick="if(window.ProntuarioWow)ProntuarioWow._showRequestDocModalLm(\'' + (lead.id||'').replace(/'/g,"\\'") + '\',\'' + ((lead.name||lead.nome||'').replace(/'/g,"\\'")) + '\')" style="padding:7px 14px;background:var(--accent-gold,#C9A96E);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">'
          + '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
          + ' Solicitar Documento</button></div>'
        return requestBtn + docBase
      }
      return docBase
    case 'orcamentos': return _lmTabOrcamentos(lead)
    case 'interacoes': return _lmTabInteracoes(lead)
    case 'protocolos': return _lmTabProtocolos(lead)
    default:           return ''
  }
}

// ── Tab: Documentos (Consentimentos TCLE) ───────────────────

function _lmTabDocumentos(lead) {
  var container = '<div id="lmDocumentosContent"><div style="text-align:center;padding:24px;color:#9CA3AF;font-size:12px">Carregando documentos...</div></div>'
  setTimeout(function () { _lmLoadDocumentos(lead) }, 50)
  return container
}

async function _lmLoadDocumentos(lead) {
  var el = document.getElementById('lmDocumentosContent')
  if (!el || !window._sbShared) return

  var patientName = (lead.name || lead.nome || '').trim()
  var res = await window._sbShared.from('legal_doc_requests')
    .select('id,patient_name,professional_name,status,created_at,signed_at,public_slug,template_id')
    .or('patient_name.ilike.%' + patientName + '%,patient_id.eq.' + (lead.id || ''))
    .neq('status', 'purged')
    .order('created_at', { ascending: false })
    .limit(50)

  var docs = res.data || []
  var STATUS_MAP = { pending:['Pendente','#F59E0B'], viewed:['Visualizado','#3B82F6'], signed:['Assinado','#10B981'], expired:['Expirado','#6B7280'], revoked:['Revogado','#EF4444'] }

  if (!docs.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#9CA3AF;font-size:13px">Nenhum consentimento registrado.</div>'
      + '<div style="text-align:center;margin-top:12px"><button onclick="if(window._sendManualConsent&&_currentLead){var a={pacienteNome:_currentLead.name||_currentLead.nome,pacienteTelefone:_currentLead.phone||_currentLead.whatsapp};window.LegalDocumentsService&&LegalDocumentsService.sendManualConsent&&LegalDocumentsService.sendManualConsent(null)}" style="padding:8px 18px;background:linear-gradient(135deg,#C9A96E,#D4B978);color:#1a1a2e;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Enviar Consentimento</button></div>'
    return
  }

  var html = '<div style="display:flex;flex-direction:column;gap:8px">'
  docs.forEach(function (d) {
    var s = STATUS_MAP[d.status] || [d.status, '#6B7280']
    var date = d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : ''
    var signedDate = d.signed_at ? new Date(d.signed_at).toLocaleString('pt-BR') : ''

    html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1.5px solid #E5E7EB;border-radius:10px">'
      + '<div style="width:10px;height:10px;border-radius:50%;background:' + s[1] + ';flex-shrink:0"></div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:12px;font-weight:600;color:#111">' + _lmEsc(d.professional_name || '') + '</div>'
      + '<div style="font-size:10px;color:#9CA3AF">' + date + (signedDate ? ' | Assinado: ' + signedDate : '') + '</div>'
      + '</div>'
      + '<span style="font-size:10px;padding:3px 10px;background:' + s[1] + '15;color:' + s[1] + ';border-radius:20px;font-weight:600">' + s[0] + '</span>'
      + '</div>'
  })
  html += '</div>'

  // Contadores
  var signed = docs.filter(function (d) { return d.status === 'signed' }).length
  var pending = docs.filter(function (d) { return d.status === 'pending' || d.status === 'viewed' }).length

  var summary = '<div style="display:flex;gap:12px;margin-bottom:14px">'
    + '<div style="flex:1;padding:10px;background:#F0FDF4;border-radius:8px;text-align:center"><div style="font-size:18px;font-weight:800;color:#10B981">' + signed + '</div><div style="font-size:9px;color:#6B7280;text-transform:uppercase;font-weight:600">Assinados</div></div>'
    + '<div style="flex:1;padding:10px;background:#FFF7ED;border-radius:8px;text-align:center"><div style="font-size:18px;font-weight:800;color:#F59E0B">' + pending + '</div><div style="font-size:9px;color:#6B7280;text-transform:uppercase;font-weight:600">Pendentes</div></div>'
    + '<div style="flex:1;padding:10px;background:#F9FAFB;border-radius:8px;text-align:center"><div style="font-size:18px;font-weight:800;color:#374151">' + docs.length + '</div><div style="font-size:9px;color:#6B7280;text-transform:uppercase;font-weight:600">Total</div></div>'
    + '</div>'

  el.innerHTML = summary + html
}

// ── Tab: Fichas de Anamnese ─────────────────────────────────

function _lmTabFichas(lead) {
  var container = '<div id="lmFichasContent"><div style="text-align:center;padding:24px;color:#9CA3AF;font-size:12px">Carregando fichas...</div></div>'
  setTimeout(function () { _lmLoadFichas(lead) }, 50)
  return container
}

async function _lmLoadFichas(lead) {
  var el = document.getElementById('lmFichasContent')
  if (!el || !window._sbShared) return

  // Buscar respostas de anamnese deste paciente
  var leadId = lead.id || ''
  console.log('[Fichas] Buscando para patient_id:', leadId)
  var res = await window._sbShared.from('anamnesis_responses')
    .select('id,patient_id,template_id,status,progress_percent,created_at,completed_at')
    .eq('patient_id', leadId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(20)

  console.log('[Fichas] Resultado:', res.data?.length || 0, 'fichas', res.error || '')
  var fichas = res.data || []

  if (!fichas.length) {
    // Fallback: checar localStorage
    var localAnamnese = null
    try {
      var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      var l = leads.find(function (x) { return x.id === lead.id })
      if (l && l.anamnese) localAnamnese = l.anamnese
    } catch (e) {}

    if (localAnamnese) {
      el.innerHTML = '<div style="padding:16px;background:#F0FDF4;border:1px solid #10B98130;border-radius:10px">'
        + '<div style="font-size:12px;font-weight:600;color:#10B981;margin-bottom:8px">Anamnese preenchida (local)</div>'
        + '<div style="font-size:12px;color:#374151;line-height:1.6;white-space:pre-wrap">' + _lmEsc(typeof localAnamnese === 'string' ? localAnamnese : JSON.stringify(localAnamnese, null, 2)) + '</div>'
        + '</div>'
      return
    }

    el.innerHTML = '<div style="text-align:center;padding:30px;color:#9CA3AF;font-size:13px">Nenhuma ficha de anamnese preenchida.</div>'
      + _renderSendAnamnesePanel(lead)
    return
  }

  // Carregar respostas de cada ficha
  var html = '<div style="display:flex;flex-direction:column;gap:10px">'
  for (var fi = 0; fi < fichas.length; fi++) {
    var f = fichas[fi]
    var date = f.completed_at ? new Date(f.completed_at).toLocaleString('pt-BR') : (f.created_at ? new Date(f.created_at).toLocaleString('pt-BR') : '')
    var patientName = (lead.name || lead.nome || '').trim()

    // Buscar answers desta ficha
    var answersRes = await window._sbShared.from('anamnesis_answers')
      .select('field_id,field_key,value_json,normalized_text')
      .eq('response_id', f.id)
      .limit(100)
    var answers = (answersRes.data || [])

    // Buscar labels das opcoes para traduzir values internos
    var fieldIds = answers.map(function(a) { return a.field_id }).filter(Boolean)
    var optLabels = {}
    if (fieldIds.length) {
      var optsRes = await window._sbShared.from('anamnesis_field_options')
        .select('field_id,value,label')
        .in('field_id', fieldIds)
      ;(optsRes.data || []).forEach(function(o) {
        optLabels[o.field_id + ':' + o.value] = o.label
      })
    }
    // Buscar labels dos fields
    var fieldLabels = {}
    if (fieldIds.length) {
      var flRes = await window._sbShared.from('anamnesis_fields')
        .select('id,label')
        .in('id', fieldIds)
      ;(flRes.data || []).forEach(function(fl) { fieldLabels[fl.id] = fl.label })
    }

    html += '<div style="padding:14px 16px;background:#fff;border:1.5px solid #E5E7EB;border-radius:10px;cursor:pointer" onclick="this.querySelector(\'.lm-ficha-detail\').style.display=this.querySelector(\'.lm-ficha-detail\').style.display===\'none\'?\'block\':\'none\'">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<div>'
      + '<div style="font-size:13px;font-weight:600;color:#111">' + _lmEsc(patientName) + '</div>'
      + '<div style="font-size:10px;color:#9CA3AF">' + date + ' | ' + answers.length + ' respostas | ' + _lmEsc(f.status) + '</div>'
      + '</div>'
      + '<svg width="14" height="14" fill="none" stroke="#9CA3AF" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</div>'
      + '<div class="lm-ficha-detail" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid #F3F4F6">'

    // Renderizar respostas com labels legiveis
    if (answers.length) {
      answers.forEach(function (a) {
        var rawVal = a.value_json
        var displayVal = ''

        // Traduzir values internos para labels
        if (Array.isArray(rawVal)) {
          displayVal = rawVal.map(function(v) { return optLabels[a.field_id + ':' + v] || v }).join(', ')
        } else if (rawVal === true || rawVal === 'true') {
          displayVal = 'Sim'
        } else if (rawVal === false || rawVal === 'false') {
          displayVal = 'N\u00e3o'
        } else if (typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal)) {
          // Objeto (ex: endereco)
          var parts = []
          Object.keys(rawVal).forEach(function(k) { if (rawVal[k]) parts.push(rawVal[k]) })
          displayVal = parts.join(', ')
        } else if (typeof rawVal === 'string') {
          displayVal = optLabels[a.field_id + ':' + rawVal] || rawVal
        } else if (rawVal !== null && rawVal !== undefined) {
          displayVal = String(rawVal)
        }

        if (!displayVal || displayVal === 'null' || displayVal === '[REDACTED]') return

        // Label do campo
        var gdLabels = {
          '__gd_nome': 'Nome', '__gd_sexo': 'Sexo', '__gd_cpf': 'CPF', '__gd_rg': 'RG',
          '__gd_telefone': 'Telefone', '__gd_email': 'E-mail',
          '__gd_data_nascimento': 'Data de Nascimento', '__gd_dataNascimento': 'Data de Nascimento',
          '__gd_cep': 'CEP', '__gd_rua': 'Rua', '__gd_numero': 'N\u00famero',
          '__gd_complemento': 'Complemento', '__gd_bairro': 'Bairro',
          '__gd_cidade': 'Cidade', '__gd_estado': 'Estado', '__gd_pais': 'Pa\u00eds',
        }
        var fieldLabel = gdLabels[a.field_key] || fieldLabels[a.field_id] || (a.field_key || '').replace(/__gd_/g, '').replace(/_/g, ' ')

        html += '<div style="margin-bottom:10px">'
          + '<div style="font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.03em">' + _lmEsc(fieldLabel) + '</div>'
          + '<div style="font-size:12px;color:#374151;line-height:1.5">' + _lmEsc(displayVal) + '</div>'
          + '</div>'
      })
    }
    html += '</div></div>'
  }
  html += '</div>'

  el.innerHTML = _renderSendAnamnesePanel(lead) + html
}

function _renderSendAnamnesePanel(lead) {
  var leadId = lead.id || ''

  return '<div style="display:flex;gap:6px;margin:12px 0">'
    + '<button onclick="_lmSendAnamnese(\'' + _lmEsc(leadId) + '\',\'whatsapp\')" style="padding:7px 14px;background:#25D366;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>'
    + 'Enviar Anamnese</button>'
    + '<button onclick="_lmSendAnamnese(\'' + _lmEsc(leadId) + '\',\'copy\')" style="padding:7px 14px;background:#F3F4F6;color:#374151;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">'
    + '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'
    + 'Copiar link</button>'
    + '</div>'
}

async function _lmSendAnamnese(leadId, method) {
  var lead = _currentLead
  if (!lead) return

  // Usar o mesmo fluxo que ja funciona: anamnese-core
  // Preparar o mapa de leads para _upsertLeadAsPatient
  if (!window._anmLeadMap) window._anmLeadMap = {}
  if (!window._anmPatientMap) window._anmPatientMap = {}
  window._anmLeadMap[leadId] = lead
  window._anmPatientMap[lead.name || lead.nome || ''] = leadId

  // Setar o template ID
  try {
    var sbUrl = window.ClinicEnv ? ClinicEnv.SUPABASE_URL : 'https://oqboitkpcvuaudouwvkl.supabase.co'
    var sbKey = window.ClinicEnv ? ClinicEnv.SUPABASE_KEY : ''
    var sess = await window._sbShared.auth.getSession()
    var tok = sess?.data?.session?.access_token || sbKey
    var hdrs = { 'apikey': sbKey, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }

    var tmplRes = await fetch(sbUrl + '/rest/v1/anamnesis_templates?is_active=eq.true&limit=1', { headers: hdrs })
    var tmpls = await tmplRes.json()
    if (!tmpls || !tmpls.length) {
      if (window._showToast) _showToast('Anamnese', 'Nenhum modelo ativo', 'warning')
      return
    }

    // Upsert patient com colunas reais da tabela
    var patientId = leadId
    var fullName = (lead.name || lead.nome || 'Paciente').trim()
    var phone = lead.phone || lead.whatsapp || lead.telefone || '0'

    // Buscar tenantId dinamicamente
    var tenantRes = await fetch(sbUrl + '/rest/v1/tenants?select=id&limit=1', { headers: hdrs })
    var tenants = await tenantRes.json()
    var tenantId = (tenants && tenants[0]) ? tenants[0].id : 'kktstp8hrf7x3pef0rvrp930'

    var upsRes = await fetch(sbUrl + '/rest/v1/patients', {
      method: 'POST',
      headers: Object.assign({}, hdrs, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify([{
        id: leadId,
        clinic_id: '00000000-0000-0000-0000-000000000001',
        leadId: leadId,
        tenantId: tenantId,
        name: fullName,
        phone: phone,
        updatedAt: new Date().toISOString(),
      }]),
    })
    if (!upsRes.ok) {
      var upsErr = await upsRes.text()
      console.error('[Anamnese] Patient upsert FAILED:', upsErr)
      if (window._showToast) _showToast('Anamnese', 'Erro ao registrar paciente: ' + upsErr.substring(0, 80), 'error')
      return
    }

    // Criar request via RPC
    var rpcRes = await fetch(sbUrl + '/rest/v1/rpc/create_anamnesis_request', {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        p_clinic_id: '00000000-0000-0000-0000-000000000001',
        p_patient_id: patientId,
        p_template_id: tmpls[0].id,
        p_expires_at: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
      }),
    })
    var rpcData = await rpcRes.json()

    if (rpcData.code || rpcData.message) {
      if (window._showToast) _showToast('Anamnese', rpcData.message || 'Erro', 'error')
      return
    }

    var r = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (!r || !r.public_slug) {
      if (window._showToast) _showToast('Anamnese', 'Erro ao criar solicitacao', 'error')
      return
    }

    var fullLink = location.origin + '/form-render.html?slug=' + r.public_slug + '#token=' + r.raw_token

    // Encurtar via short_links
    var link = fullLink
    try {
      var shortCode = 'an-' + r.public_slug.substring(0, 8)
      var slRes = await fetch(sbUrl + '/rest/v1/short_links', {
        method: 'POST',
        headers: Object.assign({}, hdrs, { 'Prefer': 'resolution=merge-duplicates' }),
        body: JSON.stringify([{ code: shortCode, url: fullLink, title: 'Anamnese ' + fullName.split(' ')[0], clicks: 0, clinic_id: '00000000-0000-0000-0000-000000000001' }]),
      })
      if (slRes.ok) link = location.origin + '/r.html?c=' + shortCode
    } catch (e) { /* fallback link completo */ }

    if (method === 'copy') {
      try { await navigator.clipboard.writeText(link) } catch (e) {}
      if (window._showToast) _showToast('Anamnese', 'Link copiado!', 'success')
    } else {
      if (window._sendAnamneseWhatsApp) {
        _sendAnamneseWhatsApp(leadId, link)
      } else if (window.InboxService && InboxService.sendText) {
        var ph = (lead.phone || lead.whatsapp || lead.telefone || '').replace(/\D/g, '')
        if (!ph.startsWith('55')) ph = '55' + ph
        InboxService.sendText(ph, 'Ola ' + firstName + '! Preencha sua ficha de anamnese:\n\n' + link + '\n\nObrigado!')
      }
      if (window._showToast) _showToast('Anamnese', 'Enviado via WhatsApp!', 'success')
    }

    setTimeout(function () { _lmLoadFichas(_currentLead) }, 1000)
  } catch (e) {
    if (window._showToast) _showToast('Anamnese', 'Erro: ' + (e.message || 'desconhecido'), 'error')
  }
}

window._lmSendAnamnese = _lmSendAnamnese

// ── Modal lateral: Detalhes da Parcela ──────────────────────
function _lmShowParcelaDetail(apptId) {
  var appts = []
  try { appts = JSON.parse(localStorage.getItem((window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments')) || '[]') } catch(e) {}
  var a = appts.find(function(x) { return x.id === apptId })
  if (!a) return

  var nome = a.pacienteNome || a.patient_name || ''
  var initials = nome.trim().split(/\s+/).map(function(w){return w[0]}).join('').slice(0,2).toUpperCase()
  var proc = a.procedimento || a.procedure_name || 'Consulta'
  var valor = a.valor || 0
  var pago = a.valorPago || 0
  // Schema canônico com fallback legacy
  var S = window.ApptSchema
  var pagamentos = S ? S.getPagamentos(a) : (a.pagamentos || [])
  var forma = (S && S.deriveFormaPagamento(pagamentos)) || a.formaPagamento || ''
  var sp = (S && S.deriveStatusPagamento(pagamentos)) || a.statusPagamento || 'pendente'
  var date = (a.data || a.scheduled_date) ? new Date(a.data || a.scheduled_date).toLocaleDateString('pt-BR') : ''
  var finDate = a.finalizadoEm ? new Date(a.finalizadoEm).toLocaleDateString('pt-BR') : date
  var det = a.pagamentoDetalhes || (pagamentos[0] || {})
  var parcelas = (pagamentos[0] && pagamentos[0].parcelas) || det.parcelas || 1
  var valorParcela = (pagamentos[0] && pagamentos[0].valorParcela) || det.valorParcela || valor

  var statusCfg = { pago: { l:'Recebido', bg:'#F0FDF4', c:'#16A34A' }, parcial: { l:'Parcial', bg:'#FFF7ED', c:'#EA580C' }, pendente: { l:'Pendente', bg:'#FEF2F2', c:'#DC2626' } }
  var sCfg = statusCfg[sp] || statusCfg.pendente

  // Remover modal anterior
  var old = document.getElementById('lmParcelaModal')
  if (old) old.remove()

  var modal = document.createElement('div')
  modal.id = 'lmParcelaModal'
  modal.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:10001;display:flex;justify-content:flex-end" onclick="if(event.target===this)this.remove()">'
    + '<div style="width:480px;max-width:90vw;height:100vh;background:#fff;box-shadow:-8px 0 30px rgba(0,0,0,.15);display:flex;flex-direction:column;animation:lmSlideIn .2s ease">'

    // Header
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #E5E7EB">'
    + '<div style="font-size:15px;font-weight:700;color:#111">Detalhes da parcela</div>'
    + '<button onclick="document.getElementById(\'lmParcelaModal\').remove()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px">&times;</button>'
    + '</div>'

    // Body
    + '<div style="flex:1;overflow-y:auto;padding:24px">'

    // Info receita
    + '<div style="font-size:13px;font-weight:700;color:#111;margin-bottom:14px">Informa\u00e7\u00f5es da receita</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;padding:14px;background:#F9FAFB;border-radius:10px;margin-bottom:24px;align-items:center">'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Receita</div><div style="font-size:12px;color:#2563EB;font-weight:500">Atendimento de ' + _lmEsc(nome) + '</div></div>'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Valor total</div><div style="font-size:13px;font-weight:700;color:#111">' + formatCurrency(valor) + '</div></div>'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Data</div><div style="font-size:12px;color:#111">' + date + '</div></div>'
    + '<div style="display:flex;align-items:center;gap:8px"><div style="width:32px;height:32px;border-radius:50%;background:#10B98120;color:#10B981;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">' + initials + '</div><div><div style="font-size:12px;font-weight:600;color:#111">' + _lmEsc(nome) + '</div><div style="font-size:10px;color:#9CA3AF">Cliente</div></div></div>'
    + '</div>'

    // Info detalhada
    + '<div style="font-size:13px;font-weight:700;color:#111;margin-bottom:14px">Informa\u00e7\u00f5es detalhadas do recebimento</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:14px;background:#F9FAFB;border-radius:10px;margin-bottom:16px">'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Parcela</div><div style="font-size:13px;font-weight:600">1/' + parcelas + '</div></div>'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Valor da parcela</div><div style="font-size:13px;font-weight:600">' + formatCurrency(valorParcela) + '</div></div>'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Situa\u00e7\u00e3o</div><span style="display:inline-block;padding:2px 10px;background:' + sCfg.bg + ';color:' + sCfg.c + ';border-radius:4px;font-size:11px;font-weight:600;margin-top:2px">' + sCfg.l + '</span></div>'
    + '</div>'

    // Tabela detalhes
    + '<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:20px">'
    + '<div style="display:grid;grid-template-columns:80px 1fr 80px 80px 80px 80px;padding:8px 10px;background:#F9FAFB;font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;border-bottom:1px solid #E5E7EB">'
    + '<div>M\u00e9todo</div><div>Valor</div><div>Vencimento</div><div>Pagamento</div><div>Receb.</div><div>Situa\u00e7\u00e3o</div></div>'
    + '<div style="display:grid;grid-template-columns:80px 1fr 80px 80px 80px 80px;padding:10px;font-size:11px;align-items:center">'
    + '<div style="color:#374151">' + _lmEsc(forma || '-') + '</div>'
    + '<div style="font-weight:600">' + formatCurrency(valor) + '</div>'
    + '<div>' + date + '</div>'
    + '<div>' + (sp === 'pago' ? finDate : '-') + '</div>'
    + '<div>' + (sp === 'pago' ? finDate : '-') + '</div>'
    + '<div><span style="padding:2px 8px;background:' + sCfg.bg + ';color:' + sCfg.c + ';border-radius:4px;font-size:10px;font-weight:600">' + sCfg.l + '</span></div>'
    + '</div></div>'

    // Resumo financeiro
    + '<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">'
    + '<div style="display:grid;grid-template-columns:1fr 100px 100px 100px;padding:8px 10px;background:#F9FAFB;font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;border-bottom:1px solid #E5E7EB">'
    + '<div></div><div style="text-align:right">Recebido</div><div style="text-align:right">A receber</div><div style="text-align:right">Em aberto</div></div>'

    + _finRow('Valor principal', pago, sp==='parcial'?(valor-pago):0, sp==='pendente'?valor:0)
    + _finRow('Desconto (R$)', 0, 0, 0)
    + _finRow('Juros (R$)', 0, 0, 0)
    + _finRow('Multa (R$)', 0, 0, 0)
    + '</div>'

    + '</div>'

    // Footer
    + '<div style="padding:16px 24px;border-top:1px solid #E5E7EB;display:flex;justify-content:flex-end;gap:10px">'
    + '<button onclick="window.print()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:none;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;font-size:12px;color:#374151;font-weight:600"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir</button>'
    + '<button onclick="document.getElementById(\'lmParcelaModal\').remove();if(window.openFinalizeModal)openFinalizeModal(\'' + apptId + '\')" style="padding:8px 16px;background:#F3F4F6;border:none;border-radius:8px;cursor:pointer;font-size:12px;color:#374151;font-weight:600">Editar</button>'
    + '</div>'

    + '</div></div>'

  document.body.appendChild(modal)
}

function _finRow(label, recebido, aReceber, aberto) {
  return '<div style="display:grid;grid-template-columns:1fr 100px 100px 100px;padding:8px 10px;border-bottom:1px solid #F3F4F6;font-size:11px">'
    + '<div style="color:#374151;font-weight:500">' + label + '</div>'
    + '<div style="text-align:right;color:#374151">' + formatCurrency(recebido) + '</div>'
    + '<div style="text-align:right;color:#374151">' + formatCurrency(aReceber) + '</div>'
    + '<div style="text-align:right;color:#374151">' + formatCurrency(aberto) + '</div></div>'
}

window._lmShowParcelaDetail = _lmShowParcelaDetail

// ── Modal lateral: Detalhes da Comanda ──────────────────────
function _lmShowComandaDetail(apptId) {
  var appts = []
  try { appts = JSON.parse(localStorage.getItem((window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments')) || '[]') } catch(e) {}
  var a = appts.find(function(x) { return x.id === apptId })
  if (!a) return

  var nome = a.pacienteNome || a.patient_name || ''
  var initials = nome.trim().split(/\s+/).map(function(w){return w[0]}).join('').slice(0,2).toUpperCase()
  var prof = a.profissionalNome || a.professional_name || ''
  var profInit = prof.trim().split(/\s+/).map(function(w){return w[0]}).join('').slice(0,2).toUpperCase()
  var valor = a.valor || 0
  var date = (a.data || a.scheduled_date) ? new Date(a.data || a.scheduled_date).toLocaleDateString('pt-BR') : ''
  // Schema canônico: pagamentos[] e procedimentos[] (com fallback legacy)
  var S = window.ApptSchema
  var pagamentos = S ? S.getPagamentos(a) : (a.pagamentos || [])
  var procs = S ? S.getProcs(a) : (a.procedimentos || a.procedimentosRealizados || [])
  var forma = (S && S.deriveFormaPagamento(pagamentos)) || a.formaPagamento || ''
  var det = a.pagamentoDetalhes || (pagamentos[0] || {})
  var parcelas = (pagamentos[0] && pagamentos[0].parcelas) || det.parcelas || 1

  var old = document.getElementById('lmComandaModal')
  if (old) old.remove()

  // Tabela de procedimentos
  var procsHtml = ''
  if (procs.length) {
    procsHtml = '<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:20px">'
      + '<div style="display:grid;grid-template-columns:1fr 70px 90px 90px 90px;padding:8px 10px;background:#F9FAFB;font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;border-bottom:1px solid #E5E7EB">'
      + '<div>Nome</div><div style="text-align:center">Qtd</div><div style="text-align:right">Unit\u00e1rio</div><div style="text-align:right">Desconto</div><div style="text-align:right">Total</div></div>'
    procs.forEach(function(p) {
      var pNome = p.nome || p
      var qtd = p.qtd || 1
      var pValor = p.valor || p.preco || 0
      var pDesc = p.desconto || 0
      var pTotal = (pValor - pDesc) * qtd
      procsHtml += '<div style="display:grid;grid-template-columns:1fr 70px 90px 90px 90px;padding:10px;font-size:11px;border-bottom:1px solid #F3F4F6;align-items:center">'
        + '<div style="color:#374151;font-weight:500">' + _lmEsc(typeof pNome === 'string' ? pNome : '') + '</div>'
        + '<div style="text-align:center">' + qtd + '</div>'
        + '<div style="text-align:right">' + formatCurrency(pValor) + '</div>'
        + '<div style="text-align:right">' + formatCurrency(pDesc) + '</div>'
        + '<div style="text-align:right;font-weight:600">' + formatCurrency(pTotal) + '</div></div>'
    })
    procsHtml += '</div>'
  }

  // Resumo de valor
  var resumoHtml = '<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">'
    + '<div style="display:flex;justify-content:flex-end;padding:10px;background:#F9FAFB;font-size:11px;font-weight:700;color:#374151;border-bottom:1px solid #E5E7EB">Valor total (R$)</div>'
    + '<div style="padding:8px 10px;display:flex;justify-content:space-between;font-size:11px;border-bottom:1px solid #F3F4F6"><span style="color:#374151;font-weight:500">Subtotal (R$)</span><span style="font-weight:600">' + formatCurrency(valor) + '</span></div>'
    + '<div style="padding:8px 10px;display:flex;justify-content:space-between;font-size:11px;border-bottom:1px solid #F3F4F6"><span style="color:#374151;font-weight:500">Descontos (R$)</span><span>' + formatCurrency(0) + '</span></div>'
    + '<div style="padding:8px 10px;display:flex;justify-content:space-between;font-size:11px"><span style="color:#374151;font-weight:500">Desconto geral (R$)</span><span>' + formatCurrency(0) + '</span></div>'
    + '</div>'

  var modal = document.createElement('div')
  modal.id = 'lmComandaModal'
  modal.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:10001;display:flex;justify-content:flex-end" onclick="if(event.target===this)this.remove()">'
    + '<div style="width:520px;max-width:90vw;height:100vh;background:#fff;box-shadow:-8px 0 30px rgba(0,0,0,.15);display:flex;flex-direction:column;animation:lmSlideIn .2s ease">'

    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #E5E7EB">'
    + '<div style="font-size:15px;font-weight:700;color:#111">Detalhes da comanda</div>'
    + '<button onclick="document.getElementById(\'lmComandaModal\').remove()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:18px">&times;</button>'
    + '</div>'

    + '<div style="flex:1;overflow-y:auto;padding:24px">'

    // Header info
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:#F9FAFB;border-radius:10px;margin-bottom:20px">'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Valor</div><div style="font-size:16px;font-weight:800;color:#111">' + formatCurrency(valor) + '</div></div>'
    + '<div style="display:flex;align-items:center;gap:8px"><div style="width:32px;height:32px;border-radius:50%;background:#10B98120;color:#10B981;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">' + initials + '</div><div><div style="font-size:12px;font-weight:600">' + _lmEsc(nome) + '</div><div style="font-size:10px;color:#9CA3AF">Paciente</div></div></div>'
    + '<div style="display:flex;align-items:center;gap:8px"><div style="width:32px;height:32px;border-radius:50%;background:#7C3AED20;color:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">' + profInit + '</div><div><div style="font-size:12px;font-weight:600">' + _lmEsc(prof) + '</div><div style="font-size:10px;color:#9CA3AF">Profissional</div></div></div>'
    + '</div>'

    // Dados
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:14px;background:#F9FAFB;border-radius:10px;margin-bottom:20px">'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Data</div><div style="font-size:12px;color:#111">' + date + '</div></div>'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Categoria</div><div style="font-size:12px;color:#111">Receitas de servi\u00e7os</div></div>'
    + '<div><div style="font-size:10px;color:#6B7280;font-weight:600">Parcelamento</div><div style="font-size:12px;color:#111">' + parcelas + 'x</div></div>'
    + '</div>'

    // Procedimentos
    + '<div style="font-size:13px;font-weight:700;color:#111;margin-bottom:12px">Procedimentos/Produtos</div>'
    + (procsHtml || '<div style="padding:16px;text-align:center;color:#9CA3AF;font-size:12px">Nenhum procedimento registrado</div>')

    // Resumo
    + resumoHtml

    + '</div>'

    // Footer
    + '<div style="padding:16px 24px;border-top:1px solid #E5E7EB;display:flex;justify-content:flex-end;gap:10px">'
    + '<button onclick="window.print()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:none;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;font-size:12px;color:#374151;font-weight:600"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir</button>'
    + '<button onclick="document.getElementById(\'lmComandaModal\').remove();if(window.openFinalizeModal)openFinalizeModal(\'' + apptId + '\')" style="padding:8px 16px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Editar</button>'
    + '</div>'

    + '</div></div>'

  document.body.appendChild(modal)
}

window._lmShowComandaDetail = _lmShowComandaDetail

// ── Tab: Linha do Tempo ─────────────────────────────────────

async function _lmTabTimeline(lead) {
  var appts = []
  try { appts = JSON.parse(localStorage.getItem((window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments')) || '[]') } catch (e) {}

  var patientName = (lead.name || lead.nome || '').toLowerCase().trim()
  var patientId = lead.id

  var myAppts = appts.filter(function (a) {
    return (a.pacienteNome || a.patient_name || '').toLowerCase().trim() === patientName
      || a.pacienteId === patientId || a.patient_id === patientId
  })

  // Icones SVG reutilizaveis
  var IC = {
    calendar: '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    check:    '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    x:        '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    edit:     '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    dollar:   '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    clock:    '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    user:     '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
    pin:      '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    tag:      '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    shield:   '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    file:     '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  }

  var events = []
  var now = new Date()

  myAppts.forEach(function (a) {
    var date = a.data || a.scheduled_date || ''
    var prof = a.profissionalNome || a.professional_name || ''
    var proc = a.procedimento || a.procedure_name || 'Consulta'
    var sala = ''
    try { var salas = window.getRooms ? getRooms() : []; sala = salas[a.salaIdx]?.nome || '' } catch (e) {}
    var hora = (a.horaInicio || a.start_time || '') + (a.horaFim || a.end_time ? ' - ' + (a.horaFim || a.end_time) : '')
    var valor = a.valor || 0
    var S2 = window.ApptSchema
    var procs = S2 ? S2.getProcs(a) : (a.procedimentos || a.procedimentosRealizados || [])
    var procsStr = procs.length ? procs.map(function(p){return (p.qtd||1)+'x ' + (p.nome||p)}).join(', ') : ''

    // Evento de criacao (expandido como referencia)
    var createdAt = a.created_at || a.createdAt || date
    var detailLines = '<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">'
      + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#6B7280">' + IC.clock + ' <span style="color:#8B5CF6;font-weight:600">Agendado</span></div>'
      + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151">' + IC.calendar + ' ' + _lmEsc(date) + ' &middot; ' + _lmEsc(hora) + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151">' + IC.user + ' ' + _lmEsc(prof) + '</div>'
      + (sala ? '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151">' + IC.pin + ' ' + _lmEsc(sala) + '</div>' : '')
      + (procsStr ? '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151">' + IC.tag + ' ' + _lmEsc(procsStr) + '</div>' : (proc !== 'Consulta' ? '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151">' + IC.tag + ' 1x ' + _lmEsc(proc) + '</div>' : ''))
      + '</div>'

    events.push({ type:'criado', date:createdAt, label:'Agendamento criado', details:detailLines, color:'#3B82F6', icon:IC.calendar, apptId:a.id, raw:true })

    // Historico de status
    var hist = a.historicoStatus || a.historico_status || []
    hist.forEach(function (h) {
      if (h.status === 'finalizado' || h.status === 'em_consulta') {
        events.push({ type:'concluido', date:h.at||h.changed_at||'', label:'Agendamento concluido', details:'', color:'#10B981', icon:IC.check, apptId:a.id })
      } else if (h.status === 'cancelado') {
        events.push({ type:'cancelado', date:h.at||h.changed_at||'', label:'Agendamento cancelado', details:a.motivo_cancelamento ? 'Motivo: ' + _lmEsc(a.motivo_cancelamento) : '', color:'#EF4444', icon:IC.x, apptId:a.id })
      }
    })

    // Historico de alteracoes (antes > depois com cor)
    var changes = a.historicoAlteracoes || a.historico_alteracoes || []
    changes.forEach(function (c) {
      if (c.action_type === 'finalizacao') return
      var changeLines = '<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">'
      if (c.old_value && c.new_value) {
        Object.keys(c.new_value).forEach(function (k) {
          if (c.old_value[k] !== undefined && c.old_value[k] !== c.new_value[k]) {
            changeLines += '<div style="display:flex;align-items:center;gap:6px;font-size:11px">'
              + IC.calendar + ' <span style="color:#9CA3AF;text-decoration:line-through">' + _lmEsc(String(c.old_value[k])) + '</span>'
              + ' <span style="color:#F59E0B">&gt;</span> <span style="color:#10B981;font-weight:600">' + _lmEsc(String(c.new_value[k])) + '</span></div>'
          }
        })
      }
      changeLines += '</div>'
      events.push({ type:'alterado', date:c.changed_at||'', label:'Agendamento alterado', details:changeLines, color:'#F59E0B', icon:IC.edit, apptId:a.id, raw:true })
    })

    // Eventos financeiros
    if (a.status === 'finalizado' && valor > 0) {
      var sp = a.statusPagamento || 'pendente'
      if (sp === 'pago') {
        events.push({ type:'financeiro', date:a.finalizadoEm||a.data||'', label:'Pagamento recebido', details:'<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#16A34A;font-weight:700">' + IC.dollar + ' ' + formatCurrency(valor) + '</div>', color:'#16A34A', icon:IC.dollar, apptId:a.id, raw:true })
      } else if (sp === 'parcial') {
        events.push({ type:'financeiro', date:a.finalizadoEm||a.data||'', label:'Pagamento parcial', details:'<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#EA580C;font-weight:700">' + IC.dollar + ' ' + formatCurrency(a.valorPago||0) + ' de ' + formatCurrency(valor) + '</div>', color:'#EA580C', icon:IC.dollar, apptId:a.id, raw:true })
      } else {
        events.push({ type:'financeiro', date:a.finalizadoEm||a.data||'', label:'Valor em aberto', details:'<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#DC2626;font-weight:700">' + IC.dollar + ' ' + formatCurrency(valor) + '</div>', color:'#DC2626', icon:IC.dollar, apptId:a.id, raw:true })
      }
    }

    // Evento futuro
    if ((a.status === 'agendado' || a.status === 'confirmado') && date) {
      if (new Date(date) > now) {
        events.push({ type:'futuro', date:date, label:'Agendamento futuro', details:detailLines, color:'#8B5CF6', icon:IC.calendar, apptId:a.id, raw:true })
      }
    }
  })

  // Eventos de consentimentos (TCLE)
  if (window._sbShared) {
    try {
      var docsRes = await window._sbShared.from('legal_doc_requests')
        .select('status,created_at,signed_at,professional_name')
        .or('patient_name.ilike.%' + (lead.name||lead.nome||'').trim() + '%,patient_id.eq.' + patientId)
        .neq('status', 'purged').order('created_at', { ascending: false }).limit(20)
      ;(docsRes.data || []).forEach(function(d) {
        if (d.status === 'signed') {
          events.push({ type:'consent', date:d.signed_at||d.created_at, label:'Consentimento assinado', details:'<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#10B981">' + IC.shield + ' Assinado digitalmente &middot; ' + _lmEsc(d.professional_name||'') + '</div>', color:'#10B981', icon:IC.shield, raw:true })
        } else if (d.status === 'pending' || d.status === 'viewed') {
          events.push({ type:'consent', date:d.created_at, label:'Consentimento enviado', details:'<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#F59E0B">' + IC.shield + ' Pendente de assinatura</div>', color:'#F59E0B', icon:IC.shield, raw:true })
        }
      })
    } catch (e) {}

    // Eventos de anamnese
    try {
      var anamRes = await window._sbShared.from('anamnesis_responses')
        .select('status,created_at,completed_at').eq('patient_id', patientId).eq('status', 'completed')
        .order('created_at', { ascending: false }).limit(5)
      ;(anamRes.data || []).forEach(function(r) {
        events.push({ type:'anamnese', date:r.completed_at||r.created_at, label:'Ficha de anamnese preenchida', details:'<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#7C3AED">' + IC.file + ' Formulario digital completo</div>', color:'#7C3AED', icon:IC.file, raw:true })
      })
    } catch (e) {}
  }

  // Ordenar: mais recente primeiro
  events.sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') })

  if (!events.length) {
    return '<div style="text-align:center;padding:40px;color:#9CA3AF;font-size:13px">Nenhum evento registrado para este paciente.</div>'
  }

  // Toggle futuros
  var hasFuture = events.some(function (e) { return e.type === 'futuro' })

  var html = ''
  if (hasFuture) {
    html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer;font-size:12px;color:#6B7280">'
      + '<input type="checkbox" id="lmTimelineFuture" checked onchange="document.querySelectorAll(\'[data-tl-future]\').forEach(function(el){el.style.display=this.checked?\'flex\':\'none\'}.bind(this))" style="accent-color:#8B5CF6">'
      + ' Mostrar eventos futuros</label>'
  }

  html += '<div style="position:relative;padding-left:32px">'
  html += '<div style="position:absolute;left:14px;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#E5E7EB,#F3F4F6)"></div>'

  events.forEach(function (ev) {
    var dateStr = ev.date ? new Date(ev.date).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
    var isFuture = ev.type === 'futuro'

    html += '<div style="display:flex;gap:14px;margin-bottom:18px;position:relative"' + (isFuture ? ' data-tl-future' : '') + '>'
      // Dot com icone
      + '<div style="position:absolute;left:-25px;width:22px;height:22px;border-radius:50%;background:' + ev.color + '18;border:2px solid ' + ev.color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;color:' + ev.color + '">'
      + '<div style="width:10px;height:10px;display:flex;align-items:center;justify-content:center">' + ev.icon + '</div></div>'
      // Content
      + '<div style="flex:1;min-width:0">'
      // Label + data na mesma linha (como referencia)
      + '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">'
      + '<span style="font-size:13px;font-weight:700;color:#111">' + ev.label + '</span>'
      + '<span style="font-size:11px;color:#9CA3AF">' + dateStr + '</span>'
      + '</div>'
      // Details
      + (ev.details ? '<div style="margin-top:4px;font-size:12px;color:#374151;line-height:1.6">' + (ev.raw ? ev.details : _lmEsc(ev.details)) + '</div>' : '')
      + '</div></div>'
  })

  html += '</div>'
  return html
}

function _lmEsc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

// ── Tab: Interacoes ──────────────────────────────────────────

function _lmTabInteracoes(lead) {
  var loading = '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:13px">Carregando interacoes...</div>'
  // Carrega async e substitui
  setTimeout(function() { _lmLoadInteracoes(lead.id) }, 50)
  return '<div id="lmInteracoesContent">' + loading + '</div>'
}

async function _lmLoadInteracoes(leadId) {
  var wrap = document.getElementById('lmInteracoesContent')
  if (!wrap) return

  if (!window.SdrService) {
    wrap.innerHTML = '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:13px">SdrService nao disponivel</div>'
    return
  }

  var result = await SdrService.getInteractions(leadId, 50)
  if (!result || !result.ok || !result.data || !result.data.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:13px">Nenhuma interacao registrada</div>'
    return
  }

  var TYPE_CFG = {
    note:     { label: 'Nota',     color: '#8B5CF6', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
    call:     { label: 'Ligacao',  color: '#10B981', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>' },
    whatsapp: { label: 'WhatsApp', color: '#25D366', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>' },
    email:    { label: 'Email',    color: '#3B82F6', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>' },
    meeting:  { label: 'Reuniao',  color: '#F59E0B', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
    system:   { label: 'Sistema',  color: '#6B7280', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' },
  }

  var esc = window.escHtml || function(s) { return String(s||'') }
  var items = result.data.map(function(i) {
    var cfg = TYPE_CFG[i.type] || TYPE_CFG.system
    var dir = i.direction === 'inbound' ? 'Recebido' : i.direction === 'outbound' ? 'Enviado' : ''
    var date = i.created_at ? new Date(i.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(i.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : ''

    return '<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #F3F4F6">' +
      '<div style="width:28px;height:28px;border-radius:8px;background:' + cfg.color + '15;color:' + cfg.color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' + cfg.icon + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">' +
          '<span style="font-size:12px;font-weight:600;color:#111">' + esc(cfg.label) + '</span>' +
          (dir ? '<span style="font-size:10px;color:#9CA3AF;background:#F3F4F6;padding:1px 6px;border-radius:4px">' + dir + '</span>' : '') +
          (i.outcome ? '<span style="font-size:10px;font-weight:600;color:' + cfg.color + ';background:' + cfg.color + '15;padding:1px 6px;border-radius:4px">' + esc(i.outcome) + '</span>' : '') +
        '</div>' +
        (i.content ? '<div style="font-size:12px;color:#374151;line-height:1.5">' + esc(i.content) + '</div>' : '') +
        '<div style="font-size:10px;color:#9CA3AF;margin-top:2px">' + date + '</div>' +
      '</div>' +
    '</div>'
  }).join('')

  wrap.innerHTML = items
}

// ── Botoes de transicao manual de fase ────────────────────────

function _lmPhaseActions(lead) {
  var phase = lead.phase || 'lead'
  var id    = lead.id

  var transitions = []
  // Compareceu: profissional decide se vira Paciente ou Orcamento
  if (phase === 'compareceu') {
    transitions.push({ to: 'paciente',  label: 'Marcar Paciente',  color: '#10b981', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' })
    transitions.push({ to: 'orcamento', label: 'Gerar Orcamento',  color: '#f59e0b', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' })
  }
  // Orcamento: pode fechar e virar paciente
  if (phase === 'orcamento') {
    transitions.push({ to: 'paciente', label: 'Fechou! Marcar Paciente', color: '#10b981', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' })
  }
  // Paciente: pode adicionar orcamento
  if (phase === 'paciente') {
    transitions.push({ to: 'pac_orcamento', label: 'Adicionar Orcamento', color: '#7c3aed', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' })
  }
  // Paciente + Orcamento: pode voltar a so paciente (fechou orcamento)
  if (phase === 'pac_orcamento') {
    transitions.push({ to: 'paciente', label: 'Orcamento Fechado', color: '#10b981', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' })
    transitions.push({ to: 'orcamento', label: 'Remover como Paciente', color: '#f59e0b', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' })
  }
  // Perdido: disponivel em qualquer fase exceto se ja perdido ou paciente
  if (phase !== 'perdido' && phase !== 'paciente') {
    transitions.push({ to: 'perdido', label: 'Marcar Perdido', color: '#ef4444', icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' })
  }

  if (!transitions.length) return ''

  var btns = transitions.map(function(t) {
    var onclick = t.to === 'perdido'
      ? '_lmShowLostForm(\'' + id + '\')'
      : '_lmChangePhase(\'' + id + '\',\'' + t.to + '\')'
    return '<button onclick="' + onclick + '" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;border:1.5px solid ' + t.color + ';background:#fff;color:' + t.color + ';font-size:12px;font-weight:600;cursor:pointer;transition:all .15s" onmouseover="this.style.background=\'' + t.color + '\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'#fff\';this.style.color=\'' + t.color + '\'">' + t.icon + t.label + '</button>'
  }).join('')

  return '<div id="lmPhaseActions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid #F3F4F6">' +
    '<span style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;width:100%;margin-bottom:4px">Transicao de Fase</span>' +
    btns +
    '<div id="lmLostForm" style="display:none;width:100%;margin-top:8px"></div>' +
  '</div>'
}

function _lmShowLostForm(leadId) {
  var form = document.getElementById('lmLostForm')
  if (!form) return
  form.style.display = 'block'
  form.innerHTML =
    '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px">' +
      '<label style="font-size:12px;font-weight:600;color:#991B1B;display:block;margin-bottom:6px">Motivo (obrigatorio)</label>' +
      '<select id="lmLostReason" onchange="var o=document.getElementById(\'lmLostReasonOther\');if(o)o.style.display=this.value===\'outro\'?\'block\':\'none\'" style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;background:#fff">' +
        '<option value="">Selecione...</option>' +
        '<option value="Muito caro">Muito caro</option>' +
        '<option value="Nao respondeu">Nao respondeu</option>' +
        '<option value="Escolheu concorrente">Escolheu concorrente</option>' +
        '<option value="Desistiu">Desistiu</option>' +
        '<option value="outro">Outro</option>' +
      '</select>' +
      '<input id="lmLostReasonOther" type="text" placeholder="Descreva o motivo..." style="display:none;width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;margin-top:6px" />' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button onclick="_lmConfirmLost(\'' + leadId + '\')" style="padding:7px 16px;border-radius:6px;border:none;background:#EF4444;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Confirmar Perdido</button>' +
        '<button onclick="document.getElementById(\'lmLostForm\').style.display=\'none\'" style="padding:7px 16px;border-radius:6px;border:1px solid #D1D5DB;background:#fff;color:#6B7280;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>' +
      '</div>' +
    '</div>'
}

async function _lmConfirmLost(leadId) {
  var select = document.getElementById('lmLostReason')
  var other  = document.getElementById('lmLostReasonOther')
  if (!select) return

  var reason = select.value === 'outro' ? (other ? other.value.trim() : '') : select.value
  if (!reason) {
    select.style.borderColor = '#EF4444'
    return
  }

  await _lmChangePhase(leadId, 'perdido', reason)
}

async function _lmChangePhase(leadId, toPhase, reason) {
  if (!window.SdrService) return

  // Feedback visual
  var actionsEl = document.getElementById('lmPhaseActions')
  if (actionsEl) actionsEl.style.opacity = '0.5'

  try {
    var result = await window.SdrService.changePhase(leadId, toPhase, reason || null)
    if (result && result.ok === false) {
      _toastErr(result.error || 'Erro ao mudar fase')
      if (actionsEl) actionsEl.style.opacity = '1'
      return
    }

    // Atualiza lead em memoria e recarrega a aba
    if (_currentLead && _currentLead.id === leadId) {
      _currentLead.phase = toPhase
      if (toPhase === 'perdido') {
        _currentLead.lost_reason = reason
      } else {
        _currentLead.lost_reason = null
      }
      var content = document.getElementById('lmContent')
      if (content) {
        content.innerHTML = _renderModalTab(_activeModalTab || 'geral', _currentLead)
      }
    }

    // Recarrega lista de leads se existir
    if (typeof loadLeads === 'function') loadLeads()
  } catch (e) {
    console.error('[LeadModal] Erro ao mudar fase:', e)
    _toastErr('Erro ao mudar fase. Tente novamente.')
    if (actionsEl) actionsEl.style.opacity = '1'
  }
}

// Expor globalmente para onclick inline
window._lmShowLostForm = _lmShowLostForm
window._lmConfirmLost  = _lmConfirmLost
window._lmChangePhase  = _lmChangePhase

async function _lmChangeFunnel(selectEl) {
  var leadId      = selectEl.dataset.leadId
  var newFunnel   = selectEl.value
  var prevFunnel  = selectEl.dataset.current
  var label       = newFunnel === 'fullface' ? 'Full Face Premium' : 'Procedimentos'
  if (newFunnel === prevFunnel) return
  if (!confirm('Mover lead para o funil "' + label + '"?')) {
    selectEl.value = prevFunnel
    return
  }
  selectEl.disabled = true
  try {
    if (!window._sbShared) throw new Error('Supabase indisponivel')
    var r = await window._sbShared.from('leads').update({ funnel: newFunnel, updated_at: new Date().toISOString() }).eq('id', leadId)
    if (r.error) throw new Error(r.error.message)
    selectEl.dataset.current = newFunnel
    if (window.Toast && window.Toast.show) window.Toast.show('Lead movido para ' + label, 'success')
    else alert('Lead movido para ' + label)
    // Recarregar kanban de captação se aberto
    if (window.CaptacaoKanbans) {
      try { window.CaptacaoKanbans.initFullFace() } catch (e) {}
      try { window.CaptacaoKanbans.initProtocolos() } catch (e) {}
    }
  } catch (e) {
    console.error('[lead-modal] changeFunnel:', e)
    selectEl.value = prevFunnel
    alert('Erro ao mudar funil: ' + (e.message || e))
  } finally {
    selectEl.disabled = false
  }
}
window._lmChangeFunnel = _lmChangeFunnel

// ── Aba: Geral ────────────────────────────────────────────────

async function _lmTabGeral(lead) {
  var cf   = lead.customFields || {}
  var ld   = lead.data || {}
  // Dados na raiz do lead > customFields > data JSON
  var addr = cf.endereco || {}
  if (typeof lead.endereco === 'string' && lead.endereco) {
    // Parse endereco string: "Rua X, 123, Bairro, Cidade/UF, CEP"
    var parts = lead.endereco.split(',').map(function(s){return s.trim()})
    addr = { rua: parts[0]||'', numero: parts[1]||'', bairro: parts[2]||'', cidade: (parts[3]||'').split('/')[0]?.trim(), estado: (parts[3]||'').split('/')[1]?.trim(), cep: parts[4]||'' }
  }
  var dob  = lead.birth_date || cf.dataNascimento || ld.dataNascimento || ''
  var age  = _calcAge(dob) || (lead.idade ? lead.idade : null)
  // Sexo: raiz > customFields > data
  if (!cf.sexo) cf.sexo = lead.sexo || ld.sexo || ''
  // CPF: customFields > data > lead raiz
  if (!cf.cpf) cf.cpf = ld.cpf || lead.cpf || ''
  // Profissao
  if (!cf.profissao) cf.profissao = lead.profissao || ld.profissao || ''
  // Estado civil
  if (!cf.estadoCivil) cf.estadoCivil = lead.estado_civil || ld.estado_civil || ''
  var sexLabels = { feminino:'Feminino', masculino:'Masculino', male:'Masculino', female:'Feminino', other:'Outro', not_informed:'N\u00e3o informado', Feminino:'Feminino', Masculino:'Masculino' }
  var phaseSrc  = { lead:'Lead', agendado:'Agendado', reagendado:'Reagendado', compareceu:'Compareceu', paciente:'Paciente', orcamento:'Orçamento', perdido:'Perdido' }
  var tempSrc   = { hot:'Quente', warm:'Morno', cold:'Frio' }
  var phone = lead.phone || lead.whatsapp || lead.telefone || ''

  var identidade = _lmGrid(3, [
    _lmField('Nome completo', lead.name),
    _lmField('Data de nascimento', dob ? new Date(dob+'T00:00:00').toLocaleDateString('pt-BR') : null),
    _lmField('Idade', age != null ? age + ' anos' : null),
    _lmField('Sexo biológico', sexLabels[cf.sexo] || cf.sexo || null),
    _lmField('CPF', _maskCpf(cf.cpf)),
    _lmField('RG', cf.rg || null),
  ])

  var contato = _lmGrid(2, [
    _lmField('Telefone', phone),
    _lmField('E-mail', lead.email),
    _lmField('Profissão', cf.profissao),
    _lmField('Indicado por', cf.indicadoPor),
    _lmField('Origem / UTM', cf.utmCampaign || lead.source || lead.utmSource),
    _lmField('Data de cadastro', lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('pt-BR') : null),
  ])

  var addrStr = [addr.rua, addr.numero, addr.complemento].filter(Boolean).join(', ')
  var cityStr = [addr.bairro, addr.cidade, addr.estado].filter(Boolean).join(' · ')
  var endereco = _lmGrid(3, [
    _lmField('CEP', addr.cep),
    _lmField('Logradouro', addrStr || null),
    _lmField('Cidade / Estado', cityStr || null),
  ])

  var sdrScore = '<div style="display:flex;align-items:baseline;gap:4px"><span style="font-size:20px;font-weight:800;color:#7C3AED">' + (lead.leadScore||0) + '</span><span style="font-size:11px;color:#9CA3AF">pts</span></div>'
  var FUNNEL_LABELS = { fullface: 'Full Face Premium', procedimentos: 'Procedimentos' }
  var currentFunnel = lead.funnel || 'procedimentos'
  var funnelEditor = '<select onchange="window._lmChangeFunnel(this)" data-lead-id="' + lead.id + '" data-current="' + currentFunnel + '" style="width:100%;padding:6px 8px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;font-weight:600;color:#374151;background:#fff;cursor:pointer">'
                   +   '<option value="procedimentos"' + (currentFunnel==='procedimentos'?' selected':'') + '>Procedimentos</option>'
                   +   '<option value="fullface"'      + (currentFunnel==='fullface'     ?' selected':'') + '>Full Face Premium</option>'
                   + '</select>'
  var sdr = _lmGrid(3, [
    _lmField('Fase', phaseSrc[lead.phase] || lead.phase || null),
    _lmField('Temperatura', tempSrc[lead.temperature] || lead.temperature || null),
    _lmField('Lead Score', sdrScore),
    _lmField('Funil', funnelEditor),
    _lmField('Procedimento de interesse', cf.procedimentoInteresse),
    _lmField('Valor estimado', cf.valorEstimado ? 'R$ ' + (+cf.valorEstimado).toLocaleString('pt-BR',{minimumFractionDigits:2}) : null),
    _lmField('Última interação', lead.lastInteractionAt ? new Date(lead.lastInteractionAt).toLocaleDateString('pt-BR') : null),
  ])

  // Botoes de transicao manual de fase
  var phaseActions = _lmPhaseActions(lead)

  // ── Enriquecer CPF do banco se nao encontrou localmente ─────
  if (!cf.cpf && window._sbShared) {
    try {
      var leadDb = await window._sbShared.from('leads').select('data').eq('id', lead.id).single()
      if (leadDb.data && leadDb.data.data && leadDb.data.data.cpf) cf.cpf = leadDb.data.data.cpf
    } catch (e) {}
  }

  // ── Enriquecer com dados da anamnese (se existir) ──────────
  var anamData = {}
  if (window._sbShared) {
    try {
      var respRes = await window._sbShared.from('anamnesis_responses')
        .select('id').eq('patient_id', lead.id).eq('status', 'completed')
        .order('created_at', { ascending: false }).limit(1)
      if (respRes.data && respRes.data.length) {
        var ansRes = await window._sbShared.from('anamnesis_answers')
          .select('field_id,field_key,value_json')
          .eq('response_id', respRes.data[0].id)
        ;(ansRes.data || []).forEach(function(a) { anamData[a.field_key] = a })

        // Traduzir opcoes para labels
        var fids = (ansRes.data || []).map(function(a) { return a.field_id }).filter(Boolean)
        if (fids.length) {
          var optsRes = await window._sbShared.from('anamnesis_field_options')
            .select('field_id,value,label').in('field_id', fids)
          var optMap = {}
          ;(optsRes.data || []).forEach(function(o) { optMap[o.field_id + ':' + o.value] = o.label })
          // Enriquecer anamData com labels
          Object.keys(anamData).forEach(function(k) {
            var a = anamData[k]
            if (Array.isArray(a.value_json)) {
              a._labels = a.value_json.map(function(v) { return optMap[a.field_id + ':' + v] || v })
            } else if (typeof a.value_json === 'string') {
              a._label = optMap[a.field_id + ':' + a.value_json] || a.value_json
            }
          })
        }

        // Dados gerais nao sao salvos em anamnesis_answers (__gd_* tem field_id null)
        // Buscar do patient no banco
        try {
          var ptRes = await window._sbShared.from('patients')
            .select('sex,birth_date,address_json,rg,phone,email')
            .eq('id', lead.id).single()
          if (ptRes.data) {
            if (!cf.sexo && ptRes.data.sex) cf.sexo = ptRes.data.sex
            if (!dob && ptRes.data.birth_date) dob = ptRes.data.birth_date
            if (!cf.rg && ptRes.data.rg) cf.rg = ptRes.data.rg
            if (ptRes.data.address_json && !addr.rua) {
              var pa = ptRes.data.address_json
              addr = typeof pa === 'string' ? JSON.parse(pa) : pa
            }
          }
        } catch (e) {}
      }
    } catch (e) { console.warn('[Geral] Anamnese enrich error:', e.message) }
  }

  // Recalcular idade apos enriquecimento
  if (dob) age = _calcAge(dob) || age

  // ── Coluna direita: dados estrategicos ──────────────────────
  // Queixas: primeiro da anamnese, fallback do lead, fallback do data aninhado do import
  var _nd   = (lead.data && lead.data.data) || cf.data || {}
  var qfRaw = lead.queixas_faciais || cf.queixas_faciais || (lead.data || {}).queixas_faciais || _nd.queixas_faciais || []
  var qfArr = Array.isArray(qfRaw) ? qfRaw : []
  // Se nao achou array, tenta string livre (queixas em texto do import)
  if (!qfArr.length) {
    var qStr = cf.queixaPrincipal || cf.queixa || cf.queixas || _nd.queixa || _nd.queixas || lead.queixas || ''
    if (qStr && typeof qStr === 'string') qfArr = qStr.split(/[,;]/).map(function(s){return s.trim()}).filter(Boolean)
  }

  // Enriquecer queixas com dados da anamnese
  var anamQueixas = anamData['assinale_as_opcoes_que_voce_gostaria_de_melhorar_e']
  if (anamQueixas && anamQueixas._labels && anamQueixas._labels.length) {
    qfArr = anamQueixas._labels
  }
  var queixaHtml = qfArr.length
    ? '<div style="display:flex;flex-wrap:wrap;gap:4px">' + qfArr.map(function(q) { return '<span style="padding:3px 9px;background:#EEF2FF;color:#4338CA;border-radius:6px;font-size:11px;font-weight:600">' + (q||'').replace(/</g,'&lt;') + '</span>' }).join('') + '</div>'
    : (cf.queixaPrincipal ? '<div style="font-size:12px;color:#78350F">' + cf.queixaPrincipal.replace(/</g,'&lt;') + '</div>' : '<span style="font-size:11px;color:#9CA3AF">Nenhuma informada</span>')

  var interesse = cf.procedimentoInteresse || ''
  var valorEst = cf.valorEstimado ? 'R$ ' + (+cf.valorEstimado).toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''

  // Financeiro: buscar de appointments
  var appts = []
  try { appts = JSON.parse(localStorage.getItem((window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments')) || '[]') } catch(e) {}
  var myAppts = appts.filter(function(a) { return (a.pacienteNome||a.patient_name||'').toLowerCase() === (lead.name||lead.nome||'').toLowerCase() || a.pacienteId === lead.id })
  var totalRevenue = 0; var totalProcs = 0; var orcAbertos = 0
  myAppts.forEach(function(a) {
    if (a.status === 'finalizado') { totalRevenue += (a.valor || 0); totalProcs++ }
  })

  var ana = cf.anamnese || {}
  var alergias = ana.alergias || ''
  // Enriquecer alergias da anamnese digital
  var anamAlergias = anamData['possui_alergia']
  if (anamAlergias && anamAlergias._labels && anamAlergias._labels.length) {
    var filtered = anamAlergias._labels.filter(function(l) { return l && l !== 'NENHUMA' && l !== 'Nenhuma' })
    if (filtered.length) alergias = filtered.join(', ')
  }

  // Cards estrategicos
  function _stratCard(color, title, content) {
    return '<div style="padding:10px 12px;background:' + color + '08;border:1px solid ' + color + '20;border-radius:10px;margin-bottom:8px">'
      + '<div style="font-size:9px;font-weight:700;color:' + color + ';text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">' + title + '</div>'
      + content + '</div>'
  }

  var estrategico =
    (window.ComplaintsPanel ? '<div id="lmComplaintsCard"></div>' : _stratCard('#7C3AED', 'Queixas Faciais', queixaHtml)) +
    _stratCard('#10B981', 'Interesse',
      (interesse ? '<div style="font-size:12px;font-weight:600;color:#111">' + interesse.replace(/</g,'&lt;') + '</div>' : '')
      + (valorEst ? '<div style="font-size:11px;color:#6B7280;margin-top:2px">Valor estimado: ' + valorEst + '</div>' : '')
      + (!interesse && !valorEst ? '<span style="font-size:11px;color:#9CA3AF">Nenhum</span>' : '')
    ) +
    _stratCard('#C9A96E', 'Financeiro',
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">'
      + '<div><div style="font-size:16px;font-weight:800;color:#C9A96E">R$ ' + totalRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0}) + '</div><div style="font-size:9px;color:#9CA3AF">Receita</div></div>'
      + '<div><div style="font-size:16px;font-weight:800;color:#374151">' + totalProcs + '</div><div style="font-size:9px;color:#9CA3AF">Procedimentos</div></div>'
      + '<div><div style="font-size:16px;font-weight:800;color:#3B82F6">' + (lead.leadScore||0) + '</div><div style="font-size:9px;color:#9CA3AF">Score</div></div>'
      + '</div>'
    ) +
    _stratCard('#3B82F6', 'Status',
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<span style="padding:3px 9px;background:#EFF6FF;color:#2563EB;border-radius:6px;font-size:11px;font-weight:600">' + (phaseSrc[lead.phase] || lead.phase || '—') + '</span>'
      + '<span style="padding:3px 9px;background:' + (lead.temperature==='hot'?'#FEF2F2':lead.temperature==='warm'?'#FFF7ED':'#F0F9FF') + ';color:' + (lead.temperature==='hot'?'#DC2626':lead.temperature==='warm'?'#EA580C':'#2563EB') + ';border-radius:6px;font-size:11px;font-weight:600">' + (tempSrc[lead.temperature] || lead.temperature || '—') + '</span>'
      + (lead.lastInteractionAt ? '<span style="font-size:10px;color:#9CA3AF">Ultima: ' + new Date(lead.lastInteractionAt).toLocaleDateString('pt-BR') + '</span>' : '')
      + '</div>'
    ) +
    (alergias ? _stratCard('#EF4444', 'Alergias / Riscos', '<div style="font-size:12px;color:#991B1B;line-height:1.5">' + alergias.replace(/</g,'&lt;') + '</div>') : '')

  // ── Layout 2 colunas ──────────────────────────────────────
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
    + '<div>'
    + _lmSection('Identidade', identidade)
    + _lmSection('Contato', contato)
    + _lmSection('Endere\u00e7o', endereco)
    + '</div>'
    + '<div>' + estrategico + phaseActions + '</div>'
    + '</div>'
}

// ── Aba: Clínico ──────────────────────────────────────────────

function _lmTabClinico(lead) {
  var cf  = lead.customFields || {}
  var ana = cf.anamnese || {}

  // Queixas: prefer quiz-collected queixas_faciais, fall back to data aninhado do import, fall back to manual queixaPrincipal
  var _nd2  = (lead.data && lead.data.data) || (lead.customFields && lead.customFields.data) || {}
  var qfRaw = lead.queixas_faciais || (lead.customFields || {}).queixas_faciais || (lead.data || {}).queixas_faciais || _nd2.queixas_faciais || []
  var qfArr = Array.isArray(qfRaw) ? qfRaw : []
  // Normaliza: pode ser array de string ou array de objetos {label}
  qfArr = qfArr.map(function(x){ return typeof x === 'string' ? x : (x && (x.label || x.nome || x.name)) || '' }).filter(Boolean)
  // Fallback string livre (import)
  if (!qfArr.length) {
    var qStr = cf.queixaPrincipal || cf.queixa || cf.queixas || _nd2.queixa || _nd2.queixas || lead.queixas || ''
    if (qStr && typeof qStr === 'string') qfArr = qStr.split(/[,;]/).map(function(s){return s.trim()}).filter(Boolean)
  }
  var queixaContent = ''
  if (qfArr.length) {
    queixaContent = '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
      qfArr.map(function(q) {
        return '<span style="display:inline-block;padding:4px 10px;background:#EEF2FF;color:#4338CA;border-radius:8px;font-size:13px;font-weight:500">' + String(q).replace(/</g,'&lt;') + '</span>'
      }).join('') + '</div>'
  } else if (cf.queixaPrincipal) {
    queixaContent = '<div style="background:#FFFBEB;border-left:3px solid #F59E0B;padding:12px 14px;border-radius:0 8px 8px 0;font-size:14px;color:#78350F;line-height:1.6">' + cf.queixaPrincipal.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
  }
  var queixa = _lmSection('Queixas Faciais',
    queixaContent || _lmEmptyState('Queixas nao informadas')
  )

  var expectativas = _lmSection('Expectativas',
    cf.expectativas
      ? '<div style="font-size:14px;color:#374151;line-height:1.6">' + cf.expectativas.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
      : _lmEmptyState('Expectativas não informadas')
  )

  var anaFields = [
    { key:'alergias',      label:'Alergias conhecidas' },
    { key:'medicamentos',  label:'Medicamentos em uso' },
    { key:'doencas',       label:'Condições preexistentes' },
    { key:'cirurgias',     label:'Cirurgias anteriores' },
    { key:'procedimentos', label:'Procedimentos estéticos anteriores' },
  ]
  var anaContent = anaFields.map(function(f) { return _lmField(f.label, ana[f.key]) }).join('')
  var historico = _lmSection('Histórico de Saúde',
    anaFields.some(function(f) { return !!ana[f.key] })
      ? anaContent
      : _lmEmptyState('Histórico não preenchido — acesse a aba Anamnese')
  )

  var obs = lead.notes
    ? _lmSection('Observações', '<div style="background:#F9FAFB;border-radius:8px;padding:12px 14px;font-size:13px;color:#374151;line-height:1.6">' + lead.notes.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>')
    : ''

  // WOW: Painel completo de queixas (adicionar + tratar + resolver)
  var complaintsPanel = ''
  if (window.ComplaintsPanel) {
    complaintsPanel = '<div style="margin-bottom:16px">' + window.ComplaintsPanel.renderFullPanel(lead) + '</div>'
  }

  // Procedimentos realizados (historico do Supabase)
  var procsRealizados = '<div id="lmProcsRealizados" style="margin-bottom:16px">'
    + '<div style="font-size:12px;font-weight:700;color:#374151;border-bottom:2px solid #F3F4F6;padding-bottom:6px;margin-bottom:10px">Procedimentos Realizados</div>'
    + '<div style="text-align:center;padding:12px;color:#9CA3AF;font-size:12px">Carregando...</div>'
    + '</div>'

  // Async load procedures from appointments
  setTimeout(async function() {
    var el = document.getElementById('lmProcsRealizados')
    if (!el || !window._sbShared) return

    var res = await window._sbShared.from('appointments')
      .select('id,procedimento,procedure_name,professional_name,scheduled_date,data,status,valor,procedimentos,procedimentosRealizados')
      .or('patient_id.eq.' + (lead.id || '') + ',pacienteId.eq.' + (lead.id || ''))
      .in('status', ['finalizado', 'em_consulta'])
      .order('scheduled_date', { ascending: false })
      .limit(50)

    var appts = res.data || []

    // Fallback por nome
    if (!appts.length && (lead.name || lead.nome)) {
      var res2 = await window._sbShared.from('appointments')
        .select('id,procedimento,procedure_name,professional_name,scheduled_date,data,status,valor,procedimentos,procedimentosRealizados')
        .ilike('patient_name', '%' + (lead.name || lead.nome || '').trim() + '%')
        .in('status', ['finalizado', 'em_consulta'])
        .order('scheduled_date', { ascending: false })
        .limit(50)
      appts = res2.data || []
    }

    if (!appts.length) {
      el.querySelector('div:last-child').innerHTML = '<div style="text-align:center;padding:16px;color:#9CA3AF;font-size:12px">Nenhum procedimento finalizado registrado.</div>'
        + '<div style="font-size:11px;color:#9CA3AF;text-align:center;margin-top:4px">Procedimentos aparecem aqui quando agendamentos sao finalizados.</div>'
      return
    }

    var totalValor = 0
    var html = ''
    appts.forEach(function(a) {
      var proc = a.procedimento || a.procedure_name || 'Consulta'
      var prof = a.profissionalNome || a.professional_name || ''
      var date = (a.data || a.scheduled_date) ? new Date(a.data || a.scheduled_date).toLocaleDateString('pt-BR') : ''
      var valor = Number(a.valor) || 0
      totalValor += valor
      var procs = window.ApptSchema ? window.ApptSchema.getProcs(a) : (a.procedimentos || a.procedimentosRealizados || [])

      html += '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #F3F4F6">'
        + '<div style="width:6px;height:6px;border-radius:50%;background:#06B6D4;margin-top:6px;flex-shrink:0"></div>'
        + '<div style="flex:1">'
        + '<div style="font-size:12px;font-weight:600;color:#111">' + (proc || '').replace(/</g,'&lt;') + '</div>'
        + '<div style="font-size:11px;color:#9CA3AF">' + date + (prof ? ' · ' + (prof || '').replace(/</g,'&lt;') : '') + (valor ? ' · R$ ' + valor.toFixed(2).replace('.',',') : '') + '</div>'
      if (procs && procs.length) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">'
        procs.forEach(function(p) {
          html += '<span style="font-size:10px;padding:2px 6px;background:#06B6D41A;color:#06B6D4;border-radius:4px">' + ((p.nome || p || '').toString()).replace(/</g,'&lt;') + (p.qtd > 1 ? ' x' + p.qtd : '') + '</span>'
        })
        html += '</div>'
      }
      html += '</div></div>'
    })

    // KPI header
    var kpiHtml = '<div style="display:flex;gap:12px;margin-bottom:12px">'
      + '<div style="padding:8px 14px;background:#F0FDFA;border-radius:8px;text-align:center;flex:1"><div style="font-size:16px;font-weight:800;color:#06B6D4">' + appts.length + '</div><div style="font-size:9px;color:#6B7280">Realizados</div></div>'
      + '<div style="padding:8px 14px;background:#F0FDF4;border-radius:8px;text-align:center;flex:1"><div style="font-size:16px;font-weight:800;color:#10B981">R$ ' + totalValor.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.') + '</div><div style="font-size:9px;color:#6B7280">Total</div></div>'
      + '</div>'

    el.innerHTML = '<div style="font-size:12px;font-weight:700;color:#374151;border-bottom:2px solid #F3F4F6;padding-bottom:6px;margin-bottom:10px">Procedimentos Realizados</div>'
      + kpiHtml + html
  }, 100)

  return complaintsPanel + procsRealizados + queixa + expectativas + historico + obs
}

// ── Anamnese digital: helpers ─────────────────────────────────

var _LM_CLINIC_ID = (function() { try { var p = JSON.parse(sessionStorage.getItem('clinicai_profile') || 'null'); if (p && p.clinic_id) return p.clinic_id } catch(e) {} return '00000000-0000-0000-0000-000000000001' })()

async function _lmUpsertPatient(lead) {
  if (!window._sbShared) throw new Error('Supabase não disponível')
  var patientId = String(lead.id || '')
  var isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)
  if (!isUUID) {
    var map = {}
    try { map = JSON.parse(localStorage.getItem('clinicai_lead_patient_map') || '{}') } catch {}
    if (!map[patientId]) {
      map[patientId] = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      })
      try { localStorage.setItem('clinicai_lead_patient_map', JSON.stringify(map)) } catch {}
    }
    patientId = map[patientId]
  }
  var parts     = (lead.name || '').trim().split(' ')
  var firstName = parts[0] || ''
  var lastName  = parts.slice(1).join(' ') || ''
  await window._sbShared.from('patients').upsert({
    id:         patientId,
    clinic_id:  _LM_CLINIC_ID,
    first_name: firstName,
    last_name:  lastName,
    phone:      lead.phone || lead.whatsapp || null,
    email:      lead.email || null,
  }, { onConflict: 'id', ignoreDuplicates: false })
  return patientId
}

async function _lmLoadAnamnTemplates() {
  if (!window._sbShared) return []
  var res = await window._sbShared
    .from('anamnesis_templates')
    .select('id, name')
    .eq('clinic_id', _LM_CLINIC_ID)
    .order('name')
  return (res.data || [])
}

async function _lmOpenLinkPanel(leadId) {
  var panel = document.getElementById('lmAnamLinkPanel')
  if (!panel) return
  panel.innerHTML = '<div style="color:#6B7280;font-size:13px">Carregando templates...</div>'
  panel.style.display = 'block'

  var templates = []
  try { templates = await _lmLoadAnamnTemplates() } catch {}

  if (!templates.length) {
    panel.innerHTML =
      '<div style="font-size:12px;color:#EF4444;background:#FEF2F2;padding:10px 12px;border-radius:8px">' +
      'Nenhum template de anamnese cadastrado. Crie um em <a href="/anamnese.html" target="_blank" style="color:#7C3AED">Anamnese</a>.' +
      '</div>'
    return
  }

  var opts = templates.map(function(t) {
    return '<option value="' + t.id + '">' + t.name.replace(/</g,'&lt;') + '</option>'
  }).join('')

  panel.innerHTML =
    '<div style="background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:12px;padding:16px">' +
      '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px">Enviar Ficha de Anamnese Digital</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">' +
        '<div>' +
          '<label style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:5px">Template</label>' +
          '<select id="lmAnamTplSelect" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">' + opts + '</select>' +
        '</div>' +
        '<div>' +
          '<label style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:5px">Expira em (opcional)</label>' +
          '<input id="lmAnamExpiry" type="datetime-local" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box">' +
        '</div>' +
      '</div>' +
      '<div id="lmAnamError" style="display:none;font-size:12px;color:#EF4444;margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button onclick="document.getElementById(\'lmAnamLinkPanel\').style.display=\'none\'" style="padding:8px 16px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>' +
        '<button id="lmAnamGenBtn" onclick="_lmGenerateAnamneseLink(\'' + leadId + '\')" style="padding:8px 16px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Gerar e Copiar Link</button>' +
      '</div>' +
    '</div>'
}

async function _lmGenerateAnamneseLink(leadId) {
  var btn = document.getElementById('lmAnamGenBtn')
  var err = document.getElementById('lmAnamError')
  var tpl = document.getElementById('lmAnamTplSelect')
  var exp = document.getElementById('lmAnamExpiry')
  if (!btn || !tpl) return

  btn.disabled    = true
  btn.textContent = 'Gerando...'
  if (err) err.style.display = 'none'

  try {
    if (!window._sbShared) throw new Error('Supabase não disponível')
    var lead      = _currentLead
    var patientId = await _lmUpsertPatient(lead)
    var expiresAt = exp && exp.value ? new Date(exp.value).toISOString()
                                     : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    var res = await window._sbShared.rpc('create_anamnesis_request', {
      p_clinic_id:   _LM_CLINIC_ID,
      p_patient_id:  patientId,
      p_template_id: tpl.value,
      p_expires_at:  expiresAt,
    })
    if (res.error) throw new Error(res.error.message || 'Erro ao gerar link')

    var row      = Array.isArray(res.data) ? res.data[0] : res.data
    var fullLink = location.origin + '/form-render.html?slug=' + row.public_slug + '#token=' + row.raw_token

    // Persiste no sessionStorage (token não é recuperável do banco)
    try { sessionStorage.setItem('anm_link_' + row.public_slug, fullLink) } catch {}

    _lmShowGeneratedLink(fullLink)
  } catch (e) {
    if (err) { err.textContent = e.message; err.style.display = 'block' }
    btn.disabled    = false
    btn.textContent = 'Gerar e Copiar Link'
  }
}

function _lmShowGeneratedLink(fullLink) {
  var panel = document.getElementById('lmAnamLinkPanel')
  if (!panel) return

  // Copia automaticamente para a área de transferência
  try { navigator.clipboard.writeText(fullLink) } catch {}

  panel.innerHTML =
    '<div style="background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:12px;padding:16px">' +
      '<div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#16A34A;margin-bottom:10px">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
        'Link gerado e copiado!' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<div id="lmAnamLinkBox" style="flex:1;padding:8px 11px;background:#fff;border:1.5px solid #D1FAE5;border-radius:8px;font-size:12px;color:#374151;word-break:break-all;font-family:monospace">' + fullLink + '</div>' +
        '<button onclick="_lmCopyAnamLink()" style="flex-shrink:0;padding:8px 12px;background:#16A34A;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer" title="Copiar link">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
        '</button>' +
      '</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px">' +
        '<button onclick="_lmOpenLinkPanel(_currentLeadId)" style="font-size:11px;color:#6B7280;background:none;border:none;cursor:pointer;text-decoration:underline">Gerar outro link</button>' +
        '<button onclick="document.getElementById(\'lmAnamLinkPanel\').style.display=\'none\'" style="font-size:11px;color:#6B7280;background:none;border:none;cursor:pointer;text-decoration:underline">Fechar</button>' +
      '</div>' +
    '</div>'
}

function _lmCopyAnamLink() {
  var box = document.getElementById('lmAnamLinkBox')
  if (!box) return
  try {
    navigator.clipboard.writeText(box.textContent)
    box.style.background = '#DCFCE7'
    setTimeout(function() { box.style.background = '#fff' }, 1200)
  } catch {}
}

// ── Aba: Anamnese ─────────────────────────────────────────────

function _lmTabAnamnese(lead) {
  var digitalSection =
    '<div style="margin-bottom:18px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:#374151">Ficha de Anamnese Digital</div>' +
          '<div style="font-size:11px;color:#9CA3AF;margin-top:2px">Gere um link para o paciente preencher no celular.</div>' +
        '</div>' +
        '<button onclick="_lmOpenLinkPanel(\'' + lead.id + '\')" style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>' +
          'Enviar Ficha' +
        '</button>' +
      '</div>' +
      '<div id="lmAnamLinkPanel" style="display:none"></div>' +
    '</div>'

  var fichasSection = '<div>' +
    '<div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;padding-bottom:8px;border-bottom:1px solid #F3F4F6;margin-bottom:14px">Fichas Preenchidas</div>' +
    '<div id="lmFichasContent"><div style="text-align:center;padding:16px;color:#9CA3AF;font-size:12px">Carregando...</div></div>' +
    '</div>'

  setTimeout(function () { _lmLoadFichas(lead) }, 100)

  return digitalSection + fichasSection
}

// ── Aba: Evolução ─────────────────────────────────────────────

function _lmTabEvolucao(lead) {
  var appts = (lead.appointments || []).sort(function(a,b) { return new Date(b.scheduledAt) - new Date(a.scheduledAt) })
  if (!appts.length) return _lmEmptyState('Nenhuma consulta registrada ainda')

  var statusCfg = {
    attended:  { label:'Realizado',  color:'#16A34A', bg:'#F0FDF4' },
    scheduled: { label:'Agendado',   color:'#2563EB', bg:'#EFF6FF' },
    confirmed: { label:'Confirmado', color:'#7C3AED', bg:'#F5F3FF' },
    cancelled: { label:'Cancelado',  color:'#DC2626', bg:'#FEF2F2' },
    no_show:   { label:'Não veio',   color:'#DC2626', bg:'#FEF2F2' },
  }

  var totalRealizados = appts.filter(function(a) { return a.status==='attended' }).length
  var revenue = appts.reduce(function(s,a) { return s + (a.status==='attended' && a.procedure?.price ? +(a.procedure.price) : 0) }, 0)

  var kpis = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px">' +
    '<div style="background:#F0FDF4;border-radius:10px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:800;color:#16A34A">' + totalRealizados + '</div><div style="font-size:11px;color:#15803D;font-weight:600;margin-top:2px">Realizados</div></div>' +
    '<div style="background:#EFF6FF;border-radius:10px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:800;color:#2563EB">' + appts.length + '</div><div style="font-size:11px;color:#1D4ED8;font-weight:600;margin-top:2px">Total</div></div>' +
    '<div style="background:#F5F3FF;border-radius:10px;padding:14px;text-align:center"><div style="font-size:16px;font-weight:800;color:#7C3AED">' + formatCurrency(revenue) + '</div><div style="font-size:11px;color:#6D28D9;font-weight:600;margin-top:2px">Receita</div></div>' +
  '</div>'

  var items = appts.map(function(a, i) {
    var sc = statusCfg[a.status] || { label:a.status, color:'#6B7280', bg:'#F9FAFB' }
    return '<div style="display:flex;gap:14px;margin-bottom:12px">' +
      '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:' + sc.color + ';margin-top:5px;flex-shrink:0"></div>' +
        (i < appts.length-1 ? '<div style="width:1px;flex:1;min-height:20px;background:#F3F4F6;margin:5px 0"></div>' : '') +
      '</div>' +
      '<div style="flex:1;border:1px solid #F3F4F6;border-radius:10px;padding:11px 14px;cursor:pointer;background:#FAFAFA" onclick="toggleHistory(' + i + ')">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:600;color:#111">' + (a.procedure?.name||'Consulta') + '</div>' +
            '<div style="font-size:11px;color:#9CA3AF;margin-top:2px">' + formatDate(a.scheduledAt) + (a.durationMinutes ? ' · ' + a.durationMinutes + 'min' : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            (a.procedure?.price ? '<span style="font-size:13px;font-weight:700;color:#10B981">' + formatCurrency(a.procedure.price) + '</span>' : '') +
            '<span style="background:' + sc.bg + ';color:' + sc.color + ';padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600">' + sc.label + '</span>' +
            '<span id="hist_icon_' + i + '" style="color:#D1D5DB;font-size:10px;transition:transform .2s">▼</span>' +
          '</div>' +
        '</div>' +
        '<div id="hist_' + i + '" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #F3F4F6">' +
          (a.notes ? '<div style="font-size:12px;color:#6B7280"><span style="font-weight:600">Obs:</span> ' + a.notes + '</div>' : '<span style="font-size:12px;color:#D1D5DB">Sem observações</span>') +
        '</div>' +
      '</div>' +
    '</div>'
  }).join('')

  return kpis +
    '<div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">Histórico de Consultas</div>' +
    items
}

// ── Aba: Financeiro ───────────────────────────────────────────

function _lmTabFinanceiro(lead) {
  var cf = lead.customFields || {}
  var patName = (lead.name || lead.nome || '').toLowerCase()

  // Buscar transacoes dos agendamentos finalizados
  var appts = []
  try { appts = JSON.parse(localStorage.getItem((window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments')) || '[]') } catch(e) {}
  var myAppts = appts.filter(function(a) {
    return (a.status === 'finalizado')
      && ((a.pacienteNome||a.patient_name||'').toLowerCase() === patName || a.pacienteId === lead.id)
  }).sort(function(a,b) { return (b.data||b.scheduled_date||'').localeCompare(a.data||a.scheduled_date||'') })

  // Calcular KPIs
  var realizado = 0, aReceber = 0, emAberto = 0
  myAppts.forEach(function(a) {
    var v = a.valor || 0
    var pago = a.valorPago || 0
    var sp = a.statusPagamento || 'pendente'
    if (sp === 'pago') realizado += v
    else if (sp === 'parcial') { realizado += pago; aReceber += (v - pago) }
    else emAberto += v
  })
  var total = realizado + aReceber + emAberto

  // KPIs cards
  function _kpi(label, value, color, dotColor) {
    return '<div style="text-align:center;padding:12px 8px">'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:4px">'
      + '<div style="width:6px;height:6px;border-radius:50%;background:' + dotColor + '"></div>'
      + '<span style="font-size:9px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.03em">' + label + '</span></div>'
      + '<div style="font-size:16px;font-weight:800;color:' + color + '">' + formatCurrency(value) + '</div></div>'
  }

  var kpis = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#E5E7EB;border-radius:12px;overflow:hidden;margin-bottom:20px">'
    + '<div style="background:#fff">' + _kpi('Realizado', realizado, '#16A34A', '#16A34A') + '</div>'
    + '<div style="background:#fff">' + _kpi('A receber', aReceber, '#2563EB', '#2563EB') + '</div>'
    + '<div style="background:#fff">' + _kpi('Em aberto', emAberto, '#EA580C', '#EA580C') + '</div>'
    + '<div style="background:#fff">' + _kpi('Total', total, '#111', '#6B7280') + '</div>'
    + '</div>'

  // Botao orcamentos
  var orcBtn = '<div style="margin-bottom:16px">' +
    '<button id="budgetBadge" onclick="showBudgetModal(\'' + lead.id + '\')" style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:8px;border:1.5px solid #E5E7EB;background:#F9FAFB;color:#6B7280;font-size:12px;font-weight:600;cursor:pointer">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' +
      'Gerenciar Or\u00e7amentos</button>' +
  '</div>'

  // Tabela de transacoes
  var table = ''
  if (myAppts.length) {
    var statusCfg = {
      pago:     { label: 'Recebido',  bg: '#F0FDF4', color: '#16A34A' },
      parcial:  { label: 'Parcial',   bg: '#FFF7ED', color: '#EA580C' },
      pendente: { label: 'Pendente',  bg: '#FEF2F2', color: '#DC2626' },
    }

    table = '<div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em">' + myAppts.length + ' registros</div>'
    table += '<div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">'
    // Header
    table += '<div style="display:grid;grid-template-columns:80px 1fr 90px 90px 30px;padding:8px 12px;background:#F9FAFB;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #E5E7EB">'
      + '<div>Data</div><div>Procedimento</div><div style="text-align:center">Situa\u00e7\u00e3o</div><div style="text-align:right">Valor</div><div></div></div>'
    // Rows
    myAppts.forEach(function(a) {
      var date = (a.data || a.scheduled_date) ? new Date(a.data || a.scheduled_date).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'}) : ''
      var proc = a.procedimento || a.procedure_name || 'Consulta'
      var sp = a.statusPagamento || 'pendente'
      var cfg = statusCfg[sp] || statusCfg.pendente
      var valor = a.valor || 0

      var apptId = (a.id || '').replace(/'/g, '')
      table += '<div style="display:grid;grid-template-columns:80px 1fr 90px 90px 30px;padding:10px 12px;border-bottom:1px solid #F3F4F6;align-items:center;font-size:12px">'
        + '<div style="color:#6B7280">' + date + '</div>'
        + '<div style="color:#374151;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + proc.replace(/</g,'&lt;') + '</div>'
        + '<div style="text-align:center"><span style="padding:2px 8px;background:' + cfg.bg + ';color:' + cfg.color + ';border-radius:4px;font-size:10px;font-weight:600">' + cfg.label + '</span></div>'
        + '<div style="text-align:right;font-weight:700;color:#111">' + formatCurrency(valor) + '</div>'
        + '<div style="text-align:center;position:relative">'
        + '<button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'block\'?\'none\':\'block\'" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:16px;padding:2px 6px;border-radius:4px" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'">&#8942;</button>'
        + '<div style="display:none;position:absolute;right:0;top:24px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:10;min-width:160px;padding:4px">'
        + '<button onclick="this.parentElement.style.display=\'none\';_lmShowComandaDetail(\'' + apptId + '\')" style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:12px;color:#374151;border-radius:4px" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'">Visualizar lan\u00e7amento</button>'
        + '<button onclick="this.parentElement.style.display=\'none\';if(window.openFinalizeModal)openFinalizeModal(\'' + apptId + '\')" style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:12px;color:#374151;border-radius:4px" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'">Editar pagamento</button>'
        + '<button onclick="this.parentElement.style.display=\'none\';_lmShowParcelaDetail(\'' + apptId + '\')" style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:12px;color:#374151;border-radius:4px" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'">Visualizar parcelas</button>'
        + '</div></div>'
        + '</div>'
    })
    table += '</div>'
  } else {
    table = '<div style="text-align:center;padding:24px;color:#9CA3AF;font-size:13px">Nenhuma transa\u00e7\u00e3o registrada.</div>'
  }

  return kpis + orcBtn + table
}

// ── Aba: Protocolos ───────────────────────────────────────────

function _lmTabProtocolos(lead) {
  return '<div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:700;color:#111">Linha do Tempo de Protocolos</div>' +
        '<div style="font-size:12px;color:#9CA3AF;margin-top:2px">Manutenção recomendada</div>' +
      '</div>' +
      '<button id="addProtocolBtn" onclick="document.getElementById(\'addProtocolForm\').style.display=\'block\';this.style.display=\'none\'" style="background:#7C3AED;color:#fff;border:none;padding:7px 13px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">+ Protocolo</button>' +
    '</div>' +
    '<div id="addProtocolForm" style="display:none;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:12px;padding:16px;margin-bottom:16px">' +
      '<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Novo Protocolo Personalizado</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px">' +
        '<div><label style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:4px">Nome</label><input id="cpNome" type="text" placeholder="Ex: Peeling Químico" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/></div>' +
        '<div><label style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:4px">Frequência</label><select id="cpMeses" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;background:#fff;box-sizing:border-box"><option value="1">1 mês</option><option value="2">2 meses</option><option value="3" selected>3 meses</option><option value="4">4 meses</option><option value="6">6 meses</option><option value="12">1 ano</option><option value="18">18 meses</option><option value="24">2 anos</option></select></div>' +
        '<div><label style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:4px">Objetivo</label><input id="cpObjetivo" type="text" placeholder="Ex: Renovação celular" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/></div>' +
        '<div><label style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:4px">Valor (R$)</label><input id="cpValor" type="number" placeholder="0,00" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button onclick="document.getElementById(\'addProtocolForm\').style.display=\'none\';document.getElementById(\'addProtocolBtn\').style.display=\'block\'" style="padding:8px 16px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>' +
        '<button onclick="saveCustomProtocol()" style="padding:8px 16px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Salvar</button>' +
      '</div>' +
    '</div>' +
    '<div id="timelineContainer">' + buildTimeline(_currentCustomProtocols) + '</div>' +
  '</div>'
}

// ── Aba: Orcamentos ─────────────────────────────────────────

function _lmTabOrcamentos(lead) {
  var loading = '<div id="lmOrcContent"><div style="text-align:center;padding:24px;color:#9CA3AF;font-size:12px">Carregando or\u00e7amentos...</div></div>'
  setTimeout(function () { _lmLoadOrcamentos(lead) }, 50)
  return loading
}

async function _lmLoadOrcamentos(lead) {
  var el = document.getElementById('lmOrcContent')
  if (!el) return

  var budgets = []
  if (window.BudgetsService) {
    var result = await BudgetsService.getBudgets(lead.id)
    if (result.ok) budgets = result.data || []
  }

  // KPIs
  var abertos = 0, aprovados = 0, recusados = 0, totalValor = 0, valorAberto = 0
  budgets.forEach(function (b) {
    var v = b.total || 0
    totalValor += v
    if (b.status === 'approved') aprovados++
    else if (b.status === 'lost') recusados++
    else { abertos++; valorAberto += v }
  })

  function _kpi(label, value, sub, color) {
    return '<div style="text-align:center;padding:12px 8px"><div style="font-size:18px;font-weight:800;color:' + color + '">' + value + '</div><div style="font-size:9px;color:#6B7280;font-weight:600;text-transform:uppercase;margin-top:2px">' + label + '</div>' + (sub ? '<div style="font-size:10px;color:#9CA3AF;margin-top:2px">' + sub + '</div>' : '') + '</div>'
  }

  var kpis = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#E5E7EB;border-radius:12px;overflow:hidden;margin-bottom:16px">'
    + '<div style="background:#fff">' + _kpi('Total', budgets.length, formatCurrency(totalValor), '#374151') + '</div>'
    + '<div style="background:#fff">' + _kpi('Abertos', abertos, formatCurrency(valorAberto), '#EA580C') + '</div>'
    + '<div style="background:#fff">' + _kpi('Aprovados', aprovados, '', '#16A34A') + '</div>'
    + '<div style="background:#fff">' + _kpi('Recusados', recusados, '', '#DC2626') + '</div>'
    + '</div>'

  // Lista de orcamentos
  var lista = ''
  if (budgets.length) {
    lista = '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">'
    budgets.forEach(function (b) {
      var s = _budgetStatusInfo(b.status)
      var val = formatCurrency(b.total || 0)
      var dt = b.created_at ? new Date(b.created_at).toLocaleDateString('pt-BR') : ''
      var items = b.items || []
      var itemsHtml = items.map(function (it) { return '<span style="font-size:10px;padding:2px 6px;background:#EEF2FF;color:#4338CA;border-radius:4px">' + (it.description || '').replace(/</g, '&lt;') + '</span>' }).join(' ')

      lista += '<div style="padding:12px 14px;background:#fff;border:1.5px solid #E5E7EB;border-radius:10px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        + '<div style="font-size:13px;font-weight:600;color:#111">' + (b.title || 'Or\u00e7amento').replace(/</g, '&lt;') + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="font-size:14px;font-weight:700;color:#10B981">' + val + '</span>'
        + '<span style="padding:2px 10px;background:' + s.bg + ';color:' + s.color + ';border-radius:20px;font-size:10px;font-weight:600">' + s.label + '</span>'
        + '<button onclick="removeBudget(\'' + lead.id + '\',\'' + b.id + '\')" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px" title="Excluir">&times;</button>'
        + '</div></div>'
        + (dt ? '<div style="font-size:10px;color:#9CA3AF;margin-bottom:4px">' + dt + '</div>' : '')
        + (itemsHtml ? '<div style="display:flex;flex-wrap:wrap;gap:4px">' + itemsHtml + '</div>' : '')
        + '</div>'
    })
    lista += '</div>'
  } else {
    lista = '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;margin-bottom:16px">Nenhum or\u00e7amento cadastrado.</div>'
  }

  // Formulario novo orcamento
  var form = '<div style="padding:14px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px">'
    + '<div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Novo Or\u00e7amento</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
    + '<div><label style="font-size:10px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px">Procedimento</label>'
    + '<input id="bProcedimento" type="text" placeholder="Ex: Full Face 5D" style="width:100%;padding:7px 10px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box" /></div>'
    + '<div><label style="font-size:10px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px">Valor (R$)</label>'
    + '<input id="bValor" type="number" placeholder="0,00" style="width:100%;padding:7px 10px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box" /></div>'
    + '<div><label style="font-size:10px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px">Status</label>'
    + '<select id="bStatus" style="width:100%;padding:7px 10px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;outline:none;background:#fff;box-sizing:border-box">'
    + '<option value="draft">Aberto</option><option value="approved">Aprovado</option><option value="lost">Recusado</option><option value="negotiation">Negociando</option></select></div>'
    + '<div><label style="font-size:10px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px">Validade</label>'
    + '<input id="bValidUntil" type="date" style="width:100%;padding:7px 10px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box" /></div>'
    + '</div>'
    + '<div style="display:flex;justify-content:flex-end"><button id="bSaveBtn" onclick="saveBudget(\'' + lead.id + '\');setTimeout(function(){_lmLoadOrcamentos(_currentLead)},500)" style="padding:7px 16px;background:#7C3AED;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Adicionar</button></div>'
    + '</div>'

  el.innerHTML = kpis + lista + form
}

// ── Modal principal ───────────────────────────────────────────

function showLeadModal(lead) {
  document.getElementById('leadModal')?.remove()

  _currentLeadId          = lead.id
  _currentLead            = lead
  _currentCustomProtocols = lead.customFields?.careProtocols || []
  _activeModalTab         = 'geral'

  const modal = document.createElement('div')
  modal.id = 'leadModal'
  modal.innerHTML =
    '<div class="modal-overlay modal-xl open" onclick="if(event.target===this){this.remove();if(typeof loadLeads===\'function\')loadLeads()}">' +
      '<div class="modal-box" style="height:92vh">' +
        _lmHeader(lead) +
        '<div class="modal-with-sidebar">' +
          _lmNav('geral') +
          '<div id="lmContent" class="modal-content">' +
            _renderModalTab('geral', lead) +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  document.body.appendChild(modal)
}

// ── viewLead ──────────────────────────────────────────────────

async function viewLead(id) {
  // Carrega do cache unificado (LeadsService.getLocal via ClinicLeadsCache)
  var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
  var lead = leads.find(function(l) { return l.id === id })

  // Fallback: buscar do Supabase se não estiver em cache local
  if (!lead && window.LeadsService) {
    var all = await window.LeadsService.loadAll()
    lead = (all || []).find(function(l) { return l.id === id })
  }

  if (!lead) return

  // Carrega tags atribuídas via SdrService
  var assignedTags = []
  if (window.SdrService) {
    var tagsResult = await window.SdrService.getTags('lead', id)
    if (tagsResult.ok) assignedTags = tagsResult.data || []
  }

  showLeadModal(Object.assign({}, lead, { _assignedTags: assignedTags }))
}

// ── Exports globais ───────────────────────────────────────────

window.viewLead               = viewLead
window.showLeadModal          = showLeadModal
window.showAnamneseModal      = showAnamneseModal
window.saveAnamnese           = saveAnamnese
window.showBudgetModal        = showBudgetModal
window.saveBudget             = saveBudget
window.removeBudget           = removeBudget
window.updateBudgetBadge      = updateBudgetBadge
window.saveCustomProtocol     = saveCustomProtocol
window.removeCustomProtocol   = removeCustomProtocol
window.printPatient           = printPatient
window._lmOpenLinkPanel       = _lmOpenLinkPanel
window._lmGenerateAnamneseLink = _lmGenerateAnamneseLink
window._lmCopyAnamLink        = _lmCopyAnamLink
window.toggleHistory      = toggleHistory
