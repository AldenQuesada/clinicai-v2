;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Module
//  Páginas: Relatórios · Eventos · Tags e Fluxos
// ══════════════════════════════════════════════════════════════

let _relTab    = 'semana'   // semana | mes | trimestre
let _eventoTab = 'bloqueios' // bloqueios | feriados | campanhas | cursos
// 'all' | 'pre_agendamento' | 'agendamento' | 'paciente' | 'orcamento' | 'paciente_orcamento' | 'perdido'

// ── Helpers ───────────────────────────────────────────────────
function _fmtDate(d) { try { return new Date(d).toLocaleDateString('pt-BR') } catch { return '' } }
function _fmtTime(d) { try { return new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) } catch { return '' } }

// ══════════════════════════════════════════════════════════════
//  RELATÓRIOS
// ══════════════════════════════════════════════════════════════
function renderAgendaRelatorios() {
  const root = document.getElementById('agenda-reports-root')
  if (!root) return

  // Dados reais via getAgendaReportData (agenda-smart.js), com fallback simulado
  const _simStats = {
    semana:    { total:0, confirmados:0, realizados:0, noshow:0, cancelados:0, remarcados:0, txComparecimento:0, txConfirmacao:0, txNoshow:0, txCancelamento:0, faturamento:0, ticketMedio:0, porDia:[] },
    mes:       { total:0, confirmados:0, realizados:0, noshow:0, cancelados:0, remarcados:0, txComparecimento:0, txConfirmacao:0, txNoshow:0, txCancelamento:0, faturamento:0, ticketMedio:0, porDia:[] },
    trimestre: { total:0, confirmados:0, realizados:0, noshow:0, cancelados:0, remarcados:0, txComparecimento:0, txConfirmacao:0, txNoshow:0, txCancelamento:0, faturamento:0, ticketMedio:0, porDia:[] },
  }
  const s = (window.getAgendaReportData ? getAgendaReportData(_relTab) : _simStats[_relTab]) || _simStats.semana

  const tabs = [
    {id:'semana',    label:'Esta semana'},
    {id:'mes',       label:'Este mês'},
    {id:'trimestre', label:'Trimestre'},
  ]

  const _fmtBRLr = v => 'R$ '+Number(v||0).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')
  const metricCards = [
    {label:'Total agendados',    value:s.total,                  icon:'calendar',     cor:'#3B82F6'},
    {label:'Realizados',         value:s.realizados,             icon:'check-circle', cor:'#10B981'},
    {label:'No-show',            value:s.noshow,                 icon:'x-circle',     cor:'#EF4444'},
    {label:'Cancelamentos',      value:s.cancelados,             icon:'slash',        cor:'#9CA3AF'},
    {label:'Remarcados',         value:s.remarcados||0,          icon:'refresh-cw',   cor:'#F59E0B'},
    {label:'Tx. comparecimento', value:s.txComparecimento+'%',   icon:'trending-up',  cor:'#059669', highlight:true},
    {label:'Faturamento',        value:_fmtBRLr(s.faturamento),  icon:'dollar-sign',  cor:'#7C3AED'},
    {label:'Ticket médio',       value:_fmtBRLr(s.ticketMedio),  icon:'bar-chart-2',  cor:'#0EA5E9'},
  ]

  const barMax = Math.max(...(s.porDia.map(d=>d.agendados||0).concat([1])))

  root.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:28px 24px">

      <!-- Cabeçalho -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Relatórios da Agenda</h1>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Métricas de desempenho e tendências de agendamento</p>
        </div>
        <button onclick="tagsOpenCheckoutModal&&tagsOpenCheckoutModal(null,null,[])"
          style="display:flex;align-items:center;gap:6px;padding:9px 15px;background:#10B981;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer">
          <i data-feather="log-out" style="width:13px;height:13px"></i> Registrar Saída
        </button>
      </div>

      <!-- Período -->
      <div style="display:flex;gap:4px;margin-bottom:22px">
        ${tabs.map(t=>{
          const active = _relTab === t.id
          return `<button onclick="agendaSetRelTab('${t.id}')"
            style="padding:8px 16px;border:none;border-radius:8px;font-size:12px;font-weight:${active?'700':'600'};
            background:${active?'#3B82F6':'#F3F4F6'};color:${active?'#fff':'#6B7280'};cursor:pointer;transition:.15s">
            ${t.label}
          </button>`}).join('')}
      </div>

      <!-- Métricas -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:24px">
        ${metricCards.map(m=>`
          <div style="background:${m.highlight?m.cor:m.cor+'0D'};border:1px solid ${m.highlight?'transparent':'#F3F4F6'};border-radius:12px;padding:16px;${m.highlight?'box-shadow:0 4px 14px '+m.cor+'44':''}">
            <div style="width:34px;height:34px;border-radius:9px;background:${m.highlight?'rgba(255,255,255,.2)':m.cor+'18'};display:flex;align-items:center;justify-content:center;margin-bottom:10px">
              <i data-feather="${m.icon}" style="width:15px;height:15px;color:${m.highlight?'#fff':m.cor}"></i>
            </div>
            <div style="font-size:28px;font-weight:800;color:${m.highlight?'#fff':'#111827'}">${m.value}</div>
            <div style="font-size:11px;color:${m.highlight?'rgba(255,255,255,.85)':'#9CA3AF'};font-weight:500;margin-top:2px">${m.label}</div>
          </div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Gráfico de barras por dia -->
        ${s.porDia.length ? `
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:20px">
          <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:16px;display:flex;align-items:center;gap:6px">
            <i data-feather="bar-chart-2" style="width:14px;height:14px;color:#3B82F6"></i> Agendamentos por dia
          </div>
          <div style="display:flex;gap:10px;align-items:flex-end;height:140px">
            ${s.porDia.map(d=>{
              const h  = Math.round((d.agendados/barMax)*120)
              const hr = Math.round((d.realizados/barMax)*120)
              const hn = Math.round((d.noshow/barMax)*120)
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="font-size:10px;font-weight:700;color:#374151">${d.agendados}</div>
                <div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:120px">
                  <div style="flex:1;background:#3B82F6;border-radius:4px 4px 0 0;height:${hr}px" title="Realizados: ${d.realizados}"></div>
                  <div style="flex:1;background:#EF4444;border-radius:4px 4px 0 0;height:${hn}px" title="No-show: ${d.noshow}"></div>
                </div>
                <div style="font-size:10px;color:#9CA3AF">${d.dia}</div>
              </div>`}).join('')}
          </div>
          <div style="display:flex;gap:12px;margin-top:12px;justify-content:center">
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6B7280">
              <div style="width:10px;height:10px;border-radius:2px;background:#3B82F6"></div> Realizados
            </div>
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6B7280">
              <div style="width:10px;height:10px;border-radius:2px;background:#EF4444"></div> No-show
            </div>
          </div>
        </div>` : `
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:20px;display:flex;align-items:center;justify-content:center">
          <div style="text-align:center;color:#D1D5DB">
            <i data-feather="bar-chart-2" style="width:40px;height:40px;display:block;margin:0 auto 10px"></i>
            <div style="font-size:12px">Gráfico diário disponível para visualização semanal</div>
          </div>
        </div>`}

        <!-- Taxas -->
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:20px">
          <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:16px;display:flex;align-items:center;gap:6px">
            <i data-feather="activity" style="width:14px;height:14px;color:#7C3AED"></i> Taxas de desempenho
          </div>
          <div style="display:grid;gap:14px">
            ${[
              {label:'Comparecimento',  value:s.txComparecimento, cor:'#10B981', meta:85},
              {label:'Confirmação',     value:s.txConfirmacao,    cor:'#3B82F6', meta:80},
              {label:'No-show',         value:s.txNoshow,         cor:'#EF4444', meta:10, inverted:true},
              {label:'Cancelamentos',   value:s.txCancelamento,   cor:'#F59E0B', meta:15, inverted:true},
            ].map(r=>{
              const ok = r.inverted ? r.value <= r.meta : r.value >= r.meta
              return `<div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                  <span style="font-size:12px;font-weight:600;color:#374151">${r.label}</span>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:13px;font-weight:800;color:${r.cor}">${r.value}%</span>
                    <span style="font-size:10px;padding:1px 6px;border-radius:5px;background:${ok?'#DCFCE7':'#FEF2F2'};color:${ok?'#166534':'#991B1B'};font-weight:600">${ok?'Meta OK':'Abaixo'}</span>
                  </div>
                </div>
                <div style="height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${Math.min(r.value,100)}%;background:${r.cor};border-radius:3px;transition:.4s"></div>
                </div>
                <div style="font-size:10px;color:#9CA3AF;margin-top:3px">Meta: ${r.inverted?'até':'mín.'} ${r.meta}%</div>
              </div>`}).join('')}
          </div>
        </div>

      </div>

      <!-- Insights automáticos -->
      <div style="margin-top:16px;background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:18px 20px">
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-feather="zap" style="width:13px;height:13px;color:#F59E0B"></i> Insights automáticos
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
          ${[
            s.txNoshow > 15 ? {icon:'alert-triangle',cor:'#EF4444',msg:`Taxa de no-show em ${s.txNoshow}% — acima do ideal de 10%. Ative o fluxo de confirmação 48h antes.`} : null,
            s.txComparecimento >= 85 ? {icon:'trending-up',cor:'#10B981',msg:`Ótima taxa de comparecimento: ${s.txComparecimento}%. Continue com os lembretes automáticos.`} : null,
            s.reagendados > 5 ? {icon:'refresh-cw',cor:'#F59E0B',msg:`${s.reagendados} reagendamentos no período. Verifique padrões de cancelamento.`} : null,
            {icon:'info',cor:'#3B82F6',msg:'Dados simulados. Serão atualizados automaticamente quando a integração com leads e pacientes estiver ativa.'},
          ].filter(Boolean).map(i=>`
            <div style="padding:10px 13px;background:${i.cor}0A;border:1px solid ${i.cor}22;border-radius:9px;display:flex;gap:8px;align-items:flex-start">
              <i data-feather="${i.icon}" style="width:13px;height:13px;color:${i.cor};flex-shrink:0;margin-top:1px"></i>
              <span style="font-size:11.5px;color:#374151;line-height:1.5">${i.msg}</span>
            </div>`).join('')}
        </div>
      </div>

    </div>`
  featherIn(root)
}

// ══════════════════════════════════════════════════════════════
//  EVENTOS
// ══════════════════════════════════════════════════════════════
function renderAgendaEventos() {
  const root = document.getElementById('agenda-eventos-root')
  if (!root) return

  const tabs = [
    { id:'bloqueios',  label:'Bloqueios',       icon:'lock'        },
    { id:'feriados',   label:'Feriados e Datas', icon:'calendar'    },
    { id:'campanhas',  label:'Campanhas',        icon:'zap'         },
    { id:'cursos',     label:'Cursos e Eventos', icon:'users'       },
  ]

  const EVENTS_KEY = 'clinicai_agenda_events'
  const events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]')

  root.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:28px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Eventos da Agenda</h1>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Bloqueios, feriados, campanhas e eventos que afetam a disponibilidade</p>
        </div>
        <button onclick="agendaEventoNovo()" style="display:flex;align-items:center;gap:6px;padding:9px 15px;background:#7C3AED;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer">
          <i data-feather="plus" style="width:13px;height:13px"></i> Novo Evento
        </button>
      </div>

      <div style="display:flex;gap:4px;margin-bottom:22px;border-bottom:1px solid #F3F4F6">
        ${tabs.map(t=>{
          const active = _eventoTab === t.id
          return `<button onclick="agendaSetEventoTab('${t.id}')"
            style="display:flex;align-items:center;gap:6px;padding:9px 16px;border:none;border-bottom:2.5px solid ${active?'#7C3AED':'transparent'};background:transparent;font-size:12px;font-weight:${active?'700':'600'};color:${active?'#7C3AED':'#6B7280'};cursor:pointer;white-space:nowrap;flex-shrink:0;transition:.15s">
            <i data-feather="${t.icon}" style="width:12px;height:12px"></i>${t.label}
          </button>`}).join('')}
      </div>

      <div id="evento-tab-content">
        ${_eventoTabAtivo(events)}
      </div>
    </div>`
  featherIn(root)
}

function _eventoTabAtivo(events) {
  const tipo = { bloqueios:'bloqueio', feriados:'feriado', campanhas:'campanha', cursos:'curso' }[_eventoTab] || 'bloqueio'
  const filtered = events.filter(e => e.tipo === tipo)
  const colors = { bloqueio:'#EF4444', feriado:'#3B82F6', campanha:'#10B981', curso:'#8B5CF6' }
  const color = colors[tipo] || '#7C3AED'

  if (_eventoTab === 'bloqueios') {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">
        ${!filtered.length ? `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9CA3AF;font-size:13px">
          <i data-feather="lock" style="width:32px;height:32px;display:block;margin:0 auto 12px;color:#E5E7EB"></i>
          Nenhum bloqueio ativo. Clique em <strong>Novo Evento</strong> para bloquear sala ou profissional.
        </div>` : filtered.map(e => _eventoCard(e, color)).join('')}

        <!-- Cards de ação rápida -->
        <div onclick="agendaEventoNovo('bloqueio_sala')" style="border:2px dashed #E5E7EB;border-radius:12px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:border-color .15s" onmouseover="this.style.borderColor='#EF4444'" onmouseout="this.style.borderColor='#E5E7EB'">
          <div style="width:38px;height:38px;border-radius:9px;background:#FEF2F2;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-feather="home" style="width:16px;height:16px;color:#EF4444"></i>
          </div>
          <div><div style="font-size:13px;font-weight:700;color:#374151">Bloquear Sala</div><div style="font-size:11px;color:#9CA3AF">Sala indisponível por período</div></div>
        </div>
        <div onclick="agendaEventoNovo('bloqueio_prof')" style="border:2px dashed #E5E7EB;border-radius:12px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:border-color .15s" onmouseover="this.style.borderColor='#F59E0B'" onmouseout="this.style.borderColor='#E5E7EB'">
          <div style="width:38px;height:38px;border-radius:9px;background:#FFFBEB;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-feather="user-x" style="width:16px;height:16px;color:#F59E0B"></i>
          </div>
          <div><div style="font-size:13px;font-weight:700;color:#374151">Bloquear Profissional</div><div style="font-size:11px;color:#9CA3AF">Férias, folga ou ausência</div></div>
        </div>
      </div>`
  }

  if (_eventoTab === 'feriados') {
    const feriados = [
      {nome:'Ano Novo',             data:'2025-01-01', tipo:'nacional'},
      {nome:'Carnaval',             data:'2025-03-03', tipo:'nacional'},
      {nome:'Sexta-feira Santa',    data:'2025-04-18', tipo:'nacional'},
      {nome:'Tiradentes',           data:'2025-04-21', tipo:'nacional'},
      {nome:'Dia do Trabalho',      data:'2025-05-01', tipo:'nacional'},
      {nome:'Corpus Christi',       data:'2025-06-19', tipo:'nacional'},
      {nome:'Independência',        data:'2025-09-07', tipo:'nacional'},
      {nome:'Nossa Sra. Aparecida', data:'2025-10-12', tipo:'nacional'},
      {nome:'Finados',              data:'2025-11-02', tipo:'nacional'},
      {nome:'Proclamação República',data:'2025-11-15', tipo:'nacional'},
      {nome:'Natal',                data:'2025-12-25', tipo:'nacional'},
    ]
    return `
      <div>
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px">Feriados Nacionais 2025</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:20px">
          ${feriados.map(f=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#EFF6FF;border-radius:9px">
            <div style="width:7px;height:7px;border-radius:50%;background:#3B82F6;flex-shrink:0"></div>
            <div style="flex:1;font-size:12px;color:#374151;font-weight:600">${f.nome}</div>
            <div style="font-size:11px;color:#9CA3AF">${f.data.split('-').reverse().join('/')}</div>
          </div>`).join('')}
        </div>
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px">Datas da Clínica</div>
        ${!filtered.length ? `<div style="text-align:center;padding:24px;color:#9CA3AF;font-size:12px;border:2px dashed #E5E7EB;border-radius:10px">Nenhuma data especial cadastrada. <button onclick="agendaEventoNovo('feriado')" style="color:#3B82F6;background:none;border:none;cursor:pointer;font-weight:700">+ Adicionar</button></div>` : filtered.map(e=>_eventoCard(e,color)).join('')}
      </div>`
  }

  const labelMap = { campanhas:'campanha', cursos:'curso' }
  const iconMap  = { campanhas:'zap', cursos:'users' }
  const colorMap = { campanhas:'#10B981', cursos:'#8B5CF6' }
  const tipoCur  = labelMap[_eventoTab] || 'evento'
  const corCur   = colorMap[_eventoTab] || '#7C3AED'

  return `
    <div>
      ${!filtered.length ? `<div style="text-align:center;padding:48px;color:#9CA3AF;font-size:13px;border:2px dashed #E5E7EB;border-radius:12px">
        <i data-feather="${iconMap[_eventoTab]||'calendar'}" style="width:32px;height:32px;display:block;margin:0 auto 12px;color:#E5E7EB"></i>
        Nenhum ${tipoCur} cadastrado.
        <button onclick="agendaEventoNovo('${tipoCur}')" style="color:${corCur};background:none;border:none;cursor:pointer;font-weight:700">+ Adicionar ${tipoCur}</button>
      </div>` : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">${filtered.map(e=>_eventoCard(e,corCur)).join('')}</div>`}
    </div>`
}

function _eventoCard(e, color) {
  return `<div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:14px;border-left:4px solid ${color}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="font-size:13px;font-weight:700;color:#111">${e.nome||'Evento'}</div>
      <button onclick="agendaEventoRemover('${e.id}')" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:16px;line-height:1;flex-shrink:0">×</button>
    </div>
    ${e.dataInicio?`<div style="font-size:11px;color:#9CA3AF;margin-top:4px">${e.dataInicio} ${e.dataFim&&e.dataFim!==e.dataInicio?'→ '+e.dataFim:''}</div>`:''}
    ${e.descricao?`<div style="font-size:11px;color:#6B7280;margin-top:6px">${e.descricao}</div>`:''}
    ${e.afetaSalas?`<div style="font-size:10px;font-weight:600;color:${color};margin-top:6px">Bloqueia: ${e.afetaSalas}</div>`:''}
  </div>`
}

function agendaEventoNovo(tipo) {
  const m = document.createElement('div')
  m.id = 'agendaEventoModal'
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9700;display:flex;align-items:center;justify-content:center;padding:16px'
  m.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:420px;box-shadow:0 16px 48px rgba(0,0,0,.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E5E7EB">
        <div style="font-size:14px;font-weight:800;color:#111">Novo Evento / Bloqueio</div>
        <button onclick="document.getElementById('agendaEventoModal').remove()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;display:inline-flex;align-items:center;padding:4px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div style="padding:18px;display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Tipo</label>
          <select id="evTipo" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px">
            <option value="bloqueio" ${tipo==='bloqueio_sala'||tipo==='bloqueio'?'selected':''}>Bloqueio de Sala</option>
            <option value="bloqueio_prof" ${tipo==='bloqueio_prof'?'selected':''}>Bloqueio de Profissional</option>
            <option value="feriado" ${tipo==='feriado'?'selected':''}>Feriado / Data Especial</option>
            <option value="campanha" ${tipo==='campanha'?'selected':''}>Campanha</option>
            <option value="curso" ${tipo==='curso'?'selected':''}>Curso / Evento</option>
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Nome</label>
          <input id="evNome" placeholder="Ex: Férias Dr. João, Feriado Municipal..." style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Data início</label>
            <input id="evInicio" type="date" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Data fim</label>
            <input id="evFim" type="date" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px">
          </div>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Descrição</label>
          <textarea id="evDesc" rows="2" placeholder="Motivo ou observação..." style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;resize:none;font-family:inherit"></textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('agendaEventoModal').remove()" style="flex:1;padding:10px;border:1.5px solid #E5E7EB;background:#fff;color:#374151;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">Cancelar</button>
          <button onclick="agendaEventoSalvar()" style="flex:2;padding:10px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:800">Salvar Evento</button>
        </div>
      </div>
    </div>`
  m.addEventListener('click', e => { if(e.target===m) m.remove() })
  document.body.appendChild(m)
}

function agendaEventoSalvar() {
  const nome  = document.getElementById('evNome')?.value?.trim()
  const tipo  = document.getElementById('evTipo')?.value
  if (!nome) { if (window._showToast) _showToast('Atenção', 'Informe o nome do evento.', 'warn'); return }
  const events = JSON.parse(localStorage.getItem('clinicai_agenda_events') || '[]')
  events.push({
    id:         'ev_'+Date.now(),
    tipo,
    nome,
    dataInicio: document.getElementById('evInicio')?.value || '',
    dataFim:    document.getElementById('evFim')?.value    || '',
    descricao:  document.getElementById('evDesc')?.value?.trim() || '',
    criadoEm:   new Date().toISOString(),
  })
  if (window.sbSave) sbSave('clinicai_agenda_events', events)
  else store.set('clinicai_agenda_events', events)
  document.getElementById('agendaEventoModal')?.remove()
  renderAgendaEventos()
}

function agendaEventoRemover(id) {
  const events = JSON.parse(localStorage.getItem('clinicai_agenda_events') || '[]').filter(e=>e.id!==id)
  if (window.sbSave) sbSave('clinicai_agenda_events', events)
  else store.set('clinicai_agenda_events', events)
  renderAgendaEventos()
}

// ══════════════════════════════════════════════════════════════
//  CONTROLES DE ESTADO
// ══════════════════════════════════════════════════════════════
function agendaSetRelTab(tab) {
  _relTab = tab
  renderAgendaRelatorios()
}

function agendaSetEventoTab(tab) {
  _eventoTab = tab
  renderAgendaEventos()
}

// ══════════════════════════════════════════════════════════════
//  EXPOSE
// ══════════════════════════════════════════════════════════════
window.renderAgendaRelatorios  = renderAgendaRelatorios
window.renderAgendaEventos     = renderAgendaEventos
window.agendaSetRelTab         = agendaSetRelTab
window.agendaSetEventoTab      = agendaSetEventoTab
window.agendaEventoNovo        = agendaEventoNovo
window.agendaEventoSalvar      = agendaEventoSalvar
window.agendaEventoRemover     = agendaEventoRemover

// ── Namespace agregador congelado (contrato canonico do projeto) ─
// Os window.<fn> acima permanecem para compatibilidade com onclick inline.
window.AgendaModule = Object.freeze({
  renderRelatorios: renderAgendaRelatorios,
  renderEventos: renderAgendaEventos,

  setRelTab: agendaSetRelTab,
  setEventoTab: agendaSetEventoTab,
  eventoNovo: agendaEventoNovo,
  eventoSalvar: agendaEventoSalvar,
  eventoRemover: agendaEventoRemover
})

})()
