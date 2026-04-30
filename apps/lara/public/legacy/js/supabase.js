// ══════════════════════════════════════════════════════════════
//  ClinicAI — Supabase Sync Layer
//  Tabela: clinic_data (key TEXT PK, data JSONB, updated_at TIMESTAMPTZ)
//
//  ── SETUP INICIAL (execute no Supabase SQL Editor uma única vez) ──
//
//  CREATE TABLE IF NOT EXISTS clinic_data (
//    key        TEXT PRIMARY KEY,
//    data       JSONB NOT NULL DEFAULT '[]',
//    updated_at TIMESTAMPTZ DEFAULT NOW()
//  );
//  ALTER TABLE clinic_data ENABLE ROW LEVEL SECURITY;
//
//  ── POLÍTICA RLS ATUAL — INSEGURA (allow_all) ─────────────────
//  ⚠ A política abaixo permite acesso público total a qualquer
//    pessoa que tenha a URL + chave anon (visíveis neste arquivo).
//    Aceitável apenas para testes locais ou enquanto não houver
//    dados sensíveis em produção.
//
//  CREATE POLICY "allow_all" ON clinic_data
//    FOR ALL USING (true) WITH CHECK (true);
//
//  ── POLÍTICA RLS SEGURA — recomendada para produção ───────────
//  Usa um secret compartilhado enviado como header HTTP.
//  Apenas clientes com o header correto conseguem ler/escrever.
//
//  Passo 1 — Remova a política allow_all:
//    DROP POLICY IF EXISTS "allow_all" ON clinic_data;
//
//  Passo 2 — Crie a política segura (substitua 'SEU_SECRET_AQUI'):
//    CREATE POLICY "clinic_secret_only" ON clinic_data
//    FOR ALL
//    USING (
//      current_setting('request.headers', true)::jsonb
//        ->>'x-clinic-secret' = 'SEU_SECRET_AQUI'
//    )
//    WITH CHECK (
//      current_setting('request.headers', true)::jsonb
//        ->>'x-clinic-secret' = 'SEU_SECRET_AQUI'
//    );
//
//  Passo 3 — Defina CLINIC_SECRET abaixo com o mesmo valor.
//    O cliente enviará o header automaticamente em todas as
//    requisições ao Supabase.
//
//  Nota: o secret fica visível no código-fonte (client-side).
//  Para proteção máxima, mova as chamadas ao Supabase para o
//  backend e use a service_role key apenas no servidor.
//
//  ── CLINIC_ID — execute no Supabase SQL Editor (uma única vez) ─
//
//  Prerequisito para multi-tenant: isola os dados de cada clínica.
//  Execute APÓS criar a tabela inicial.
//
//  -- Passo 1: adicionar coluna
//  ALTER TABLE clinic_data
//    ADD COLUMN IF NOT EXISTS clinic_id TEXT NOT NULL DEFAULT 'default';
//
//  -- Passo 2: migrar dados existentes (tudo para 'default')
//  UPDATE clinic_data SET clinic_id = 'default';
//
//  -- Passo 3: substituir a PK simples pela PK composta
//  ALTER TABLE clinic_data DROP CONSTRAINT clinic_data_pkey;
//  ALTER TABLE clinic_data ADD PRIMARY KEY (clinic_id, key);
//
//  -- Passo 4: índice de performance (queries por clínica)
//  CREATE INDEX IF NOT EXISTS idx_clinic_data_clinic ON clinic_data(clinic_id);
//
//  ── RLS MULTI-TENANT (opcional — requer autenticação server-side) ─
//
//  Com a PK composta acima, cada clínica já está isolada por JS.
//  Para isolamento garantido no banco, adicione uma policy:
//
//  DROP POLICY IF EXISTS "allow_all" ON clinic_data;
//  CREATE POLICY "clinic_isolation" ON clinic_data
//    FOR ALL
//    USING (
//      clinic_id = current_setting('request.headers', true)::jsonb->>'x-clinic-id'
//    )
//    WITH CHECK (
//      clinic_id = current_setting('request.headers', true)::jsonb->>'x-clinic-id'
//    );
//
//  E configure o header x-clinic-id junto com CLINIC_SECRET (Passo 3 acima).
//
//  ── REALTIME — execute no Supabase SQL Editor (uma única vez) ─
//
//  Para que as atualizações multi-usuário funcionem, a tabela
//  precisa estar incluída na publicação de replicação:
//
//  ALTER PUBLICATION supabase_realtime ADD TABLE clinic_data;
//
//  Verifique se está ativo em:
//  Database → Replication → supabase_realtime → clinic_data ✓
// ══════════════════════════════════════════════════════════════

