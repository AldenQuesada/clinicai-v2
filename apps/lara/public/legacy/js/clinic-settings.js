// ── ClinicAI — Clinic Settings Module ──
// ─── Configurações — Abas ────────────────────────────────────
// ── Máscaras de input ─────────────────────────────────────────
function maskCPF(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11)
  if (v.length > 9) v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4')
  else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3')
  else if (v.length > 3) v = v.replace(/^(\d{3})(\d{0,3})/, '$1.$2')
  input.value = v
}

function maskCNPJ(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 14)
  if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4')
  else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3')
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})/, '$1.$2')
  input.value = v
}

function maskPhone(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11)
  if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3')
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2')
  else if (v.length > 0) v = v.replace(/^(\d{0,2})/, '($1')
  input.value = v
}

function maskCEP(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 8)
  if (v.length > 5) v = v.replace(/^(\d{5})(\d{0,3})/, '$1-$2')
  input.value = v
}

async function fetchCEP(prefix) {
  const cepInput = document.getElementById(`${prefix}_cep`)
  if (!cepInput) return
  const cep = cepInput.value.replace(/\D/g, '')
  if (cep.length !== 8) return
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    const data = await res.json()
    if (data.erro) return
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val }
    set(`${prefix}_rua`,         data.logradouro)
    set(`${prefix}_bairro`,      data.bairro)
    set(`${prefix}_cidade`,      data.localidade)
    set(`${prefix}_estado`,      data.uf)
    // profissional usa sufixo diferente
    set(`${prefix}_bairro_end`,  data.bairro)
    set(`${prefix}_cidade_end`,  data.localidade)
    set(`${prefix}_estado_end`,  data.uf)
  } catch (_) {}
}

function maskRG(input) {
  let v = input.value.replace(/[^0-9xX]/gi, '').substring(0, 9).toUpperCase()
  if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\w)/, '$1.$2.$3-$4')
  else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\w+)/, '$1.$2.$3')
  else if (v.length > 2) v = v.replace(/^(\d{2})(\w+)/, '$1.$2')
  input.value = v
}

window.maskCPF   = maskCPF
window.maskCNPJ  = maskCNPJ
window.maskPhone = maskPhone
window.maskCEP   = maskCEP
window.maskRG    = maskRG
window.fetchCEP  = fetchCEP

function settingsTab(tab) {
  ;['clinic','professionals','rooms','technologies','injectables','procedures','users','permissions'].forEach(t => {
    const page = document.getElementById(`spage_${t}`)
    const btn  = document.getElementById(`stab_${t}`)
    if (!page || !btn) return
    const active = t === tab
    page.style.display = active ? 'block' : 'none'
    btn.classList.toggle('stab-active', active)
  })
  // Progresso só visível na aba Dados da Clínica
  const banner = document.getElementById('scProgressBanner')
  if (banner && banner.style.display !== 'none') {
    banner.style.visibility = tab === 'clinic' ? 'visible' : 'hidden'
    banner.style.height     = tab === 'clinic' ? ''        : '0'
    banner.style.margin     = tab === 'clinic' ? ''        : '0'
    banner.style.padding    = tab === 'clinic' ? ''        : '0'
    banner.style.overflow   = tab === 'clinic' ? ''        : 'hidden'
  }
  if (tab === 'professionals') renderProfessionalsList()
  if (tab === 'rooms')         renderRoomsList()
  if (tab === 'technologies')  renderTechnologiesList()
  if (tab === 'injectables')   { _lazyLoadInjetaveis() }
  if (tab === 'procedures')    {
    if (window.renderProcedimentos) {
      renderProcedimentos()
    } else {
      console.warn('procedimentos.js nao carregou')
      const root = document.getElementById('page-procedimentos')
      if (root) root.innerHTML = '<div style="padding:32px;text-align:center;color:#92400E;background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;font-size:13px"><div style="font-weight:700;margin-bottom:6px">Modulo nao carregou</div><div style="color:#78350F">O arquivo procedimentos.js nao esta disponivel. Recarregue a pagina (F5). Se persistir, contate o suporte.</div></div>'
    }
  }
  if (tab === 'clinic')        loadClinicSettings()
  if (tab === 'users')         { if (window.loadUsersAdmin) { loadUsersAdmin(); loadPendingInvites() } }
  if (tab === 'permissions')   { if (window.ModulePermissionsUI) { window.ModulePermissionsUI.init() } }
}
window.settingsTab = settingsTab

let _injLoaded = false
function _lazyLoadInjetaveis() {
  if (window.injSettingsTab) {
    injSettingsTab('cadastro')
    if (window.renderInjetaveis) renderInjetaveis()
    return
  }
  if (_injLoaded) return
  _injLoaded = true
  const s = document.createElement('script')
  s.src = 'js/injetaveis.js?v=20260412a'
  s.onload = function () {
    if (window.injSettingsTab) injSettingsTab('cadastro')
    if (window.renderInjetaveis) renderInjetaveis()
  }
  document.head.appendChild(s)
}

// ── Dados da Clínica ─────────────────────────────────────────
// Fonte primária: Supabase (via ClinicSettingsService)
// Fallback: localStorage (chave abaixo)
const CLINIC_KEY = 'clinicai_clinic_settings'

// Campos simples (input/select/textarea) mapeados a sc_{field}
const CLINIC_FIELDS = [
  'nome','tipo','especialidade','funcionarios','descricao','data_fundacao',
  'telefone','whatsapp','email','site','cardapio',
  'instagram','facebook','tiktok','youtube','google','linkedin',
  'cep','rua','num','comp','bairro','cidade','estado','maps',
  'cnpj','ie','im','cnae','regime_tributario','iss_pct','nfe',
  'duracao_padrao','intervalo_consulta','antecedencia_min','limite_agendamento',
  'politica_cancelamento','termos_consentimento','msg_boas_vindas',
  'fuso_horario','moeda','formato_data','observacoes_internas',
]

const CLINIC_TOGGLES  = ['notif_confirmacao','notif_lembrete24','notif_lembrete1h']
const CLINIC_SECTIONS = ['perfil','fiscal','visual','atendimento','notificacoes','sistema','alexa','documentos','observacoes']

// ── Navegação de seções ──────────────────────────────────────
function clinicSection(sec) {
  CLINIC_SECTIONS.forEach(s => {
    const panel = document.getElementById(`cs_panel_${s}`)
    const btn   = document.getElementById(`csn_${s}`)
    const active = s === sec
    if (panel) panel.style.display = active ? 'block' : 'none'
    if (btn)   btn.classList.toggle('csn-active', active)
  })
  // Garante renderização dos grids quando visíveis pela 1ª vez
  if (sec === 'perfil') {
    const data = JSON.parse(localStorage.getItem(CLINIC_KEY) || '{}')
    renderHorariosGrid(data.horarios || {})
  }
}
window.clinicSection = clinicSection

function csToggle(checkbox, trackId) {
  const track = document.getElementById(trackId)
  if (track) track.classList.toggle('cs-toggle-on', checkbox.checked)
}
window.csToggle = csToggle

