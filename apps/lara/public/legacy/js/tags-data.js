;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════
//  ClinicAI — Tags Data Layer
//  Seeds, constantes e helpers de storage
// ══════════════════════════════════════════════════════════════

window.TAGS_STORAGE_KEYS = {
  GROUPS:       'clinic_tag_groups',
  TAGS:         'clinic_tags_v2',
  TMPL_MSG:     'clinic_tmpl_msg',
  TMPL_ALERT:   'clinic_tmpl_alert',
  TMPL_TASK:    'clinic_tmpl_task',
  FLOWS:        'clinic_tag_flows',
  OBJECTIONS:   'clinic_budget_objections',
  ALERTS:       'clinic_internal_alerts',
  TASKS:        'clinic_op_tasks',
  HISTORY:      'clinic_tag_history',
  AUTO_LOGS:    'clinic_auto_logs',
  ENTITY_TAGS:  'clinic_entity_tags',
  BUDGETS:      'clinic_budgets',
}

// ── Helpers de Storage unificados ────────────────────────────
window.tagsDB = {
  get:    function(key) { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } },
  getObj: function(key, def) { try { return JSON.parse(localStorage.getItem(key) || 'null') || def || {} } catch { return def || {} } },
  set:    function(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)) } catch(e) { console.warn('[tagsDB.set]', key, e) }
  },
}

// ── Grupos de Tags ────────────────────────────────────────────
window.TAG_GROUP_SEEDS = [
  { id:'pre_agendamento', nome:'Pré-agendamento',     cor:'#6366F1', icone:'user-plus',  descricao:'Lead qualificado, interesse confirmado, aguardando agendamento.', ordem:1, ativo:true },
  { id:'agendamento',     nome:'Agendamento',          cor:'#3B82F6', icone:'calendar',   descricao:'Consulta ou procedimento agendado. Controla confirmações, lembretes e no-shows.', ordem:2, ativo:true },
  { id:'paciente',        nome:'Paciente',             cor:'#10B981', icone:'heart',      descricao:'Paciente com procedimento realizado. Controla pós-procedimento e retenção.', ordem:3, ativo:true },
  { id:'orcamento',       nome:'Orçamento',            cor:'#F59E0B', icone:'clipboard',  descricao:'Realizou consulta, não fez procedimento, saiu com orçamento. Fluxo de conversão.', ordem:4, ativo:true },
  { id:'pac_orcamento',   nome:'Paciente + Orçamento', cor:'#8B5CF6', icone:'file-text',  descricao:'Fez procedimento E saiu com orçamento para outro tratamento.', ordem:5, ativo:true },
]