;(function () {
'use strict'

// Config (lê de window.ClinicEnv — centralizado em js/config/env.js)
const _env = window.ClinicEnv || {}
const SUPABASE_URL = _env.SUPABASE_URL || ''
const SUPABASE_KEY = _env.SUPABASE_KEY || ''

// ── Secret de segurança (defesa em profundidade) ──────────────
// Quando a política RLS "clinic_secret_only" estiver ativa no Supabase,
// defina aqui o mesmo valor configurado na policy SQL.
// Enquanto a policy "allow_all" estiver ativa, este valor é ignorado pelo servidor
// mas é enviado em todos os requests (preparando a transição).
//
// ⚠ Para ativar: substitua null pela string do seu secret e aplique o SQL do cabeçalho.
//   Exemplo: const CLINIC_SECRET = 'minha-clinica-secret-2026'
const CLINIC_SECRET = '0b6e63c7c320a5211d9bea3145416b33b0cc070de170ebe05c07d0b8914ab5fa'

// Chaves do localStorage que devem ser sincronizadas
// ⚠ NÃO incluir: tokens de auth, senhas, dados de sessão, perfis dinâmicos
// ⚠ Ao adicionar store.set() em um novo módulo, adicione a chave aqui também
const SYNC_KEYS = [
  // ── Cadastros base (crítico para validações de conflito) ──────
  'clinicai_professionals',         // profissionais (conflict check, agendamento)
  'clinicai_rooms',                 // salas (conflict check, agendamento)
  'clinicai_technologies',          // equipamentos/tecnologias (vinculados a salas e profissionais)
  'clinicai_tech_cats_custom',      // categorias de tecnologia customizadas
  // 'clinicai_leads' — DEPRECADO Sprint 6-B: migrado para tabela `leads` com RLS própria.
  //   Sync agora é exclusivo via LeadsService.syncOne() / syncBatch().
  //   Mantido no localStorage como cache local; não mais escrito em clinic_data.
  'clinicai_clinic_settings',       // configurações da clínica (nome, horários)
  'clinic_config',                  // configuração de horário de funcionamento

  // ── Profissionais — dados complementares ──────────────────────
  'clinicai_prof_especialidades',   // lista de especialidades customizadas
  'clinicai_prof_cargos',           // lista de cargos customizados
  'clinicai_team_functions',        // lista de funções/cargos customizados da equipe
  'clinicai_team_profiles',         // perfis de RH da equipe (CPF, contrato, comissões, metas, horários)

  // ── Injetáveis ────────────────────────────────────────────────
  'clinic_injetaveis',
  'clinic_inj_protocolos',
  'clinic_inj_precificacao',
  'clinic_inj_cats_custom',
  'clinic_inj_fabs_custom',
  'clinic_inj_tpl_custom',
  'clinic_inj_repo_data',           // repositório de referência de injetáveis

  // ── Procedimentos e Tarefas ───────────────────────────────────
  'clinic_procedimentos',
  'clinic_tasks',
  'clinic_op_tasks',                // tarefas operacionais (no-show tasks, etc.)
  'clinicai_tasks_v2',              // sistema de tarefas v2

  // ── WhatsApp ──────────────────────────────────────────────────
  'clinic_wa_links',
  'clinic_wpp_fila',                // fila de mensagens WA enviadas
  'clinicai_wa_messages',           // mensagens WA disparadas
  'clinicai_wa_numbers',            // números WA configurados
  'clinicai_wa_history',            // histórico WA para auditoria

  // ── Financeiro ────────────────────────────────────────────────
  'clinic_financeiro',
  'clinic_fin_goals',
  'clinicai_fin_meta',
  'clinicai_fin_gastos',
  'clinicai_fin_procs',
  'clinicai_fin_demo',
  'clinicai_fin_plan',              // planejamento financeiro

  // ── SDR ───────────────────────────────────────────────────────
  'clinicai_sdr_config',            // configuração do funil SDR

  // ── Mensagens e Alertas ───────────────────────────────────────
  'clinic_agenda_mensagens',

  // ── Tags v1 (legado) ──────────────────────────────────────────
  'clinic_tags',
  'clinic_tags_config',

  // ── Tags v2 — engine completa ─────────────────────────────────
  'clinic_tag_groups',
  'clinic_tags_v2',
  'clinic_tmpl_msg',
  'clinic_tmpl_alert',
  'clinic_tmpl_task',
  'clinic_tag_flows',
  'clinic_budget_objections',
  'clinic_internal_alerts',
  'clinic_tag_history',
  'clinic_auto_logs',               // logs do engine de tags
  'clinic_entity_tags',
  'clinic_budgets',
  'clinic_tag_groups_v2',

  // ── Agenda Smart (fluxo automático) ───────────────────────────
  // 'clinicai_appointments' — DEPRECADO Sprint 6-A: migrado para tabela `appointments` com RLS própria.
  //   Sync agora é exclusivo via AppointmentsService.syncOne() / syncBatch().
  //   Mantido no localStorage como cache local; não mais escrito em clinic_data.
  'clinicai_automations_queue',     // fila de automações D-1, 08h, 30min, 10min
  'clinicai_auto_logs',             // log de automações disparadas
  'clinicai_agenda_events',         // bloqueios, feriados, campanhas, cursos
]

// ── Realtime: chaves críticas para sync multi-usuário ────────
//
// Subconjunto de SYNC_KEYS que justifica WebSocket ativo:
//   • Dados que múltiplos usuários simultâneos podem alterar
//   • Dados que afetam validações de conflito em tempo real
//   • NÃO incluir: dados pessoais de sessão, configurações raras
//
const REALTIME_KEYS = new Set([
  // 'clinicai_appointments' — DEPRECADO Sprint 6-A: Realtime via tabela `appointments` (Supabase Realtime nativo).
  // 'clinicai_leads'        — DEPRECADO Sprint 6-B: Realtime via tabela `leads` (Supabase Realtime nativo).
  'clinicai_automations_queue',     // fila de automações — coordenação
  'clinicai_agenda_events',         // bloqueios/feriados — conflict check
  'clinicai_professionals',         // profissionais — conflict check
  'clinicai_team_profiles',         // perfis de RH — compartilhado entre gestores
  'clinicai_rooms',                 // salas — conflict check
  'clinicai_technologies',          // equipamentos — compartilhado (operadores, salas)
  'clinic_injetaveis',              // estoque de injetáveis
  'clinic_inj_protocolos',          // protocolos compartilhados
  'clinic_procedimentos',           // procedimentos — compartilhado
  'clinic_op_tasks',                // tarefas operacionais — multi-usuário
  'clinicai_tasks_v2',              // tarefas gerais — multi-usuário
  'clinicai_clinic_settings',       // configurações — alterar um reflete em todos
])

// Janela anti-feedback: eventos Realtime que chegam dentro deste
// intervalo da nossa última gravação local são ignorados — são
// reflexos do nosso próprio store.set(), não de outro usuário.
const FEEDBACK_WINDOW_MS = 3_000

// ── Tenant: identidade da clínica ────────────────────────────
//
// Retorna o clinic_id do usuário autenticado.
// Prioridade: user.tenant.id → user.tenant.slug → 'default'
//
// Fallback 'default' garante que o sistema funcione antes do
// login (page load inicial) e em modo de desenvolvimento.
//
// ⚠ Chamada dinâmica (não cacheada) — reflete mudanças de sessão.
//
function _getClinicId() {
  try {
    if (typeof getUser !== 'function') return 'default'
    const user = getUser()
    return (
      user?.tenant?.id   ||
      user?.tenant?.slug ||
      'default'
    )
  } catch {
    return 'default'
  }
}

// ── Client ───────────────────────────────────────────────────
let _sb = null

function _client() {
  if (_sb) return _sb
  if (window.supabase?.createClient) {
    // Monta headers de segurança:
    //   x-clinic-secret — defesa em profundidade (RLS policy)
    //   x-clinic-id     — tenant header para RLS multi-tenant (quando ativado)
    const headers = {}
    if (CLINIC_SECRET) headers['x-clinic-secret'] = CLINIC_SECRET
    const cid = _getClinicId()
    if (cid !== 'default') headers['x-clinic-id'] = cid
    const opts = Object.keys(headers).length
      ? { global: { headers } }
      : {}
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, opts)
    return _sb
  }
  console.warn('ClinicAI: Supabase SDK não carregado.')
  return null
}

// Descarta o singleton do cliente — necessário após login/logout
// para que as credenciais de tenant sejam reaplicadas nos headers.
function _resetClient() {
  _sb = null
}

// ── Auditoria de segurança (executa uma vez na inicialização) ─
function _securityAudit() {
  const issues = []

  // 1. HTTPS — dados médicos/financeiros nunca devem trafegar sem TLS
  const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname)
  if (!isLocal && location.protocol !== 'https:') {
    issues.push(
      'CRÍTICO: App servido em HTTP. Dados da clínica trafegam sem criptografia. ' +
      'Configure HTTPS no servidor antes de usar em produção.'
    )
  }

  // 2. RLS — se CLINIC_SECRET é null, a policy allow_all está ativa
  if (!CLINIC_SECRET) {
    issues.push(
      'ATENÇÃO: CLINIC_SECRET não configurado. A política RLS allow_all permite ' +
      'acesso público aos dados com a chave anon. ' +
      'Consulte o cabeçalho de supabase.js para aplicar a política segura.'
    )
  }

  if (issues.length) {
    console.group('%c[ClinicAI Security Audit]', 'color:#EF4444;font-weight:bold;font-size:13px')
    issues.forEach(msg => console.warn(msg))
    console.warn('Para corrigir, siga as instruções em js/supabase.js (cabeçalho do arquivo).')
    console.groupEnd()
  }
}

