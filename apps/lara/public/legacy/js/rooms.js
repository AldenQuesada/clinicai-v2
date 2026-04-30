/**
 * ClinicAI — Rooms Module (Supabase)
 * Fonte primária: Supabase via RoomsRepository
 * Fallback: localStorage (clinicai_rooms)
 */

const ROOMS_KEY = 'clinicai_rooms'

// ── Cache em memória ──────────────────────────────────────────
let _rooms = []

function getRooms() { return _rooms }

async function _loadRooms() {
  if (window.RoomsRepository) {
    const r = await window.RoomsRepository.getAll()
    if (r.ok) { _rooms = r.data ?? []; return }
  }
  // fallback localStorage
  try { _rooms = JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]') } catch { _rooms = [] }
}

// ── Render ────────────────────────────────────────────────────
async function renderRoomsList() {
  const list = document.getElementById('roomsList')
  if (!list) return
  await _loadRooms()
  if (!_rooms.length) {
    list.innerHTML = `<div style="text-align:center;padding:48px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:14px">Nenhuma sala cadastrada</div>`
    return
  }
  const roomIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`
  const avatarColors = ['#7C3AED','#2563EB','#16A34A','#EA580C','#0891B2','#DC2626']

  // Calcula responsaveis e aparelhos a partir dos caches dos outros módulos
  const profs = typeof getProfessionals === 'function' ? getProfessionals() : []
  const techs = typeof getTechnologies  === 'function' ? getTechnologies()  : []

  list.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">` +
    _rooms.map((r, i) => {
      const color = avatarColors[i % avatarColors.length]
      // Relacionamentos via sala_id (Supabase) ou nome (legado)
      const responsaveis = profs.filter(p => p.sala_id === r.id || p.sala === r.nome).map(p => p.display_name || p.nome).filter(Boolean)
      const aparelhos    = techs.filter(t => t.sala_id === r.id || t.sala === r.nome).map(t => t.nome).filter(Boolean)
      const respLabel = responsaveis.length ? responsaveis.join(', ') : 'Sem responsável'
      return `
      <div style="background:#fff;border:1px solid #F3F4F6;border-radius:14px;padding:20px;cursor:default;transition:box-shadow .2s"
           onmouseenter="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'"
           onmouseleave="this.style.boxShadow='none'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div style="display:flex;gap:12px;align-items:center">
            <div style="width:44px;height:44px;border-radius:12px;flex-shrink:0;background:linear-gradient(135deg,${color},${color}99);display:flex;align-items:center;justify-content:center;color:#fff">${roomIcon}</div>
            <div>
              <div style="font-size:14px;font-weight:700;color:#111">${r.nome}</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:1px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${respLabel}</div>
            </div>
          </div>
          <div style="display:flex;gap:5px">
            <button onclick="editRoom('${r.id || i}')" style="display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 12px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Ver
            </button>
            <button onclick="removeRoom('${r.id || i}')" style="display:flex;align-items:center;justify-content:center;padding:6px 10px;background:none;border:1px solid #FECACA;color:#EF4444;border-radius:7px;cursor:pointer" title="Remover">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="background:#F9FAFB;border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Aparelhos</div>
            <div style="font-size:12px;font-weight:600;color:#374151">${aparelhos.length || '—'}</div>
          </div>
          <div style="background:#F9FAFB;border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Responsáveis</div>
            <div style="font-size:12px;font-weight:600;color:#374151">${responsaveis.length || '—'}</div>
          </div>
        </div>
        ${responsaveis.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">${responsaveis.slice(0,2).map(n=>`<span style="background:#F0FDF4;color:#16A34A;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">${n}</span>`).join('')}${responsaveis.length>2?`<span style="font-size:11px;color:#9CA3AF">+${responsaveis.length-2}</span>`:''}</div>` : ''}
        ${aparelhos.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">${aparelhos.slice(0,3).map(a=>`<span style="background:#EDE9FE;color:#7C3AED;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">${a}</span>`).join('')}${aparelhos.length>3?`<span style="font-size:11px;color:#9CA3AF">+${aparelhos.length-3}</span>`:''}</div>` : ''}
        ${r.alexa_device_name ? `<div style="display:flex;align-items:center;gap:5px;margin-top:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg><span style="font-size:11px;color:#06B6D4;font-weight:600">Alexa: ${r.alexa_device_name}</span></div>` : ''}
      </div>`
    }).join('') + `</div>`
}

let _roomModalSnapshot = null

function _populateRoomResponsaveisList(selectedArr) {
  const container = document.getElementById('sr_responsaveis_list')
  if (!container) return
  const profs = typeof getProfessionals === 'function' ? getProfessionals() : []
  if (!profs.length) {
    container.innerHTML = '<span style="font-size:12px;color:#C4C9D4;align-self:center">Cadastre profissionais na aba Equipe para selecionar responsáveis</span>'
    return
  }
  const sel = selectedArr || []
  container.innerHTML = profs.map(p => {
    const nome = p.display_name || p.nome || ''
    const isChecked = sel.includes(nome) || sel.includes(p.id)
    return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;cursor:pointer;padding:5px 10px;border-radius:7px;background:${isChecked?'#F0FDF4':'#fff'};border:1.5px solid ${isChecked?'#16A34A40':'#E5E7EB'};transition:all .15s" onclick="this.style.background=this.querySelector('input').checked?'#fff':'#F0FDF4';this.style.borderColor=this.querySelector('input').checked?'#E5E7EB':'#16A34A40';_roomCheckDirty()">
      <input type="checkbox" value="${nome}" ${isChecked?'checked':''} style="accent-color:#16A34A;width:13px;height:13px"> ${nome}${p.cargo ? `<span style="font-size:10px;color:#9CA3AF;margin-left:4px">— ${p.cargo}</span>` : ''}
    </label>`
  }).join('')
}

