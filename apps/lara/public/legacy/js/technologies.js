/**
 * ClinicAI — Technologies Module (Supabase)
 * Fonte primária: Supabase via TechnologiesRepository
 * Fallback: localStorage (clinicai_technologies)
 */

const TECH_KEY      = 'clinicai_technologies'
const TECH_CATS_KEY = 'clinicai_tech_cats_custom'

const TECH_CATS_DEFAULT = [
  'Laser','Radiofrequência','Ultrassom Focalizado','LED / Fototerapia',
  'Crioterapia','Pressoterapia','Microagulhamento','Eletroestimulação',
  'Infravermelho','Plasma','Endermologia','Carboxiterapia',
]

function getTechCatsCustom()   { return JSON.parse(localStorage.getItem(TECH_CATS_KEY) || '[]') }
function saveTechCatsCustom(a) { store.set(TECH_CATS_KEY, a) }
function getAllTechCats()       { return [...TECH_CATS_DEFAULT, ...getTechCatsCustom()] }
function addTechCatCustom(n)   { const a = getTechCatsCustom(); if (!a.includes(n)) { a.push(n); saveTechCatsCustom(a) } }

// ── Cache em memória ──────────────────────────────────────────
let _technologies = []

function getTechnologies() { return _technologies }

async function _loadTechnologies() {
  if (window.TechnologiesRepository) {
    const r = await window.TechnologiesRepository.getAll()
    if (r.ok) { _technologies = r.data ?? []; return }
  }
  try { _technologies = JSON.parse(localStorage.getItem(TECH_KEY) || '[]') } catch { _technologies = [] }
}

function _populateTechCatSelect(current) {
  const sel = document.getElementById('st_categoria')
  if (!sel) return
  const cats = getAllTechCats()
  sel.innerHTML = '<option value="">Selecione...</option>' +
    cats.map(c => `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`).join('') +
    '<option value="__novo__">+ Adicionar nova...</option>'
}