// ── Status UI ────────────────────────────────────────────────
const _SVG = {
  ok:      { bg:'#10B981', stroke:'#fff', path:'<polyline points="4 8 7 11 12 5"/>' },
  error:   { bg:'#EF4444', stroke:'#fff', path:'<line x1="5" y1="5" x2="11" y2="11"/><line x1="11" y1="5" x2="5" y2="11"/>' },
  syncing: { bg:'#F59E0B', stroke:'#fff', path:'<path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3"/><polyline points="11 3 13 5 11 7"/><polyline points="5 9 3 11 5 13"/>' },
  offline: { bg:'#E5E7EB', stroke:'#9CA3AF', path:'<circle cx="8" cy="8" r="4"/>' },
}

function _setStatus(state, msg) {
  const el   = document.getElementById('sb-sync-status')
  const icon = document.getElementById('sb-sync-icon')
  if (!el || !icon) return
  const c = _SVG[state] || _SVG.offline
  el.style.background = c.bg
  el.title = msg || (state === 'ok' ? 'Supabase sincronizado' : state === 'error' ? 'Erro de sincronização' : state === 'syncing' ? 'Sincronizando...' : 'Offline')
  icon.setAttribute('stroke', c.stroke)
  icon.innerHTML = c.path
}

// ── Load: Supabase → localStorage (Last-Write-Wins por timestamp) ──
//
// ESTRATÉGIA DE MERGE — Last-Write-Wins (LWW) por chave:
//
//   Cada store.set(key, data) registra localStorage._ts_{key} = ISO timestamp.
//   O Supabase armazena updated_at em cada linha.
//   Na carga, comparamos os dois timestamps ISO (string comparison é suficiente):
//
//   ┌─────────────────────────┬───────────────────────────────────────────────┐
//   │ Situação                │ Decisão                                       │
//   ├─────────────────────────┼───────────────────────────────────────────────┤
//   │ Sem _ts_ local          │ Primeiro load neste dispositivo → usa Supabase │
//   │ remoteTs > localTs      │ Outro dispositivo salvou depois → usa Supabase │
//   │ localTs >= remoteTs     │ Este dispositivo salvou por último → mantém    │
//   │ Dado local ausente      │ Sempre usa Supabase                           │
//   └─────────────────────────┴───────────────────────────────────────────────┘
//
//   Deleções são preservadas: store.set() atualiza _ts_, então local sempre
//   vence na próxima carga — o item deletado não "volta do servidor".
//
async function sbLoadAll() {
  const sb        = _client()
  const clinicId  = _getClinicId()
  if (!sb) { _setStatus('offline'); return }
  _setStatus('syncing', 'Carregando dados...')
  try {
    const { data, error } = await sb
      .from('clinic_data')
      .select('key, data, updated_at')   // updated_at necessário para LWW
      .eq('clinic_id', clinicId)         // isolamento por clínica
      .in('key', SYNC_KEYS)

    if (error) throw error

    let loaded = 0
    for (const row of (data || [])) {
      try {
        const remoteTs = row.updated_at || '1970-01-01T00:00:00.000Z'
        const localTs  = localStorage.getItem(`_ts_${row.key}`)
        const hasLocal = localStorage.getItem(row.key) !== null

        const shouldUseRemote =
          !hasLocal   ||   // primeiro load neste dispositivo
          !localTs    ||   // dado existe mas sem timestamp (legado pré-LWW)
          remoteTs > localTs  // Supabase é mais recente

        if (shouldUseRemote) {
          localStorage.setItem(row.key, JSON.stringify(row.data))
          localStorage.setItem(`_ts_${row.key}`, remoteTs)
          loaded++
        }
      } catch { /* skip — dado corrompido não bloqueia o resto */ }
    }

    _setStatus('ok', `Supabase sincronizado — ${(data||[]).length} coleções verificadas`)
    console.info(`[ClinicAI] Supabase LWW: ${loaded} coleções atualizadas do servidor.`)
  } catch (err) {
    const detail = err?.message || err?.code || JSON.stringify(err)
    _setStatus('error', `Erro ao carregar: ${detail}`)
    console.error('[ClinicAI] sbLoadAll ERRO:', err)
  }
}