// ── Tags ──────────────────────────────────────────────────────
window.TAG_SEEDS_V2 = [
  // ── Pré-agendamento ──────────────────────────────────────────
  { id:'lead_novo',             group_id:'pre_agendamento', nome:'Lead Novo',              cor:'#A78BFA', icone:'user-plus',      kanban_coluna:'Novo lead',             cor_calendario:null,      ordem:1,  ativo:true, msg_template_id:null,                  alert_template_id:'alert_lead_novo',          task_template_id:'task_qualificar_lead',       incompativeis:['lead_desqualificado'],   regras:'Aplicada automaticamente ao criar um novo lead.',         proxima_acao:'Qualificar lead em 24h.' },
  { id:'lead_em_conversa',      group_id:'pre_agendamento', nome:'Em Conversa',            cor:'#818CF8', icone:'message-circle', kanban_coluna:'Em conversa',           cor_calendario:null,      ordem:2,  ativo:true, msg_template_id:'boas_vindas_lead',    alert_template_id:null,                       task_template_id:null,                         incompativeis:[],                        regras:'SDR iniciou contato ativo com o lead.',                   proxima_acao:'Acompanhar e qualificar.' },
  { id:'lead_frio',             group_id:'pre_agendamento', nome:'Lead Frio',              cor:'#93C5FD', icone:'thermometer',    kanban_coluna:'Frio',                  cor_calendario:null,      ordem:3,  ativo:true, msg_template_id:'followup_lead_frio',  alert_template_id:null,                       task_template_id:'task_followup_frio',         incompativeis:['lead_quente','lead_morno'],  regras:'Baixo interesse ou inatividade acima de 7 dias.',         proxima_acao:'Fluxo de reaquecimento.' },
  { id:'lead_morno',            group_id:'pre_agendamento', nome:'Lead Morno',             cor:'#FDE68A', icone:'thermometer',    kanban_coluna:'Morno',                 cor_calendario:null,      ordem:4,  ativo:true, msg_template_id:'followup_lead_morno', alert_template_id:null,                       task_template_id:'task_followup_morno',        incompativeis:['lead_frio','lead_quente'],   regras:'Interesse moderado — respondeu mas não agendou.',         proxima_acao:'Oferecer horário disponível.' },
  { id:'lead_quente',           group_id:'pre_agendamento', nome:'Lead Quente',            cor:'#FCA5A5', icone:'thermometer',    kanban_coluna:'Quente',                cor_calendario:null,      ordem:5,  ativo:true, msg_template_id:'followup_lead_quente',alert_template_id:'alert_lead_quente',         task_template_id:'task_agendar_urgente',       incompativeis:['lead_frio','lead_morno'],    regras:'Alto interesse, pediu informações de agenda.',            proxima_acao:'Agendar imediatamente.' },
  { id:'lead_sem_resposta',     group_id:'pre_agendamento', nome:'Sem Resposta',           cor:'#9CA3AF', icone:'phone-missed',   kanban_coluna:'Sem resposta',          cor_calendario:null,      ordem:6,  ativo:true, msg_template_id:null,                  alert_template_id:null,                       task_template_id:'task_tentativa_contato',     incompativeis:[],                        regras:'Tentativa de contato sem resposta. Máximo 3 tentativas.', proxima_acao:'Nova tentativa em 24-48h.' },
  { id:'lead_qualificado',      group_id:'pre_agendamento', nome:'Qualificado',            cor:'#6EE7B7', icone:'check-circle',   kanban_coluna:'Qualificado',           cor_calendario:null,      ordem:7,  ativo:true, msg_template_id:null,                  alert_template_id:'alert_lead_qualificado',   task_template_id:'task_agendar_consulta',      incompativeis:['lead_desqualificado'],   regras:'Lead com perfil, interesse e capacidade confirmados.',    proxima_acao:'Converter em agendamento.' },
  { id:'lead_desqualificado',   group_id:'pre_agendamento', nome:'Desqualificado',         cor:'#D1D5DB', icone:'x-circle',       kanban_coluna:'Desqualificado',        cor_calendario:null,      ordem:8,  ativo:true, msg_template_id:null,                  alert_template_id:null,                       task_template_id:null,                         incompativeis:['lead_qualificado'],      regras:'Perfil não compatível ou sem capacidade de investimento.', proxima_acao:'Encerrar fluxo.' },
  { id:'lead_followup',         group_id:'pre_agendamento', nome:'Follow-up',              cor:'#C4B5FD', icone:'clock',          kanban_coluna:'Em conversa',           cor_calendario:null,      ordem:9,  ativo:true, msg_template_id:null,                  alert_template_id:null,                       task_template_id:'task_followup_agendamento', incompativeis:[],                        regras:'Aguardando retorno do lead para decisão.',                proxima_acao:'Contato em data programada.' },
  { id:'lead_prioritario',      group_id:'pre_agendamento', nome:'Prioritário',            cor:'#EF4444', icone:'alert-triangle',  kanban_coluna:'Quente',                cor_calendario:null,      ordem:10, ativo:true, msg_template_id:null,                  alert_template_id:'alert_lead_quente',        task_template_id:'task_agendar_urgente',       incompativeis:[],                        regras:'Lead indicado pela gestão como alta prioridade.',         proxima_acao:'Atendimento prioritário e imediato.' },

  // ── Agendamento ───────────────────────────────────────────────
  { id:'agendado',              group_id:'agendamento', nome:'Agendado',                   cor:'#3B82F6', icone:'calendar',       kanban_coluna:'Agendado',              cor_calendario:'#3B82F6', ordem:1,  ativo:true, msg_template_id:'confirmacao_agendamento', alert_template_id:'alert_novo_agendamento', task_template_id:'task_preparar_prontuario', incompativeis:['cancelado','falta'],    regras:'Consulta ou procedimento inserido na agenda.',                   proxima_acao:'Confirmar presença 48h antes.' },
  { id:'aguardando_confirmacao',group_id:'agendamento', nome:'Aguardando Confirmação',     cor:'#F59E0B', icone:'clock',          kanban_coluna:'Aguardando confirmação', cor_calendario:'#F59E0B', ordem:2,  ativo:true, msg_template_id:'lembrete_confirmacao',    alert_template_id:null,                     task_template_id:'task_confirmar_presenca',  incompativeis:[],                      regras:'Lembrete enviado, aguardando resposta do paciente.',             proxima_acao:'Confirmar em até 24h antes.' },
  { id:'confirmado',            group_id:'agendamento', nome:'Confirmado',                 cor:'#059669', icone:'check-circle',   kanban_coluna:'Confirmado',            cor_calendario:'#059669', ordem:3,  ativo:true, msg_template_id:'lembrete_1_dia_antes',    alert_template_id:null,                     task_template_id:null,                       incompativeis:['cancelado'],            regras:'Paciente confirmou presença.',                                   proxima_acao:'Preparar sala e materiais.' },
  { id:'reagendado',            group_id:'agendamento', nome:'Reagendado',                 cor:'#F97316', icone:'refresh-cw',     kanban_coluna:'Reagendado',            cor_calendario:'#F97316', ordem:4,  ativo:true, msg_template_id:'mensagem_reagendamento',  alert_template_id:'alert_reagendamento',    task_template_id:null,                       incompativeis:[],                      regras:'Consulta reagendada — registrar data anterior e nova.',          proxima_acao:'Reconfirmar 24h antes.' },
  { id:'cancelado',             group_id:'agendamento', nome:'Cancelado',                  cor:'#EF4444', icone:'x',              kanban_coluna:'Cancelado',             cor_calendario:'#EF4444', ordem:5,  ativo:true, msg_template_id:'mensagem_cancelamento',   alert_template_id:'alert_cancelamento',     task_template_id:'task_recuperar_cancelamento', incompativeis:['confirmado'],      regras:'Paciente cancelou a consulta.',                                  proxima_acao:'Iniciar fluxo de recuperação.' },
  { id:'falta',                 group_id:'agendamento', nome:'Falta (No-show)',             cor:'#DC2626', icone:'x-circle',       kanban_coluna:'Falta',                 cor_calendario:'#DC2626', ordem:6,  ativo:true, msg_template_id:'reagendamento_noshow',    alert_template_id:'alert_noshow',           task_template_id:'task_recuperar_noshow',     incompativeis:[],                      regras:'Paciente não compareceu sem aviso prévio.',                      proxima_acao:'Tentar reagendar em 24h.' },
  { id:'encaixe',               group_id:'agendamento', nome:'Encaixe',                    cor:'#8B5CF6', icone:'zap',            kanban_coluna:'Agendado',              cor_calendario:'#8B5CF6', ordem:7,  ativo:true, msg_template_id:'confirmacao_agendamento', alert_template_id:'alert_novo_agendamento', task_template_id:null,                       incompativeis:[],                      regras:'Encaixe de urgência fora do horário normal.',                    proxima_acao:'Confirmar horário imediatamente.' },
  { id:'prioridade_agenda',     group_id:'agendamento', nome:'Prioridade na Agenda',       cor:'#DB2777', icone:'alert-circle',   kanban_coluna:'Agendado',              cor_calendario:'#DB2777', ordem:8,  ativo:true, msg_template_id:null,                      alert_template_id:'alert_lead_quente',      task_template_id:'task_confirmar_presenca',  incompativeis:[],                      regras:'Paciente VIP ou urgência clínica.',                              proxima_acao:'Atendimento preferencial.' },

  // ── Paciente ──────────────────────────────────────────────────
  { id:'paciente_ativo',        group_id:'paciente', nome:'Paciente Ativo',                cor:'#10B981', icone:'heart',          kanban_coluna:'Em atendimento',        cor_calendario:'#10B981', ordem:1,  ativo:true, msg_template_id:null,                  alert_template_id:null,                       task_template_id:null,                         incompativeis:[],                    regras:'Paciente com procedimento em andamento ou recente.',   proxima_acao:'Monitorar retorno.' },
  { id:'consulta_realizada',    group_id:'paciente', nome:'Consulta Realizada',             cor:'#34D399', icone:'check',          kanban_coluna:'Pós-consulta',          cor_calendario:'#34D399', ordem:2,  ativo:true, msg_template_id:'pos_procedimento_dia_0',alert_template_id:null,                       task_template_id:'task_acompanhamento_pos',    incompativeis:[],                    regras:'Consulta finalizada — iniciar fluxo de pós.',          proxima_acao:'Enviar pós-consulta no mesmo dia.' },
  { id:'procedimento_realizado',group_id:'paciente', nome:'Procedimento Realizado',         cor:'#6EE7B7', icone:'activity',       kanban_coluna:'Pós-procedimento',      cor_calendario:'#6EE7B7', ordem:3,  ativo:true, msg_template_id:'pos_procedimento_dia_0',alert_template_id:null,                       task_template_id:'task_acompanhamento_pos',    incompativeis:[],                    regras:'Procedimento estético finalizado com sucesso.',         proxima_acao:'Iniciar fluxo D0 a D3.' },
  { id:'pos_consulta',          group_id:'paciente', nome:'Pós-consulta',                   cor:'#A7F3D0', icone:'sun',            kanban_coluna:'Pós-consulta',          cor_calendario:null,      ordem:4,  ativo:true, msg_template_id:'pos_procedimento_dia_1',alert_template_id:null,                       task_template_id:'task_acompanhamento_pos',    incompativeis:[],                    regras:'Em acompanhamento pós-consulta (D0 a D7).',            proxima_acao:'Ligar 72h após procedimento.' },
  { id:'pos_procedimento',      group_id:'paciente', nome:'Pós-procedimento',               cor:'#14B8A6', icone:'heart',          kanban_coluna:'Pós-procedimento',      cor_calendario:null,      ordem:5,  ativo:true, msg_template_id:'pos_procedimento_dia_0',alert_template_id:null,                       task_template_id:'task_acompanhamento_pos',    incompativeis:[],                    regras:'Acompanhamento pós-procedimento estético ativo.',       proxima_acao:'Acompanhar dias 1, 2 e 3.' },
  { id:'aguardando_retorno',    group_id:'paciente', nome:'Aguardando Retorno',             cor:'#0EA5E9', icone:'refresh-cw',     kanban_coluna:'Aguardando retorno',    cor_calendario:null,      ordem:6,  ativo:true, msg_template_id:'lembrete_retorno',    alert_template_id:null,                       task_template_id:null,                         incompativeis:[],                    regras:'Retorno ou manutenção agendada futuramente.',          proxima_acao:'Lembrar 7 dias antes.' },
  { id:'avaliacao_pendente',    group_id:'paciente', nome:'Avaliação Pendente',             cor:'#FBBF24', icone:'star',           kanban_coluna:'Pós-consulta',          cor_calendario:null,      ordem:7,  ativo:true, msg_template_id:'pedido_avaliacao',    alert_template_id:null,                       task_template_id:null,                         incompativeis:['avaliacao_realizada'], regras:'Pedido de avaliação ainda não enviado.',               proxima_acao:'Solicitar avaliação no D+3.' },
  { id:'avaliacao_realizada',   group_id:'paciente', nome:'Avaliação Realizada',            cor:'#F59E0B', icone:'award',          kanban_coluna:'Pós-consulta',          cor_calendario:null,      ordem:8,  ativo:true, msg_template_id:null,                  alert_template_id:null,                       task_template_id:null,                         incompativeis:['avaliacao_pendente'], regras:'Paciente deixou avaliação online.',                    proxima_acao:'Agradecer e fidelizar.' },

  // ── Orçamento (consulta sem procedimento, saiu com orçamento) ─
  { id:'orc_em_aberto',        group_id:'orcamento', nome:'Orçamento em Aberto',    cor:'#FCD34D', icone:'clipboard',      kanban_coluna:'Em aberto',          cor_calendario:'#F59E0B', ordem:1,  ativo:true, msg_template_id:'orcamento_enviado',           alert_template_id:null,               task_template_id:'task_followup_orcamento',    incompativeis:['orc_perdido'],               regras:'Consulta realizada, saiu com orçamento aberto. Sem procedimento feito.',    proxima_acao:'Follow-up em 48h.' },
  { id:'orc_enviado',          group_id:'orcamento', nome:'Orçamento Enviado',      cor:'#F59E0B', icone:'send',           kanban_coluna:'Orçamento enviado',  cor_calendario:'#F59E0B', ordem:2,  ativo:true, msg_template_id:'orcamento_enviado',           alert_template_id:null,               task_template_id:'task_followup_orcamento',    incompativeis:['orc_aprovado','orc_perdido'], regras:'Orçamento enviado por WhatsApp ou e-mail.',                                proxima_acao:'Confirmar recebimento em 24h.' },
  { id:'orc_em_negociacao',    group_id:'orcamento', nome:'Em Negociação',          cor:'#F97316', icone:'git-merge',      kanban_coluna:'Em negociação',      cor_calendario:'#F97316', ordem:3,  ativo:true, msg_template_id:null,                          alert_template_id:'alert_negociacao',         task_template_id:'task_proposta_negociacao',   incompativeis:['orc_aprovado','orc_perdido'], regras:'Pessoa pediu negociação de valor ou condição.',                            proxima_acao:'Resposta em até 24h.' },
  { id:'orc_followup',         group_id:'orcamento', nome:'Follow-up Pendente',     cor:'#FDE68A', icone:'clock',          kanban_coluna:'Follow-up',          cor_calendario:null,      ordem:4,  ativo:true, msg_template_id:null,                          alert_template_id:null,               task_template_id:'task_followup_orcamento',    incompativeis:['orc_aprovado','orc_perdido'], regras:'Sem resposta há mais de 48h. Acionar fluxo por objeção.',                  proxima_acao:'Identificar objeção e acionar template.' },
  { id:'orc_aprovado',         group_id:'orcamento', nome:'Aprovado — Agendar',     cor:'#059669', icone:'check-circle',   kanban_coluna:'Aprovado',           cor_calendario:'#059669', ordem:5,  ativo:true, msg_template_id:'orcamento_aprovado',          alert_template_id:'alert_novo_agendamento',   task_template_id:'task_agendar_consulta',      incompativeis:['orc_perdido'],               regras:'Pessoa aprovou o orçamento. Mover para Agendamento imediatamente.',         proxima_acao:'Agendar procedimento.' },
  { id:'orc_perdido',          group_id:'orcamento', nome:'Perdido',                cor:'#9CA3AF', icone:'x-circle',       kanban_coluna:'Perdido',            cor_calendario:null,      ordem:6,  ativo:true, msg_template_id:null,                          alert_template_id:null,               task_template_id:null,                         incompativeis:['orc_aprovado'],              regras:'Pessoa recusou o orçamento definitivamente.',                              proxima_acao:'Reativar em 90 dias.' },

  // ── Paciente + Orçamento ──────────────────────────────────────
  { id:'orcamento_aberto',      group_id:'pac_orcamento', nome:'Orçamento Aberto',          cor:'#A78BFA', icone:'file-plus',      kanban_coluna:'Orçamento aberto',      cor_calendario:'#8B5CF6', ordem:1,  ativo:true, msg_template_id:'orcamento_enviado',   alert_template_id:null,                       task_template_id:'task_followup_orcamento',    incompativeis:['orcamento_fechado','orcamento_perdido'], regras:'Orçamento criado e ainda sem resposta.',  proxima_acao:'Follow-up em 48h.' },
  { id:'orcamento_enviado',     group_id:'pac_orcamento', nome:'Orçamento Enviado',          cor:'#8B5CF6', icone:'send',           kanban_coluna:'Orçamento aberto',      cor_calendario:'#8B5CF6', ordem:2,  ativo:true, msg_template_id:'orcamento_enviado',   alert_template_id:null,                       task_template_id:'task_followup_orcamento',    incompativeis:['orcamento_fechado'],             regras:'Orçamento enviado por WhatsApp.',         proxima_acao:'Confirmar recebimento em 24h.' },
  { id:'orcamento_em_negociacao',group_id:'pac_orcamento',nome:'Em Negociação',              cor:'#F59E0B', icone:'git-merge',      kanban_coluna:'Em negociação',         cor_calendario:'#F59E0B', ordem:3,  ativo:true, msg_template_id:null,                  alert_template_id:'alert_negociacao',         task_template_id:'task_proposta_negociacao',    incompativeis:['orcamento_fechado'],             regras:'Paciente solicitou negociação de valor.',  proxima_acao:'Resposta em até 24h.' },
  { id:'orcamento_followup',    group_id:'pac_orcamento', nome:'Follow-up',                  cor:'#C4B5FD', icone:'clock',          kanban_coluna:'Follow-up',             cor_calendario:null,      ordem:4,  ativo:true, msg_template_id:null,                  alert_template_id:null,                       task_template_id:'task_followup_orcamento',    incompativeis:['orcamento_fechado','orcamento_perdido'], regras:'Aguardando decisão do paciente.',         proxima_acao:'Ativar fluxo por objeção.' },
  { id:'orcamento_fechado',     group_id:'pac_orcamento', nome:'Fechado',                    cor:'#059669', icone:'check-circle',   kanban_coluna:'Fechado',               cor_calendario:'#059669', ordem:5,  ativo:true, msg_template_id:'orcamento_aprovado',  alert_template_id:'alert_lead_novo',          task_template_id:'task_preparar_prontuario',   incompativeis:['orcamento_perdido'],             regras:'Orçamento aprovado e procedimento agendado.',             proxima_acao:'Agendar procedimento.' },
  { id:'orcamento_perdido',     group_id:'pac_orcamento', nome:'Perdido',                    cor:'#9CA3AF', icone:'x-circle',       kanban_coluna:'Perdido',               cor_calendario:null,      ordem:6,  ativo:true, msg_template_id:null,                  alert_template_id:null,                       task_template_id:null,                         incompativeis:['orcamento_fechado'],             regras:'Paciente recusou definitivamente.',                       proxima_acao:'Reativar em 90 dias.' },
]