// ── Repeater: Responsáveis ───────────────────────────────────
const _RESP_FIELDS = ['nome','cpf','nascimento','cargo','tel','email','conselho','conselho_num']
const _RESP_LABELS = {
  nome:'Nome Completo', cpf:'CPF', nascimento:'Data de Nascimento',
  cargo:'Cargo / Função', tel:'Telefone', email:'E-mail',
  conselho:'Conselho Profissional', conselho_num:'Número do Conselho'
}
const _RESP_CONSEHOS = ['','CRM – Medicina','CRO – Odontologia','CREFITO – Fisioterapia','CRN – Nutrição','CRF – Farmácia','COREN – Enfermagem','CFP – Psicologia','Outro']
const _RESP_VALUES = {
  nome: '',cpf:'',nascimento:'',cargo:'',tel:'',email:'',conselho:'',conselho_num:''
}

function csRenderResponsaveis(arr) {
  const c = document.getElementById('cs_responsaveis_list')
  if (!c) return
  if (!arr || !arr.length) {
    c.innerHTML = `<div style="text-align:center;padding:20px 0;color:#C4C9D4;font-size:12px">Nenhum responsável cadastrado. Clique em "Adicionar Responsável" acima.</div>`
    return
  }
  c.innerHTML = arr.map((r, i) => `
    <div class="cs-repeater-item" id="cs_resp_wrap_${i}">
      <div class="cs-repeater-item-hdr">
        <span class="cs-repeater-label">Responsável #${i+1}${r.nome ? ` — ${r.nome}` : ''}</span>
        <button class="cs-repeater-remove" onclick="csRemoveResponsavel(${i})" title="Remover">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="grid-column:1/span 2">
          <label class="cs-label">Nome Completo</label>
          <input id="cs_resp_${i}_nome" type="text" value="${_esc(r.nome||'')}" placeholder="Nome completo" class="cs-input"/>
        </div>
        <div>
          <label class="cs-label">CPF</label>
          <input id="cs_resp_${i}_cpf" type="text" value="${_esc(r.cpf||'')}" placeholder="000.000.000-00" maxlength="14" oninput="maskCPF(this)" class="cs-input"/>
        </div>
        <div>
          <label class="cs-label">Data de Nascimento</label>
          <input id="cs_resp_${i}_nascimento" type="date" value="${_esc(r.nascimento||'')}" class="cs-input"/>
        </div>
        <div>
          <label class="cs-label">Cargo / Função</label>
          <input id="cs_resp_${i}_cargo" type="text" value="${_esc(r.cargo||'')}" placeholder="Proprietária, Diretora..." class="cs-input"/>
        </div>
        <div>
          <label class="cs-label">Telefone</label>
          <input id="cs_resp_${i}_tel" type="text" value="${_esc(r.tel||'')}" placeholder="(11) 99999-9999" maxlength="15" oninput="maskPhone(this)" class="cs-input"/>
        </div>
        <div>
          <label class="cs-label">E-mail</label>
          <input id="cs_resp_${i}_email" type="email" value="${_esc(r.email||'')}" placeholder="nome@email.com" class="cs-input"/>
        </div>
        <div>
          <label class="cs-label">Conselho Profissional</label>
          <select id="cs_resp_${i}_conselho" class="cs-select">
            ${_RESP_CONSEHOS.map(v => `<option value="${v}" ${r.conselho===v?'selected':''}>${v||'Sem conselho / N/A'}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="cs-label">Número do Conselho</label>
          <input id="cs_resp_${i}_conselho_num" type="text" value="${_esc(r.conselho_num||'')}" placeholder="Ex: CRM/SP 123456" class="cs-input"/>
        </div>
      </div>
    </div>`).join('')
}
function csAddResponsavel() {
  const arr = csGetResponsaveis()
  arr.push({ nome:'', cpf:'', nascimento:'', cargo:'', tel:'', email:'', conselho:'', conselho_num:'' })
  csRenderResponsaveis(arr)
}
function csRemoveResponsavel(i) {
  const arr = csGetResponsaveis()
  arr.splice(i, 1)
  csRenderResponsaveis(arr)
}
function csGetResponsaveis() {
  const arr = []
  let i = 0
  while (document.getElementById(`cs_resp_wrap_${i}`)) {
    const g = (f) => document.getElementById(`cs_resp_${i}_${f}`)?.value?.trim() || ''
    arr.push({ nome:g('nome'), cpf:g('cpf'), nascimento:g('nascimento'), cargo:g('cargo'), tel:g('tel'), email:g('email'), conselho:g('conselho'), conselho_num:g('conselho_num') })
    i++
  }
  return arr
}
window.csAddResponsavel  = csAddResponsavel
window.csRemoveResponsavel = csRemoveResponsavel

// ── Repeater: CNAE secundários ───────────────────────────────
function csRenderCnaes(arr) {
  const c = document.getElementById('cs_cnaes_list')
  if (!c) return
  c.innerHTML = (arr||[]).map((v, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px" id="cs_cnae_wrap_${i}">
      <input id="cs_cnae_sec_${i}" type="text" value="${_esc(v||'')}" placeholder="Ex: 8690-9/99 – Atividades de atenção à saúde humana" class="cs-input"/>
      <button class="cs-repeater-remove" onclick="csRemoveCnae(${i})" title="Remover">×</button>
    </div>`).join('')
}
function csAddCnae() {
  const arr = csGetCnaes()
  arr.push('')
  csRenderCnaes(arr)
}
function csRemoveCnae(i) {
  const arr = csGetCnaes()
  arr.splice(i, 1)
  csRenderCnaes(arr)
}
function csGetCnaes() {
  const arr = []
  let i = 0
  while (document.getElementById(`cs_cnae_wrap_${i}`)) {
    arr.push(document.getElementById(`cs_cnae_sec_${i}`)?.value?.trim() || '')
    i++
  }
  return arr.filter(v => v)
}
window.csAddCnae = csAddCnae
window.csRemoveCnae = csRemoveCnae