// ── Push: localStorage → Supabase (on-demand, shows status) ─
async function sbPush(key, data) {
  const sb       = _client()
  const clinicId = _getClinicId()
  if (!sb) return
  try {
    const { error } = await sb
      .from('clinic_data')
      .upsert(
        { clinic_id: clinicId, key, data, updated_at: new Date().toISOString() },
        { onConflict: 'clinic_id,key' }   // PK composta pós-migração
      )
    if (error) throw error
    _setStatus('ok')
  } catch (err) {
    _setStatus('error', 'Erro ao salvar no Supabase')
    console.error('[ClinicAI] Supabase push error:', key, err.message)
  }
}

// ── Push all: coleta localStorage e envia em batch ───────────
async function _buildRows() {
  const clinicId = _getClinicId()
  const now      = new Date().toISOString()
  return SYNC_KEYS
    .map(key => {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      try {
        return { clinic_id: clinicId, key, data: JSON.parse(raw), updated_at: now }
      } catch { return null }
    })
    .filter(Boolean)
}

// Push manual (clique no badge) — mostra feedback visual
async function sbPushAll() {
  const sb = _client()
  if (!sb) { _setStatus('offline'); return }
  _setStatus('syncing', 'Enviando todos os dados...')
  try {
    const rows = await _buildRows()
    if (!rows.length) { _setStatus('ok', 'Nada para enviar'); return }
    const { error } = await sb.from('clinic_data').upsert(rows, { onConflict: 'clinic_id,key' })
    if (error) throw error
    _setStatus('ok', `${rows.length} coleções enviadas`)
  } catch (err) {
    _setStatus('error', 'Falha no push completo')
    console.error('[ClinicAI] Supabase pushAll error:', err.message)
  }
}

