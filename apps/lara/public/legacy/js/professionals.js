// ── ClinicAI — Professionals Module ──
// ── Profissionais (Supabase + cache) ─────────────────────────
const PROF_KEY = 'clinicai_professionals'

let _professionals = []

// Dirty marker para profModal — declarado no topo para evitar TDZ hazard
// quando handlers sincronicamente referenciam antes do script parse chegar la embaixo.
let _profMarkDirtyFn = null

function getProfessionals() { return _professionals }

function _getProfessionalsLocal() {
  try { return JSON.parse(localStorage.getItem(PROF_KEY) || '[]') } catch { return [] }
}

async function _loadProfessionals() {
  if (window.ProfessionalsRepository) {
    const r = await window.ProfessionalsRepository.getAll()
    if (r.ok && r.data) {
      // Normaliza para compatibilidade com código legado
      _professionals = r.data.map(p => ({
        ...p,
        nome:         p.display_name || '',
        especialidade: p.specialty   || '',
        registro:     p.crm          || '',
        sala:         p.sala_nome    || '',
        aparelhos:    (p.tecnologias || []).map(t => t.nome),
        email:        '',
        role:         '',
        senha:        '',
        ativo:        p.is_active !== false,
        cep:          p.endereco?.cep    || '',
        rua:          p.endereco?.rua    || '',
        num_end:      p.endereco?.numero || '',
        comp_end:     p.endereco?.comp   || '',
        bairro_end:   p.endereco?.bairro || '',
        cidade_end:   p.endereco?.cidade || '',
        estado_end:   p.endereco?.estado || '',
      }))
      return
    }
  }
  _professionals = _getProfessionalsLocal()
}