// ── Templates de Mensagem ─────────────────────────────────────
window.MESSAGE_TEMPLATE_SEEDS = [
  { id:'boas_vindas_lead',             nome:'Boas-vindas Lead',              canal:'whatsapp', corpo:'Olá {{nome}}! Seja bem-vindo(a) à {{clinica}}! Estamos aqui para te ajudar a se sentir ainda mais bonita. Como posso te ajudar hoje?', variaveis:['nome','clinica'] },
  { id:'followup_lead_frio',           nome:'Follow-up Lead Frio',           canal:'whatsapp', corpo:'Oi {{nome}}, tudo bem? Passando para ver se você ainda tem interesse em conhecer nossos procedimentos. Podemos te ajudar?', variaveis:['nome'] },
  { id:'followup_lead_morno',          nome:'Follow-up Lead Morno',          canal:'whatsapp', corpo:'Olá {{nome}}! Que tal agendar uma avaliação gratuita? Temos horários esta semana. Qual seria o melhor para você?', variaveis:['nome'] },
  { id:'followup_lead_quente',         nome:'Follow-up Lead Quente',         canal:'whatsapp', corpo:'{{nome}}, ótima notícia! Temos um horário disponível {{data_hora}}. Posso reservar para você?', variaveis:['nome','data_hora'] },
  { id:'confirmacao_agendamento',      nome:'Confirmação de Agendamento',    canal:'whatsapp', corpo:'Olá {{nome}}! Sua consulta está confirmada para {{data}} às {{hora}} com {{profissional}}. Qualquer dúvida pode falar comigo!', variaveis:['nome','data','hora','profissional'] },
  { id:'lembrete_confirmacao',         nome:'Lembrete de Confirmação',       canal:'whatsapp', corpo:'Oi {{nome}}! Lembrete da sua consulta amanhã, {{data}} às {{hora}}. Por favor confirme sua presença respondendo SIM ou NÃO.', variaveis:['nome','data','hora'] },
  { id:'lembrete_1_dia_antes',         nome:'Lembrete 1 Dia Antes',         canal:'whatsapp', corpo:'{{nome}}, amanhã é o grande dia! Sua consulta é às {{hora}} em {{endereco}}. Estamos te esperando!', variaveis:['nome','hora','endereco'] },
  { id:'lembrete_mesmo_dia',           nome:'Lembrete Mesmo Dia',            canal:'whatsapp', corpo:'Bom dia {{nome}}! Só para lembrar que hoje é sua consulta às {{hora}}. Até logo!', variaveis:['nome','hora'] },
  { id:'mensagem_cancelamento',        nome:'Mensagem de Cancelamento',      canal:'whatsapp', corpo:'Olá {{nome}}, entendemos que você precisou cancelar. Quando quiser remarcar é só falar! Ficamos à disposição.', variaveis:['nome'] },
  { id:'mensagem_reagendamento',       nome:'Mensagem de Reagendamento',     canal:'whatsapp', corpo:'{{nome}}, confirmamos o reagendamento para {{data}} às {{hora}}. Até lá!', variaveis:['nome','data','hora'] },
  { id:'reagendamento_noshow',         nome:'Reagendamento após No-show',    canal:'whatsapp', corpo:'Olá {{nome}}, sentimos sua falta hoje! Vamos remarcar? Temos horários disponíveis esta semana.', variaveis:['nome'] },
  { id:'pos_procedimento_dia_0',       nome:'Pós-procedimento (Dia 0)',      canal:'whatsapp', corpo:'{{nome}}, foi um prazer te atender! Segue abaixo as orientações de cuidados. Qualquer dúvida estou aqui!', variaveis:['nome'] },
  { id:'pos_procedimento_dia_1',       nome:'Pós-procedimento (Dia 1)',      canal:'whatsapp', corpo:'Oi {{nome}}! Como você está se sentindo? Tudo ocorrendo bem com o resultado? Estamos acompanhando!', variaveis:['nome'] },
  { id:'pos_procedimento_dia_2',       nome:'Pós-procedimento (Dia 2)',      canal:'whatsapp', corpo:'{{nome}}, já faz 2 dias do seu procedimento! O resultado está te agradando? Qualquer sinal diferente entre em contato.', variaveis:['nome'] },
  { id:'pos_procedimento_dia_3',       nome:'Pós-procedimento (Dia 3)',      canal:'whatsapp', corpo:'Olá {{nome}}! Chegou a hora de conferir o resultado final. Está feliz? Adoraríamos ver uma foto!', variaveis:['nome'] },
  { id:'pedido_avaliacao',             nome:'Pedido de Avaliação',           canal:'whatsapp', corpo:'{{nome}}, adoramos te atender! Você poderia deixar uma avaliação no Google? Leva apenas 1 minuto e ajuda muito. {{link_avaliacao}}', variaveis:['nome','link_avaliacao'] },
  { id:'orcamento_enviado',            nome:'Orçamento Enviado',             canal:'whatsapp', corpo:'{{nome}}, segue seu orçamento personalizado. Qualquer dúvida ou se quiser negociar é só falar! Aguardamos seu retorno.', variaveis:['nome'] },
  { id:'orcamento_aprovado',           nome:'Orçamento Aprovado',            canal:'whatsapp', corpo:'{{nome}}, que ótima notícia! Vamos agendar seu procedimento. Qual o melhor horário para você?', variaveis:['nome'] },
  { id:'followup_orcamento_preco',     nome:'Follow-up - Preço',             canal:'whatsapp', corpo:'Oi {{nome}}! Entendo que o investimento pode ser um fator. Temos opções de parcelamento. Posso te apresentar?', variaveis:['nome'] },
  { id:'followup_orcamento_medo',      nome:'Follow-up - Medo',              canal:'whatsapp', corpo:'{{nome}}, é normal ter dúvidas! Que tal uma conversa com nossa especialista para esclarecer antes de decidir?', variaveis:['nome'] },
  { id:'followup_orcamento_tempo',     nome:'Follow-up - Tempo',             canal:'whatsapp', corpo:'Olá {{nome}}! Entendo que a agenda está corrida. Temos horários bem flexíveis, inclusive aos sábados. Quando tem 30 minutos?', variaveis:['nome'] },
  { id:'followup_orcamento_comparacao',nome:'Follow-up - Comparação',        canal:'whatsapp', corpo:'{{nome}}, ótimo que você está pesquisando! Estamos à disposição para mostrar todo nosso diferencial. Quando posso ligar?', variaveis:['nome'] },
  { id:'followup_orcamento_pensar',    nome:'Follow-up - Precisa Pensar',    canal:'whatsapp', corpo:'Oi {{nome}}! Só passando para ver se surgiu alguma dúvida. Estou aqui se precisar de mais informações!', variaveis:['nome'] },
  { id:'lembrete_retorno',             nome:'Lembrete de Retorno',           canal:'whatsapp', corpo:'{{nome}}, está quase na hora do seu retorno! Sua consulta é {{data}}. Estamos te esperando!', variaveis:['nome','data'] },
]