// ── Auto-sync: bidirecional a cada 60 segundos ───────────────
//
// Ciclo completo por intervalo:
//   1. PUSH  — envia dados locais ao Supabase (garante que outros veem)
//   2. PULL  — lê Supabase com LWW (garante que vemos dados de outros)
//   3. RENDER — chama _reRenderAll() se algum dado foi atualizado pelo pull
//   4. STATUS — ícone fica verde permanente após sync bem-sucedido
//
// Sem reload de página. Sem piscar. Ícone reflete estado real.
//
let _autoSaveTimer = null

async function _autoSave() {
  const sb = _client()
  if (!sb) return

  _setStatus('syncing', 'Sincronizando...')

  try {
    // ── 1. PUSH: local → Supabase ──────────────────────────────
    const rows = await _buildRows()
    if (rows.length) {
      const { error: pushErr } = await sb
        .from('clinic_data')
        .upsert(rows, { onConflict: 'clinic_id,key' })
      if (pushErr) throw pushErr
    }

    // ── 2. PULL: Supabase → localStorage (LWW) ─────────────────
    const clinicId = _getClinicId()
    const { data, error: pullErr } = await sb
      .from('clinic_data')
      .select('key, data, updated_at')
      .eq('clinic_id', clinicId)
      .in('key', SYNC_KEYS)
    if (pullErr) throw pullErr

    let updated = 0
    for (const row of (data || [])) {
      try {
        const remoteTs = row.updated_at || '1970-01-01T00:00:00.000Z'
        const localTs  = localStorage.getItem(`_ts_${row.key}`)
        const hasLocal = localStorage.getItem(row.key) !== null
        const shouldUseRemote = !hasLocal || !localTs || remoteTs > localTs
        if (shouldUseRemote) {
          localStorage.setItem(row.key, JSON.stringify(row.data))
          localStorage.setItem(`_ts_${row.key}`, remoteTs)
          updated++
        }
      } catch { /* dado corrompido não bloqueia */ }
    }

    // ── 3. RENDER: atualiza UI se novos dados chegaram ──────────
    if (updated > 0) _reRenderAll()

    // ── 4. STATUS: verde permanente ─────────────────────────────
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    _setStatus('ok', `Sincronizado às ${now} — ${(data||[]).length} coleções`)
    console.info(`[ClinicAI] Auto-sync: push ${rows.length} | pull ${updated} atualizado(s) — ${now}`)

  } catch (err) {
    const detail = err?.message || err?.code || JSON.stringify(err)
    _setStatus('error', `Sync falhou: ${detail}`)
    console.error('[ClinicAI] _autoSave ERRO:', err)
  }
}

function _startAutoSave(intervalMs) {
  if (_autoSaveTimer) clearInterval(_autoSaveTimer)
  _autoSaveTimer = setInterval(_autoSave, intervalMs)
  // Nota: NÃO chama _autoSave() imediatamente aqui.
  // sbLoadAll() já fez o pull inicial e setou o status 'ok'.
  // O primeiro ciclo bidirecional ocorre após intervalMs (60s).
}

// ── Patch: salva localStorage E faz push automático ─────────
function sbSave(key, value) {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)) } catch {}
  sbPush(key, typeof value === 'string' ? JSON.parse(value) : value)
}