async function renderProfessionalsList() {
  const list = document.getElementById('professionalsList')
  if (!list) return
  await _loadProfessionals()
  const profs = getProfessionals()

  // Configuração dos níveis hierárquicos — icone via feather (SVG inline), sem emoji.
  const NIVEIS = [
    { key: 'socio',       icon: 'award',  label: 'Sócios',       color: '#B45309', bg: '#FEF3C7', border: '#FCD34D', accent: '#D97706' },
    { key: 'funcionario', icon: 'users',  label: 'Funcionários', color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD', accent: '#2563EB' },
    { key: 'freela',      icon: 'link',   label: 'Freelas',      color: '#065F46', bg: '#ECFDF5', border: '#6EE7B7', accent: '#059669' },
  ]

  const avatarPalette = ['#7C3AED','#2563EB','#059669','#D97706','#DC2626','#0891B2','#7C3AED']

  // Stats de topo
  const total = profs.length
  const counts = { socio: 0, funcionario: 0, freela: 0 }
  profs.forEach(p => { const n = p.nivel || 'funcionario'; if (counts[n] !== undefined) counts[n]++ })

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:10px 18px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#374151">${total}</div>
          <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Total</div>
        </div>
        ${NIVEIS.map(n => `
        <div style="background:${n.bg};border:1px solid ${n.border};border-radius:10px;padding:10px 18px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:${n.color}">${counts[n.key]}</div>
          <div style="font-size:10px;font-weight:700;color:${n.color};opacity:.7;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">${n.label}</div>
        </div>`).join('')}
      </div>
      <button onclick="openProfModal(-1)" style="display:flex;align-items:center;gap:6px;padding:10px 18px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(124,58,237,.25)">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        Adicionar Membro
      </button>
    </div>`

  if (!total) {
    html += `<div style="text-align:center;padding:48px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:14px">
      <div style="margin-bottom:10px;display:flex;justify-content:center"><svg width="32" height="32" fill="none" stroke="#9CA3AF" stroke-width="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <div style="font-weight:600;color:#6B7280;margin-bottom:4px">Nenhum membro cadastrado</div>
      <div style="font-size:12px">Clique em "Adicionar Membro" para começar</div>
    </div>`
    list.innerHTML = html
    return
  }

  // Árvore hierárquica — um grupo por nível
  NIVEIS.forEach((nivel, nivelIdx) => {
    const membros = profs.map((p, i) => ({ ...p, _index: i })).filter(p => (p.nivel || 'funcionario') === nivel.key)
    const isFirst = nivelIdx === 0

    html += `
    <div style="margin-bottom:${nivelIdx < NIVEIS.length - 1 ? '0' : '0'}">
      <!-- Conector vertical à esquerda -->
      <div style="display:flex;gap:0">
        <!-- Linha vertical da árvore -->
        <div style="display:flex;flex-direction:column;align-items:center;width:36px;flex-shrink:0">
          ${!isFirst ? `<div style="width:2px;height:16px;background:#E5E7EB"></div>` : '<div style="height:0"></div>'}
          <div style="width:36px;height:36px;border-radius:50%;background:${nivel.bg};border:2px solid ${nivel.border};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;z-index:1">${nivel.icon}</div>
          ${membros.length ? `<div style="width:2px;flex:1;min-height:12px;background:#E5E7EB"></div>` : ''}
        </div>

        <!-- Conteúdo do nível -->
        <div style="flex:1;padding-left:14px;padding-bottom:${nivelIdx < NIVEIS.length - 1 ? '0' : '12px'}">
          <!-- Header do grupo -->
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0 14px;cursor:pointer" onclick="toggleTeamLevel('${nivel.key}')">
            <span style="font-size:15px;font-weight:700;color:${nivel.color}">${nivel.label}</span>
            <span style="background:${nivel.bg};color:${nivel.color};border:1px solid ${nivel.border};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700">${membros.length}</span>
            <svg id="team-chevron-${nivel.key}" width="14" height="14" fill="none" stroke="${nivel.color}" stroke-width="2.5" viewBox="0 0 24 24" style="transition:transform .2s;transform:${membros.length?'rotate(90deg)':'rotate(0deg)'}"><path d="M9 18l6-6-6-6"/></svg>
            <button onclick="event.stopPropagation();openProfModalWithNivel('${nivel.key}')" style="margin-left:auto;display:flex;align-items:center;gap:5px;padding:5px 12px;background:${nivel.bg};color:${nivel.color};border:1.5px solid ${nivel.border};border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">
              <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              Adicionar
            </button>
          </div>

          <!-- Grid de cards do grupo -->
          <div id="team-level-${nivel.key}" style="display:${membros.length?'grid':'none'};grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:20px">
            ${membros.map((p, localIdx) => {
              const color = avatarPalette[p._index % avatarPalette.length]
              const initials = p.nome.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
              const aparelhos = Array.isArray(p.aparelhos) ? p.aparelhos : []
              const skills = p.skills || {}
              const allSkills = [...Object.keys(skills.facial||{}), ...Object.keys(skills.corporal||{}), ...Object.keys(skills.custom||{})]
              return `
              <div style="background:#fff;border:1px solid ${nivel.border};border-left:3px solid ${nivel.accent};border-radius:12px;padding:16px;transition:box-shadow .2s;cursor:default;display:flex;flex-direction:column"
                   onmouseenter="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.10)';showTeamFlyout(event,${p._index})"
                   onmouseleave="this.style.boxShadow='none';scheduleHideTeamFlyout()"
                   onmousemove="moveTeamFlyout(event)">
                <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">
                  <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,${color},${color}99);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff">${initials}</div>
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:6px">
                      <div style="font-size:13px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0" title="${p.nome}">${p.nome}</div>
                      ${_profAccessBadge(p.invite_status)}
                    </div>
                    ${p.especialidade
                      ? `<div style="display:inline-block;margin-top:3px;background:#EDE9FE;color:#7C3AED;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">${p.especialidade}</div>`
                      : p.cargo ? `<div style="font-size:11px;color:#9CA3AF;margin-top:2px">${p.cargo}</div>` : ''}
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
                  <div style="background:#F9FAFB;border-radius:7px;padding:6px 8px">
                    <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:1px">Registro</div>
                    <div style="font-size:11px;font-weight:600;color:#374151">${p.registro || '—'}</div>
                  </div>
                  <div style="background:#F9FAFB;border-radius:7px;padding:6px 8px">
                    <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:1px">Sala</div>
                    <div style="font-size:11px;font-weight:600;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.sala || '—'}</div>
                  </div>
                </div>
                ${aparelhos.length || allSkills.length ? `
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
                  ${aparelhos.slice(0,2).map(a=>`<span style="background:#EFF6FF;color:#2563EB;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600">${a}</span>`).join('')}
                  ${aparelhos.length>2?`<span style="font-size:10px;color:#9CA3AF">+${aparelhos.length-2}</span>`:''}
                  ${allSkills.slice(0,2).map(sk=>`<span style="background:#EDE9FE;color:#7C3AED;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:500">${sk}</span>`).join('')}
                  ${allSkills.length>2?`<span style="font-size:10px;color:#9CA3AF">+${allSkills.length-2}</span>`:''}
                </div>` : ''}
                <div style="display:flex;gap:5px;margin-top:auto">
                  <button onclick="openProfModal(${p._index})" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 0;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Ver
                  </button>
                  <button onclick="event.stopPropagation();openFaturamentoModal(${p._index})" style="display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 10px;background:#F0FDF4;color:#16A34A;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer" title="Faturamento">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  </button>
                  <button onclick="removeProfessional(${p._index})" style="display:flex;align-items:center;justify-content:center;padding:6px 10px;background:none;border:1px solid #FECACA;color:#EF4444;border-radius:7px;cursor:pointer" title="Remover">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>`
            }).join('')}
          </div>

          ${!membros.length ? `<div style="color:#9CA3AF;font-size:12px;padding-bottom:20px;font-style:italic">Nenhum ${nivel.label.toLowerCase().slice(0,-1)} cadastrado</div>` : ''}
        </div>
      </div>
    </div>`
  })

  list.innerHTML = html
}

// ── Skills: dados predefinidos ────────────────────────────────
const SKILLS_ESTETICISTA = {
  facial: [
    'Limpeza de Pele Profunda','Peeling Químico','Hidratação Facial',
    'Microagulhamento Facial','LED Terapia','Drenagem Facial',
    'Massagem Facial','Radiofrequência Facial','Ultrassom Facial',
    'HIFU Facial','Dermaplaning','Crioterapia Facial'
  ],
  corporal: [
    'Drenagem Linfática','Massagem Modeladora','Criolipólise',
    'Radiofrequência Corporal','Ultrassom Cavitacional',
    'Eletroestimulação','Pressoterapia','Esfoliação Corporal',
    'Bamboo Terapia','Pedras Quentes','Endermologia'
  ]
}

// Guarda skills temporariamente durante edição no modal
let _profSkillsDraft = {}

function isEsteticista(especialidade) {
  return /estetic/i.test(especialidade || '')
}

// ── Modal: abrir / fechar ─────────────────────────────────────
function openProfModal(index) {
  const modal = document.getElementById('profModal')
  if (!modal) return

  const profFields = ['sp_nome','sp_especialidade','sp_registro','sp_cargo','sp_email','sp_invite_email',
    'sp_telefone','sp_whatsapp','sp_bio','sp_cep','sp_rua','sp_num_end',
    'sp_comp_end','sp_bairro_end','sp_cidade_end','sp_estado_end',
    'sp_contrato','sp_salario','sp_valor_consulta']
  // sp_nivel é gerenciado por profSetNivel(), não via .value direto

  // Popular select de salas
  const salaSelect = document.getElementById('sp_sala')
  if (salaSelect) {
    const rooms = typeof getRooms === 'function' ? getRooms() : []
    salaSelect.innerHTML = '<option value="">Sem sala definida</option>' +
      rooms.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('')
  }

  // Popular checkboxes de aparelhos
  const aparelhosContainer = document.getElementById('sp_aparelhos_list')
  const techs = getTechnologies()
  let savedAparelhos = []

  // Preencher datalists de especialidade e cargo
  _profFillDatalist('sp_espec_list', _getProfEspecialidades())
  _profFillDatalist('sp_cargo_list', _getProfCargos())

  const subtitleEl = document.getElementById('profModalSubtitle')

  if (index < 0) {
    document.getElementById('profModalTitle').textContent = 'Novo Membro da Equipe'
    if (subtitleEl) subtitleEl.textContent = ''
    document.getElementById('sp_edit_index').value = '-1'
    profFields.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
    const cpfEl = document.getElementById('sp_cpf'); if (cpfEl) cpfEl.value = ''
    const nascEl = document.getElementById('sp_nascimento'); if (nascEl) nascEl.value = ''
    if (salaSelect) salaSelect.value = ''
    // Novos membros aparecem na agenda por default — quem nao atende desliga
    const agendaEl = document.getElementById('sp_agenda_enabled'); if (agendaEl) agendaEl.checked = true
    profSetNivel('funcionario')
    _profSetAtivo(true)
    _profSkillsDraft = {}
    _profCommDraft = []
    _profGoalsDraft = []
  } else {
    const p = getProfessionals()[index]
    if (!p) return
    document.getElementById('profModalTitle').textContent = 'Ver / Editar Membro'
    if (subtitleEl) subtitleEl.textContent = p.nome ? '— ' + p.nome : ''
    document.getElementById('sp_edit_index').value = index
    const map = { sp_nome:'nome', sp_especialidade:'especialidade', sp_registro:'registro',
      sp_cargo:'cargo', sp_email:'email', sp_telefone:'telefone', sp_whatsapp:'whatsapp',
      sp_bio:'bio', sp_cep:'cep', sp_rua:'rua', sp_num_end:'num_end', sp_comp_end:'comp_end',
      sp_bairro_end:'bairro_end', sp_cidade_end:'cidade_end', sp_estado_end:'estado_end',
      sp_contrato:'contrato', sp_salario:'salario', sp_valor_consulta:'valor_consulta' }
    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById(id); if (el) el.value = p[key] || ''
    })
    // CPF e nascimento
    const cpfEl = document.getElementById('sp_cpf'); if (cpfEl) cpfEl.value = p.cpf || ''
    const nascEl = document.getElementById('sp_nascimento'); if (nascEl) nascEl.value = p.nascimento || ''
    if (salaSelect) salaSelect.value = p.sala_nome || p.sala || ''
    const agendaEl = document.getElementById('sp_agenda_enabled'); if (agendaEl) agendaEl.checked = p.agenda_enabled !== false
    profSetNivel(p.nivel || 'funcionario')
    _profSetAtivo(p.ativo !== false)
    savedAparelhos = Array.isArray(p.aparelhos) ? p.aparelhos : []
    _profSkillsDraft  = JSON.parse(JSON.stringify(p.skills       || {}))
    _profCommDraft    = JSON.parse(JSON.stringify(p.commissions  || []))
    _profGoalsDraft   = JSON.parse(JSON.stringify(p.goals        || []))
  }
  // Acesso ao sistema — renderiza status e bloco de convite
  _profRenderAccessTab(index)

  if (aparelhosContainer) {
    if (!techs.length) {
      aparelhosContainer.innerHTML = '<span style="font-size:12px;color:#C4C9D4;align-self:center">Cadastre tecnologias na aba Tecnologias para selecionar aqui</span>'
    } else {
      aparelhosContainer.innerHTML = techs.map(t =>
        `<label style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:7px;background:${savedAparelhos.includes(t.nome)?'#EDE9FE':'#fff'};border:1.5px solid ${savedAparelhos.includes(t.nome)?'#7C3AED40':'#E5E7EB'};cursor:pointer;transition:all .15s">
          <input type="checkbox" value="${t.nome}" ${savedAparelhos.includes(t.nome)?'checked':''}
            onchange="this.closest('label').style.background=this.checked?'#EDE9FE':'#fff';this.closest('label').style.borderColor=this.checked?'#7C3AED40':'#E5E7EB'"
            style="width:13px;height:13px;accent-color:#7C3AED;cursor:pointer"/>
          <span style="font-size:12px;font-weight:600;color:#374151">${t.nome}</span>
          ${t.sala?`<span style="font-size:10px;color:#9CA3AF">(${t.sala})</span>`:''}
        </label>`
      ).join('')
    }
  }

  profModalTab('dados')

  // Dirty tracking: para edição mostra Salvar só ao alterar; para novo, sempre visível
  const saveBtn = document.getElementById('profSaveBtn')
  if (saveBtn) saveBtn.style.display = index < 0 ? '' : 'none'
  _profMarkDirtyFn = () => { if (saveBtn) saveBtn.style.display = '' }
  const _markDirty = _profMarkDirtyFn
  const watchIds = ['sp_nome','sp_especialidade','sp_registro','sp_cargo','sp_email',
    'sp_telefone','sp_whatsapp','sp_bio','sp_cep','sp_rua','sp_num_end',
    'sp_comp_end','sp_bairro_end','sp_cidade_end','sp_estado_end',
    'sp_contrato','sp_salario','sp_valor_consulta','sp_sala',
    'sp_cpf','sp_nascimento','sp_agenda_enabled',
    // Convite / acesso
    'sp_invite_email','sp_invite_role',
    // Comissionamento: campos dinamicos do form de regra
    'prof_comm_proc','prof_comm_proc_txt','prof_comm_val','prof_comm_tipo',
    // Metas
    'prof_meta_target','prof_meta_bonus_pct','prof_meta_bonus_fixed','prof_meta_desc']
  watchIds.forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    el.removeEventListener('input',  _markDirty)
    el.removeEventListener('change', _markDirty)
    el.addEventListener('input',  _markDirty)
    el.addEventListener('change', _markDirty)
  })
  // Checkboxes de aparelhos também marcam dirty
  const aparContainerEl = document.getElementById('sp_aparelhos_list')
  if (aparContainerEl) {
    aparContainerEl.removeEventListener('change', _markDirty)
    aparContainerEl.addEventListener('change', _markDirty)
  }

  modal.style.display = 'block'
  document.body.style.overflow = 'hidden'
}

function closeProfModal() {
  const modal = document.getElementById('profModal')
  if (modal) modal.style.display = 'none'
  document.body.style.overflow = ''
  _profMarkDirtyFn = null
}

function profModalBgClick(e) {
  if (e.target === document.getElementById('profModal')) closeProfModal()
}

function profModalTab(tab) {
  const tabs = ['dados','acesso','comissao','skills']
  tabs.forEach(t => {
    const page = document.getElementById(`pmpage_${t}`)
    const btn  = document.getElementById(`pmtab_${t}`)
    if (!page || !btn) return
    const active = t === tab
    page.style.display = active ? 'block' : 'none'
    if (active) {
      btn.style.background = 'linear-gradient(135deg,#7C3AED,#5B21B6)'
      btn.style.color = '#fff'
    } else {
      btn.style.background = 'none'
      btn.style.color = '#6B7280'
    }
  })
  if (tab === 'skills')   renderSkillsContent()
  if (tab === 'comissao') _profRenderComissao()
}

function onEspecialidadeChange(val) {
  // Atualiza hint na aba skills sem re-renderizar se não estiver aberta
  const skillsPage = document.getElementById('pmpage_skills')
  if (skillsPage && skillsPage.style.display !== 'none') renderSkillsContent()
}

// ── Skills: renderizar aba ────────────────────────────────────
function renderSkillsContent() {
  const container = document.getElementById('skillsContent')
  if (!container) return
  const esp = document.getElementById('sp_especialidade')?.value || ''

  if (isEsteticista(esp)) {
    container.innerHTML = renderEsteticistaSkills()
  } else {
    container.innerHTML = renderGenericSkills()
  }
}

function renderEsteticistaSkills() {
  const facial   = _profSkillsDraft.facial   || {}
  const corporal = _profSkillsDraft.corporal || {}
  const custom   = _profSkillsDraft.custom   || {}

  const renderGroup = (label, color, key, predefined, data) => `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid ${color}20">${label}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${predefined.map(skill => {
          const checked = !!data[skill]
          return `
          <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:${checked ? color+'12' : '#F9FAFB'};border:1.5px solid ${checked ? color+'40' : '#F3F4F6'};cursor:pointer;transition:all .15s">
            <input type="checkbox" onchange="toggleProfSkill('${key}','${skill}',this.checked)"
              ${checked ? 'checked' : ''}
              style="width:15px;height:15px;accent-color:${color};cursor:pointer;flex-shrink:0"/>
            <span style="font-size:12px;font-weight:${checked?'600':'400'};color:${checked?'#111':'#6B7280'}">${skill}</span>
          </label>`
        }).join('')}
      </div>
    </div>`

  const customKeys = Object.keys(custom)

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div>
        ${renderGroup('Facial', '#7C3AED', 'facial', SKILLS_ESTETICISTA.facial, facial)}
      </div>
      <div>
        ${renderGroup('Corporal', '#3B82F6', 'corporal', SKILLS_ESTETICISTA.corporal, corporal)}
      </div>
    </div>
    ${renderCustomSkillsSection(custom)}
  `
}