// ── Templates de Alerta Interno ───────────────────────────────
window.ALERT_TEMPLATE_SEEDS = [
  { id:'alert_lead_novo',        nome:'Novo Lead',              tipo:'info',    titulo:'Novo lead recebido',                  corpo:'Lead entrou no sistema. Qualificar em até 24h.',          para:'sdr' },
  { id:'alert_lead_quente',      nome:'Lead Quente',            tipo:'warning', titulo:'Lead quente — ação imediata!',         corpo:'Lead demonstrou alto interesse. Fazer contato AGORA.',    para:'sdr' },
  { id:'alert_lead_qualificado', nome:'Lead Qualificado',       tipo:'success', titulo:'Lead pronto para agendar',             corpo:'Lead qualificado. Oferecer horário de agendamento.',      para:'sdr' },
  { id:'alert_novo_agendamento', nome:'Novo Agendamento',       tipo:'info',    titulo:'Novo agendamento confirmado',          corpo:'Novo agendamento realizado. Preparar prontuário.',        para:'secretaria' },
  { id:'alert_reagendamento',    nome:'Reagendamento',          tipo:'warning', titulo:'Consulta reagendada',                  corpo:'Consulta reagendada para nova data. Verificar agenda.',   para:'secretaria' },
  { id:'alert_cancelamento',     nome:'Cancelamento',           tipo:'error',   titulo:'Consulta cancelada',                   corpo:'Consulta cancelada. Iniciar fluxo de recuperação.',       para:'sdr' },
  { id:'alert_noshow',           nome:'No-show',                tipo:'error',   titulo:'Falta — No-show registrado',           corpo:'Paciente não compareceu. Tentar reagendar em 24h.',       para:'sdr' },
  { id:'alert_negociacao',       nome:'Negociação de Orçamento',tipo:'warning', titulo:'Paciente pediu negociação',            corpo:'Paciente quer negociar o orçamento. Acionar SDR.',        para:'sdr' },
]