// ── Realtime: busca uma única chave do Supabase ──────────────
//
// Usado após receber um evento postgres_changes.
// Aplica LWW antes de sobrescrever o localStorage.
// Dispara o evento DOM `clinicai:realtime:{key}` para que os
// módulos que precisam re-renderizar se auto-registrem.
//
async function _reloadKey(key) {
  const sb       = _client()
  const clinicId = _getClinicId()
  if (!sb) return
  try {
    const { data: row, error } = await sb
      .from('clinic_data')
      .select('data, updated_at')
      .eq('clinic_id', clinicId)   // isolamento por clínica
      .eq('key', key)
      .single()

    if (error || !row) return

    const remoteTs = row.updated_at || '1970-01-01T00:00:00.000Z'
    const localTs  = localStorage.getItem(`_ts_${key}`)

    // LWW: só atualiza se o servidor é mais recente que o local
    if (localTs && remoteTs <= localTs) {
      console.debug(`[ClinicAI Realtime] skip ${key} — local mais recente (${localTs} >= ${remoteTs})`)
      return
    }

    localStorage.setItem(key, JSON.stringify(row.data))
    localStorage.setItem(`_ts_${key}`, remoteTs)

    // Notifica os módulos ouvintes para re-renderizar
    document.dispatchEvent(new CustomEvent(`clinicai:realtime:${key}`, {
      detail: { key, data: row.data },
    }))

    console.info(`[ClinicAI Realtime] ← ${key} atualizado por outro usuário.`)
  } catch (err) {
    console.warn(`[ClinicAI Realtime] _reloadKey(${key}) falhou:`, err.message)
  }
}

// ── Realtime: reconexão com backoff exponencial ───────────────
let _realtimeChannel = null
let _realtimeBackoff = 1_000   // começa em 1s, dobra a cada falha, máx 60s
let _realtimeTimer   = null

function _scheduleRealtimeReconnect() {
  if (_realtimeTimer) return   // já agendada
  _realtimeTimer = setTimeout(() => {
    _realtimeTimer = null
    _realtimeBackoff = Math.min(_realtimeBackoff * 2, 60_000)
    console.info(`[ClinicAI Realtime] tentando reconectar... (backoff ${_realtimeBackoff / 1000}s)`)
    sbStartRealtime()
  }, _realtimeBackoff)
}

// ── Realtime: inicia ou reinicia a assinatura ─────────────────
//
// UMA única subscription para toda a tabela clinic_data.
// Filtragem por REALTIME_KEYS é feita no client-side para minimizar
// conexões WebSocket — apenas 1 canal independente da quantidade de chaves.
//
// Proteção anti-feedback:
//   Ao fazer store.set(), registramos _ts_{key} com o timestamp local.
//   Quando o Realtime reflete de volta o mesmo write, comparamos
//   commit_timestamp (ou updated_at) com _ts_{key}.
//   Se a diferença for < FEEDBACK_WINDOW_MS, é nosso próprio write → ignorado.
//
function sbStartRealtime() {
  const sb       = _client()
  const clinicId = _getClinicId()
  if (!sb) {
    console.warn('[ClinicAI Realtime] SDK não disponível — realtime desabilitado.')
    return
  }

  // Remove canal anterior se existir (chamada de reconexão ou troca de tenant)
  if (_realtimeChannel) {
    try { sb.removeChannel(_realtimeChannel) } catch {}
    _realtimeChannel = null
  }

  _realtimeChannel = sb
    .channel(`clinic_data_realtime_${clinicId}`, {
      config: { broadcast: { self: false } },
    })
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'clinic_data',
        // Filtra no servidor — só recebe eventos da clínica correta.
        // Requisito: PK composta (clinic_id, key) e coluna replicada.
        filter: `clinic_id=eq.${clinicId}`,
      },
      (payload) => {
        const key = payload.new?.key || payload.old?.key
        if (!key || !REALTIME_KEYS.has(key)) return   // ignora chaves não monitoradas

        // ── Anti-feedback loop ────────────────────────────────
        // Se o timestamp do evento estiver dentro de FEEDBACK_WINDOW_MS
        // da nossa última gravação local, é reflexo do nosso próprio write.
        const localTs  = localStorage.getItem(`_ts_${key}`)
        const remoteTs = payload.new?.updated_at || payload.commit_timestamp || ''

        if (localTs && remoteTs) {
          const localMs  = new Date(localTs).getTime()
          const remoteMs = new Date(remoteTs).getTime()
          if (Math.abs(remoteMs - localMs) < FEEDBACK_WINDOW_MS) {
            console.debug(`[ClinicAI Realtime] auto-skip ${key} (Δ${Math.abs(remoteMs - localMs)}ms < ${FEEDBACK_WINDOW_MS}ms)`)
            return
          }
        }

        // Atualiza localStorage + dispara evento de re-render
        _reloadKey(key)
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        _realtimeBackoff = 1_000   // reset backoff — conexão estável
        console.info('[ClinicAI Realtime] ✓ conectado — sync multi-usuário ativo.')
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[ClinicAI Realtime] CHANNEL_ERROR:', err?.message || 'sem detalhes')
        _scheduleRealtimeReconnect()
      } else if (status === 'TIMED_OUT') {
        console.warn('[ClinicAI Realtime] TIMED_OUT — reconectando...')
        _scheduleRealtimeReconnect()
      } else if (status === 'CLOSED') {
        // CLOSED normal (page unload) — não reconectar
        console.info('[ClinicAI Realtime] canal fechado.')
      }
    })
}