// ── Repeater: Bancos (PJ) ────────────────────────────────────
function csRenderBancos(arr) {
  const c = document.getElementById('cs_bancos_list')
  if (!c) return
  if (!arr || !arr.length) {
    c.innerHTML = `<div style="text-align:center;padding:16px 0;color:#C4C9D4;font-size:12px">Nenhuma conta bancária cadastrada.</div>`
    return
  }
  const tipos = ['','Conta Corrente PJ','Conta Pagamento PJ','Conta Poupança PJ']
  const bancoList = ['Nubank','Itaú Unibanco','Bradesco','Banco do Brasil','Caixa Econômica Federal','Santander','Banco Inter','C6 Bank','Sicoob','Sicredi','PagBank','Mercado Pago','BTG Pactual']
  c.innerHTML = arr.map((b, i) => `
    <div class="cs-repeater-item" id="cs_banco_wrap_${i}">
      <div class="cs-repeater-item-hdr">
        <span class="cs-repeater-label">Conta #${i+1}${b.banco ? ` — ${b.banco}` : ''}<span style="font-size:10px;background:#EDE9FE;color:#7C3AED;padding:1px 7px;border-radius:6px;margin-left:8px">PJ</span></span>
        <button class="cs-repeater-remove" onclick="csRemoveBanco(${i})" title="Remover">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label class="cs-label">Banco</label>
          <input id="cs_banco_${i}_banco" type="text" value="${_esc(b.banco||'')}" list="cs_banco_list_${i}" placeholder="Nubank, Itaú..." class="cs-input"/>
          <datalist id="cs_banco_list_${i}">${bancoList.map(v=>`<option value="${v}"/>`).join('')}</datalist>
        </div>
        <div>
          <label class="cs-label">Tipo de Conta</label>
          <select id="cs_banco_${i}_tipo" class="cs-select">
            ${tipos.map(v=>`<option value="${v}" ${b.tipo===v?'selected':''}>${v||'Selecione...'}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="cs-label">Agência</label>
          <input id="cs_banco_${i}_agencia" type="text" value="${_esc(b.agencia||'')}" placeholder="0000-0" class="cs-input"/>
        </div>
        <div>
          <label class="cs-label">Conta</label>
          <input id="cs_banco_${i}_conta" type="text" value="${_esc(b.conta||'')}" placeholder="00000-0" class="cs-input"/>
        </div>
        <div style="grid-column:1/span 2">
          <label class="cs-label">Titular da Conta</label>
          <input id="cs_banco_${i}_titular" type="text" value="${_esc(b.titular||'')}" placeholder="Razão social exata" class="cs-input"/>
        </div>
        <div style="grid-column:1/span 2">
          <label class="cs-label">Chave PIX</label>
          <input id="cs_banco_${i}_pix" type="text" value="${_esc(b.pix||'')}" placeholder="CNPJ, e-mail, telefone ou chave aleatória" class="cs-input"/>
        </div>
      </div>
    </div>`).join('')
}
function csAddBanco() {
  const arr = csGetBancos()
  arr.push({ banco:'', tipo:'', agencia:'', conta:'', titular:'', pix:'' })
  csRenderBancos(arr)
}
function csRemoveBanco(i) {
  const arr = csGetBancos()
  arr.splice(i, 1)
  csRenderBancos(arr)
}
function csGetBancos() {
  const arr = []
  let i = 0
  while (document.getElementById(`cs_banco_wrap_${i}`)) {
    const g = (f) => document.getElementById(`cs_banco_${i}_${f}`)?.value?.trim() || ''
    arr.push({ banco:g('banco'), tipo:g('tipo'), agencia:g('agencia'), conta:g('conta'), titular:g('titular'), pix:g('pix') })
    i++
  }
  return arr
}
window.csAddBanco    = csAddBanco
window.csRemoveBanco = csRemoveBanco

// ── Repeater: Cores da Marca ─────────────────────────────────
function csRenderCores(arr) {
  const c = document.getElementById('cs_cores_list')
  if (!c) return
  c.innerHTML = (arr||[]).map((cor, i) => {
    const val = cor.valor || '#7C3AED'
    return `
    <div class="cs-repeater-item" id="cs_cor_wrap_${i}" style="padding:10px 14px">
      <div style="display:flex;align-items:center;gap:10px">
        <input id="cs_cor_${i}_picker" type="color" value="${val}" oninput="document.getElementById('cs_cor_${i}_hex').value=this.value" style="width:38px;height:34px;border:1.5px solid #E5E7EB;border-radius:8px;padding:2px;cursor:pointer;box-sizing:border-box;flex-shrink:0"/>
        <input id="cs_cor_${i}_hex" type="text" value="${val}" maxlength="7" placeholder="#7C3AED" oninput="if(/^#[0-9A-Fa-f]{6}$/.test(this.value))document.getElementById('cs_cor_${i}_picker').value=this.value" class="cs-input" style="width:100px;flex-shrink:0"/>
        <input id="cs_cor_${i}_nome" type="text" value="${_esc(cor.nome||'')}" placeholder="Ex: Primária, Secundária, Fundo..." class="cs-input" style="flex:1"/>
        ${i > 1 ? `<button class="cs-repeater-remove" onclick="csRemoveCor(${i})" title="Remover">×</button>` : '<div style="width:24px"></div>'}
      </div>
    </div>`
  }).join('')
}
function csAddCor() {
  const arr = csGetCores()
  arr.push({ nome:'', valor:'#374151' })
  csRenderCores(arr)
}
function csRemoveCor(i) {
  const arr = csGetCores()
  arr.splice(i, 1)
  csRenderCores(arr)
}
function csGetCores() {
  const arr = []
  let i = 0
  while (document.getElementById(`cs_cor_wrap_${i}`)) {
    arr.push({
      valor: document.getElementById(`cs_cor_${i}_picker`)?.value || '#7C3AED',
      nome:  document.getElementById(`cs_cor_${i}_nome`)?.value?.trim() || '',
    })
    i++
  }
  return arr
}
window.csAddCor    = csAddCor
window.csRemoveCor = csRemoveCor

// ── Repeater: Logos / Variações ──────────────────────────────
function csRenderLogos(arr) {
  const c = document.getElementById('cs_logos_list')
  if (!c) return
  if (!arr || !arr.length) {
    c.innerHTML = `<div style="text-align:center;padding:16px 0;color:#C4C9D4;font-size:12px">Nenhuma variação de logo carregada. Clique em "Adicionar Variação".</div>`
    return
  }
  const tipos = ['Logo Principal','Logo Fundo Branco','Logo Fundo Escuro','Versão Monocromática','Favicon','Outro']
  c.innerHTML = arr.map((logo, i) => `
    <div class="cs-repeater-item" id="cs_logo_wrap_${i}">
      <div class="cs-repeater-item-hdr">
        <span class="cs-repeater-label">${logo.tipo || `Logo #${i+1}`}</span>
        <button class="cs-repeater-remove" onclick="csRemoveLogo(${i})" title="Remover">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start">
        <div>
          <label class="cs-label">Tipo / Nome</label>
          <select id="cs_logo_${i}_tipo" class="cs-select" onchange="csUpdateLogoLabel(${i})">
            ${tipos.map(t=>`<option value="${t}" ${logo.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="cs-label">Arquivo</label>
          <input type="file" accept="image/*" onchange="csLogoUpload(this,${i})" style="font-size:12px;width:100%;padding:7px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;box-sizing:border-box"/>
          <input type="hidden" id="cs_logo_${i}_data" value="${_esc(logo.data||'')}"/>
        </div>
        ${logo.data ? `
        <div style="grid-column:1/span 2">
          <div style="padding:10px;background:#F9FAFB;border-radius:8px;border:1.5px dashed #E5E7EB;display:flex;align-items:center;gap:12px">
            <img id="cs_logo_${i}_preview" src="${logo.data}" alt="" style="max-height:56px;max-width:120px;object-fit:contain;border-radius:6px"/>
            <div style="font-size:11px;color:#9CA3AF">${logo.tipo || ''}</div>
          </div>
        </div>` : `<div id="cs_logo_${i}_preview_wrap" style="display:none;grid-column:1/span 2">
          <img id="cs_logo_${i}_preview" src="" style="max-height:56px;max-width:120px;object-fit:contain;border-radius:6px"/>
        </div>`}
      </div>
    </div>`).join('')
}
function csAddLogo() {
  const arr = csGetLogos()
  const tipos = ['Logo Principal','Logo Fundo Branco','Logo Fundo Escuro','Versão Monocromática','Favicon','Outro']
  arr.push({ tipo: tipos[arr.length] || 'Outro', data:'' })
  csRenderLogos(arr)
}
function csRemoveLogo(i) {
  const arr = csGetLogos()
  arr.splice(i, 1)
  csRenderLogos(arr)
}
function csGetLogos() {
  const arr = []
  let i = 0
  while (document.getElementById(`cs_logo_wrap_${i}`)) {
    arr.push({
      tipo: document.getElementById(`cs_logo_${i}_tipo`)?.value || '',
      data: document.getElementById(`cs_logo_${i}_data`)?.value || '',
    })
    i++
  }
  return arr.filter(l => l.data || l.tipo)
}
function csUpdateLogoLabel(i) {
  const tipo = document.getElementById(`cs_logo_${i}_tipo`)?.value || ''
  const hdr = document.querySelector(`#cs_logo_wrap_${i} .cs-repeater-label`)
  if (hdr) hdr.textContent = tipo || `Logo #${i+1}`
}
function csLogoUpload(input, i) {
  const file = input.files[0]
  if (!file) return
  if (file.size > 3 * 1024 * 1024) { if (window._showToast) _showToast('Atenção', 'Arquivo muito grande. Maximo 3MB.', 'warn'); else alert('Arquivo muito grande. Maximo 3MB.'); input.value = ''; return }
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX = 512
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX }
        else        { w = Math.round(w * MAX / h); h = MAX }
      }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const data = canvas.toDataURL('image/png', 0.85)
      const dataEl = document.getElementById(`cs_logo_${i}_data`)
      if (dataEl) dataEl.value = data
      // Show preview
      const wrap = document.getElementById(`cs_logo_${i}_preview_wrap`)
      const prev = document.getElementById(`cs_logo_${i}_preview`)
      if (prev) { prev.src = data; if (wrap) wrap.style.display = 'block' }
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}
window.csAddLogo         = csAddLogo
window.csRemoveLogo      = csRemoveLogo
window.csUpdateLogoLabel = csUpdateLogoLabel
window.csLogoUpload      = csLogoUpload