// ── Templates de Tarefa ───────────────────────────────────────
window.TASK_TEMPLATE_SEEDS = [
  { id:'task_qualificar_lead',         nome:'Qualificar Lead',          titulo:'Qualificar lead recém chegado',                  para:'sdr',        prazo_horas:24,  prioridade:'alta' },
  { id:'task_followup_frio',           nome:'Follow-up Frio',           titulo:'Enviar follow-up para lead frio',                 para:'sdr',        prazo_horas:48,  prioridade:'normal' },
  { id:'task_followup_morno',          nome:'Follow-up Morno',          titulo:'Ligar para lead morno — oferecer horário',         para:'sdr',        prazo_horas:24,  prioridade:'alta' },
  { id:'task_agendar_urgente',         nome:'Agendar Urgente',          titulo:'Converter lead quente em agendamento — URGENTE',   para:'sdr',        prazo_horas:4,   prioridade:'urgente' },
  { id:'task_tentativa_contato',       nome:'Tentativa de Contato',     titulo:'Nova tentativa de contato (sem resposta)',         para:'sdr',        prazo_horas:24,  prioridade:'normal' },
  { id:'task_agendar_consulta',        nome:'Agendar Consulta',         titulo:'Agendar consulta com lead qualificado',            para:'sdr',        prazo_horas:12,  prioridade:'alta' },
  { id:'task_preparar_prontuario',     nome:'Preparar Prontuário',      titulo:'Preparar prontuário e sala para consulta',         para:'secretaria', prazo_horas:2,   prioridade:'alta' },
  { id:'task_confirmar_presenca',      nome:'Confirmar Presença',       titulo:'Confirmar presença do paciente',                   para:'secretaria', prazo_horas:24,  prioridade:'alta' },
  { id:'task_recuperar_cancelamento',  nome:'Recuperar Cancelamento',   titulo:'Tentar reagendar consulta cancelada',              para:'sdr',        prazo_horas:24,  prioridade:'alta' },
  { id:'task_recuperar_noshow',        nome:'Recuperar No-show',        titulo:'Tentar reagendar no-show',                         para:'sdr',        prazo_horas:24,  prioridade:'alta' },
  { id:'task_acompanhamento_pos',      nome:'Acompanhamento Pós',       titulo:'Ligar 72h após procedimento para acompanhamento',  para:'cs',         prazo_horas:72,  prioridade:'alta' },
  { id:'task_followup_orcamento',      nome:'Follow-up Orçamento',      titulo:'Follow-up do orçamento em aberto',                 para:'sdr',        prazo_horas:48,  prioridade:'alta' },
  { id:'task_proposta_negociacao',     nome:'Proposta de Negociação',   titulo:'Apresentar proposta de negociação',                para:'sdr',        prazo_horas:24,  prioridade:'urgente' },
  { id:'task_followup_agendamento',    nome:'Follow-up Agendamento',    titulo:'Contato de follow-up conforme combinado',          para:'sdr',        prazo_horas:0,   prioridade:'normal' },
]