// ── Diagnóstico: testa conexão e schema diretamente ──────────
async function sbDiag() {
  console.group('%c[ClinicAI] Supabase Diagnóstico', 'color:#7C3AED;font-weight:bold;font-size:14px')
  console.info('URL:', SUPABASE_URL)
  console.info('clinic_id:', _getClinicId())
  const sb = _client()
  if (!sb) { console.error('SDK não carregado'); console.groupEnd(); return }

  // 1. Teste de conectividade — query mínima
  try {
    const { data, error } = await sb.from('clinic_data').select('key').limit(1)
    if (error) {
      console.error('❌ Conexão falhou:', error)
    } else {
      console.info('✅ Conexão OK — primeira linha:', data)
    }
  } catch (e) { console.error('❌ Fetch falhou:', e) }

  // 2. Testa coluna clinic_id
  try {
    const { data, error } = await sb.from('clinic_data').select('clinic_id').limit(1)
    if (error) {
      console.error('❌ Coluna clinic_id ausente — execute o SQL de migração no Supabase:', error)
    } else {
      console.info('✅ Coluna clinic_id presente')
    }
  } catch (e) { console.error('❌ Erro ao verificar clinic_id:', e) }

  // 3. Testa upsert simples
  try {
    const testRow = { clinic_id: _getClinicId(), key: '__diag_test__', data: { ok: true }, updated_at: new Date().toISOString() }
    const { error } = await sb.from('clinic_data').upsert(testRow, { onConflict: 'clinic_id,key' })
    if (error) {
      console.error('❌ Upsert falhou — possível problema de RLS ou schema:', error)
    } else {
      console.info('✅ Upsert OK')
      // limpa o teste
      await sb.from('clinic_data').delete().eq('clinic_id', _getClinicId()).eq('key', '__diag_test__')
    }
  } catch (e) { console.error('❌ Upsert exception:', e) }

  console.groupEnd()
}

// ── Expose ───────────────────────────────────────────────────
window.sbLoadAll       = sbLoadAll
window.sbPushAll       = sbPushAll
window.sbPush          = sbPush
window.sbSave          = sbSave
window.sbSetStatus     = _setStatus
window.sbStartRealtime = sbStartRealtime
window.sbGetClinicId   = _getClinicId   // diagnóstico / dev tools
window.sbDiag          = sbDiag         // diagnóstico: sbDiag() no console

// Singleton compartilhado — auth.js e outros módulos reutilizam este cliente
// para evitar múltiplas instâncias GoTrueClient no mesmo contexto
window._sbShared = _client()

// ── Realtime re-render listeners ─────────────────────────────
//
// Cada módulo que tem uma função de render global se registra aqui.
// Quando outro usuário altera uma chave monitorada, o evento
// `clinicai:realtime:{key}` é disparado e o módulo re-renderiza.
//
// COMO ADICIONAR UM NOVO MÓDULO:
//   1. Exporte a função de render: window.minhaFuncaoRender = minhaFuncaoRender
//   2. Adicione a chave em REALTIME_KEYS (acima)
//   3. Adicione um listener abaixo no padrão existente
//
document.addEventListener('clinicai:realtime:clinicai_appointments',
  () => { if (window.renderAgenda)         renderAgenda() })

document.addEventListener('clinicai:realtime:clinicai_agenda_events',
  () => { if (window.renderAgenda)         renderAgenda() })

document.addEventListener('clinicai:realtime:clinicai_automations_queue',
  () => { if (window.renderAgenda)         renderAgenda() })

document.addEventListener('clinicai:realtime:clinicai_leads',
  () => { if (window.loadLeads)            loadLeads() })

document.addEventListener('clinicai:realtime:clinicai_professionals',
  () => { if (window.renderProfessionalsList) renderProfessionalsList() })

document.addEventListener('clinicai:realtime:clinicai_rooms',
  () => { if (window.renderRoomsList)         renderRoomsList() })

document.addEventListener('clinicai:realtime:clinic_injetaveis',
  () => { if (window.renderInjetaveis)     renderInjetaveis() })

document.addEventListener('clinicai:realtime:clinic_inj_protocolos',
  () => { if (window.renderInjetaveis)     renderInjetaveis() })

document.addEventListener('clinicai:realtime:clinic_procedimentos',
  () => { if (window.renderProcedimentos)  renderProcedimentos() })

document.addEventListener('clinicai:realtime:clinicai_tasks_v2',
  () => { if (window.renderTasks)          renderTasks() })

document.addEventListener('clinicai:realtime:clinic_op_tasks',
  () => { if (window.renderTasks)          renderTasks() })

document.addEventListener('clinicai:realtime:clinicai_clinic_settings',
  () => { if (window.applyClinicSettings)  applyClinicSettings() })

document.addEventListener('clinicai:realtime:clinicai_team_profiles',
  () => {
    if (window.renderTeamGrid)          renderTeamGrid()
    if (window.renderProfessionalsList) renderProfessionalsList()
  })