// ── Helper: escape HTML values ───────────────────────────────
function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;') }

function previewClinicLogo() {
  const url  = document.getElementById('sc_logo_url')?.value?.trim()
  const wrap = document.getElementById('sc_logo_preview_wrap')
  const img  = document.getElementById('sc_logo_preview_img')
  if (!wrap || !img) return
  if (url) { img.src = url; wrap.style.display = 'block' }
  else     { wrap.style.display = 'none' }
}
window.previewClinicLogo = previewClinicLogo

const DIAS_SEMANA = [
  { key:'seg', label:'Segunda' },
  { key:'ter', label:'Terça'  },
  { key:'qua', label:'Quarta' },
  { key:'qui', label:'Quinta' },
  { key:'sex', label:'Sexta'  },
  { key:'sab', label:'Sábado' },
  { key:'dom', label:'Domingo'},
]

function renderHorariosGrid(horarios = {}) {
  const grid = document.getElementById('horariosGrid')
  if (!grid) return
  grid.innerHTML = DIAS_SEMANA.map(d => {
    const h = horarios[d.key] || {
      aberto: d.key !== 'dom',
      manha: { ativo: true, inicio: '08:30', fim: '12:00' },
      tarde: { ativo: true, inicio: '13:30', fim: '18:00' },
    }
    // Retrocompatibilidade com formato antigo (abertura/fechamento)
    if (!h.manha) h.manha = { ativo: true,  inicio: h.abertura || '08:30', fim: '12:00' }
    if (!h.tarde) h.tarde = { ativo: !!h.abertura, inicio: '13:30', fim: h.fechamento || '18:00' }

    const inputStyle = 'padding:5px 7px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:12px;outline:none;color:#374151;width:84px'
    const sepStyle   = 'font-size:11px;color:#C4C9D4'
    const tagStyle   = (color) => `font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.05em;background:${color}18;padding:2px 7px;border-radius:10px`
    const btnDel     = (dia, periodo) =>
      `<button onclick="toggleHorarioPeriodo('${dia}','${periodo}')" id="sc_h_${dia}_${periodo}_btn"
        title="Remover período" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border:1.5px solid #FECACA;border-radius:5px;background:#FEF2F2;color:#EF4444;cursor:pointer;font-size:13px;line-height:1;flex-shrink:0">×</button>`
    const btnAdd     = (dia, periodo, label, color) =>
      `<button onclick="toggleHorarioPeriodo('${dia}','${periodo}')" id="sc_h_${dia}_${periodo}_btn"
        title="Adicionar período" style="display:flex;align-items:center;gap:5px;padding:4px 10px;border:1.5px dashed ${color}55;border-radius:7px;background:transparent;color:${color};cursor:pointer;font-size:11px;font-weight:600">+ ${label}</button>`

    const manhaAtivo = h.manha.ativo !== false
    const tardeAtivo = h.tarde.ativo !== false

    return `
    <div id="sc_h_${d.key}_container" style="border:1px solid #F3F4F6;border-radius:9px;padding:10px 14px;background:${h.aberto?'#fff':'#F9FAFB'}">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;min-width:96px">
          <input type="checkbox" id="sc_h_${d.key}_open" ${h.aberto?'checked':''}
            onchange="toggleDiaHorario('${d.key}',this.checked)"
            style="width:15px;height:15px;accent-color:#7C3AED;cursor:pointer;flex-shrink:0"/>
          <span style="font-size:13px;font-weight:${h.aberto?'600':'400'};color:${h.aberto?'#111':'#9CA3AF'}">${d.label}</span>
        </label>

        <div id="sc_h_${d.key}_range" style="display:${h.aberto?'flex':'none'};align-items:center;gap:8px;flex-wrap:wrap">
          <!-- Manhã -->
          <div id="sc_h_${d.key}_manha_wrap" style="display:${manhaAtivo?'flex':'none'};align-items:center;gap:6px">
            <span style="${tagStyle('#F59E0B')}">Manhã</span>
            <input type="time" id="sc_h_${d.key}_manha_ini" value="${h.manha.inicio}" style="${inputStyle}"/>
            <span style="${sepStyle}">–</span>
            <input type="time" id="sc_h_${d.key}_manha_fim" value="${h.manha.fim}" style="${inputStyle}"/>
            ${btnDel(d.key, 'manha')}
          </div>
          <div id="sc_h_${d.key}_manha_add" style="display:${manhaAtivo?'none':'flex'}">
            ${btnAdd(d.key, 'manha', 'Manhã', '#F59E0B')}
          </div>

          <span id="sc_h_${d.key}_sep" style="font-size:13px;color:#E5E7EB;display:${manhaAtivo&&tardeAtivo?'block':'none'}">|</span>

          <!-- Tarde -->
          <div id="sc_h_${d.key}_tarde_wrap" style="display:${tardeAtivo?'flex':'none'};align-items:center;gap:6px">
            <span style="${tagStyle('#7C3AED')}">Tarde</span>
            <input type="time" id="sc_h_${d.key}_tarde_ini" value="${h.tarde.inicio}" style="${inputStyle}"/>
            <span style="${sepStyle}">–</span>
            <input type="time" id="sc_h_${d.key}_tarde_fim" value="${h.tarde.fim}" style="${inputStyle}"/>
            ${btnDel(d.key, 'tarde')}
          </div>
          <div id="sc_h_${d.key}_tarde_add" style="display:${tardeAtivo?'none':'flex'}">
            ${btnAdd(d.key, 'tarde', 'Tarde', '#7C3AED')}
          </div>
        </div>

        <span id="sc_h_${d.key}_fechado" style="display:${h.aberto?'none':'block'};font-size:12px;color:#D1D5DB;font-style:italic">Fechado</span>

        <button id="sc_h_${d.key}_copyall" onclick="aplicarHorarioParaTodos('${d.key}')"
          title="Aplicar este horário para todos os outros dias"
          style="display:${h.aberto?'flex':'none'};align-items:center;gap:4px;margin-left:auto;padding:4px 10px;border:1.5px solid #E5E7EB;border-radius:7px;background:#F9FAFB;color:#6B7280;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Aplicar para todos
        </button>
      </div>
    </div>`
  }).join('')
}