// ── Render ────────────────────────────────────────────────────
async function renderTechnologiesList() {
  const list = document.getElementById('technologiesList')
  if (!list) return
  await _loadTechnologies()
  if (!_technologies.length) {
    list.innerHTML = `<div style="text-align:center;padding:48px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:14px">Nenhuma tecnologia cadastrada</div>`
    return
  }
  const techIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`
  const avatarColors = ['#0891B2','#7C3AED','#EA580C','#16A34A','#2563EB','#DC2626']
  list.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">` +
    _technologies.map((t, i) => {
      const color = avatarColors[i % avatarColors.length]
      // ops pode vir de Supabase (array de {id,nome}) ou localStorage (array de strings)
      const ops = Array.isArray(t.operadores)
        ? t.operadores.map(o => typeof o === 'object' ? o.nome : o)
        : []
      const salaNome = t.sala_nome || t.sala || ''
      return `
      <div style="background:#fff;border:1px solid #F3F4F6;border-radius:14px;padding:20px;transition:box-shadow .2s;display:flex;flex-direction:column"
           onmouseenter="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'"
           onmouseleave="this.style.boxShadow='none'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div style="display:flex;gap:12px;align-items:center">
            <div style="width:44px;height:44px;border-radius:12px;flex-shrink:0;background:linear-gradient(135deg,${color},${color}99);display:flex;align-items:center;justify-content:center;color:#fff">${techIcon}</div>
            <div>
              <div style="font-size:14px;font-weight:700;color:#111">${t.nome}</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:1px">${[t.fabricante, t.modelo].filter(Boolean).join(' · ') || t.categoria || ''}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            ${t.categoria ? `<span style="background:#F3F4F6;color:#374151;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${t.categoria}</span>` : ''}
            ${salaNome ? `<span style="background:#EDE9FE;color:#7C3AED;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600">${salaNome}</span>` : ''}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="background:#F9FAFB;border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Aquisição</div>
            <div style="font-size:12px;font-weight:600;color:#374151">${t.ano || '—'}</div>
          </div>
          <div style="background:#F9FAFB;border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Investimento</div>
            <div style="font-size:12px;font-weight:600;color:#374151">${t.investimento ? formatCurrency(t.investimento) : '—'}</div>
          </div>
        </div>
        <div style="flex:1"></div>
        ${ops.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">${ops.map(op=>`<span style="background:#F0FDF4;color:#16A34A;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">${op}</span>`).join('')}</div>` : ''}
        <div style="display:flex;gap:5px">
          <button onclick="openTechModal('${t.id || i}')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 0;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Ver
          </button>
          <button onclick="removeTechnology('${t.id || i}')" style="display:flex;align-items:center;justify-content:center;padding:6px 10px;background:none;border:1px solid #FECACA;color:#EF4444;border-radius:7px;cursor:pointer" title="Remover">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>`
    }).join('') + `</div>`
}

function techCatChange(val) {
  const wrap = document.getElementById('st_cat_novo_wrap')
  if (!wrap) return
  if (val === '__novo__') {
    wrap.style.display = 'flex'
    document.getElementById('st_cat_novo_input')?.focus()
  } else {
    wrap.style.display = 'none'
  }
  if (_techMarkDirtyFn) _techMarkDirtyFn()
}

function techCatSave() {
  const input = document.getElementById('st_cat_novo_input')
  const val = input?.value?.trim()
  if (!val) return
  addTechCatCustom(val)
  _populateTechCatSelect(val)
  const wrap = document.getElementById('st_cat_novo_wrap')
  if (wrap) wrap.style.display = 'none'
  if (input) input.value = ''
  if (_techMarkDirtyFn) _techMarkDirtyFn()
}

function techCatCancel() {
  const wrap = document.getElementById('st_cat_novo_wrap')
  if (wrap) wrap.style.display = 'none'
  const input = document.getElementById('st_cat_novo_input')
  if (input) input.value = ''
  const sel = document.getElementById('st_categoria')
  if (sel && sel.value === '__novo__') sel.value = ''
}

let _techMarkDirtyFn = null

const TECH_FIELDS = ['st_nome','st_fabricante','st_modelo','st_descricao','st_ano','st_investimento','st_ponteiras']

function openTechModal(idOrIndex) {
  const modal    = document.getElementById('techModal')
  const titleEl  = document.getElementById('techModalTitle')
  const subtitleEl = document.getElementById('techModalSubtitle')
  const idxEl    = document.getElementById('st_index')
  if (!modal) return

  TECH_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  const catWrap = document.getElementById('st_cat_novo_wrap')
  if (catWrap) catWrap.style.display = 'none'

  // Popular select de salas (usa nome como value para compatibilidade)
  const salaSelect = document.getElementById('st_sala')
  const rooms = typeof getRooms === 'function' ? getRooms() : []
  if (salaSelect) {
    salaSelect.innerHTML = '<option value="">Sem sala definida</option>' +
      rooms.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('')
  }

  // Popular checkboxes de operadores
  const opsContainer = document.getElementById('st_operadores_list')
  const profs = typeof getProfessionals === 'function' ? getProfessionals() : []
  let savedOps = []

  // Encontra a tecnologia pelo id ou índice
  const t = typeof idOrIndex === 'string' && idOrIndex !== '-1' && !/^\d+$/.test(idOrIndex)
    ? _technologies.find(tech => tech.id === idOrIndex)
    : _technologies[parseInt(idOrIndex)]

  if (t) {
    document.getElementById('st_nome').value         = t.nome         || ''
    document.getElementById('st_fabricante').value   = t.fabricante   || ''
    document.getElementById('st_modelo').value       = t.modelo       || ''
    document.getElementById('st_descricao').value    = t.descricao    || ''
    document.getElementById('st_ano').value          = t.ano          || ''
    document.getElementById('st_investimento').value = t.investimento || ''
    document.getElementById('st_ponteiras').value    = t.ponteiras    || ''
    _populateTechCatSelect(t.categoria || '')
    if (salaSelect) salaSelect.value = t.sala_nome || t.sala || ''
    // Normaliza operadores: Supabase retorna [{id,nome}], localStorage retorna strings
    savedOps = (Array.isArray(t.operadores) ? t.operadores : [])
      .map(o => (typeof o === 'object' ? o.nome : o).trim())
    if (titleEl)    titleEl.textContent    = 'Ver / Editar Tecnologia'
    if (subtitleEl) subtitleEl.textContent = t.nome ? '— ' + t.nome : ''
    if (idxEl)      idxEl.value            = t.id || idOrIndex
  } else {
    _populateTechCatSelect('')
    if (titleEl)    titleEl.textContent    = 'Nova Tecnologia / Equipamento'
    if (subtitleEl) subtitleEl.textContent = ''
    if (idxEl)      idxEl.value            = '-1'
  }

  if (opsContainer) {
    if (!profs.length) {
      opsContainer.innerHTML = '<span style="font-size:12px;color:#C4C9D4;align-self:center">Cadastre profissionais na aba Equipe para selecionar operadores</span>'
    } else {
      opsContainer.innerHTML = profs.map(p => {
        const nome = p.display_name || p.nome || ''
        const checked = savedOps.includes(nome.trim())
        return `<label style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:7px;background:${checked?'#F0FDF4':'#fff'};border:1.5px solid ${checked?'#16A34A40':'#E5E7EB'};cursor:pointer;transition:all .15s">
          <input type="checkbox" value="${p.id || nome}" ${checked?'checked':''}
            onchange="this.closest('label').style.background=this.checked?'#F0FDF4':'#fff';this.closest('label').style.borderColor=this.checked?'#16A34A40':'#E5E7EB'"
            style="width:13px;height:13px;accent-color:#16A34A;cursor:pointer"/>
          <span style="font-size:12px;font-weight:600;color:#374151">${nome}</span>
        </label>`
      }).join('')
    }
  }

  const saveBtn = document.getElementById('techSaveBtn')
  if (saveBtn) saveBtn.style.display = !t ? '' : 'none'
  _techMarkDirtyFn = () => { if (saveBtn) saveBtn.style.display = '' }
  const _markDirty = _techMarkDirtyFn
  const watchIds = [...TECH_FIELDS, 'st_sala', 'st_categoria']
  watchIds.forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    el.removeEventListener('input',  _markDirty)
    el.removeEventListener('change', _markDirty)
    el.addEventListener('input',  _markDirty)
    el.addEventListener('change', _markDirty)
  })
  if (opsContainer) {
    opsContainer.removeEventListener('change', _markDirty)
    opsContainer.addEventListener('change', _markDirty)
  }

  modal.style.display = 'block'
  document.body.style.overflow = 'hidden'
}

function closeTechModal() {
  const modal = document.getElementById('techModal')
  if (modal) modal.style.display = 'none'
  document.body.style.overflow = ''
  _techMarkDirtyFn = null
}

function techModalBgClick(e) {
  if (e.target === document.getElementById('techModal')) closeTechModal()
}

function showAddTechForm(index = -1) { openTechModal(index) }
function cancelTechForm() { closeTechModal() }

async function saveTechnology() {
  const nome = document.getElementById('st_nome')?.value?.trim()
  if (!nome) { _toastWarn('Informe o nome'); return }

  const existingId = document.getElementById('st_index')?.value
  const id = (existingId && existingId !== '-1') ? existingId : null

  const catVal = document.getElementById('st_categoria')?.value?.trim()
  const categoria = (catVal === '__novo__' || !catVal) ? null : catVal
  const salaNome  = document.getElementById('st_sala')?.value || ''
  const rooms     = typeof getRooms === 'function' ? getRooms() : []
  const sala_id   = salaNome ? (rooms.find(r => r.nome === salaNome)?.id || null) : null

  // Operadores: checkboxes têm value = prof.id (Supabase) ou prof.nome (fallback)
  const checkedOps = [...(document.getElementById('st_operadores_list')?.querySelectorAll('input[type=checkbox]:checked') || [])]
    .map(cb => cb.value).filter(Boolean)

  const btn = document.getElementById('techSaveBtn')
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }

  if (window.TechnologiesRepository) {
    const r = await window.TechnologiesRepository.upsert({
      id:           id || null,
      nome,
      categoria,
      fabricante:   document.getElementById('st_fabricante')?.value?.trim()   || null,
      modelo:       document.getElementById('st_modelo')?.value?.trim()       || null,
      descricao:    document.getElementById('st_descricao')?.value?.trim()    || null,
      ano:          parseInt(document.getElementById('st_ano')?.value || '0') || null,
      investimento: parseFloat(document.getElementById('st_investimento')?.value || '0') || null,
      ponteiras:    document.getElementById('st_ponteiras')?.value?.trim()    || null,
      sala_id,
    })
    if (!r.ok) {
      _toastErr(r.error || 'Erro ao salvar tecnologia')
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar' }
      return
    }
    const techId = r.data?.id || id
    // Sincroniza operadores pela direção tecnologia → profissional
    if (techId) {
      // checkedOps pode ser UUIDs (Supabase) ou nomes (fallback)
      const isUuids = checkedOps.every(v => /^[0-9a-f-]{36}$/i.test(v))
      const profIds = isUuids ? checkedOps
        : checkedOps.map(n => (typeof getProfessionals === 'function' ? getProfessionals() : []).find(p => (p.display_name||p.nome) === n)?.id).filter(Boolean)
      await window.TechnologiesRepository.setOperadoresByTech(techId, profIds)
    }
  } else {
    // fallback localStorage
    const techs = JSON.parse(localStorage.getItem(TECH_KEY) || '[]')
    const item = {
      nome,
      fabricante:   document.getElementById('st_fabricante')?.value?.trim()   || '',
      modelo:       document.getElementById('st_modelo')?.value?.trim()       || '',
      categoria,
      descricao:    document.getElementById('st_descricao')?.value?.trim()    || '',
      ano:          parseInt(document.getElementById('st_ano')?.value || '0') || null,
      investimento: parseFloat(document.getElementById('st_investimento')?.value || '0') || 0,
      ponteiras:    document.getElementById('st_ponteiras')?.value?.trim()    || '',
      sala:         salaNome,
      operadores:   checkedOps,
    }
    if (id) {
      const idx = techs.findIndex(t => (t.id || t.nome) === id)
      if (idx >= 0) techs[idx] = { ...techs[idx], ...item }
      else techs.push(item)
    } else {
      techs.push(item)
    }
    store.set(TECH_KEY, techs)
  }

  const isNew = !id
  closeTechModal()
  renderTechnologiesList()
  _showToast(
    isNew ? 'Tecnologia cadastrada' : 'Dados salvos',
    isNew ? `${nome} adicionado ao acervo` : `${nome} atualizado com sucesso`,
    'success'
  )
}

function removeTechnology(idOrIndex) {
  const tech = _technologies.find(t => t.id === idOrIndex) || _technologies[parseInt(idOrIndex)]
  const nome = tech?.nome || 'este equipamento'
  confirmDelete(
    'Excluir Tecnologia',
    `Tem certeza que deseja excluir "${nome}"?`,
    async () => {
      if (window.TechnologiesRepository && tech?.id) {
        const r = await window.TechnologiesRepository.softDelete(tech.id)
        if (!r.ok) { _toastErr(r.error || 'Erro ao excluir'); return }
      } else {
        // fallback localStorage
        const techs = JSON.parse(localStorage.getItem(TECH_KEY) || '[]')
        const idx = typeof idOrIndex === 'number' ? idOrIndex : techs.findIndex(t => t.id === idOrIndex || t.nome === nome)
        if (idx >= 0) techs.splice(idx, 1)
        store.set(TECH_KEY, techs)
      }
      renderTechnologiesList()
    }
  )
}

window.openTechModal          = openTechModal
window.closeTechModal         = closeTechModal
window.techModalBgClick       = techModalBgClick
window.techCatChange          = techCatChange
window.techCatSave            = techCatSave
window.techCatCancel          = techCatCancel
window.showAddTechForm        = showAddTechForm
window.cancelTechForm         = cancelTechForm
window.saveTechnology         = saveTechnology
window.removeTechnology       = removeTechnology
window.renderTechnologiesList = renderTechnologiesList
window.getTechnologies        = getTechnologies