document.addEventListener('clinicai:realtime:clinicai_technologies',
  () => { if (window.renderTechnologiesList) renderTechnologiesList() })

// ── Re-render central: chama todos os módulos com guarda de existência ──
//
// Chamado após sbLoadAll() tanto no boot quanto após auth-success.
// setTimeout(200) garante que os scripts de módulo já foram avaliados
// e registraram suas funções em window.* antes de tentar chamar.
// Cada guarda `if (window.X)` é seguro: módulos não carregados são ignorados.
//
function _reRenderAll () {
  setTimeout(() => {
    // Agenda e seus sub-módulos
    if (window.renderAgenda)            renderAgenda()
    if (window.loadAgendaOverview)      loadAgendaOverview()
    if (window.renderAgendaRelatorios)  renderAgendaRelatorios()
    if (window.renderAgendaEventos)     renderAgendaEventos()
    if (window.renderAgendaTagsFluxos)  renderAgendaTagsFluxos()
    if (window.renderAgendaMensagens)   renderAgendaMensagens()

    // Procedimentos e Injetáveis
    if (window.renderProcedimentos)     renderProcedimentos()
    if (window.renderInjetaveis)        renderInjetaveis()

    // Orçamentos / Financeiro
    // Desativado: orcamentos gerenciado por orcamentos.js
    // if (window.renderOrcamentos)        renderOrcamentos()
    if (window.renderPatientsBudget)    renderPatientsBudget()
    if (window.renderFinanceiro)        renderFinanceiro()

    // Equipe, Profissionais, Salas e Tecnologias
    if (window.renderProfessionalsList) renderProfessionalsList()
    if (window.renderTeamGrid)          renderTeamGrid()
    if (window.renderTeamStats)         renderTeamStats()
    if (window.renderRoomsList)         renderRoomsList()
    if (window.renderTechnologiesList)  renderTechnologiesList()

    // Configurações e Tags
    if (window.renderSettingsTags)      renderSettingsTags()
    if (window.applyClinicSettings)     applyClinicSettings()

    // Growth & Mkt
    if (window.renderWaLinks)           renderWaLinks()
    if (window.renderParcerias)         renderParcerias()
    if (window.renderIndicacoes)        renderIndicacoes()

    // SDR / Tasks
    if (window.renderSDR)               renderSDR()
    if (window.renderTasks)             renderTasks()
  }, 200)
}

// ── Expõe client Supabase para módulos que precisam de queries relacionais ─
window.sbClient = function() {
  if (window.supabase?.createClient) {
    const headers = {}
    if (typeof CLINIC_SECRET !== 'undefined' && CLINIC_SECRET) headers['x-clinic-secret'] = CLINIC_SECRET
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, Object.keys(headers).length ? { global: { headers } } : {})
  }
  return null
}

// ── Auth-success: reinicializa com o tenant correto ──────────
//
// Quando o usuário faz login (doLogin / handleGoogleLogin), o evento
// clinicai:auth-success é disparado. Neste momento:
//   1. O singleton do cliente é descartado — será recriado com os
//      headers corretos (x-clinic-id, x-clinic-secret) na próxima chamada.
//   2. sbLoadAll() é re-executado com o clinic_id real do usuário,
//      trazendo os dados corretos da clínica autenticada.
//   3. sbStartRealtime() é reiniciado com o filtro de clinic_id correto.
//
document.addEventListener('clinicai:auth-success', () => {
  // Reutiliza singleton existente — NAO resetar para evitar GoTrueClient duplicado
  sbLoadAll().then(() => {
    _reRenderAll()
    try { sbStartRealtime() } catch (err) {
      console.warn('[ClinicAI Realtime] falha ao reiniciar após auth:', err.message)
    }
  })
})

// ── Boot: aguarda DOM + SDK, depois carrega e inicia realtime ─
document.addEventListener('DOMContentLoaded', () => {
  // Auditoria de segurança uma única vez no boot
  _securityAudit()

  // Aguarda o SDK do Supabase estar disponível (carregado via CDN)
  let attempts = 0
  const tryLoad = () => {
    if (window.supabase?.createClient) {
      sbLoadAll().then(() => {
        // Re-renderiza todos os módulos que já podem estar montados
        _reRenderAll()

        // Auto-sync bidirecional a cada 60 segundos:
        // push local → Supabase + pull Supabase → local + re-render + ícone verde
        _startAutoSave(60_000)

        // Inicia Realtime para sync multi-usuário em tempo real
        // Graceful degradation: se falhar, auto-save continua funcionando
        try {
          sbStartRealtime()
        } catch (err) {
          console.warn('[ClinicAI Realtime] falha ao iniciar (degradação graciosa):', err.message)
        }
      })
    } else if (attempts++ < 20) {
      setTimeout(tryLoad, 200)
    } else {
      _setStatus('offline', 'SDK não carregado — modo local')
    }
  }
  tryLoad()
})

})()