window.toggleHorarioPeriodo = function(dia, periodo) {
  const wrap = document.getElementById(`sc_h_${dia}_${periodo}_wrap`)
  const add  = document.getElementById(`sc_h_${dia}_${periodo}_add`)
  const sep  = document.getElementById(`sc_h_${dia}_sep`)
  const ativo = wrap?.style.display !== 'none'

  if (wrap) wrap.style.display = ativo ? 'none' : 'flex'
  if (add)  add.style.display  = ativo ? 'flex' : 'none'

  // Atualiza separador: só visível quando ambos ativos
  if (sep) {
    const manhaWrap = document.getElementById(`sc_h_${dia}_manha_wrap`)
    const tardeWrap = document.getElementById(`sc_h_${dia}_tarde_wrap`)
    const ambos = manhaWrap?.style.display !== 'none' && tardeWrap?.style.display !== 'none'
    sep.style.display = ambos ? 'block' : 'none'
  }
}

window.toggleDiaHorario = function(dia, open) {
  const range     = document.getElementById(`sc_h_${dia}_range`)
  const fechado   = document.getElementById(`sc_h_${dia}_fechado`)
  const copyAll   = document.getElementById(`sc_h_${dia}_copyall`)
  const label     = document.querySelector(`#sc_h_${dia}_open + span`)
  const container = document.getElementById(`sc_h_${dia}_container`)
  if (range)     range.style.display     = open ? 'flex'  : 'none'
  if (fechado)   fechado.style.display   = open ? 'none'  : 'block'
  if (copyAll)   copyAll.style.display   = open ? 'flex'  : 'none'
  if (label)     { label.style.fontWeight = open ? '600' : '400'; label.style.color = open ? '#111' : '#9CA3AF' }
  if (container) container.style.background = open ? '#fff' : '#F9FAFB'
}

window.aplicarHorarioParaTodos = function(diaOrigem) {
  // Lê o estado atual do dia de origem
  const manhaWrap = document.getElementById(`sc_h_${diaOrigem}_manha_wrap`)
  const tardeWrap = document.getElementById(`sc_h_${diaOrigem}_tarde_wrap`)
  const manhaIni  = document.getElementById(`sc_h_${diaOrigem}_manha_ini`)?.value || '08:30'
  const manhaFim  = document.getElementById(`sc_h_${diaOrigem}_manha_fim`)?.value || '12:00'
  const tardeIni  = document.getElementById(`sc_h_${diaOrigem}_tarde_ini`)?.value || '13:30'
  const tardeFim  = document.getElementById(`sc_h_${diaOrigem}_tarde_fim`)?.value || '18:00'
  const manhaAtivo = manhaWrap?.style.display !== 'none'
  const tardeAtivo = tardeWrap?.style.display !== 'none'

  DIAS_SEMANA.forEach(d => {
    if (d.key === diaOrigem) return
    // Só aplica em dias marcados como abertos
    const open = document.getElementById(`sc_h_${d.key}_open`)?.checked
    if (!open) return

    // Manhã
    const mw  = document.getElementById(`sc_h_${d.key}_manha_wrap`)
    const mad = document.getElementById(`sc_h_${d.key}_manha_add`)
    const sep = document.getElementById(`sc_h_${d.key}_sep`)
    if (mw)  mw.style.display  = manhaAtivo ? 'flex' : 'none'
    if (mad) mad.style.display = manhaAtivo ? 'none' : 'flex'
    const mi = document.getElementById(`sc_h_${d.key}_manha_ini`)
    const mf = document.getElementById(`sc_h_${d.key}_manha_fim`)
    if (mi) mi.value = manhaIni
    if (mf) mf.value = manhaFim

    // Tarde
    const tw  = document.getElementById(`sc_h_${d.key}_tarde_wrap`)
    const tad = document.getElementById(`sc_h_${d.key}_tarde_add`)
    if (tw)  tw.style.display  = tardeAtivo ? 'flex' : 'none'
    if (tad) tad.style.display = tardeAtivo ? 'none' : 'flex'
    const ti = document.getElementById(`sc_h_${d.key}_tarde_ini`)
    const tf = document.getElementById(`sc_h_${d.key}_tarde_fim`)
    if (ti) ti.value = tardeIni
    if (tf) tf.value = tardeFim

    // Separador
    if (sep) sep.style.display = (manhaAtivo && tardeAtivo) ? 'block' : 'none'
  })

  // Feedback visual no botão
  const btn = document.getElementById(`sc_h_${diaOrigem}_copyall`)
  if (btn) {
    const orig = btn.innerHTML
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Aplicado!'
    btn.style.color = '#10B981'
    btn.style.borderColor = '#10B981'
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = '#6B7280'; btn.style.borderColor = '#E5E7EB' }, 2000)
  }
}

function getHorarios() {
  const h = {}
  DIAS_SEMANA.forEach(d => {
    const open = document.getElementById(`sc_h_${d.key}_open`)?.checked ?? false
    const manhaWrap = document.getElementById(`sc_h_${d.key}_manha_wrap`)
    const tardeWrap = document.getElementById(`sc_h_${d.key}_tarde_wrap`)
    h[d.key] = {
      aberto: open,
      manha: {
        ativo: manhaWrap ? manhaWrap.style.display !== 'none' : true,
        inicio: document.getElementById(`sc_h_${d.key}_manha_ini`)?.value || '08:30',
        fim:    document.getElementById(`sc_h_${d.key}_manha_fim`)?.value || '12:00',
      },
      tarde: {
        ativo: tardeWrap ? tardeWrap.style.display !== 'none' : true,
        inicio: document.getElementById(`sc_h_${d.key}_tarde_ini`)?.value || '13:30',
        fim:    document.getElementById(`sc_h_${d.key}_tarde_fim`)?.value || '18:00',
      },
    }
  })
  return h
}