// ── Fluxos ────────────────────────────────────────────────────
window.FLOW_SEEDS = [
  { id:'flow_lead_novo',        nome:'Fluxo Lead Novo',          group_id:'pre_agendamento', descricao:'Qualificação e aquecimento inicial de leads.', ativo:true, delay_entre_steps:24 },
  { id:'flow_reaquecimento',    nome:'Reaquecimento de Lead',    group_id:'pre_agendamento', descricao:'Reativar leads frios ou sem resposta.', ativo:true, delay_entre_steps:48 },
  { id:'flow_agendamento',      nome:'Fluxo de Agendamento',     group_id:'agendamento',     descricao:'Confirmação, lembretes e ação pós-falta.', ativo:true, delay_entre_steps:24 },
  { id:'flow_pos_procedimento', nome:'Pós-procedimento',         group_id:'paciente',        descricao:'Acompanhamento D0 a D3 após procedimento.', ativo:true, delay_entre_steps:24 },
  { id:'flow_orcamento',        nome:'Fluxo de Orçamento',       group_id:'pac_orcamento',   descricao:'Follow-up inteligente por tipo de objeção.', ativo:true, delay_entre_steps:48 },
]

// ── Objeções de Orçamento ─────────────────────────────────────
window.BUDGET_OBJECTION_SEEDS = [
  { id:'preco',      nome:'Preço',                     descricao:'Paciente achou caro ou quer desconto.',      flow_id:'flow_orcamento', ordem:1, ativo:true },
  { id:'medo',       nome:'Medo / Insegurança',        descricao:'Paciente tem receio do procedimento.',        flow_id:'flow_orcamento', ordem:2, ativo:true },
  { id:'tempo',      nome:'Falta de Tempo',             descricao:'Paciente alega não ter agenda disponível.',   flow_id:'flow_orcamento', ordem:3, ativo:true },
  { id:'pensar',     nome:'Precisa Pensar',             descricao:'Paciente pediu prazo para decidir.',          flow_id:'flow_orcamento', ordem:4, ativo:true },
  { id:'conjuge',    nome:'Consultar cônjuge',          descricao:'Decisão depende de outra pessoa.',            flow_id:'flow_orcamento', ordem:5, ativo:true },
  { id:'comparacao', nome:'Comparando preços',          descricao:'Está pesquisando em outros lugares.',         flow_id:'flow_orcamento', ordem:6, ativo:true },
  { id:'prioridade', nome:'Sem prioridade agora',       descricao:'Não está com o procedimento como prioridade.',flow_id:'flow_orcamento', ordem:7, ativo:true },
  { id:'inseguranca',nome:'Insegurança com resultado',  descricao:'Dúvida sobre a eficácia do tratamento.',     flow_id:'flow_orcamento', ordem:8, ativo:true },
  { id:'agenda',     nome:'Problema de Agenda',         descricao:'Não encontrou horário compatível.',           flow_id:'flow_orcamento', ordem:9, ativo:true },
  { id:'outro',      nome:'Outro',                      descricao:'Motivo não categorizado.',                    flow_id:null,             ordem:10,ativo:true },
]