function renderGenericSkills() {
  const custom = _profSkillsDraft.custom || {}
  return `
    <div style="margin-bottom:8px;font-size:12px;color:#9CA3AF">Adicione as skills deste profissional abaixo.</div>
    ${renderCustomSkillsSection(custom, true)}
  `
}

function renderCustomSkillsSection(custom, standalone = false) {
  const keys = Object.keys(custom)
  return `
    <div style="margin-top:${standalone?'0':'20px'}">
      <div style="font-size:11px;font-weight:700;color:#10B981;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #10B98120">Skills Personalizadas</div>
      ${keys.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
          ${keys.map(s => `
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;background:${custom[s]?'#ECFDF5':'#F9FAFB'};border:1.5px solid ${custom[s]?'#6EE7B740':'#E5E7EB'};border-radius:20px;font-size:12px;font-weight:500;color:${custom[s]?'#065F46':'#6B7280'}">
              <input type="checkbox" onchange="toggleProfSkill('custom','${s.replace(/'/g,"\\'")}',this.checked)"
                ${custom[s]?'checked':''} style="accent-color:#10B981;cursor:pointer"/>
              ${s}
              <button onclick="removeProfSkill('${s.replace(/'/g,"\\'")}'); event.preventDefault()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;line-height:1;padding:0;margin-left:2px" title="Remover"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </span>`).join('')}
        </div>` : ''}
      <div style="display:flex;gap:8px;align-items:center">
        <input id="newSkillInput" type="text" placeholder="Nova skill..." onkeydown="if(event.key==='Enter'){addProfSkill();event.preventDefault()}"
          style="flex:1;padding:8px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none"/>
        <button onclick="addProfSkill()" style="padding:8px 14px;background:#10B981;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">+ Adicionar</button>
      </div>
    </div>
  `
}

function toggleProfSkill(group, skill, checked) {
  if (!_profSkillsDraft[group]) _profSkillsDraft[group] = {}
  if (checked) {
    _profSkillsDraft[group][skill] = true
  } else {
    delete _profSkillsDraft[group][skill]
  }
  if (_profMarkDirtyFn) _profMarkDirtyFn()
}

function addProfSkill() {
  const input = document.getElementById('newSkillInput')
  const val = input?.value?.trim()
  if (!val) return
  if (!_profSkillsDraft.custom) _profSkillsDraft.custom = {}
  _profSkillsDraft.custom[val] = true
  if (input) input.value = ''
  if (_profMarkDirtyFn) _profMarkDirtyFn()
  renderSkillsContent()
}

function removeProfSkill(skill) {
  if (_profSkillsDraft.custom) delete _profSkillsDraft.custom[skill]
  if (_profMarkDirtyFn) _profMarkDirtyFn()
  renderSkillsContent()
}