async function loadClinicSettings() {
  // Usa o serviço (Supabase + localStorage) quando disponível,
  // senão cai direto no localStorage.
  let data
  if (window.ClinicSettingsService) {
    data = await window.ClinicSettingsService.load()
  } else {
    data = JSON.parse(localStorage.getItem(CLINIC_KEY) || '{}')
  }

  // Migração: responsável antigo (resp_nome) → responsaveis array
  if (data.resp_nome && (!data.responsaveis || !data.responsaveis.length)) {
    data.responsaveis = [{ nome: data.resp_nome, cpf: data.resp_cpf||'', nascimento: data.resp_nascimento||'', cargo: data.resp_cargo||'', tel: data.resp_tel||'', email: data.resp_email||'', conselho: data.resp_conselho||'', conselho_num: data.resp_conselho_num||'' }]
  }

  // Campos simples
  CLINIC_FIELDS.forEach(f => {
    const el = document.getElementById(`sc_${f}`)
    if (!el) return
    if (data[f] !== undefined) el.value = data[f]
  })

  // Defaults sistema
  const fusoEl = document.getElementById('sc_fuso_horario')
  if (fusoEl && !data.fuso_horario) fusoEl.value = 'America/Sao_Paulo'
  const moedaEl = document.getElementById('sc_moeda')
  if (moedaEl && !data.moeda) moedaEl.value = 'BRL'
  const fmtEl = document.getElementById('sc_formato_data')
  if (fmtEl && !data.formato_data) fmtEl.value = 'dd/MM/yyyy'

  // Toggles
  CLINIC_TOGGLES.forEach(t => {
    const cb    = document.getElementById(`sc_${t}`)
    const track = document.getElementById(`sc_${t}_track`)
    if (cb) cb.checked = !!data[t]
    if (track) track.classList.toggle('cs-toggle-on', !!data[t])
  })

  // Repeaters
  const defaultCores = [{ nome:'Primária', valor:'#7C3AED' }, { nome:'Secundária', valor:'#5B21B6' }]
  csRenderResponsaveis(data.responsaveis || [])
  csRenderCnaes(data.cnaes_secundarios || [])
  csRenderBancos(data.bancos || [])
  csRenderCores(data.cores && data.cores.length ? data.cores : defaultCores)
  csRenderLogos(data.logos || [])

  renderHorariosGrid(data.horarios || {})
  updateClinicProgress(data)
  featherIn(document.getElementById('spage_clinic'))

  // Aplica guards de permissão após renderizar
  _applyClinicPermissionGuards()
}

async function saveClinicSettings() {
  // Guard: somente admin/owner podem salvar
  if (window.ClinicSettingsService && !window.ClinicSettingsService.canEdit()) {
    _showSaveResult('Sem permissão para salvar configurações.', 'error')
    return
  }

  const data = {}

  // Campos simples
  CLINIC_FIELDS.forEach(f => {
    const el = document.getElementById(`sc_${f}`)
    if (!el) return
    const v = el.value?.trim()
    if (v) data[f] = v
    else if (['fuso_horario','moeda','formato_data'].includes(f)) data[f] = el.value
  })

  // Toggles
  CLINIC_TOGGLES.forEach(t => {
    const cb = document.getElementById(`sc_${t}`)
    if (cb) data[t] = cb.checked
  })

  // Arrays / Repeaters
  data.responsaveis      = csGetResponsaveis()
  data.cnaes_secundarios = csGetCnaes()
  data.bancos            = csGetBancos()
  data.cores             = csGetCores()
  data.logos             = csGetLogos()

  data.horarios = getHorarios()

  // Salva via serviço (Supabase + localStorage)
  if (window.ClinicSettingsService) {
    const result = await window.ClinicSettingsService.save(data)
    if (!result.ok) {
      _showSaveResult('Erro ao salvar: ' + (result.error || 'desconhecido'), 'error')
      return
    }
    if (!result.synced && result.error) {
      console.warn('[ClinicSettings] Salvo localmente, falha no Supabase:', result.error)
      _showSaveResult('Salvo neste navegador, mas falhou ao sincronizar com o servidor. Tente salvar novamente.', 'warning')
      return
    }
  } else {
    store.set(CLINIC_KEY, data)
  }

  // Deriva clinic_config para agenda-validation
  const diasAbertos = Object.values(data.horarios || {}).filter(h => h.aberto)
  if (diasAbertos.length) {
    const inicios = diasAbertos.map(h =>
      h.manha?.ativo !== false ? (h.manha?.inicio || '08:00') : (h.tarde?.inicio || '13:30')
    ).sort()
    const fins = diasAbertos.map(h =>
      h.tarde?.ativo !== false ? (h.tarde?.fim || '18:00') : (h.manha?.fim || '12:00')
    ).sort().reverse()
    store.set('clinic_config', { horarioInicio: inicios[0], horarioFim: fins[0] })
  }

  _showSaveResult()
  updateClinicProgress(data)
}

function _showSaveResult(msg, type) {
  const saved = document.getElementById('sc_saved')
  if (!saved) return
  if (type === 'error' || type === 'warning') {
    const isWarn = type === 'warning'
    saved.textContent = msg || (isWarn ? 'Salvo parcialmente' : 'Erro ao salvar')
    saved.style.background = isWarn ? '#FEF3C7' : '#FEF2F2'
    saved.style.color      = isWarn ? '#92400E' : '#DC2626'
    saved.style.display    = 'inline-flex'
    setTimeout(() => {
      saved.style.display    = 'none'
      saved.style.background = ''
      saved.style.color      = ''
      saved.textContent      = 'Salvo!'
    }, isWarn ? 6000 : 3500)
  } else {
    saved.textContent   = 'Salvo!'
    saved.style.display = 'inline-flex'
    setTimeout(() => { saved.style.display = 'none' }, 2500)
  }
}