// ── Colunas do Kanban por grupo ───────────────────────────────
window.KANBAN_COLUMNS = {
  pre_agendamento: [
    { id:'col_novo_lead',      nome:'Novo lead',      cor:'#6366F1', ordem:1 },
    { id:'col_em_conversa',    nome:'Em conversa',    cor:'#818CF8', ordem:2 },
    { id:'col_frio',           nome:'Frio',           cor:'#93C5FD', ordem:3 },
    { id:'col_morno',          nome:'Morno',          cor:'#FDE68A', ordem:4 },
    { id:'col_quente',         nome:'Quente',         cor:'#FCA5A5', ordem:5 },
    { id:'col_sem_resposta',   nome:'Sem resposta',   cor:'#D1D5DB', ordem:6 },
    { id:'col_qualificado',    nome:'Qualificado',    cor:'#6EE7B7', ordem:7 },
    { id:'col_desqualificado', nome:'Desqualificado', cor:'#9CA3AF', ordem:8 },
  ],
  agendamento: [
    { id:'col_agendado',       nome:'Agendado',                cor:'#3B82F6', ordem:1 },
    { id:'col_ag_confirmacao', nome:'Aguardando confirmação',   cor:'#F59E0B', ordem:2 },
    { id:'col_confirmado',     nome:'Confirmado',              cor:'#059669', ordem:3 },
    { id:'col_reagendado',     nome:'Reagendado',              cor:'#F97316', ordem:4 },
    { id:'col_cancelado',      nome:'Cancelado',               cor:'#EF4444', ordem:5 },
    { id:'col_falta',          nome:'Falta',                   cor:'#DC2626', ordem:6 },
  ],
  paciente: [
    { id:'col_em_atendimento', nome:'Em atendimento',  cor:'#10B981', ordem:1 },
    { id:'col_pos_consulta',   nome:'Pós-consulta',    cor:'#34D399', ordem:2 },
    { id:'col_pos_proc',       nome:'Pós-procedimento',cor:'#14B8A6', ordem:3 },
    { id:'col_ag_retorno',     nome:'Aguardando retorno',cor:'#0EA5E9',ordem:4 },
  ],
  orcamento: [
    { id:'col_orc_em_aberto',  nome:'Em aberto',          cor:'#FCD34D', ordem:1 },
    { id:'col_orc_enviado',    nome:'Orçamento enviado',   cor:'#F59E0B', ordem:2 },
    { id:'col_orc_negociacao', nome:'Em negociação',       cor:'#F97316', ordem:3 },
    { id:'col_orc_followup',   nome:'Follow-up',           cor:'#FDE68A', ordem:4 },
    { id:'col_orc_aprovado',   nome:'Aprovado',            cor:'#059669', ordem:5 },
    { id:'col_orc_perdido_s',  nome:'Perdido',             cor:'#9CA3AF', ordem:6 },
  ],
  pac_orcamento: [
    { id:'col_orc_aberto',     nome:'Orçamento aberto',cor:'#A78BFA', ordem:1 },
    { id:'col_negociacao',     nome:'Em negociação',   cor:'#F59E0B', ordem:2 },
    { id:'col_followup_orc',   nome:'Follow-up',       cor:'#C4B5FD', ordem:3 },
    { id:'col_orc_fechado',    nome:'Fechado',         cor:'#059669', ordem:4 },
    { id:'col_orc_perdido',    nome:'Perdido',         cor:'#9CA3AF', ordem:5 },
  ],
}

// ── Status da consulta no dia ─────────────────────────────────
window.APPOINTMENT_DAY_STATUSES = [
  { id:'aguardando',   nome:'Aguardando',    cor:'#F59E0B' },
  { id:'na_clinica',   nome:'Na clínica',    cor:'#10B981' },
  { id:'em_consulta',  nome:'Em consulta',   cor:'#7C3AED' },
  { id:'finalizado',   nome:'Finalizado',    cor:'#6B7280' },
  { id:'falta',        nome:'Falta',         cor:'#EF4444' },
]

// ── Mapeamento de destinatários ───────────────────────────────
window.TAREFA_PARA_OPTS = [
  { id:'sdr',        nome:'SDR / Comercial' },
  { id:'secretaria', nome:'Secretária'      },
  { id:'cs',         nome:'CS / Pós-venda'  },
  { id:'clinica',    nome:'Equipe Clínica'  },
  { id:'gestao',     nome:'Gestão'          },
]

})()