// ── Salvar profissional ────────────────────────────────────────
async function saveProfessional() {
  const nome = document.getElementById('sp_nome')?.value?.trim()
  if (!nome) { _toastWarn('Informe o nome'); return }

  const salario        = parseFloat(document.getElementById('sp_salario')?.value) || 0
  const valorConsulta  = parseFloat(document.getElementById('sp_valor_consulta')?.value) || 0
  const editIndex = parseInt(document.getElementById('sp_edit_index')?.value ?? '-1')
  const isNew     = editIndex < 0
  const existing  = isNew ? null : getProfessionals()[editIndex]
  const oldSalario = existing?.salario || 0

  const salaNome = document.getElementById('sp_sala')?.value || ''
  const rooms    = typeof getRooms === 'function' ? getRooms() : []
  const sala_id  = salaNome ? (rooms.find(r => r.nome === salaNome)?.id || null) : null

  const checkedTechValues = [...(document.getElementById('sp_aparelhos_list')?.querySelectorAll('input[type=checkbox]:checked') || [])].map(cb => cb.value).filter(Boolean)

  if (window.ProfessionalsRepository) {
    const profPayload = {
      id:           isNew ? undefined : existing?.id,
      display_name: nome,
      specialty:    document.getElementById('sp_especialidade')?.value?.trim() || null,
      crm:          document.getElementById('sp_registro')?.value?.trim()      || null,
      color:        existing?.color || '#7C3AED',
      bio:          document.getElementById('sp_bio')?.value?.trim()           || null,
      email:        document.getElementById('sp_email')?.value?.trim()         || null,
      telefone:     document.getElementById('sp_telefone')?.value?.trim()      || null,
      whatsapp:     document.getElementById('sp_whatsapp')?.value?.trim()      || null,
      cpf:          document.getElementById('sp_cpf')?.value?.trim()           || null,
      nascimento:   document.getElementById('sp_nascimento')?.value            || null,
      endereco: {
        cep:    document.getElementById('sp_cep')?.value?.trim()      || '',
        rua:    document.getElementById('sp_rua')?.value?.trim()      || '',
        numero: document.getElementById('sp_num_end')?.value?.trim()  || '',
        comp:   document.getElementById('sp_comp_end')?.value?.trim() || '',
        bairro: document.getElementById('sp_bairro_end')?.value?.trim() || '',
        cidade: document.getElementById('sp_cidade_end')?.value?.trim() || '',
        estado: document.getElementById('sp_estado_end')?.value?.trim() || '',
      },
      contrato:       document.getElementById('sp_contrato')?.value              || null,
      salario:        salario || null,
      valor_consulta: valorConsulta || null,
      agenda_enabled: document.getElementById('sp_agenda_enabled')?.checked !== false,
      nivel:       document.getElementById('sp_nivel')?.value                 || 'funcionario',
      cargo:       document.getElementById('sp_cargo')?.value?.trim()         || null,
      commissions: JSON.parse(JSON.stringify(_profCommDraft)),
      goals:       JSON.parse(JSON.stringify(_profGoalsDraft)),
      skills:      JSON.parse(JSON.stringify(_profSkillsDraft)),
      sala_id,
    }
    const r = await window.ProfessionalsRepository.upsert(profPayload)
    if (!r.ok) { _toastErr(r.error || 'Erro ao salvar profissional'); return }

    // Sincroniza tecnologias (aparelhos)
    const profId = r.data?.id || existing?.id
    if (profId && checkedTechValues.length > 0) {
      const isUuids = checkedTechValues.every(v => /^[0-9a-f-]{36}$/i.test(v))
      const techIds = isUuids ? checkedTechValues
        : checkedTechValues.map(n => (typeof getTechnologies === 'function' ? getTechnologies() : []).find(t => t.nome === n)?.id).filter(Boolean)
      if (techIds.length) await window.ProfessionalsRepository.setOperadores(profId, techIds)
    } else if (profId) {
      await window.ProfessionalsRepository.setOperadores(profId, [])
    }
  } else {
    // fallback localStorage
    const profs = _getProfessionalsLocal()
    const data = {
      nome, nivel: document.getElementById('sp_nivel')?.value || 'funcionario',
      ativo: document.getElementById('sp_ativo')?.checked !== false,
      especialidade: document.getElementById('sp_especialidade')?.value?.trim() || '',
      registro: document.getElementById('sp_registro')?.value?.trim() || '',
      cargo: document.getElementById('sp_cargo')?.value?.trim() || '',
      contrato: document.getElementById('sp_contrato')?.value || '', salario,
      valor_consulta: valorConsulta || 0,
      agenda_enabled: document.getElementById('sp_agenda_enabled')?.checked !== false,
      cpf: document.getElementById('sp_cpf')?.value?.trim() || '',
      nascimento: document.getElementById('sp_nascimento')?.value || '',
      email: document.getElementById('sp_email')?.value?.trim() || '',
      telefone: document.getElementById('sp_telefone')?.value?.trim() || '',
      whatsapp: document.getElementById('sp_whatsapp')?.value?.trim() || '',
      bio: document.getElementById('sp_bio')?.value?.trim() || '',
      cep: document.getElementById('sp_cep')?.value?.trim() || '',
      rua: document.getElementById('sp_rua')?.value?.trim() || '',
      num_end: document.getElementById('sp_num_end')?.value?.trim() || '',
      comp_end: document.getElementById('sp_comp_end')?.value?.trim() || '',
      bairro_end: document.getElementById('sp_bairro_end')?.value?.trim() || '',
      cidade_end: document.getElementById('sp_cidade_end')?.value?.trim() || '',
      estado_end: document.getElementById('sp_estado_end')?.value?.trim() || '',
      sala: salaNome, aparelhos: checkedTechValues,
      skills: JSON.parse(JSON.stringify(_profSkillsDraft)),
      commissions: JSON.parse(JSON.stringify(_profCommDraft)),
      goals: JSON.parse(JSON.stringify(_profGoalsDraft)),
    }
    if (!isNew) profs[editIndex] = data
    else profs.push(data)
    store.set(PROF_KEY, profs)
  }

  if (salario !== oldSalario || isNew) {
    _syncProfSalarioToGastos(nome, salario, isNew ? null : existing?.nome)
  }
  closeProfModal()
  renderProfessionalsList()
  _showToast(
    isNew ? 'Membro cadastrado' : 'Dados salvos',
    isNew ? `${nome} adicionado à equipe` : `Informações de ${nome} atualizadas`,
    'success'
  )
}

function showAddProfessionalForm() { openProfModal(-1) }
function editProfessional(index)   { openProfModal(index) }