function _populateRoomAparelhosList(selectedArr) {
  const container = document.getElementById('sr_aparelhos_list')
  if (!container) return
  const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
  if (!techs.length) {
    container.innerHTML = '<span style="font-size:12px;color:#9CA3AF;align-self:center">Cadastre tecnologias na aba Tecnologias para selecionar aqui</span>'
    return
  }
  const sel = selectedArr || []
  container.innerHTML = techs.map(t => {
    const isChecked = sel.includes(t.nome)
    return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;cursor:pointer;padding:5px 10px;border-radius:7px;background:${isChecked?'#EDE9FE':'#fff'};border:1.5px solid ${isChecked?'#7C3AED40':'#E5E7EB'};transition:all .15s" onclick="this.style.background=this.querySelector('input').checked?'#fff':'#EDE9FE';this.style.borderColor=this.querySelector('input').checked?'#E5E7EB':'#7C3AED40';_roomCheckDirty()">
      <input type="checkbox" value="${t.nome}" ${isChecked?'checked':''} style="accent-color:#7C3AED;width:13px;height:13px"> ${t.nome}
    </label>`
  }).join('')
}

function _roomGetCurrentState() {
  return JSON.stringify({
    nome: document.getElementById('sr_nome')?.value?.trim() || '',
    responsaveis: Array.from(document.querySelectorAll('#sr_responsaveis_list input[type=checkbox]:checked')).map(c=>c.value),
    aparelhos: Array.from(document.querySelectorAll('#sr_aparelhos_list input[type=checkbox]:checked')).map(c=>c.value),
    alexa_device: document.getElementById('sr_alexa_device')?.value?.trim() || ''
  })
}

function _roomCheckDirty() {
  const saveBtn = document.getElementById('roomSaveBtn')
  if (!saveBtn) return
  const isDirty = _roomModalSnapshot !== null && _roomGetCurrentState() !== _roomModalSnapshot
  saveBtn.style.display = isDirty ? 'inline-flex' : 'none'
}

function _showRoomToast(msg) {
  let toast = document.getElementById('roomToast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'roomToast'
    toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#111;color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.25);transform:translateY(-8px);opacity:0;transition:all .25s ease'
    document.body.appendChild(toast)
  }
  toast.innerHTML = `<svg width="16" height="16" fill="none" stroke="#4ADE80" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> ${msg}`
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateY(0)'
  })
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(-8px)'
  }, 3000)
}

// ── CRUD ──────────────────────────────────────────────────────
function showAddRoomForm() {
  const modal = document.getElementById('roomModal')
  if (!modal) return
  document.getElementById('roomModalTitle').textContent = 'Nova Sala'
  document.getElementById('sr_index').value = '-1'
  const nomeEl = document.getElementById('sr_nome'); if (nomeEl) nomeEl.value = ''
  const alexaEl = document.getElementById('sr_alexa_device'); if (alexaEl) alexaEl.value = ''
  _populateRoomResponsaveisList([])
  _populateRoomAparelhosList([])
  _roomModalSnapshot = null
  const saveBtn = document.getElementById('roomSaveBtn')
  if (saveBtn) saveBtn.style.display = 'inline-flex'
  modal.style.display = 'block'
}

function closeRoomModal() {
  const modal = document.getElementById('roomModal')
  if (modal) modal.style.display = 'none'
  _roomModalSnapshot = null
}

function roomModalBgClick(e) {
  if (e.target === document.getElementById('roomModal')) closeRoomModal()
}

function cancelRoomForm() { closeRoomModal() }

async function saveRoom() {
  const nome = document.getElementById('sr_nome')?.value?.trim()
  if (!nome) { _toastWarn('Informe o nome da sala'); return }

  const existingId = document.getElementById('sr_index')?.value
  const id = (existingId && existingId !== '-1') ? existingId : null
  const isNew = !id

  const btn = document.getElementById('roomSaveBtn')
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }

  const alexaDevice = document.getElementById('sr_alexa_device')?.value?.trim() || ''

  if (window.RoomsRepository) {
    const r = await window.RoomsRepository.upsert({ id, nome, alexa_device_name: alexaDevice || null })
    if (!r.ok) {
      _toastErr(r.error || 'Erro ao salvar sala')
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar' }
      return
    }
  } else {
    // fallback localStorage
    const rooms = JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]')
    const responsaveis = Array.from(document.querySelectorAll('#sr_responsaveis_list input[type=checkbox]:checked')).map(cb=>cb.value)
    const aparelhos    = Array.from(document.querySelectorAll('#sr_aparelhos_list input[type=checkbox]:checked')).map(cb=>cb.value)
    if (id) {
      const idx = rooms.findIndex(r => (r.id || r.nome) === id)
      if (idx >= 0) rooms[idx] = { ...rooms[idx], nome, responsaveis, aparelhos }
    } else {
      rooms.push({ nome, responsaveis, aparelhos })
    }
    store.set(ROOMS_KEY, rooms)
  }

  closeRoomModal()
  renderRoomsList()
  _showRoomToast(isNew ? `Sala "${nome}" criada com sucesso` : `Sala "${nome}" atualizada com sucesso`)
}

// ── Confirmação de exclusão estilizada ───────────────────────
let _deleteCallback = null
function confirmDelete(title, msg, onConfirm) {
  const modal = document.getElementById('deleteConfirmModal')
  const titleEl = document.getElementById('deleteConfirmTitle')
  const msgEl   = document.getElementById('deleteConfirmMsg')
  const btn     = document.getElementById('deleteConfirmBtn')
  if (!modal) { if (confirm(msg)) onConfirm(); return }
  titleEl.textContent = title
  msgEl.textContent   = msg
  _deleteCallback = onConfirm
  btn.onclick = () => { closeDeleteConfirm(); onConfirm() }
  modal.style.display = 'flex'
}
function closeDeleteConfirm() {
  const modal = document.getElementById('deleteConfirmModal')
  if (modal) modal.style.display = 'none'
  _deleteCallback = null
}
window.closeDeleteConfirm = closeDeleteConfirm

function removeRoom(idOrIndex) {
  // Suporte a UUID (Supabase) e índice numérico (legado)
  const room = _rooms.find(r => r.id === idOrIndex) || _rooms[parseInt(idOrIndex)]
  const nome = room?.nome || 'esta sala'
  confirmDelete(
    'Excluir Sala',
    `Tem certeza que deseja excluir "${nome}"? Os profissionais e tecnologias vinculados perderão a referência de sala.`,
    async () => {
      if (window.RoomsRepository && room?.id) {
        const res = await window.RoomsRepository.softDelete(room.id)
        if (!res.ok) { _toastErr(res.error || 'Erro ao excluir sala'); return }
      } else {
        // fallback localStorage
        const rooms = JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]')
        const idx = typeof idOrIndex === 'number' ? idOrIndex : rooms.findIndex(r => r.id === idOrIndex || r.nome === nome)
        if (idx >= 0) rooms.splice(idx, 1)
        store.set(ROOMS_KEY, rooms)
      }
      renderRoomsList()
    }
  )
}

function editRoom(idOrIndex) {
  // Suporte a UUID (Supabase) e índice numérico (legado)
  const r = _rooms.find(room => room.id === idOrIndex) || _rooms[parseInt(idOrIndex)]
  if (!r) return
  const modal = document.getElementById('roomModal')
  if (!modal) return
  document.getElementById('roomModalTitle').textContent = r.nome
  document.getElementById('sr_index').value = r.id || idOrIndex
  document.getElementById('sr_nome').value  = r.nome || ''
  var alexaEl = document.getElementById('sr_alexa_device'); if (alexaEl) alexaEl.value = r.alexa_device_name || ''
  // Responsaveis: calculados a partir do cache de professionals
  const profs = typeof getProfessionals === 'function' ? getProfessionals() : []
  const responsaveis = profs
    .filter(p => p.sala_id === r.id || p.sala === r.nome)
    .map(p => p.display_name || p.nome)
    .filter(Boolean)
  _populateRoomResponsaveisList(responsaveis)
  // Aparelhos: calculados a partir do cache de technologies
  const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
  const aparelhos = techs
    .filter(t => t.sala_id === r.id || t.sala === r.nome)
    .map(t => t.nome)
    .filter(Boolean)
  _populateRoomAparelhosList(aparelhos)
  // Esconde Salvar até haver mudança
  const saveBtn = document.getElementById('roomSaveBtn')
  if (saveBtn) saveBtn.style.display = 'none'
  setTimeout(() => { _roomModalSnapshot = _roomGetCurrentState() }, 0)
  modal.style.display = 'block'
}

window.showAddRoomForm  = showAddRoomForm
window.editRoom         = editRoom
window.cancelRoomForm   = cancelRoomForm
window.closeRoomModal   = closeRoomModal
window.roomModalBgClick = roomModalBgClick
window.saveRoom         = saveRoom
window.removeRoom       = removeRoom
window._roomCheckDirty  = _roomCheckDirty
window.renderRoomsList  = renderRoomsList
window.getRooms         = getRooms