function updateClinicProgress(data) {
  if (!data) data = JSON.parse(localStorage.getItem(CLINIC_KEY) || '{}')
  const horarios = data.horarios || {}
  const temHorario = Object.values(horarios).some(h => h.aberto)
  const profs = JSON.parse(localStorage.getItem('clinicai_professionals') || '[]')

  const checks = [
    { label: 'Nome da clínica',          done: !!data.nome },
    { label: 'Tipo de estabelecimento',  done: !!data.tipo },
    { label: 'Endereço',                 done: !!(data.rua && data.cidade) },
    { label: 'Telefone / WhatsApp',      done: !!(data.telefone || data.whatsapp) },
    { label: 'E-mail de contato',        done: !!data.email },
    { label: 'Instagram',                done: !!data.instagram },
    { label: 'Google Meu Negócio',       done: !!data.google },
    { label: 'Google Maps',              done: !!data.maps },
    { label: 'Horário de funcionamento', done: temHorario },
    { label: 'Profissional responsável', done: profs.length > 0 },
    { label: 'CNPJ',                     done: !!data.cnpj },
    { label: 'Dados bancários / PIX',    done: !!(data.banco || data.pix) },
    { label: 'Cardápio digital',         done: !!data.cardapio },
  ]

  const total = checks.length
  const done  = checks.filter(c => c.done).length
  const pct   = Math.round((done / total) * 100)

  const fill = document.getElementById('scProgressFill')
  const pctEl = document.getElementById('scProgressPct')
  const itemsEl = document.getElementById('scProgressItems')
  if (fill)   fill.style.width = pct + '%'
  if (pctEl)  pctEl.textContent = pct + '%'
  if (itemsEl) itemsEl.innerHTML = checks.map(c =>
    `<span class="sc-prog-item ${c.done?'done':'pending'}" title="${c.done?'Concluído':'Pendente'}">${c.label}</span>`
  ).join('')

  const banner = document.getElementById('scProgressBanner')
  if (banner && pct === 100) banner.style.display = 'none'
}
// ── Guards de permissão para a aba de configurações ──────────
function _applyClinicPermissionGuards() {
  const perms = window.PermissionsService
  if (!perms) return

  const canEdit      = perms.can('settings:edit')
  const canOwnerOnly = perms.can('settings:clinic-data')

  // Botões salvar: visíveis só para admin/owner
  ;['sc_save_btn', 'sc_save_btn_bottom'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.style.display = canEdit ? '' : 'none'
  })

  // Seções exclusivas do owner: nome da clínica + dados fiscais
  const ownerSections = ['cs_panel_fiscal']
  ownerSections.forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    el.style.opacity       = canOwnerOnly ? '1' : '0.5'
    el.style.pointerEvents = canOwnerOnly ? ''  : 'none'
  })

  // Campos de nome da clínica (somente owner pode editar)
  const nomeEl = document.getElementById('sc_nome')
  if (nomeEl) {
    nomeEl.readOnly = !canOwnerOnly
    if (!canOwnerOnly) {
      nomeEl.title = 'Somente o proprietário pode alterar o nome da clínica'
      nomeEl.style.background = '#F9FAFB'
    }
  }

  // Mensagem de aviso para não-admins
  const spage = document.getElementById('spage_clinic')
  if (spage && !canEdit) {
    const existing = spage.querySelector('#cs_readonly_notice')
    if (!existing) {
      const notice = document.createElement('div')
      notice.id = 'cs_readonly_notice'
      notice.style.cssText = `
        display:flex;align-items:center;gap:10px;
        background:#FFF7ED;border:1.5px solid #FED7AA;
        border-radius:10px;padding:10px 14px;margin-bottom:16px;
        font-size:13px;color:#92400E;font-weight:500`
      notice.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Você está no modo de visualização. Somente administradores podem editar as configurações.`
      spage.insertAdjacentElement('afterbegin', notice)
    }
  } else {
    document.getElementById('cs_readonly_notice')?.remove()
  }
}

window.loadClinicSettings   = loadClinicSettings
window.applyClinicSettings  = loadClinicSettings
window.saveClinicSettings   = saveClinicSettings
window.updateClinicProgress = updateClinicProgress
window.clinicSection        = clinicSection
window.csToggle             = csToggle

// ── Preview da Clínica — ícones inline (constante, não recriada) ─
const _CPV_ICONS = {
  phone:           '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.77 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.68 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.64a16 16 0 0 0 6.45 6.45l1-1.02a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  smartphone:      '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  mail:            '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  globe:           '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  instagram:       '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>',
  facebook:        '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  youtube:         '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.4a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>',
  linkedin:        '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  music:           '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  search:          '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'map-pin':       '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  clock:           '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'book-open':     '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'external-link': '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  'users':     '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'hash':      '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  'briefcase': '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
}

function _cpvIcon(icon, size = 14) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${_CPV_ICONS[icon] || ''}</svg>`
}

// Normaliza URL: adiciona https:// se não tiver protocolo (exceto mailto: e tel:)
function _cpvUrl(href) {
  if (!href) return href
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href
  return 'https://' + href
}

const _CPV_REDES = [
  { key:'instagram', icon:'instagram', label:'Instagram', href: d => `https://instagram.com/${d.replace('@','')}` },
  { key:'facebook',  icon:'facebook',  label:'Facebook',  href: d => _cpvUrl(d) },
  { key:'tiktok',    icon:'music',     label:'TikTok',    href: d => `https://tiktok.com/@${d.replace('@','')}` },
  { key:'youtube',   icon:'youtube',   label:'YouTube',   href: d => _cpvUrl(d) },
  { key:'linkedin',  icon:'linkedin',  label:'LinkedIn',  href: d => _cpvUrl(d) },
  { key:'google',    icon:'search',    label:'Google',    href: d => _cpvUrl(d) },
]

// ── Preview da Clínica ────────────────────────────────────────
function openClinicPreview() {
  const data = JSON.parse(localStorage.getItem(CLINIC_KEY) || '{}')
  const nome = data.nome || 'Clínica'
  const cores = (data.cores && data.cores.length) ? data.cores : [{nome:'Primária',valor:'#7C3AED'},{nome:'Secundária',valor:'#5B21B6'}]
  const corPrim = cores[0]?.valor || '#7C3AED'
  const corSec  = cores[1]?.valor || '#5B21B6'

  // Banner dinâmico com cor primária da marca
  const banner = document.getElementById('cpv_banner')
  if (banner) banner.style.background = `linear-gradient(135deg,${corPrim},${corSec})`

  // Logo ou avatar
  const logoImg   = document.getElementById('cpv_logo_img')
  const avatarEl  = document.getElementById('cpv_avatar')
  const logoWrap  = document.getElementById('cpv_logo_wrap')
  const logoData  = data.logos?.find(l => l.tipo === 'Logo Principal' || l.data)?.data || ''
  if (logoImg && logoData) {
    logoImg.src = logoData
    logoImg.style.display = 'block'
    if (avatarEl) avatarEl.style.display = 'none'
  } else {
    if (logoImg) logoImg.style.display = 'none'
    if (avatarEl) {
      avatarEl.style.display = 'flex'
      avatarEl.style.background = `linear-gradient(135deg,${corPrim},${corSec})`
      avatarEl.textContent = nome.charAt(0).toUpperCase()
    }
  }
  if (logoWrap) logoWrap.style.borderColor = corPrim

  setText('cpv_nome', nome)
  setText('cpv_tipo', data.tipo || '')
  setText('cpv_especialidade', data.especialidade || '')
  setText('cpv_descricao', data.descricao || '')

  // Cores da marca como swatches
  const coresWrap = document.getElementById('cpv_cores_wrap')
  const coresEl   = document.getElementById('cpv_cores')
  if (coresWrap && coresEl) {
    if (cores.length) {
      coresEl.innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center">
        ${cores.map(c => `<div title="${c.nome} — ${c.valor}" style="display:flex;align-items:center;gap:5px;background:#F9FAFB;border-radius:8px;padding:4px 10px;font-size:11px;color:#374151;border:1px solid #F3F4F6">
          <div style="width:16px;height:16px;border-radius:4px;background:${c.valor};flex-shrink:0;border:1px solid rgba(0,0,0,.08)"></div>${c.nome}
        </div>`).join('')}
      </div>`
      coresWrap.style.display = 'flex'
    } else { coresWrap.style.display = 'none' }
  }

  // Contatos
  const mkLink = (href, content) =>
    `<a href="${_cpvUrl(href)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:7px;font-size:13px;color:#374151;padding:7px 10px;background:#F9FAFB;border-radius:7px;text-decoration:none">${content}</a>`
  const ctEl = document.getElementById('cpv_contatos')
  if (ctEl) {
    const items = [
      data.telefone ? `<div style="display:flex;align-items:center;gap:7px;font-size:13px;color:#374151;padding:7px 10px;background:#F9FAFB;border-radius:7px">${_cpvIcon('phone')} ${data.telefone}</div>` : '',
      data.whatsapp ? mkLink(`https://wa.me/${data.whatsapp.replace(/\D/g,'')}`, `${_cpvIcon('smartphone')} ${data.whatsapp} <span style="font-size:10px;background:#D1FAE5;color:#065F46;padding:1px 7px;border-radius:6px;margin-left:2px">WhatsApp</span>`) : '',
      data.email    ? mkLink(`mailto:${data.email}`, `${_cpvIcon('mail')} ${data.email}`) : '',
      data.site     ? mkLink(data.site, `${_cpvIcon('globe')} ${data.site}`) : '',
      data.cardapio ? mkLink(data.cardapio, `${_cpvIcon('book-open')} Cardápio Digital`) : '',
    ].filter(Boolean)
    ctEl.innerHTML = items.join('') || '<div style="font-size:12px;color:#9CA3AF">Nenhum contato informado</div>'
  }

  // Redes Sociais
  const rdEl = document.getElementById('cpv_redes')
  if (rdEl) {
    const redes = _CPV_REDES.filter(r => data[r.key]).map(r =>
      `<a href="${r.href(data[r.key])}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:5px 10px;background:#EDE9FE;color:#7C3AED;border-radius:20px;font-weight:600;text-decoration:none">${_cpvIcon(r.icon, 12)} ${r.label}</a>`)
    rdEl.innerHTML = redes.join('') || '<span style="font-size:12px;color:#9CA3AF">Sem redes sociais</span>'
  }

  // Endereço
  const end = [data.rua, data.num, data.comp, data.bairro, data.cidade, data.estado ? `(${data.estado})` : ''].filter(Boolean).join(', ')
  const enEl = document.getElementById('cpv_endereco')
  if (enEl) {
    if (end) {
      const mapsLink = data.maps
        ? `<a href="${data.maps}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;margin-top:6px;font-size:12px;color:${corPrim};font-weight:600;text-decoration:none">${_cpvIcon('external-link',12)} Ver no Google Maps</a>`
        : ''
      enEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:${corPrim};text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${_cpvIcon('map-pin',13)} Endereço</div>
        <div style="font-size:13px;color:#374151">${end}</div>
        ${data.cep ? `<div style="font-size:11px;color:#9CA3AF;margin-top:2px">CEP: ${data.cep}</div>` : ''}
        ${mapsLink ? `<div style="margin-top:4px">${mapsLink}</div>` : ''}`
    } else {
      enEl.innerHTML = '<div style="font-size:12px;color:#9CA3AF">Endereço não informado</div>'
    }
  }

  // Horários
  const hor   = data.horarios || {}
  const horEl = document.getElementById('cpv_horarios')
  if (horEl) {
    const col  = 'font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;width:100px;text-align:center'
    const time = 'font-size:12px;color:#374151;width:100px;text-align:center'
    const off  = 'font-size:12px;color:#D1D5DB;width:100px;text-align:center'
    const rows = DIAS_SEMANA.map(d => {
      const h = hor[d.key]
      if (!h?.aberto) return `<div style="display:flex;align-items:center;padding:4px 0;border-bottom:1px solid #F9FAFB"><span style="flex:1;font-size:13px;color:#D1D5DB">${d.label}</span><span style="${off}">—</span><span style="${off}">—</span></div>`
      const ma = h.manha?.ativo !== false
      const ta = h.tarde?.ativo !== false
      return `<div style="display:flex;align-items:center;padding:4px 0;border-bottom:1px solid #F9FAFB"><span style="flex:1;font-size:13px;font-weight:500;color:#374151">${d.label}</span><span style="${ma?time:off}">${ma?`${h.manha?.inicio||'08:30'}–${h.manha?.fim||'12:00'}`:'—'}</span><span style="${ta?time:off}">${ta?`${h.tarde?.inicio||'13:30'}–${h.tarde?.fim||'18:00'}`:'—'}</span></div>`
    }).join('')
    horEl.innerHTML = `<div style="border-bottom:2px solid #F3F4F6;padding-bottom:6px;margin-bottom:4px;display:flex"><span style="flex:1;font-size:11px;font-weight:700;color:${corPrim};text-transform:uppercase;letter-spacing:.05em;display:flex;align-items:center;gap:5px">${_cpvIcon('clock',13)} Horários</span><span style="${col}">Manhã</span><span style="${col}">Tarde</span></div>${rows}`
  }

  // Responsáveis
  const respEl = document.getElementById('cpv_responsaveis')
  if (respEl) {
    const resps = data.responsaveis || []
    if (resps.length) {
      respEl.innerHTML = `<div style="background:#F9FAFB;border-radius:10px;padding:12px 14px">
        <div style="font-size:11px;font-weight:700;color:${corPrim};text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;display:flex;align-items:center;gap:5px">${_cpvIcon('users',13)} Responsáveis</div>
        ${resps.map(r => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #F3F4F6">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,${corPrim},${corSec});display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${(r.nome||'?').charAt(0).toUpperCase()}</div>
          <div><div style="font-size:13px;font-weight:600;color:#111">${r.nome||''}</div><div style="font-size:11px;color:#9CA3AF">${[r.cargo,r.conselho?`${r.conselho} ${r.conselho_num||''}`:null].filter(Boolean).join(' · ')}</div></div>
          ${r.tel ? `<div style="margin-left:auto;font-size:12px;color:#6B7280">${r.tel}</div>` : ''}
        </div>`).join('')}
      </div>`
    } else { respEl.innerHTML = '' }
  }

  // Resumo Fiscal
  const fiscalEl = document.getElementById('cpv_fiscal')
  if (fiscalEl) {
    const items = [
      data.cnpj ? `<div style="display:flex;align-items:center;gap:7px">${_cpvIcon('hash',12)}<span style="font-size:12px;color:#6B7280">CNPJ: <strong>${data.cnpj}</strong></span></div>` : '',
      data.regime_tributario ? `<div style="display:flex;align-items:center;gap:7px">${_cpvIcon('briefcase',12)}<span style="font-size:12px;color:#6B7280">Regime: <strong>${data.regime_tributario}</strong></span></div>` : '',
    ].filter(Boolean)
    fiscalEl.innerHTML = items.length ? `<div style="background:#F9FAFB;border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:6px">${items.join('')}</div>` : ''
  }

  document.getElementById('clinicPreviewModal').style.display = 'block'
  document.body.style.overflow = 'hidden'
}

function closeClinicPreview() {
  const m = document.getElementById('clinicPreviewModal')
  if (m) m.style.display = 'none'
  document.body.style.overflow = ''
}

// setText → definido em utils.js (carrega antes deste arquivo)

window.openClinicPreview  = openClinicPreview
window.closeClinicPreview = closeClinicPreview