// ── Modal de Faturamento do Profissional ─────────────────────
function openFaturamentoModal(index) {
  const p = getProfessionals()[index]
  if (!p) return

  const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const now = new Date()

  // Calcula histórico dos últimos 12 meses
  const history = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()

    // Faturamento: agendamentos finalizados do profissional no mês
    // Match por id quando disponivel, fallback pra nome exato OU inclui-primeiro-nome.
    const pNomeLower = (p.nome || '').toLowerCase().trim()
    const pFirstName = pNomeLower.split(' ')[0]
    const appts = getAppointments().filter(a => {
      if (!a.date) return false
      const ad = new Date(a.date)
      if (ad.getFullYear() !== y || ad.getMonth() !== m) return false
      if (a.status !== 'finalizado' && a.status !== 'attended') return false
      // Match por id se existir
      if (p.id && (a.professional_id === p.id || a.profissional_id === p.id)) return true
      const profName = (a.professional || a.profissional || '').toLowerCase().trim()
      if (!profName) return false
      if (profName === pNomeLower) return true
      // Fallback primeiro nome — mais restritivo que includes para evitar cross-attribution
      return profName.split(' ')[0] === pFirstName
    })
    const faturamento = appts.reduce((s, a) => s + (a.procedure?.price || a.valor || a.price || 0), 0)

    // Comissao: aplica regras cadastradas por procedimento.
    // Schema canonico: { procedure, value, type }  (value = numero; type = 'percent'|'fixed')
    // Compat legado: { percent, percentual }.
    const comms = p.commissions || []
    let comissao = 0
    if (comms.length) {
      comissao = appts.reduce((sum, a) => {
        const procName = String(a.procedure?.name || a.procedure_nome || a.procedimento || '').toLowerCase().trim()
        const apptPrice = Number(a.procedure?.price || a.valor || a.price || 0)
        // Regra especifica primeiro, depois curinga __todos__, depois regra legada (sem procedure)
        let rule = comms.find(c => String(c.procedure || '').toLowerCase().trim() === procName)
        if (!rule) rule = comms.find(c => String(c.procedure || '').toLowerCase().trim() === '__todos__')
        // Legado: regras antigas sem 'procedure' + com 'percent'/'percentual'
        if (!rule) rule = comms.find(c => !c.procedure && (c.percent != null || c.percentual != null))
        if (!rule) return sum
        const rType = rule.type || (rule.percent != null || rule.percentual != null ? 'percent' : 'percent')
        const rValue = Number(rule.value != null ? rule.value : (rule.percent != null ? rule.percent : rule.percentual)) || 0
        if (rType === 'fixed') return sum + rValue
        return sum + apptPrice * (rValue / 100)
      }, 0)
    }

    history.push({
      label: `${MONTHS_PT[m]}/${String(y).slice(2)}`,
      faturamento,
      salario: parseFloat(p.salario || 0),
      comissao,
      total: parseFloat(p.salario || 0) + comissao,
    })
  }

  const maxFat = Math.max(...history.map(h => h.faturamento), 1)
  const fmtBRL = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})

  const rows = history.map(h => `
    <tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:10px 12px;font-size:12px;font-weight:600;color:#374151;white-space:nowrap">${h.label}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:6px;background:#F3F4F6;border-radius:3px;min-width:60px">
            <div style="height:6px;background:#7C3AED;border-radius:3px;width:${h.faturamento?Math.round(h.faturamento/maxFat*100):0}%"></div>
          </div>
          <span style="font-weight:600;min-width:90px;text-align:right">${h.faturamento ? fmtBRL(h.faturamento) : '<span style="color:#D1D5DB">—</span>'}</span>
        </div>
      </td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;text-align:right">${h.salario ? fmtBRL(h.salario) : '<span style="color:#D1D5DB">—</span>'}</td>
      <td style="padding:10px 12px;font-size:12px;color:#16A34A;font-weight:600;text-align:right">${h.comissao ? fmtBRL(h.comissao) : '<span style="color:#D1D5DB">—</span>'}</td>
      <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#111;text-align:right">${fmtBRL(h.total)}</td>
    </tr>`).join('')

  const totFat = history.reduce((s,h) => s+h.faturamento, 0)
  const totSal = history.reduce((s,h) => s+h.salario, 0)
  const totCom = history.reduce((s,h) => s+h.comissao, 0)
  const totTot = history.reduce((s,h) => s+h.total, 0)

  const initials = p.nome.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
  const color = ['#7C3AED','#2563EB','#16A34A','#EA580C','#DC2626','#0891B2'][p.nome.charCodeAt(0)%6]

  document.getElementById('fatModal')?.remove()
  const el = document.createElement('div')
  el.id = 'fatModal'
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px'
  el.onclick = e => { if (e.target === el) el.remove() }
  el.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:18px;width:100%;max-width:760px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.2);overflow:hidden">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid #F3F4F6;flex-shrink:0">
        <div style="display:flex;gap:12px;align-items:center">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,${color},${color}99);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:#111">${p.nome}</div>
            <div style="font-size:11px;color:#9CA3AF;margin-top:1px">${p.especialidade || p.cargo || ''} · Faturamento Mensal</div>
          </div>
        </div>
        <button onclick="document.getElementById('fatModal').remove()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;transition:background .15s" onmouseenter="this.style.background='#F3F4F6'" onmouseleave="this.style.background='none'">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Resumo -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px 24px;border-bottom:1px solid #F3F4F6;flex-shrink:0">
        <div style="background:#F9FAFB;border-radius:10px;padding:12px 14px">
          <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Faturamento 12m</div>
          <div style="font-size:16px;font-weight:700;color:#7C3AED">${fmtBRL(totFat)}</div>
        </div>
        <div style="background:#F9FAFB;border-radius:10px;padding:12px 14px">
          <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Salário acumulado</div>
          <div style="font-size:16px;font-weight:700;color:#374151">${fmtBRL(totSal)}</div>
        </div>
        <div style="background:#F0FDF4;border-radius:10px;padding:12px 14px">
          <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Comissão acumulada</div>
          <div style="font-size:16px;font-weight:700;color:#16A34A">${fmtBRL(totCom)}</div>
        </div>
      </div>

      <!-- Tabela -->
      <div style="overflow-y:auto;flex:1">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#F9FAFB;border-bottom:2px solid #F3F4F6">
              <th style="padding:10px 12px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;text-align:left">Mês</th>
              <th style="padding:10px 12px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;text-align:left">Faturamento</th>
              <th style="padding:10px 12px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;text-align:right">Salário</th>
              <th style="padding:10px 12px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;text-align:right">Comissão</th>
              <th style="padding:10px 12px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#F9FAFB;border-top:2px solid #F3F4F6">
              <td style="padding:10px 12px;font-size:11px;font-weight:700;color:#374151">Total</td>
              <td style="padding:10px 12px;font-size:11px;font-weight:700;color:#7C3AED">${fmtBRL(totFat)}</td>
              <td style="padding:10px 12px;font-size:11px;font-weight:700;color:#374151;text-align:right">${fmtBRL(totSal)}</td>
              <td style="padding:10px 12px;font-size:11px;font-weight:700;color:#16A34A;text-align:right">${fmtBRL(totCom)}</td>
              <td style="padding:10px 12px;font-size:11px;font-weight:700;color:#111;text-align:right">${fmtBRL(totTot)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`
  document.body.appendChild(el)
}
window.openFaturamentoModal = openFaturamentoModal

function toggleTeamLevel(nivelKey) {
  const el = document.getElementById(`team-level-${nivelKey}`)
  const ch = document.getElementById(`team-chevron-${nivelKey}`)
  if (!el) return
  const open = el.style.display !== 'none'
  el.style.display = open ? 'none' : 'grid'
  if (ch) ch.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)'
}

function openProfModalWithNivel(nivelKey) {
  openProfModal(-1)
  setTimeout(() => profSetNivel(nivelKey), 60)
}

// ── Nível Hierárquico — seleção visual ────────────────────────
function profSetNivel(key) {
  const CORES = {
    socio:       { border:'#FCD34D', bg:'#FEF3C7', color:'#B45309' },
    funcionario: { border:'#7C3AED', bg:'#F5F3FF', color:'#7C3AED' },
    freela:      { border:'#6EE7B7', bg:'#ECFDF5', color:'#059669' },
  }
  ;['socio','funcionario','freela'].forEach(k => {
    const el = document.getElementById(`sp_nivel_${k}`)
    if (!el) return
    const active = k === key
    const c = CORES[k]
    el.style.border      = `1.5px solid ${active ? c.border : '#E5E7EB'}`
    el.style.background  = active ? c.bg : '#fff'
    el.style.color       = active ? c.color : '#9CA3AF'
  })
  const inp = document.getElementById('sp_nivel')
  if (inp) inp.value = key
  if (_profMarkDirtyFn) _profMarkDirtyFn()
}

// ── Status Ativo/Inativo ───────────────────────────────────────
function profToggleAtivo(checked) {
  _profSetAtivo(checked)
  if (_profMarkDirtyFn) _profMarkDirtyFn()
}
function _profSetAtivo(on) {
  const cb    = document.getElementById('sp_ativo')
  const track = document.getElementById('sp_ativo_track')
  const thumb = document.getElementById('sp_ativo_thumb')
  const label = document.getElementById('sp_ativo_label')
  if (cb)    cb.checked = on
  if (track) track.style.background = on ? '#10B981' : '#D1D5DB'
  if (thumb) thumb.style.left = on ? '18px' : '2px'
  if (label) { label.textContent = on ? 'Ativo' : 'Inativo'; label.style.color = on ? '#10B981' : '#6B7280' }
}

// ── Especialidades e Cargos — datalist persistido ─────────────
const _PROF_ESPEC_KEY = 'clinicai_prof_especialidades'
const _PROF_CARGO_KEY = 'clinicai_prof_cargos'

function _getProfEspecialidades() {
  try { return JSON.parse(localStorage.getItem(_PROF_ESPEC_KEY) || '[]') } catch { return [] }
}
function _getProfCargos() {
  try { return JSON.parse(localStorage.getItem(_PROF_CARGO_KEY) || '[]') } catch { return [] }
}
function _profFillDatalist(listId, items) {
  const dl = document.getElementById(listId)
  if (!dl) return
  dl.innerHTML = items.map(v => `<option value="${v}">`).join('')
}

function profSaveEspecialidade() {
  const val = document.getElementById('sp_especialidade')?.value?.trim()
  if (!val) return
  const list = _getProfEspecialidades()
  if (!list.includes(val)) {
    list.push(val)
    store.set(_PROF_ESPEC_KEY, list)
    _profFillDatalist('sp_espec_list', list)
    _showProfToast(`Especialidade "${val}" salva`)
  }
}
function profSaveCargo() {
  const val = document.getElementById('sp_cargo')?.value?.trim()
  if (!val) return
  const list = _getProfCargos()
  if (!list.includes(val)) {
    list.push(val)
    store.set(_PROF_CARGO_KEY, list)
    _profFillDatalist('sp_cargo_list', list)
    _showProfToast(`Cargo "${val}" salvo`)
  }
}

function _showProfToast(msg) {
  const t = document.createElement('div')
  t.textContent = msg
  Object.assign(t.style, {
    position:'fixed', bottom:'80px', right:'24px', zIndex:'9999',
    padding:'10px 18px', borderRadius:'10px', fontSize:'13px', fontWeight:'600',
    color:'#fff', background:'#7C3AED', boxShadow:'0 4px 16px rgba(0,0,0,.15)', transition:'opacity .3s'
  })
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 300) }, 2000)
}

// ── Nova Tecnologia direto do modal ───────────────────────────
function profAbrirNovaTeconologia() {
  closeProfModal()
  setTimeout(() => {
    settingsTab('technologies')
    showAddTechForm()
  }, 100)
}

// ── Sincronizar salário com Gastos Fixos ─────────────────────
function _syncProfSalarioToGastos(nome, salario, oldNome) {
  const GASTO_KEY = 'clinicai_fin_gastos'
  try {
    const gastos = JSON.parse(localStorage.getItem(GASTO_KEY) || '{"fixos":[],"variaveis":[]}')
    const nomeLinha = `Salário — ${nome}`
    const nomeAntigo = oldNome ? `Salário — ${oldNome}` : null

    // Remover linha antiga (renomear ou trocar)
    if (nomeAntigo && nomeAntigo !== nomeLinha) {
      gastos.fixos = gastos.fixos.filter(g => g.nome !== nomeAntigo)
    }

    if (salario > 0) {
      const existing = gastos.fixos.find(g => g.nome === nomeLinha)
      if (existing) {
        existing.valor = salario
      } else {
        const maxId = gastos.fixos.length ? Math.max(...gastos.fixos.map(g => g.id || 0)) + 1 : 1
        gastos.fixos.push({ id: maxId, nome: nomeLinha, valor: salario })
      }
    } else {
      // Salário 0 ou vazio → remove
      gastos.fixos = gastos.fixos.filter(g => g.nome !== nomeLinha)
    }
    store.set(GASTO_KEY, gastos)
  } catch(e) { console.warn('Erro ao sincronizar gastos:', e) }
}

// ── Acesso ao Sistema (integrado com modulo Usuarios) ─────────
// Estado atual do profissional sendo editado (preenchido em _profRenderAccessTab)
let _profAccessCtx = { index: -1, prof: null }

function _profRenderAccessTab(index) {
  _profAccessCtx.index = index
  _profAccessCtx.prof  = index >= 0 ? (getProfessionals()[index] || null) : null

  const statusEl = document.getElementById('sp_access_status')
  const inviteEl = document.getElementById('sp_invite_block')
  if (!statusEl || !inviteEl) return

  // Profissional novo (nao salvo): precisa salvar primeiro antes de convidar
  if (!_profAccessCtx.prof) {
    statusEl.innerHTML = `
      <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
        <svg width="20" height="20" fill="none" stroke="#92400E" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style="font-size:13px;color:#92400E;font-weight:600">Salve o profissional primeiro para poder convida-lo como usuario.</div>
      </div>`
    inviteEl.style.display = 'none'
    return
  }

  const p = _profAccessCtx.prof
  const status = p.invite_status || 'none'

  if (status === 'active') {
    statusEl.innerHTML = `
      <div style="background:#D1FAE5;border:1px solid #A7F3D0;border-radius:12px;padding:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <svg width="20" height="20" fill="none" stroke="#059669" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
          <div style="font-size:14px;color:#065F46;font-weight:700">Usuario Ativo</div>
        </div>
        <div style="font-size:12px;color:#047857;margin-left:32px">Email: <strong>${p.user_email || p.email || '—'}</strong></div>
        <div style="font-size:12px;color:#047857;margin-left:32px">Nivel: <strong>${_profRoleLabel(p.user_role)}</strong></div>
        <div style="margin-top:12px;margin-left:32px;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" onclick="settingsTab('users');closeProfModal()" style="padding:7px 14px;background:#fff;color:#065F46;border:1.5px solid #A7F3D0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Gerenciar em Usuarios</button>
        </div>
      </div>`
    inviteEl.style.display = 'none'
    return
  }

  if (status === 'inactive') {
    statusEl.innerHTML = `
      <div style="background:#FEE2E2;border:1px solid #FECACA;border-radius:12px;padding:16px">
        <div style="display:flex;align-items:center;gap:12px">
          <svg width="20" height="20" fill="none" stroke="#B91C1C" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <div>
            <div style="font-size:14px;color:#991B1B;font-weight:700">Usuario Desativado</div>
            <div style="font-size:12px;color:#B91C1C;margin-top:2px">Reative em Configuracoes → Usuarios.</div>
          </div>
        </div>
      </div>`
    inviteEl.style.display = 'none'
    return
  }

  if (status === 'pending') {
    statusEl.innerHTML = `
      <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:16px">
        <div style="display:flex;align-items:center;gap:12px">
          <svg width="20" height="20" fill="none" stroke="#92400E" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <div>
            <div style="font-size:14px;color:#92400E;font-weight:700">Convite Pendente</div>
            <div style="font-size:12px;color:#B45309;margin-top:2px">O profissional ainda nao aceitou o convite. Gerencie em Usuarios → Convites Pendentes.</div>
          </div>
        </div>
        <div style="margin-top:12px;margin-left:32px">
          <button type="button" onclick="settingsTab('users');closeProfModal()" style="padding:7px 14px;background:#fff;color:#92400E;border:1.5px solid #FDE68A;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Ir para Usuarios</button>
        </div>
      </div>`
    inviteEl.style.display = 'none'
    return
  }

  // status === 'none' → mostra bloco de convite
  statusEl.innerHTML = `
    <div style="background:#F3F4F6;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
      <svg width="18" height="18" fill="none" stroke="#6B7280" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 1 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
      <div>
        <div style="font-size:13px;color:#374151;font-weight:700">Sem acesso ao sistema</div>
        <div style="font-size:12px;color:#6B7280;margin-top:2px">Este profissional nao tem login. Envie um convite para criar o acesso.</div>
      </div>
    </div>`
  inviteEl.style.display = 'block'

  // Pre-preenche email do profissional (se houver) no input de convite
  const emailPreenchido = p.email || document.getElementById('sp_email')?.value?.trim() || ''
  const inviteEmailInput = document.getElementById('sp_invite_email')
  if (inviteEmailInput && !inviteEmailInput.value) inviteEmailInput.value = emailPreenchido

  // Renderiza permissoes padrao para o role selecionado
  _profRenderInvitePerms()
  const roleSel = document.getElementById('sp_invite_role')
  if (roleSel) {
    roleSel.removeEventListener('change', _profRenderInvitePerms)
    roleSel.addEventListener('change', _profRenderInvitePerms)
  }

  // Reset mensagens
  const err = document.getElementById('sp_invite_err'); if (err) err.style.display = 'none'
  const ok  = document.getElementById('sp_invite_ok');  if (ok)  ok.style.display  = 'none'
}

function _profRoleLabel(role) {
  const map = { owner:'Proprietario', admin:'Administrador', therapist:'Especialista', receptionist:'Secretaria', viewer:'Visualizador' }
  return map[role] || role || '—'
}

function _profAccessBadge(status) {
  const cfg = {
    active:   { color:'#059669', bg:'#D1FAE5', border:'#A7F3D0', title:'Usuario ativo',     icon:'<path d="M20 6 9 17l-5-5"/>' },
    pending:  { color:'#B45309', bg:'#FEF3C7', border:'#FDE68A', title:'Convite pendente',  icon:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
    inactive: { color:'#B91C1C', bg:'#FEE2E2', border:'#FECACA', title:'Usuario desativado', icon:'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' },
    none:     { color:'#6B7280', bg:'#F3F4F6', border:'#E5E7EB', title:'Sem acesso ao sistema', icon:'<path d="M18 8h1a4 4 0 1 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>' },
  }
  const s = cfg[status] || cfg.none
  return `<span title="${s.title}" style="flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:${s.bg};border:1px solid ${s.border}">
    <svg width="10" height="10" fill="none" stroke="${s.color}" stroke-width="2.5" viewBox="0 0 24 24">${s.icon}</svg>
  </span>`
}

function _profRenderInvitePerms() {
  const el = document.getElementById('sp_invite_perms')
  if (!el) return
  const role = document.getElementById('sp_invite_role')?.value || 'therapist'
  const nav  = window.NAV_CONFIG || []
  if (!nav.length) {
    el.innerHTML = '<div style="font-size:12px;color:#9CA3AF">Permissoes serao aplicadas conforme o perfil.</div>'
    return
  }
  el.innerHTML = nav
    .filter(s => s.section !== 'settings')
    .map(s => {
      const sRoles = s.roles || []
      const defaultOn = sRoles.length === 0 || sRoles.indexOf(role) >= 0
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;border-bottom:1px solid #F3F4F6">
          <div style="font-size:12px;font-weight:600;color:#374151">${s.label || s.section}</div>
          <label style="position:relative;display:inline-block;width:34px;height:20px;cursor:pointer">
            <input type="checkbox" class="_sp-inv-perm" data-module="${s.section}" ${defaultOn?'checked':''} style="opacity:0;width:0;height:0"/>
            <span style="position:absolute;inset:0;background:${defaultOn?'#7C3AED':'#D1D5DB'};border-radius:20px;transition:.2s"></span>
            <span style="position:absolute;top:2px;left:${defaultOn?'16px':'2px'};width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s"></span>
          </label>
        </div>`
    }).join('')
  el.querySelectorAll('._sp-inv-perm').forEach(cb => {
    cb.addEventListener('change', function () {
      const track = this.nextElementSibling
      const thumb = track?.nextElementSibling
      if (track) track.style.background = this.checked ? '#7C3AED' : '#D1D5DB'
      if (thumb) thumb.style.left       = this.checked ? '16px'    : '2px'
    })
  })
}

async function profSendInvite() {
  const p     = _profAccessCtx.prof
  const errEl = document.getElementById('sp_invite_err')
  const okEl  = document.getElementById('sp_invite_ok')
  const btn   = document.getElementById('sp_invite_btn')
  if (!p || !p.id) {
    if (errEl) { errEl.textContent = 'Salve o profissional antes de enviar o convite.'; errEl.style.display = 'block' }
    return
  }
  if (!window.UsersRepository?.inviteProfessionalAsUser) {
    if (errEl) { errEl.textContent = 'Modulo de usuarios indisponivel.'; errEl.style.display = 'block' }
    return
  }

  const email = (document.getElementById('sp_invite_email')?.value || '').trim().toLowerCase()
  const role  = document.getElementById('sp_invite_role')?.value || 'therapist'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errEl) { errEl.textContent = 'Email invalido.'; errEl.style.display = 'block' }
    return
  }

  const perms = []
  document.querySelectorAll('._sp-inv-perm').forEach(cb => {
    perms.push({ module_id: cb.dataset.module, page_id: null, allowed: cb.checked })
  })

  if (errEl) errEl.style.display = 'none'
  if (okEl)  okEl.style.display  = 'none'
  if (btn)   { btn.disabled = true; btn.textContent = 'Enviando...' }

  const r = await window.UsersRepository.inviteProfessionalAsUser(p.id, email, role, perms)

  if (btn) { btn.disabled = false; btn.textContent = 'Enviar Convite' }

  if (!r.ok) {
    const msg = _profInviteErrorMsg(r.error)
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block' }
    return
  }

  const joinUrl = window.location.origin + '/join.html?token=' + (r.data?.raw_token || '')
  if (okEl) {
    okEl.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px">Convite gerado!</div>
      <div style="margin-bottom:8px">Envie este link para <strong>${email}</strong> (valido por 48h):</div>
      <div style="background:#fff;border:1px solid #A7F3D0;border-radius:8px;padding:8px 10px;word-break:break-all;font-family:monospace;font-size:11px;margin-bottom:8px">${joinUrl}</div>
      <button type="button" onclick="navigator.clipboard.writeText('${joinUrl}');this.textContent='Copiado!'" style="padding:6px 12px;background:#10B981;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer">Copiar Link</button>`
    okEl.style.display = 'block'
  }

  // Recarrega lista de profissionais para atualizar invite_status
  if (window.ProfessionalsRepository?.getAll) {
    const list = await window.ProfessionalsRepository.getAll()
    if (list.ok && Array.isArray(list.data)) {
      try {
        if (typeof setProfessionalsFromServer === 'function') setProfessionalsFromServer(list.data)
        else if (typeof _setProfessionalsCache === 'function') _setProfessionalsCache(list.data)
      } catch (_) {}
    }
  }
  // Re-renderiza a aba com status atualizado
  setTimeout(() => _profRenderAccessTab(_profAccessCtx.index), 300)
}

function _profInviteErrorMsg(code) {
  const msgs = {
    insufficient_permissions:    'Sem permissao para enviar convites.',
    invalid_role:                'Nivel de acesso invalido.',
    invalid_email:               'Email invalido.',
    only_owner_can_invite_admin: 'Apenas o proprietario pode convidar administradores.',
    already_member:              'Este email ja e membro ativo da clinica.',
    professional_not_found:      'Profissional nao encontrado nesta clinica.',
    professional_already_linked: 'Este profissional ja esta vinculado a um usuario.',
  }
  return msgs[code] || code || 'Erro desconhecido'
}

// ── Comissionamento no profModal ──────────────────────────────
let _profCommDraft  = []
let _profGoalsDraft = []

function _profRenderComissao() {
  const cRows = document.getElementById('profCommissionRows')
  const gRows = document.getElementById('profGoalRows')
  if (cRows) cRows.innerHTML = _profCommDraft.length
    ? _profCommDraft.map((c, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fff;border:1px solid #F3F4F6;border-radius:9px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:8px;height:8px;border-radius:50%;background:#EA580C;flex-shrink:0"></div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#111">${c.procedure==='__todos__'?'Todos os procedimentos':c.procedure}</div>
            <div style="font-size:11px;color:#9CA3AF">${c.type==='fixed'?'R$ '+c.value+' fixo':c.value+'% do valor'}</div>
          </div>
        </div>
        <button onclick="_profRemoveComissao(${i})" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px;line-height:0" title="Remover"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>`).join('')
    : '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:10px">Nenhuma comissão configurada</div>'

  if (gRows) gRows.innerHTML = _profGoalsDraft.length
    ? _profGoalsDraft.map((g, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px;margin-bottom:6px">
        <div>
          <div style="font-size:13px;font-weight:600;color:#15803D">${g.description||'Meta Mensal'}</div>
          <div style="font-size:12px;color:#16A34A;margin-top:2px">Meta: R$ ${g.target?.toLocaleString('pt-BR')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="text-align:right">
            ${g.bonusPercent?`<div style="font-size:14px;font-weight:800;color:#16A34A">${g.bonusPercent}%</div>`:''}
            ${g.bonusFixed?`<div style="font-size:13px;font-weight:700;color:#16A34A">+ R$ ${g.bonusFixed?.toLocaleString('pt-BR')}</div>`:''}
          </div>
          <button onclick="_profRemoveMeta(${i})" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px;line-height:0" title="Remover"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
      </div>`).join('')
    : '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:10px">Nenhuma meta configurada</div>'
}

function profShowAddComissao() { document.getElementById('profAddComissaoForm').style.display='block' }
function profShowAddMeta()     { document.getElementById('profAddMetaForm').style.display='block' }

function profSaveComissao() {
  const procSel = document.getElementById('prof_comm_proc')?.value
  const procTxt = document.getElementById('prof_comm_proc_txt')?.value?.trim()
  const procedure = procSel === '__outro__' ? procTxt : procSel
  const value   = parseFloat(document.getElementById('prof_comm_val')?.value || '0')
  const type    = document.getElementById('prof_comm_tipo')?.value || 'percent'
  if (!procedure || !value) { _toastWarn('Preencha procedimento e valor'); return }
  _profCommDraft.push({ procedure, value, type })
  document.getElementById('profAddComissaoForm').style.display = 'none'
  document.getElementById('prof_comm_val').value = ''
  if (_profMarkDirtyFn) _profMarkDirtyFn()
  _profRenderComissao()
}

function profSaveMeta() {
  const target     = parseFloat(document.getElementById('prof_meta_target')?.value || '0')
  const bonusPct   = parseFloat(document.getElementById('prof_meta_bonus_pct')?.value   || '0')
  const bonusFixed = parseFloat(document.getElementById('prof_meta_bonus_fixed')?.value || '0')
  const description = document.getElementById('prof_meta_desc')?.value?.trim()
  if (!target) { _toastWarn('Informe a meta mensal'); return }
  _profGoalsDraft.push({ target, bonusPercent: bonusPct||null, bonusFixed: bonusFixed||null, description: description||'' })
  document.getElementById('profAddMetaForm').style.display = 'none'
  if (_profMarkDirtyFn) _profMarkDirtyFn()
  _profRenderComissao()
}

function _profRemoveComissao(i) { _profCommDraft.splice(i,1); if (_profMarkDirtyFn) _profMarkDirtyFn(); _profRenderComissao() }
function _profRemoveMeta(i)     { _profGoalsDraft.splice(i,1); if (_profMarkDirtyFn) _profMarkDirtyFn(); _profRenderComissao() }

function removeProfessional(index) {
  const prof = getProfessionals()[index]
  const nome = prof?.nome || prof?.display_name || 'este profissional'
  confirmDelete(
    'Excluir da Equipe',
    `Tem certeza que deseja excluir "${nome}"?`,
    async () => {
      if (window.ProfessionalsRepository && prof?.id) {
        const r = await window.ProfessionalsRepository.softDelete(prof.id)
        if (!r.ok) { _toastErr(r.error || 'Erro ao excluir'); return }
      } else {
        const p = _getProfessionalsLocal()
        p.splice(index, 1)
        store.set(PROF_KEY, p)
      }
      renderProfessionalsList()
    }
  )
}

window.showAddProfessionalForm = showAddProfessionalForm
window.openProfModal           = openProfModal
window.closeProfModal          = closeProfModal
window.profModalBgClick        = profModalBgClick
window.profModalTab            = profModalTab
window.onEspecialidadeChange   = onEspecialidadeChange
window.editProfessional        = editProfessional
window.saveProfessional        = saveProfessional
window.removeProfessional      = removeProfessional
window.toggleProfSkill         = toggleProfSkill
window.addProfSkill            = addProfSkill
window.removeProfSkill         = removeProfSkill
window.toggleTeamLevel         = toggleTeamLevel
window.openProfModalWithNivel  = openProfModalWithNivel
window.showTeamFlyout          = showTeamFlyout
window.hideTeamFlyout          = hideTeamFlyout
window.moveTeamFlyout          = moveTeamFlyout
window.scheduleHideTeamFlyout  = scheduleHideTeamFlyout
window.cancelHideTeamFlyout    = cancelHideTeamFlyout
window.profSetNivel            = profSetNivel
window.profToggleAtivo         = profToggleAtivo
window.profSaveEspecialidade   = profSaveEspecialidade
window.profSaveCargo           = profSaveCargo
window.profAbrirNovaTeconologia = profAbrirNovaTeconologia
window.profShowAddComissao     = profShowAddComissao
window.profShowAddMeta         = profShowAddMeta
window.profSaveComissao        = profSaveComissao
window.profSaveMeta            = profSaveMeta
window._profRemoveComissao     = _profRemoveComissao
window._profRemoveMeta         = _profRemoveMeta
window._profRenderAccessTab    = _profRenderAccessTab
window.profSendInvite          = profSendInvite
window.renderProfessionalsList = renderProfessionalsList
window.getProfessionals        = getProfessionals

// Dirty marker declarado no topo do arquivo — referenciado por profSetNivel / profToggleAtivo

// ── Team Member Flyout (hover) ────────────────────────────────
let _teamFlyoutTimer     = null
let _teamFlyoutHideTimer = null

function showTeamFlyout(event, index) {
  clearTimeout(_teamFlyoutTimer)
  _teamFlyoutTimer = setTimeout(() => {
    const flyout = document.getElementById('teamMemberFlyout')
    if (!flyout) return
    const p = getProfessionals()[index]
    if (!p) return

    const NIVEL_CFG = {
      socio:       { icon: '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', label: 'Sócio',       color: '#B45309', bg: '#FEF3C7' },
      funcionario: { icon: '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>', label: 'Funcionário',  color: '#1D4ED8', bg: '#EFF6FF' },
      freela:      { icon: '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>', label: 'Freela',       color: '#065F46', bg: '#ECFDF5' },
    }
    const avatarPalette = ['#7C3AED','#2563EB','#059669','#D97706','#DC2626','#0891B2']
    const nCfg    = NIVEL_CFG[p.nivel || 'funcionario']
    const color   = avatarPalette[index % avatarPalette.length]
    const initials = p.nome.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
    const aparelhos = Array.isArray(p.aparelhos) ? p.aparelhos : []
    const skills  = p.skills || {}
    const allSkills = [
      ...Object.keys(skills.facial  || {}),
      ...Object.keys(skills.corporal|| {}),
      ...Object.keys(skills.custom  || {}),
    ]

    const svgIcon = (path, extra='') => `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px;color:#9CA3AF"${extra}>${path}</svg>`
    const icoEspec   = svgIcon('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>')
    const icoReg     = svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>')
    const icoSala    = svgIcon('<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>')
    const icoMail    = svgIcon('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>')
    const icoPhone   = svgIcon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.27 6.27l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>')
    const icoMsg     = svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')
    const icoPin     = svgIcon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>')

    const row = (icon, label, val) => val ? `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid #F9FAFB">
        ${icon}
        <div style="min-width:0">
          <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em">${label}</div>
          <div style="font-size:12px;font-weight:600;color:#374151;word-break:break-word">${val}</div>
        </div>
      </div>` : ''

    const endereco = [p.rua, p.num_end, p.bairro_end, p.cidade_end, p.estado_end].filter(Boolean).join(', ')

    flyout.innerHTML = `
      <!-- Header colorido -->
      <div style="background:linear-gradient(135deg,${color},${color}cc);padding:16px 18px;display:flex;align-items:center;gap:12px">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;flex-shrink:0;border:2px solid rgba(255,255,255,.4)">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">${p.cargo || p.especialidade || '—'}</div>
          <span style="display:inline-flex;align-items:center;gap:4px;margin-top:5px;background:rgba(255,255,255,.2);color:#fff;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700">${nCfg.icon} ${nCfg.label}</span>
        </div>
      </div>

      <!-- Corpo com dados -->
      <div style="padding:12px 16px;max-height:340px;overflow-y:auto">
        ${row(icoEspec,  'Especialidade',      p.especialidade)}
        ${row(icoReg,    'Registro (CRM/CRO)', p.registro)}
        ${row(icoSala,   'Sala',               p.sala)}
        ${row(icoMail,   'E-mail',             p.email)}
        ${row(icoPhone,  'Telefone',           p.telefone)}
        ${row(icoMsg,    'WhatsApp',           p.whatsapp)}
        ${p.bio ? `
        <div style="margin-top:8px;padding:8px 10px;background:#F9FAFB;border-radius:8px;font-size:11px;color:#6B7280;line-height:1.5;font-style:italic">"${p.bio}"</div>` : ''}
        ${aparelhos.length ? `
        <div style="margin-top:10px">
          <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Aparelhos</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${aparelhos.map(a=>`<span style="background:#EFF6FF;color:#2563EB;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:600">${a}</span>`).join('')}
          </div>
        </div>` : ''}
        ${allSkills.length ? `
        <div style="margin-top:10px">
          <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Skills</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${allSkills.map(sk=>`<span style="background:#EDE9FE;color:#7C3AED;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:500">${sk}</span>`).join('')}
          </div>
        </div>` : ''}
        ${endereco ? `
        <div style="margin-top:10px;display:flex;align-items:flex-start;gap:8px">
          ${icoPin}
          <div>
            <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Endereço</div>
            <div style="font-size:11px;color:#6B7280">${endereco}</div>
          </div>
        </div>` : ''}
      </div>`

    // Posicionamento: prefere à direita do cursor, ajusta se ultrapassar tela
    const margin = 14
    let left = event.clientX + margin
    let top  = event.clientY - 60

    flyout.style.display = 'block'
    requestAnimationFrame(() => {
      const fw = flyout.offsetWidth  || 300
      const fh = flyout.offsetHeight || 400
      if (left + fw > window.innerWidth  - 8) left = Math.max(8, event.clientX - fw - margin)
      if (top  + fh > window.innerHeight - 8) top  = window.innerHeight - fh - 8
      if (top < 8) top = 8
      flyout.style.left    = `${left}px`
      flyout.style.top     = `${top}px`
      flyout.style.opacity = '1'
      flyout.style.transform = 'translateY(0)'
    })
  }, 220)
}

function scheduleHideTeamFlyout() {
  clearTimeout(_teamFlyoutHideTimer)
  _teamFlyoutHideTimer = setTimeout(hideTeamFlyout, 60)
}

function cancelHideTeamFlyout() {
  clearTimeout(_teamFlyoutHideTimer)
}

function hideTeamFlyout() {
  clearTimeout(_teamFlyoutTimer)
  clearTimeout(_teamFlyoutHideTimer)
  const flyout = document.getElementById('teamMemberFlyout')
  if (!flyout) return
  flyout.style.opacity   = '0'
  flyout.style.transform = 'translateY(6px)'
  setTimeout(() => { flyout.style.display = 'none' }, 150)
}

function moveTeamFlyout(event) {
  const flyout = document.getElementById('teamMemberFlyout')
  if (!flyout || flyout.style.display === 'none' || flyout.style.opacity === '0') return
  const margin = 14
  let left = event.clientX + margin
  let top  = event.clientY - 60
  const fw = flyout.offsetWidth  || 300
  const fh = flyout.offsetHeight || 400
  if (left + fw > window.innerWidth  - 8) left = Math.max(8, event.clientX - fw - margin)
  if (top  + fh > window.innerHeight - 8) top  = window.innerHeight - fh - 8
  if (top < 8) top = 8
  flyout.style.left = `${left}px`
  flyout.style.top  = `${top}px`
}

