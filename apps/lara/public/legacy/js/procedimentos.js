;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════
//  PROCEDIMENTOS ESTÉTICOS — Módulo de cadastro e gestão
// ══════════════════════════════════════════════════════════════

const PROC_KEY = 'clinic_procedimentos'

let _procsCache = null

function _isProcUuid(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) }

function getProcs() {
  if (_procsCache !== null) return _procsCache
  try { return JSON.parse(localStorage.getItem(PROC_KEY) || '[]') } catch { return [] }
}
function saveProcs(d) { try { store.set(PROC_KEY, d) } catch (e) { if (e.name === 'QuotaExceededError') console.warn('ClinicAI: localStorage cheio.') } }

async function _loadProcedimentos() {
  if (!window.ProcedimentosRepository) return
  const r = await window.ProcedimentosRepository.getAll(false)
  if (r.ok) _procsCache = r.data ?? []
}

// ── Categorias ────────────────────────────────────────────────
const PROC_CATEGORIAS = [
  { id: 'injetavel',   nome: 'Procedimentos Injetáveis', icon: 'droplet',  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { id: 'manual',      nome: 'Procedimentos Manuais',    icon: 'wind',     color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  { id: 'tecnologia',  nome: 'Tecnologias',              icon: 'zap',      color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
]

function _getCat(id) { return PROC_CATEGORIAS.find(c => c.id === id) || { id, nome: id, icon: 'circle', color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' } }

// ── Protocolos padrão por categoria ──────────────────────────
const PROC_PROTOCOLS = {
  injetavel: {
    cuidados_pre: [
      'Evitar anti-inflamatórios (AAS, ibuprofeno) 7 dias antes',
      'Evitar álcool 24h antes',
      'Remover maquiagem antes do procedimento',
      'Informar uso de anticoagulantes ou antiagregantes',
      'Informar histórico de herpes labial (profilaxia antiviral se indicado)',
      'Não realizar procedimentos estéticos na área 2 semanas antes',
      'Fazer limpeza de pele suave 2-3 dias antes',
    ],
    cuidados_pos: [
      'Evitar pressão ou massagem na área tratada por 48h',
      'Aplicar compressa fria suavemente se necessário',
      'Evitar calor excessivo (sauna, banho muito quente, sol direto) por 72h',
      'Não fazer exercícios físicos por 24h',
      'Usar protetor solar FPS 30+ diariamente',
      'Evitar maquiagem no local por 24h',
      'Não realizar outros procedimentos estéticos por 15 dias',
      'Retornar conforme protocolo para avaliação do resultado',
    ],
    contraindicacoes: [
      'Gestação e amamentação',
      'Infecção ativa na área de aplicação',
      'Hipersensibilidade ao produto utilizado',
      'Doenças autoimunes ativas',
      'Coagulopatias não controladas',
      'Menores de 18 anos',
    ],
  },
  manual: {
    cuidados_pre: [
      'Não fazer uso de cremes ativos (ácidos, retinol) 3 dias antes',
      'Remover maquiagem antes do procedimento',
      'Informar alergias a cosméticos ou ativos',
      'Evitar exposição solar intensa 48h antes',
    ],
    cuidados_pos: [
      'Usar protetor solar FPS 30+ diariamente',
      'Evitar exposição solar direta por 48h',
      'Manter hidratação tópica adequada',
      'Não usar ácidos ou produtos agressivos por 3 dias',
    ],
    contraindicacoes: [
      'Infecção ativa ou feridas abertas na área',
      'Rosácea em fase ativa',
      'Hipersensibilidade a ingredientes dos cosméticos usados',
      'Gestação (relativo — avaliar produto a produto)',
    ],
  },
  tecnologia: {
    cuidados_pre: [
      'Não usar autobronzeador 2 semanas antes',
      'Evitar exposição solar intensa 2 semanas antes',
      'Remover maquiagem e protetor solar antes do procedimento',
      'Informar uso de medicamentos fotossensibilizantes (minociclina, isotretinoína)',
      'Informar histórico de queloides ou cicatrizes hipertróficas',
      'Rapar a área se necessário (para tratamentos de laser corporal)',
    ],
    cuidados_pos: [
      'Usar protetor solar FPS 50+ diariamente — obrigatório',
      'Evitar exposição solar direta por 7-14 dias após o procedimento',
      'Evitar calor excessivo (sauna, banho muito quente) por 48h',
      'Não esfregar ou manipular a área tratada por 24h',
      'Manter hidratação tópica intensa',
      'Evitar exercícios físicos intensos por 24h',
      'Não realizar outros procedimentos estéticos por 15 dias (salvo protocolo combinado)',
      'Retornar conforme protocolo de sessões prescrito',
    ],
    contraindicacoes: [
      'Gestação e amamentação',
      'Implantes metálicos na área a ser tratada (avaliar modelo)',
      'Marcapasso ou dispositivos eletrônicos implantáveis (avaliar)',
      'Câncer ativo ou histórico recente (<2 anos) na área',
      'Doenças autoimunes ativas',
      'Pele bronzeada recente ou autobronzeador ativo',
      'Uso de isotretinoína nos últimos 6 meses (laser ablativo)',
      'Fotossensibilidade ou uso de fotossensibilizantes',
      'Infecção ativa na área de tratamento',
    ],
  },
}

// ── Seeds: procedimentos padrão ───────────────────────────────
const PROC_SEEDS = [
  // ── Injetáveis ───────────────────────────────────────────
  {
    id: 'lifting_5d', nome: 'Lifting 5D', categoria: 'injetavel',
    descricao: 'Protocolo completo de rejuvenescimento facial com múltiplos injetáveis (neurotoxina, ácido hialurônico, bioestimulador), abordando as 5 dimensões do envelhecimento.',
    duracao: 90, sessoes: 1,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Protocolo combinado: toxina + preenchimento + bioestimulador. Planejamento individualizado por sessão.',
  },
  {
    id: 'botox_regenerativo', nome: 'Botox Regenerativo', categoria: 'injetavel',
    descricao: 'Aplicação de toxina botulínica em micropontos dispersos para estimular renovação celular e melhora da qualidade da pele, além do efeito neuromodulador.',
    duracao: 60, sessoes: 1,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Micropontos superficiais com doses baixas. Indicado para pele sem viço, poros dilatados e rugas finas.',
  },
  {
    id: 'preenchimento_full_face', nome: 'Preenchimento Full Face', categoria: 'injetavel',
    descricao: 'Preenchimento global da face com ácido hialurônico, abordando múltiplas regiões para restaurar volume, contorno e harmonia facial completa.',
    duracao: 90, sessoes: 1,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Planejamento com mapeamento facial. Pode combinar diferentes densidades de HA por região.',
  },
  {
    id: 'preenchimento_labial', nome: 'Preenchimento Labial', categoria: 'injetavel',
    descricao: 'Preenchimento com ácido hialurônico para aumento de volume, definição do contorno labial e hidratação.',
    duracao: 45, sessoes: 1,
    cuidados_pre: ['Profilaxia antiviral se histórico de herpes labial (iniciar 2 dias antes)'],
    cuidados_pos: ['Evitar pressão nos lábios por 48h', 'Não fazer movimentos exagerados de boca por 24h', 'Evitar besijos e canudinhos por 24h'],
    contraindicacoes: ['Herpes labial ativo'],
    observacoes: 'Resultados imediatos. Edema esperado nas primeiras 48h. Resultado final avaliado em 15 dias.',
  },
  {
    id: 'preenchimento_olheiras', nome: 'Preenchimento de Olheiras', categoria: 'injetavel',
    descricao: 'Preenchimento do sulco lacrimal (tear trough) com ácido hialurônico de baixa densidade para correção de olheiras côncavas e perda de volume periorbital.',
    duracao: 45, sessoes: 1,
    cuidados_pre: [], cuidados_pos: [],
    contraindicacoes: ['Edema palpebral crônico não tratado', 'Olheiras de causa vascular predominante (relativo)'],
    observacoes: 'Técnica delicada. Usar produto de baixa viscosidade. Risco de efeito Tyndall se superficial. Retorno em 15 dias.',
  },
  {
    id: 'preenchimento_mandibula', nome: 'Preenchimento de Mandíbula', categoria: 'injetavel',
    descricao: 'Definição e estruturação do contorno mandibular com ácido hialurônico de alta densidade.',
    duracao: 60, sessoes: 1,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Ideal para harmonização do terço inferior. Pode ser combinado com mento e pescoço.',
  },
  {
    id: 'preenchimento_malar', nome: 'Preenchimento de Malar', categoria: 'injetavel',
    descricao: 'Volumização e projeção da região malar (maçãs do rosto) com ácido hialurônico para restaurar volume perdido e elevar o terço médio da face.',
    duracao: 60, sessoes: 1,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Efeito lifting indireto no terço médio. Combinar com rinomodelação e mandíbula para harmonização completa.',
  },
  {
    id: 'preenchimento_mento', nome: 'Preenchimento de Mento', categoria: 'injetavel',
    descricao: 'Projeção e modelagem do mento (queixo) com ácido hialurônico para harmonização do perfil facial.',
    duracao: 45, sessoes: 1,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Resultado imediato. Avaliar perfil e relação queixo-nariz. Pode evitar necessidade de mentoplastia cirúrgica.',
  },
  {
    id: 'rinomodelacao', nome: 'Rinomodelação', categoria: 'injetavel',
    descricao: 'Harmonização do nariz com ácido hialurônico sem cirurgia, corrigindo desvios, dorso, ponta e base nasal.',
    duracao: 45, sessoes: 1,
    cuidados_pre: [], cuidados_pos: ['Não usar óculos apoiados no nariz por 2 semanas'],
    contraindicacoes: ['Nariz operado com implante (relativo — avaliar)', 'Pele muito fina ou nariz com circulação comprometida'],
    observacoes: 'Área de alto risco vascular. Ter hialuronidase disponível. Injetar lentamente, em pequenos volumes, aspirar antes.',
  },
  {
    id: 'bioestimulador_colageno', nome: 'Bio Estimulador de Colágeno', categoria: 'injetavel',
    descricao: 'Aplicação de bioestimulador (PLLA, CaHA ou PCL) para estimular produção endógena de colágeno, melhorando firmeza e qualidade da pele.',
    duracao: 60, sessoes: 3,
    cuidados_pre: [], cuidados_pos: ['Realizar massagem conforme protocolo do produto (regra 5-5-5 para PLLA)'],
    contraindicacoes: ['Tendência a queloides', 'Câncer ativo ou em tratamento oncológico'],
    observacoes: 'Resultado progressivo (2-3 meses). Protocolo geralmente de 2-3 sessões. Escolher produto conforme indicação clínica.',
  },
  {
    id: 'tirzepatida', nome: 'Aplicação de Tirzepatida', categoria: 'injetavel',
    descricao: 'Aplicação subcutânea de tirzepatida (agonista duplo GIP/GLP-1) para controle de peso e tratamento de obesidade.',
    duracao: 30, sessoes: 4,
    cuidados_pre: ['Avaliação médica prévia obrigatória', 'Exames laboratoriais recentes', 'Informar histórico de pancreatite, doença renal ou tireoide'],
    cuidados_pos: ['Monitorar efeitos gastrointestinais (náusea, vômito)', 'Manter dieta orientada e hidratação adequada', 'Retorno mensal para ajuste de dose'],
    contraindicacoes: ['Gestação e amamentação', 'Histórico pessoal ou familiar de carcinoma medular de tireoide', 'Pancreatite ativa ou histórico de pancreatite', 'Doença renal grave', 'DM tipo 1'],
    observacoes: 'Prescrição e aplicação exclusivamente médica. Titulação gradual de dose. Monitoramento contínuo.',
  },
  {
    id: 'ozonoterapia_facial', nome: 'Ozonoterapia Facial', categoria: 'injetavel',
    descricao: 'Aplicação de ozônio medicinal na região facial para rejuvenescimento, tratamento de acne, rosácea e infecções localizadas.',
    duracao: 45, sessoes: 6,
    cuidados_pre: ['Não fumar no dia do procedimento', 'Remover maquiagem antes'],
    cuidados_pos: ['Manter hidratação tópica', 'Usar protetor solar FPS 30+'],
    contraindicacoes: ['Hipertireoidismo não controlado', 'Déficit de G6PD (favismo)', 'Gestação', 'Epilepsia não controlada', 'Infarto agudo do miocárdio recente'],
    observacoes: 'Efeito antioxidante, imunomodulador e antimicrobiano. Protocolo de sessões semanal ou quinzenal.',
  },
  {
    id: 'ozonoterapia_corporal', nome: 'Ozonoterapia Corporal', categoria: 'injetavel',
    descricao: 'Aplicação de ozônio medicinal em regiões corporais para tratamento de celulite, cicatrizes, dores musculares e articulares.',
    duracao: 60, sessoes: 8,
    cuidados_pre: ['Não fumar no dia do procedimento'],
    cuidados_pos: ['Hidratação oral abundante', 'Evitar exercícios intensos por 24h'],
    contraindicacoes: ['Hipertireoidismo não controlado', 'Déficit de G6PD (favismo)', 'Gestação', 'Epilepsia não controlada', 'Trombocitopenia grave'],
    observacoes: 'Aplicação intradérmica, subcutânea ou intravenosa conforme indicação. Protocolo individualizado.',
  },

  // ── Manuais ──────────────────────────────────────────────
  {
    id: 'limpeza_pele', nome: 'Limpeza de Pele', categoria: 'manual',
    descricao: 'Limpeza profunda da pele com extração de comedões, esfoliação e hidratação, melhorando textura e aparência da pele.',
    duracao: 60, sessoes: 1,
    cuidados_pre: ['Não usar ácidos (AHA, BHA, retinol) 3 dias antes', 'Não depilar o rosto 3 dias antes', 'Remover maquiagem'],
    cuidados_pos: ['Não usar maquiagem por 24h', 'Usar protetor solar FPS 30+', 'Evitar sol direto por 48h', 'Não usar ácidos por 3 dias após', 'Manter hidratação tópica'],
    contraindicacoes: ['Rosácea em crise', 'Acne inflamatória grave (relativo — adaptar protocolo)', 'Feridas abertas na face', 'Herpes labial ativo'],
    observacoes: 'Frequência recomendada: mensal. Adaptar protocolo ao tipo e condição da pele.',
  },
  {
    id: 'drenagem_linfatica', nome: 'Drenagem Linfática', categoria: 'manual',
    descricao: 'Massagem manual específica para estimular o sistema linfático, reduzindo edema, toxinas e melhorando circulação.',
    duracao: 60, sessoes: 10,
    cuidados_pre: ['Estar hidratado (beber água antes)', 'Não fazer refeição pesada 1h antes'],
    cuidados_pos: ['Beber bastante água após (mínimo 2L no dia)', 'Evitar álcool no dia', 'Pode sentir vontade frequente de urinar — é esperado'],
    contraindicacoes: ['Insuficiência cardíaca descompensada', 'Trombose venosa profunda ativa', 'Infecção aguda ou febre', 'Câncer sem avaliação oncológica prévia', 'Hipotireoidismo não controlado'],
    observacoes: 'Indicada pós-procedimentos cirúrgicos e estéticos, gestação, retenção de líquidos e linfedema.',
  },

  // ── Tecnologias Fotona ───────────────────────────────────
  {
    id: 'fotona_4d', nome: 'Fotona 4D', categoria: 'tecnologia',
    descricao: 'Protocolo Fotona completo com 4 modos de tratamento (Smooth, FRAC3, Piano, SupErficial) para rejuvenescimento facial global, tonificação e lifting sem cirurgia.',
    duracao: 90, sessoes: 3,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Tratamento padrão-ouro da Fotona. Aborda superfície, derme e SMAS. Sem downtime. Resultado progressivo.',
  },
  {
    id: 'fotona_veu_noiva', nome: 'Fotona Véu de Noiva', categoria: 'tecnologia',
    descricao: 'Protocolo luminosidade e textura da pele, indicado para preparação pré-evento. Combinação de modos para efeito radiance e skin glow.',
    duracao: 60, sessoes: 1,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Indicado como tratamento de véspera para eventos importantes. Sem downtime. Efeito imediato de luminosidade.',
  },
  {
    id: 'fotona_smootheye', nome: 'Fotona SmoothEye — Pálpebras', categoria: 'tecnologia',
    descricao: 'Tratamento Fotona específico para a região periorbital e pálpebras, reduzindo flacidez, rugas finas e papada palpebral sem cirurgia.',
    duracao: 45, sessoes: 3,
    cuidados_pre: ['Usar protetor ocular fornecido pela clínica durante o procedimento'],
    cuidados_pos: ['Não esfregar os olhos por 24h', 'Usar lubrificante ocular se indicado', 'Protetor solar ao redor dos olhos'],
    contraindicacoes: ['Implantes oculares metálicos', 'Glaucoma avançado (relativo)', 'Blefarite ativa'],
    observacoes: 'Alternativa não cirúrgica à blefaroplastia leve. Combina lifting e suavização da pálpebra.',
  },
  {
    id: 'fotona_vectorlift', nome: 'Fotona VectorLift — Arqueamento de Sobrancelhas', categoria: 'tecnologia',
    descricao: 'Lifting vetorial de sobrancelhas e região frontal com laser Fotona, promovendo efeito de arqueamento e elevação sem toxina.',
    duracao: 45, sessoes: 3,
    cuidados_pre: [], cuidados_pos: [], contraindicacoes: [],
    observacoes: 'Resultado natural e progressivo. Pode ser combinado com toxina botulínica para efeito potencializado.',
  },
  {
    id: 'fotona_microcoring', nome: 'Fotona MicroCoring — Código de Barras', categoria: 'tecnologia',
    descricao: 'Tratamento Fotona para rugas periorais (código de barras), suavizando as linhas verticais do lábio superior com ablação fracionada.',
    duracao: 45, sessoes: 3,
    cuidados_pre: [], cuidados_pos: ['Cuidado extremo com proteção solar na área tratada por 2 semanas'],
    contraindicacoes: ['Herpes labial ativo — necessária profilaxia antiviral'],
    observacoes: 'Profilaxia antiviral obrigatória. Downtime leve (3-5 dias de vermelhidão). Resultado excelente em rugas de fumantes.',
  },
  {
    id: 'fotona_liplase', nome: 'Fotona LipLase — Aumento dos Lábios', categoria: 'tecnologia',
    descricao: 'Estimulação a laser da mucosa labial para aumento não invasivo do volume e definição dos lábios, sem agulhas.',
    duracao: 30, sessoes: 4,
    cuidados_pre: [], cuidados_pos: ['Hidratação labial intensiva após o procedimento'],
    contraindicacoes: ['Herpes labial ativo — profilaxia antiviral indicada'],
    observacoes: 'Procedimento indolor, sem downtime. Resultado gradual com estímulo de colágeno labial. Excelente para quem não deseja agulhas.',
  },
  {
    id: 'fotona_tightsculpting', nome: 'Fotona TightSculpting — Gordura e Flacidez Corporal', categoria: 'tecnologia',
    descricao: 'Tratamento não invasivo para redução de gordura localizada e flacidez corporal com laser Fotona modo Piano + Smooth.',
    duracao: 60, sessoes: 6,
    cuidados_pre: [], cuidados_pos: ['Hidratação abundante no dia', 'Drenagem linfática após 48h recomendada'],
    contraindicacoes: [],
    observacoes: 'Sem downtime. Eficaz para abdômen, flancos, coxas, braços e glúteos. Combinar com procedimentos injetáveis lipolíticos para potencializar.',
  },
  {
    id: 'fotona_thermolipolise', nome: 'Fotona ThermoLipolise — Lipólise', categoria: 'tecnologia',
    descricao: 'Lipólise térmica com laser Fotona para dissolução de gordura localizada e remodelação corporal.',
    duracao: 60, sessoes: 4,
    cuidados_pre: [], cuidados_pos: ['Drenagem linfática após 48h', 'Cinta modeladora se indicado'],
    contraindicacoes: [],
    observacoes: 'Associar com drenagem linfática para melhor resultado. Protocolo de manutenção a cada 3 meses.',
  },
  {
    id: 'fotona_nightlase', nome: 'Fotona NightLase — Melhora do Sono', categoria: 'tecnologia',
    descricao: 'Tratamento Fotona intraoral para redução do ronco e melhora da qualidade do sono, através da contração e firmamento dos tecidos da orofaringe.',
    duracao: 45, sessoes: 3,
    cuidados_pre: ['Não comer 2h antes do procedimento'],
    cuidados_pos: ['Evitar álcool e cigarros por 24h', 'Evitar alimentos muito quentes por 24h'],
    contraindicacoes: ['Apneia obstrutiva grave (encaminhar para otorrinolaringologista)', 'Infecção ativa na orofaringe'],
    observacoes: 'Protocolo de 3 sessões mensais. Manutenção anual. Combinar com avaliação do sono.',
  },
  {
    id: 'fotona_hairestart', nome: 'Fotona HaiRestart — Crescimento Capilar', categoria: 'tecnologia',
    descricao: 'Estimulação do couro cabeludo com laser Fotona para crescimento capilar e tratamento de alopecia androgenética.',
    duracao: 45, sessoes: 6,
    cuidados_pre: ['Lavar os cabelos antes do procedimento', 'Não usar produtos capilares no dia'],
    cuidados_pos: ['Evitar exposição solar direta no couro cabeludo por 48h', 'Não lavar o cabelo por 12h'],
    contraindicacoes: ['Alopecia cicatricial (relativo)', 'Infecção ativa no couro cabeludo'],
    observacoes: 'Combinar com PRP capilar para resultado potencializado. Protocolo quinzenal ou mensal.',
  },
  {
    id: 'fotona_active_acne', nome: 'Fotona Active Acne — Acne Ativa', categoria: 'tecnologia',
    descricao: 'Tratamento Fotona com modo FRAC3 e Smooth para redução da acne ativa, sebáceos e inflamação folicular.',
    duracao: 45, sessoes: 6,
    cuidados_pre: ['Não usar isotretinoína nos últimos 6 meses', 'Remover maquiagem'],
    cuidados_pos: ['Usar protetor solar FPS 50+ obrigatório', 'Não manipular lesões após o tratamento', 'Manter rotina de skincare leve'],
    contraindicacoes: ['Uso atual de isotretinoína', 'Pele com infecção bacteriana generalizada ativa'],
    observacoes: 'Combinar com peeling químico leve e skincare adequado. Avaliar causas hormonais da acne.',
  },
  {
    id: 'fotona_orangelase', nome: 'Fotona OrangeLase — Celulite', categoria: 'tecnologia',
    descricao: 'Tratamento Fotona para celulite (fibroedema geloide) com ação nos septos fibrosos subcutâneos e estimulação do colágeno dérmico.',
    duracao: 60, sessoes: 8,
    cuidados_pre: [], cuidados_pos: ['Drenagem linfática recomendada após 48h', 'Manter atividade física regular para potencializar resultado'],
    contraindicacoes: [],
    observacoes: 'Combinar com TightSculpting e procedimentos injetáveis (lipólise). Resultado melhor em celulite grau I-II.',
  },
  {
    id: 'fotona_linelase', nome: 'Fotona LineLase — Estrias', categoria: 'tecnologia',
    descricao: 'Tratamento Fotona para estrias brancas e vermelhas com estimulação de colágeno e remodelação tecidual.',
    duracao: 60, sessoes: 6,
    cuidados_pre: [], cuidados_pos: ['Protetor solar FPS 50+ obrigatório na área tratada', 'Hidratação intensa na área'],
    contraindicacoes: [],
    observacoes: 'Estrias recentes (vermelhas) respondem melhor. Estrias antigas exigem mais sessões. Combinar com microagulhamento.',
  },
  {
    id: 'fotona_lipedema', nome: 'Fotona LipedemaXtreme — Lipedema', categoria: 'tecnologia',
    descricao: 'Protocolo Fotona especializado para lipedema, reduzindo a inflamação, a fibrose e o acúmulo de gordura dolorosa característica da condição.',
    duracao: 60, sessoes: 10,
    cuidados_pre: ['Usar meias de compressão pré-procedimento se indicado'],
    cuidados_pos: ['Usar meias de compressão após o procedimento', 'Drenagem linfática recomendada', 'Hidratação oral abundante'],
    contraindicacoes: ['Trombose venosa profunda ativa', 'Insuficiência venosa grave não tratada'],
    observacoes: 'Tratamento complementar ao lipedema — não é curativo. Combinar com drenagem linfática e orientação nutricional.',
  },
  {
    id: 'fotona_dores_musculares', nome: 'Fotona Dores Musculares — Ponteira Marco', categoria: 'tecnologia',
    descricao: 'Tratamento de dores musculares, pontos de gatilho e tensões com laser Fotona utilizando ponteira Marco para analgesia e relaxamento tecidual.',
    duracao: 45, sessoes: 4,
    cuidados_pre: [], cuidados_pos: ['Evitar esforço físico intenso na área por 24h'],
    contraindicacoes: ['Área com implante metálico (avaliar)', 'Neoplasia ativa na área tratada'],
    observacoes: 'Eficaz para DTM, tensão cervical, lombalgia e pontos de gatilho miofasciais. Combinar com fisioterapia.',
  },
  {
    id: 'fotona_clearsteps', nome: 'Fotona ClearSteps — Onicomicose', categoria: 'tecnologia',
    descricao: 'Tratamento a laser das unhas para onicomicose (fungo das unhas), sem medicação sistêmica e com excelente tolerância.',
    duracao: 30, sessoes: 4,
    cuidados_pre: ['Remover esmalte ou gel das unhas', 'Higienizar os pés antes do procedimento'],
    cuidados_pos: ['Não usar esmalte por 48h', 'Usar meias limpas e calçados arejados', 'Desinfetar calçados durante o tratamento'],
    contraindicacoes: ['Neuropatia periférica grave (cuidado com feedback de dor)', 'Psoríase ungueal (diagnóstico diferencial)'],
    observacoes: 'Protocolo de 4 sessões mensais. Orientar higiene rigorosa. Taxa de cura variável — complementar com antifúngico tópico.',
  },
  {
    id: 'fotona_intimalase', nome: 'Fotona IntimaLase — Rejuvenescimento Íntimo', categoria: 'tecnologia',
    descricao: 'Tratamento a laser Er:YAG intra-vaginal para rejuvenescimento da mucosa vaginal, frouxidão e atrofia.',
    duracao: 30, sessoes: 3,
    cuidados_pre: ['Ausência de infecção vaginal ativa — coleta de secreção prévia se necessário', 'Período menstrual: aguardar término', 'Não ter relação sexual 3 dias antes'],
    cuidados_pos: ['Abstinência sexual por 7 dias', 'Não usar absorventes internos por 7 dias', 'Usar calcinhas de algodão', 'Não fazer banho de banheira ou piscina por 7 dias'],
    contraindicacoes: ['Infecção vaginal ativa (candidíase, vaginose, tricomoníase)', 'Gestação', 'Câncer ginecológico ativo', 'Período menstrual', 'DIU de cobre (relativo)'],
    observacoes: 'Protocolo de 3 sessões com intervalo de 4-6 semanas. Resultado progressivo. Combinar com RenovaLase para síndrome geniturinária.',
  },
  {
    id: 'fotona_incontinase', nome: 'Fotona IncontiLase — Incontinência Urinária', categoria: 'tecnologia',
    descricao: 'Tratamento a laser Er:YAG para incontinência urinária de esforço leve a moderada, fortalecendo os tecidos de suporte do assoalho pélvico.',
    duracao: 30, sessoes: 3,
    cuidados_pre: ['Exame de urina (urocultura) prévia para excluir ITU', 'Urodinâmica se indicada pelo médico', 'Período menstrual: aguardar término'],
    cuidados_pos: ['Abstinência sexual por 7 dias', 'Não usar absorventes internos por 7 dias', 'Evitar esforços físicos intensos por 48h'],
    contraindicacoes: ['Infecção urinária ativa', 'Incontinência de urgência (outra indicação)', 'Prolapso grau III ou IV (indicação cirúrgica)', 'Gestação'],
    observacoes: 'Tratamento complementar. Combinar com fisioterapia pélvica para resultado otimizado. Avaliação ginecológica prévia obrigatória.',
  },
  {
    id: 'fotona_prolapse', nome: 'Fotona Prolapse — Prolapso Uterino Leve', categoria: 'tecnologia',
    descricao: 'Tratamento a laser para prolapso uterino leve (grau I-II), com contração e reforço dos tecidos de suporte.',
    duracao: 30, sessoes: 3,
    cuidados_pre: ['Avaliação ginecológica prévia obrigatória', 'Descarte de lesões malignas', 'Período menstrual: aguardar término'],
    cuidados_pos: ['Abstinência sexual por 7 dias', 'Não usar absorventes internos por 7 dias', 'Evitar esforços físicos por 48h'],
    contraindicacoes: ['Prolapso grau III ou IV (indicação cirúrgica)', 'Câncer ginecológico', 'Gestação', 'Infecção vaginal ativa'],
    observacoes: 'Indicado apenas para prolapso leve. Casos moderados/graves: encaminhar para cirurgia. Avaliação ginecológica obrigatória.',
  },
  {
    id: 'fotona_intimawave', nome: 'Fotona IntimaWave — Disfunções Pélvicas Femininas', categoria: 'tecnologia',
    descricao: 'Tratamento com ondas de choque de baixa intensidade para disfunções pélvicas femininas, melhorando vascularização e sensibilidade.',
    duracao: 30, sessoes: 6,
    cuidados_pre: ['Período menstrual: aguardar término', 'Não ter relação sexual 24h antes'],
    cuidados_pos: ['Abstinência sexual por 48h', 'Hidratação oral adequada'],
    contraindicacoes: ['Gestação', 'DIU de cobre na área de aplicação (relativo)', 'Neoplasia pélvica ativa', 'Infecção vaginal ativa'],
    observacoes: 'Indicado para dor pélvica crônica, dispareunia, disfunção sexual feminina. Combinar com IntimaLase para resultado completo.',
  },
  {
    id: 'fotona_renovalase', nome: 'Fotona RenovaLase — Síndrome Geniturinária da Menopausa', categoria: 'tecnologia',
    descricao: 'Tratamento a laser Er:YAG para síndrome geniturinária da menopausa (atrofia vaginal, secura, dispareunia), restaurando a mucosa e lubrificação.',
    duracao: 30, sessoes: 3,
    cuidados_pre: ['Avaliação ginecológica prévia', 'Cytologia oncótica em dia', 'Período menstrual: aguardar término'],
    cuidados_pos: ['Abstinência sexual por 7 dias', 'Não usar absorventes internos por 7 dias', 'Hidratante vaginal prescrito se indicado'],
    contraindicacoes: ['Câncer ginecológico ativo ou histórico recente', 'Gestação', 'Infecção vaginal ativa', 'Herpes genital ativo — profilaxia antiviral'],
    observacoes: 'Excelente alternativa à terapia hormonal tópica. Combinar com IncontiLase se houver incontinência associada.',
  },
  {
    id: 'depilacao_laser', nome: 'Depilação a Laser', categoria: 'tecnologia',
    descricao: 'Depilação definitiva a laser com fototermólise seletiva para destruição do folículo piloso.',
    duracao: 30, sessoes: 8,
    cuidados_pre: [
      'Não depilar com cera ou pinça 4 semanas antes (pode raspar)',
      'Não fazer exposição solar na área por 2-4 semanas antes',
      'Não usar autobronzeador na área',
      'Raspar a área no dia anterior ao procedimento',
      'Não usar cremes ou desodorante no dia (axilas)',
    ],
    cuidados_pos: [
      'Usar protetor solar FPS 50+ na área por 2-4 semanas após',
      'Não se expor ao sol por 2 semanas',
      'Não depilar com cera ou pinça entre as sessões',
      'Evitar calor excessivo (sauna, banho muito quente) por 48h',
      'Não esfregar a área vigorosamente por 24h',
    ],
    contraindicacoes: [
      'Pele bronzeada recente ou autobronzeador ativo na área',
      'Vitiligo ou albinismo (relativo — contraindicação relativa)',
      'Uso de isotretinoína (aguardar 6 meses)',
      'Fotossensibilização ativa',
      'Gestação (relativo — evitar área pélvica e abdômen)',
      'Tatuagem na área a ser tratada',
    ],
    observacoes: 'Número de sessões variável conforme tipo de pelo e fotótipo. Cabelos brancos/loiros não respondem ao laser. Intervalo entre sessões: 4-8 semanas.',
  },
]

// ── Estado interno ────────────────────────────────────────────
let _procView    = 'grid'   // 'grid' | 'list'
let _procFilter  = { q: '', categoria: '' }
let _procDetail  = null     // id do procedimento no painel
let _procFormId  = null     // id em edição (null = novo)
let _initialized = false
// Wizard form
let _pfData = {}            // dados do formulário em edição
let _pfStep = 1             // passo atual (1-4)

// ── CRUD ──────────────────────────────────────────────────────
function _ensureSeeds() {
  // Só semeia em fallback puro localStorage. Se o repo Supabase
  // está disponível, _loadProcedimentos populou _procsCache (mesmo
  // que vazio); nunca poluímos com seeds nesse caso.
  if (window.ProcedimentosRepository) return
  const stored = getProcs()
  if (stored.length > 0) return
  saveProcs(PROC_SEEDS.map(s => ({ ...s, preco: 0, preco_promo: 0, ativo: true })))
}

function _getProc(id) { return getProcs().find(p => p.id === id) }

async function _saveProc(proc) {
  if (window.ProcedimentosRepository) {
    // Insumos: padroniza pra { injetavel_id, qtd_por_sessao } (formato do RPC)
    const insumosNorm = (proc.insumos || []).map(i => ({
      injetavel_id:   i.injetavel_id || i.injId || null,
      qtd_por_sessao: parseFloat(i.qtd_por_sessao) || 1,
    })).filter(i => i.injetavel_id && _isProcUuid(i.injetavel_id))

    const r = await window.ProcedimentosRepository.upsert({
      id:                   _isProcUuid(proc.id) ? proc.id : null,
      nome:                 proc.nome,
      categoria:            proc.categoria            || null,
      descricao:            proc.descricao            || null,
      duracao_min:          proc.duracao              || 60,
      sessoes:              proc.sessoes              || 1,
      tipo:                 proc.tipo                 || 'avulso',
      preco:                proc.preco                || null,
      preco_promo:          proc.preco_promo          || null,
      custo_estimado:       proc.custo_estimado       || null,
      margem:               proc.margem               || null,
      combo_sessoes:        proc.combo_sessoes        || null,
      combo_desconto_pct:   proc.combo_desconto_pct   || null,
      combo_valor_final:    proc.combo_valor_final    || null,
      combo_bonus:          proc.combo_bonus          || null,
      combo_descricao:      proc.combo_descricao      || null,
      usa_tecnologia:       !!proc.usa_tecnologia,
      tecnologia_protocolo: proc.tecnologia_protocolo || null,
      tecnologia_sessoes:   proc.tecnologia_sessoes   || null,
      tecnologia_custo:     proc.tecnologia_custo     || null,
      cuidados_pre:         proc.cuidados_pre         || [],
      cuidados_pos:         proc.cuidados_pos         || [],
      contraindicacoes:     proc.contraindicacoes     || [],
      observacoes:          proc.observacoes          || null,
      insumos:              insumosNorm,
      intervalo_sessoes_dias: proc.intervalo_sessoes_dias || null,
      fases:                Array.isArray(proc.fases) && proc.fases.length ? proc.fases : null,
    })
    if (!r.ok) throw new Error(r.error || 'Erro ao salvar procedimento')
    _procsCache = null
    await _loadProcedimentos()
    return
  }
  const all = getProcs()
  const idx = all.findIndex(p => p.id === proc.id)
  if (idx >= 0) all[idx] = proc
  else all.push(proc)
  saveProcs(all)
}

async function _deleteProc(id) {
  if (window.ProcedimentosRepository && _isProcUuid(id)) {
    const r = await window.ProcedimentosRepository.softDelete(id)
    if (!r.ok) throw new Error(r.error || 'Erro ao excluir procedimento')
    _procsCache = null
    await _loadProcedimentos()
    return
  }
  saveProcs(getProcs().filter(p => p.id !== id))
}

function _newId(nome) {
  return 'proc_' + nome.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/, '') + '_' + Date.now()
}

// ── Filtros ───────────────────────────────────────────────────
function _filtered() {
  const { q, categoria } = _procFilter
  return getProcs().filter(p => {
    if (!p.ativo) return false
    if (categoria && p.categoria !== categoria) return false
    if (q) {
      const ql = q.toLowerCase()
      const cat = _getCat(p.categoria)
      if (!p.nome.toLowerCase().includes(ql) && !cat.nome.toLowerCase().includes(ql) && !(p.descricao||'').toLowerCase().includes(ql)) return false
    }
    return true
  })
}

function _groupByCat(items) {
  const grupos = {}
  items.forEach(p => {
    const k = p.categoria || '__outro__'
    if (!grupos[k]) grupos[k] = []
    grupos[k].push(p)
  })
  const ordered = []
  PROC_CATEGORIAS.forEach(cat => {
    if (grupos[cat.id]?.length) ordered.push({ cat, items: grupos[cat.id] })
  })
  if (grupos.__outro__?.length) {
    ordered.push({ cat: { id: '__outro__', nome: 'Outros', icon: 'circle', color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' }, items: grupos.__outro__ })
  }
  return ordered
}

// ── Margens reais (do Cashflow do mes) ────────────────────────
var _procMargensReais = {}  // keyed por procedure_name LOWER

async function _loadProcMargens() {
  if (!window.CashflowService || !window.CashflowService.getSegments) return
  try {
    var now = new Date()
    var res = await window.CashflowService.getSegments(now.getFullYear(), now.getMonth() + 1)
    if (!res || !res.ok) return
    var data = res.data || {}
    var byProc = data.by_procedure || []
    _procMargensReais = {}
    byProc.forEach(function(p) {
      if (p.name && p.name !== '(sem procedimento)') {
        _procMargensReais[p.name.toLowerCase().trim()] = {
          bruto:      p.bruto,
          liquido:    p.liquido,
          margem_pct: p.margem_pct,
          qtd:        p.qtd,
        }
      }
    })
    // Re-render se dados chegaram apos render inicial
    if (typeof _procRefreshContent === 'function') _procRefreshContent()
  } catch (e) { console.warn('[procedimentos] _loadProcMargens:', e) }
}

function _procMargemBadge(procName) {
  if (!procName) return '<span style="color:#9CA3AF;font-size:11px">—</span>'
  var key = String(procName).toLowerCase().trim()
  var m = _procMargensReais[key]
  if (!m) return '<span style="color:#9CA3AF;font-size:11px">sem dado</span>'
  var color = m.margem_pct >= 30 ? '#10B981' : m.margem_pct >= 15 ? '#F59E0B' : '#EF4444'
  return ''
    + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">'
      + '<span style="background:' + color + '22;color:' + color + ';font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px">' + m.margem_pct + '%</span>'
      + '<span style="font-size:10px;color:#9CA3AF">' + m.qtd + ' venda(s)</span>'
    + '</div>'
}

// ── Render Principal ──────────────────────────────────────────
async function renderProcedimentos() {
  const page = document.getElementById('page-procedimentos')
  if (!page) return
  await _loadProcedimentos()
  _loadProcMargens().catch(function() {})  // fire-and-forget — re-render quando voltar
  _ensureSeeds()
  _ensureOverlay()

  // Cria a estrutura fixa apenas na primeira vez
  if (!page.querySelector('.inj-page')) {
    page.innerHTML = `
      <div class="inj-page">
        <div class="inj-header">
          <div class="inj-header-right">
            <div class="inj-view-toggle">
              <button id="proc-btn-grid" class="inj-view-btn" onclick="procSetView('grid')" title="Blocos">
                <i data-feather="grid" style="width:14px;height:14px"></i>
              </button>
              <button id="proc-btn-list" class="inj-view-btn" onclick="procSetView('list')" title="Lista">
                <i data-feather="list" style="width:14px;height:14px"></i>
              </button>
            </div>
            <div class="inj-search-wrap">
              <i data-feather="search" style="width:14px;height:14px;color:#9CA3AF;flex-shrink:0"></i>
              <input id="proc-search" class="inj-search" type="text" placeholder="Buscar procedimento..."
                oninput="procSetFilter('q',this.value)">
            </div>
            <select id="proc-cat-select" class="inj-select" onchange="procSetFilter('categoria',this.value)">
              <option value="">Todas as categorias</option>
              ${PROC_CATEGORIAS.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}
            </select>
            <div class="inj-header-sep"></div>
            <span id="proc-total-badge" style="background:#F3F4F6;color:#6B7280;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap"></span>
            <button class="inj-btn-primary inj-btn-sm" onclick="procOpenForm(null)">
              <i data-feather="plus" style="width:13px;height:13px"></i> Novo Procedimento
            </button>
          </div>
        </div>
        <div id="proc-content"></div>
      </div>
    `
    featherIn(page)
  }

  _procRefreshContent()
}

function _procRefreshContent() {
  const items = _filtered()
  const total = getProcs().filter(p => p.ativo).length

  // Atualiza badge de total
  const badge = document.getElementById('proc-total-badge')
  if (badge) badge.textContent = `${total} procedimento${total !== 1 ? 's' : ''}`

  // Atualiza estado ativo dos botões de view
  const btnGrid = document.getElementById('proc-btn-grid')
  const btnList = document.getElementById('proc-btn-list')
  if (btnGrid) btnGrid.classList.toggle('active', _procView === 'grid')
  if (btnList) btnList.classList.toggle('active', _procView === 'list')

  // Atualiza select de categoria sem mexer no foco
  const sel = document.getElementById('proc-cat-select')
  if (sel && sel.value !== _procFilter.categoria) sel.value = _procFilter.categoria

  // Atualiza apenas o conteúdo de cards
  const content = document.getElementById('proc-content')
  if (!content) return
  content.innerHTML = items.length === 0
    ? _procEmpty()
    : (_procView === 'grid' ? _procGrid(items) : _procList(items))
  featherIn(content)
}

// Cria o overlay modal uma única vez no body (não dentro de page-procedimentos)
function _ensureOverlay() {
  if (document.getElementById('proc-modal-overlay')) return
  const ov = document.createElement('div')
  ov.id = 'proc-modal-overlay'
  ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center;padding:20px'
  ov.onclick = e => { if (e.target === ov) procCloseModal() }
  ov.innerHTML = `
    <div style="background:#fff;border-radius:18px;width:100%;max-width:680px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.22)" onclick="event.stopPropagation()">
      <div id="proc-modal-content"></div>
    </div>`
  document.body.appendChild(ov)
}

function _procEmpty() {
  return `
    <div class="inj-empty">
      <i data-feather="clipboard" style="width:48px;height:48px;color:#D1D5DB"></i>
      <h3>Nenhum procedimento encontrado</h3>
      <p>Ajuste os filtros ou adicione um novo procedimento.</p>
      <button class="inj-btn-primary" onclick="procOpenForm(null)">
        <i data-feather="plus" style="width:14px;height:14px"></i> Novo Procedimento
      </button>
    </div>
  `
}

// ── Grid View ─────────────────────────────────────────────────
function _procGrid(items) {
  return _groupByCat(items).map(({ cat, items: catItems }) => `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${cat.color}22">
        <div style="width:28px;height:28px;border-radius:7px;background:${cat.color}18;color:${cat.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-feather="${cat.icon}" style="width:13px;height:13px"></i>
        </div>
        <span style="font-size:13px;font-weight:700;color:#374151">${cat.nome}</span>
        <span style="background:${cat.color}15;color:${cat.color};font-size:11px;font-weight:700;padding:1px 8px;border-radius:20px">${catItems.length}</span>
      </div>
      <div class="inj-grid">
        ${catItems.map(p => _procCard(p, cat)).join('')}
      </div>
    </div>
  `).join('')
}

function _procCard(p, cat) {
  const dur = p.duracao ? `${p.duracao} min` : ''
  const ses = p.sessoes > 1 ? `${p.sessoes} sessões` : '1 sessão'
  const precoHtml = p.preco > 0
    ? `<div style="font-size:14px;font-weight:800;color:#10B981">R$ ${_fmtMoney(p.preco)}</div>${p.preco_promo > 0 ? `<div style="font-size:11px;font-weight:600;color:#F59E0B">Promo: R$ ${_fmtMoney(p.preco_promo)}</div>` : ''}`
    : `<div style="font-size:11px;color:#D1D5DB;font-style:italic">Preço a definir</div>`

  return `
    <div class="inj-card" onclick="procOpenDetail('${p.id}')">
      <div style="height:3px;background:${cat.color};border-radius:12px 12px 0 0"></div>
      <div class="inj-card-header">
        <div class="inj-card-icon" style="background:${cat.color}18;color:${cat.color}">
          <i data-feather="${cat.icon}" style="width:18px;height:18px"></i>
        </div>
        <div>
          <div class="inj-card-nome">${_escHtml(p.nome)}</div>
        </div>
      </div>
      <div class="inj-card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
          <div style="padding:7px 9px;background:#F9FAFB;border-radius:7px;border:1px solid #F3F4F6">
            <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Duração</div>
            <div style="font-size:13px;font-weight:700;color:#374151">${dur || '—'}</div>
          </div>
          <div style="padding:7px 9px;background:#F9FAFB;border-radius:7px;border:1px solid #F3F4F6">
            <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Sessões</div>
            <div style="font-size:13px;font-weight:700;color:#374151">${ses}</div>
          </div>
        </div>
        <div style="margin-top:7px;padding:8px 10px;background:#F9FAFB;border-radius:7px;border:1px solid #F3F4F6">
          ${precoHtml}
        </div>
      </div>
      <div class="inj-card-actions" onclick="event.stopPropagation()">
        <button class="inj-card-btn" onclick="procOpenForm('${p.id}')" title="Editar">
          <i data-feather="edit-2" style="width:13px;height:13px"></i>
        </button>
        <button class="inj-card-btn danger" onclick="procDelete('${p.id}')" title="Excluir">
          <i data-feather="trash-2" style="width:13px;height:13px"></i>
        </button>
      </div>
    </div>
  `
}

// ── List View ─────────────────────────────────────────────────
function _procList(items) {
  return _groupByCat(items).map(({ cat, items: catItems }) => `
    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${cat.color}22">
        <div style="width:28px;height:28px;border-radius:7px;background:${cat.color}18;color:${cat.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-feather="${cat.icon}" style="width:13px;height:13px"></i>
        </div>
        <span style="font-size:13px;font-weight:700;color:#374151">${cat.nome}</span>
        <span style="background:${cat.color}15;color:${cat.color};font-size:11px;font-weight:700;padding:1px 8px;border-radius:20px">${catItems.length}</span>
      </div>
      <div class="inj-list-table">
        <table>
          <thead>
            <tr>
              <th>Procedimento</th>
              <th>Duração</th>
              <th>Sessões</th>
              <th>Preço</th>
              <th style="text-align:right">Margem (Mês)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${catItems.map(p => `
              <tr onclick="procOpenDetail('${p.id}')" style="cursor:pointer">
                <td>
                  <strong style="color:#111">${_escHtml(p.nome)}</strong>
                  <div style="font-size:11px;color:#9CA3AF;margin-top:2px">${_escHtml((p.descricao||'').substring(0,60))}${(p.descricao||'').length>60?'…':''}</div>
                </td>
                <td>${p.duracao ? p.duracao + ' min' : '—'}</td>
                <td>${p.sessoes > 1 ? p.sessoes : '1'}</td>
                <td>
                  ${p.preco > 0 ? `<span style="font-weight:700;color:#10B981">R$ ${_fmtMoney(p.preco)}</span>` : '<span style="color:#9CA3AF">A definir</span>'}
                  ${p.preco_promo > 0 ? `<div style="font-size:11px;color:#F59E0B">Promo: R$ ${_fmtMoney(p.preco_promo)}</div>` : ''}
                </td>
                <td style="text-align:right">${_procMargemBadge(p.nome)}</td>
                <td onclick="event.stopPropagation()">
                  <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
                    <button class="inj-card-btn" onclick="procOpenForm('${p.id}')" title="Editar"><i data-feather="edit-2" style="width:12px;height:12px"></i></button>
                    <button class="inj-card-btn danger" onclick="procDelete('${p.id}')" title="Excluir"><i data-feather="trash-2" style="width:12px;height:12px"></i></button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('')
}

// ── Modal Detalhe ─────────────────────────────────────────────
function procOpenDetail(id) {
  const p   = _getProc(id)
  if (!p) return
  const cat   = _getCat(p.categoria)
  const proto = PROC_PROTOCOLS[p.categoria] || {}
  const cPre   = p.cuidados_pre?.length      ? p.cuidados_pre      : (proto.cuidados_pre      || [])
  const cPos   = p.cuidados_pos?.length      ? p.cuidados_pos      : (proto.cuidados_pos      || [])
  const contra = p.contraindicacoes?.length  ? p.contraindicacoes  : (proto.contraindicacoes  || [])
  const _ul = arr => arr.length
    ? `<ul style="margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:3px">${arr.map(i=>`<li style="font-size:13px;color:#374151;line-height:1.5">${_escHtml(i)}</li>`).join('')}</ul>`
    : `<p style="font-size:13px;color:#9CA3AF;margin:6px 0 0">Não definido</p>`

  document.getElementById('proc-modal-content').innerHTML = `
    <div style="padding:24px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:48px;height:48px;border-radius:14px;background:${cat.color}18;color:${cat.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-feather="${cat.icon}" style="width:22px;height:22px"></i>
          </div>
          <div>
            <div style="font-size:18px;font-weight:800;color:#111827">${_escHtml(p.nome)}</div>
            <div style="font-size:12px;font-weight:600;color:${cat.color};margin-top:2px">${cat.nome}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="inj-btn-secondary inj-btn-sm" onclick="procOpenForm('${p.id}')">
            <i data-feather="edit-2" style="width:12px;height:12px"></i> Editar
          </button>
          <button onclick="procCloseModal()" style="width:32px;height:32px;border:none;background:#F9FAFB;border-radius:8px;cursor:pointer;font-size:16px;color:#6B7280;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
        </div>
      </div>

      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#F9FAFB;border-radius:10px;padding:10px;text-align:center;border:1px solid #F3F4F6">
          <div style="font-size:16px;font-weight:800;color:#7C3AED">${p.preco > 0 ? 'R$ ' + _fmtMoney(p.preco) : '—'}</div>
          <div style="font-size:10px;color:#9CA3AF;margin-top:2px">Preço/sessão</div>
          ${p.preco_promo > 0 ? `<div style="font-size:10px;color:#F59E0B;font-weight:600">Promo: R$ ${_fmtMoney(p.preco_promo)}</div>` : ''}
        </div>
        <div style="background:#F9FAFB;border-radius:10px;padding:10px;text-align:center;border:1px solid #F3F4F6">
          <div style="font-size:16px;font-weight:800;color:#374151">${p.duracao || '—'} min</div>
          <div style="font-size:10px;color:#9CA3AF;margin-top:2px">Duração</div>
        </div>
        <div style="background:#F9FAFB;border-radius:10px;padding:10px;text-align:center;border:1px solid #F3F4F6">
          <div style="font-size:16px;font-weight:800;color:#374151">${p.sessoes || 1}</div>
          <div style="font-size:10px;color:#9CA3AF;margin-top:2px">Sessões</div>
        </div>
        <div style="background:${p.custo_estimado > 0 ? '#F0FDF4' : '#F9FAFB'};border-radius:10px;padding:10px;text-align:center;border:1px solid ${p.custo_estimado > 0 ? '#BBF7D0' : '#F3F4F6'}">
          <div style="font-size:16px;font-weight:800;color:${p.custo_estimado > 0 ? '#059669' : '#9CA3AF'}">${p.custo_estimado > 0 ? 'R$ ' + _fmtMoney(p.custo_estimado) : '—'}</div>
          <div style="font-size:10px;color:#9CA3AF;margin-top:2px">Custo estimado</div>
        </div>
      </div>

      <!-- Combo badge -->
      ${p.tipo === 'combo' && p.combo_sessoes > 0 ? `
        <div style="padding:12px 14px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:flex;align-items:center;gap:5px">
            <i data-feather="package" style="width:12px;height:12px"></i> Combo / Pacote
          </div>
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            <div><span style="font-size:13px;color:#374151">${p.combo_sessoes} sessões</span></div>
            ${p.combo_desconto_pct > 0 ? `<div style="color:#DC2626;font-weight:700;font-size:13px">−${p.combo_desconto_pct}% desconto</div>` : ''}
            ${p.combo_valor_final > 0  ? `<div style="color:#7C3AED;font-weight:800;font-size:15px">R$ ${_fmtMoney(p.combo_valor_final)}</div>` : ''}
            ${p.combo_bonus ? `<div style="background:#EDE9FE;color:#5B21B6;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600">${_escHtml(p.combo_bonus)}</div>` : ''}
          </div>
          ${p.combo_descricao ? `<p style="font-size:12px;color:#6B7280;margin:6px 0 0;line-height:1.5">${_escHtml(p.combo_descricao)}</p>` : ''}
        </div>` : ''}

      ${p.descricao ? `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Descrição</div>
          <p style="font-size:13px;color:#374151;line-height:1.6;margin:6px 0 0">${_escHtml(p.descricao)}</p>
        </div>` : ''}

      <!-- Insumos -->
      ${p.insumos?.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;display:flex;align-items:center;gap:4px">
            <i data-feather="droplet" style="width:12px;height:12px;color:#7C3AED"></i> Injetáveis utilizados
          </div>
          <div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
            ${p.insumos.map(s => `
              <div style="display:flex;align-items:center;padding:7px 12px;border-bottom:1px solid #F3F4F6;gap:10px">
                <div style="flex:1;font-size:12.5px;font-weight:600;color:#374151">${_escHtml(s.nome)}</div>
                <div style="font-size:11px;color:#9CA3AF">${s.qtd_por_sessao || 1} ${s.unidade || 'un'}/sessão</div>
                ${s.custo_unit > 0 ? `<div style="font-size:11px;font-weight:700;color:#6B7280">R$ ${_fmtMoney((s.custo_unit||0)*(s.qtd_por_sessao||1))}</div>` : ''}
              </div>`).join('')}
          </div>
        </div>` : ''}

      <!-- Tecnologia -->
      ${p.usa_tecnologia && p.tecnologia_protocolo ? `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;display:flex;align-items:center;gap:4px">
            <i data-feather="zap" style="width:12px;height:12px;color:#D97706"></i> Tecnologia associada
          </div>
          <div style="padding:10px 14px;background:#FFFBEB;border:1px solid #FEF3C7;border-radius:8px;display:flex;align-items:center;gap:12px">
            <div style="flex:1;font-size:13px;font-weight:600;color:#92400E">${_escHtml(p.tecnologia_protocolo)}</div>
            <div style="font-size:11px;color:#A16207">${p.tecnologia_sessoes || 1} sessão(ões)</div>
            ${p.tecnologia_custo > 0 ? `<div style="font-size:11px;font-weight:700;color:#D97706">R$ ${_fmtMoney(p.tecnologia_custo)}/sessão</div>` : ''}
          </div>
        </div>` : ''}

      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">
          <i data-feather="alert-circle" style="width:13px;height:13px;vertical-align:-2px;color:#F59E0B"></i> Cuidados Pré-Procedimento
        </div>
        ${_ul(cPre)}
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">
          <i data-feather="check-circle" style="width:13px;height:13px;vertical-align:-2px;color:#10B981"></i> Cuidados Pós-Procedimento
        </div>
        ${_ul(cPos)}
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">
          <i data-feather="x-circle" style="width:13px;height:13px;vertical-align:-2px;color:#EF4444"></i> Contraindicações
        </div>
        ${_ul(contra)}
      </div>

      ${p.observacoes ? `
        <div>
          <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">
            <i data-feather="info" style="width:13px;height:13px;vertical-align:-2px;color:#7C3AED"></i> Observações Clínicas
          </div>
          <p style="font-size:13px;color:#374151;line-height:1.6;margin:6px 0 0;background:#F5F3FF;padding:10px 14px;border-radius:8px;border-left:3px solid #7C3AED">${_escHtml(p.observacoes)}</p>
        </div>` : ''}
    </div>
  `
  _showModal()
  featherIn(document.getElementById('proc-modal-overlay'))
}

// ══════════════════════════════════════════════════════════════
//  WIZARD — Formulário de Procedimento (4 passos)
// ══════════════════════════════════════════════════════════════

const PF_STEPS = ['Dados', 'Insumos', 'Protocolo', 'Preço']

// Sugestões para chips de cuidados
const PF_SUGEST_PRE = [
  'Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes',
  'Remover maquiagem antes do procedimento','Não usar autobronzeador 2 semanas antes',
  'Evitar exposição solar intensa 48h antes','Informar uso de anticoagulantes',
  'Informar alergias a cosméticos ou ativos','Fazer limpeza de pele suave 2-3 dias antes',
  'Informar uso de medicamentos fotossensibilizantes','Rapar a área se necessário',
  'Não realizar procedimentos estéticos na área 2 semanas antes',
]
const PF_SUGEST_POS = [
  'Usar protetor solar FPS 50+ diariamente','Evitar exposição solar direta por 7-14 dias',
  'Evitar calor excessivo (sauna, banho quente) por 48h','Não esfregar a área por 24h',
  'Manter hidratação tópica intensa','Evitar exercícios físicos por 24h',
  'Não usar ácidos ou produtos agressivos por 3 dias','Retornar conforme protocolo de sessões',
  'Não realizar outros procedimentos por 15 dias','Usar FPS 30+ diariamente',
]
const PF_SUGEST_CONTRA = [
  'Gestação e amamentação','Infecção ativa na área de aplicação',
  'Doenças autoimunes ativas','Coagulopatias não controladas',
  'Menores de 18 anos','Câncer ativo ou em tratamento recente',
  'Implantes metálicos na área','Uso de isotretinoína nos últimos 6 meses',
  'Pele bronzeada recente','Hipersensibilidade ao produto utilizado',
]

// ── helpers do wizard ──────────────────────────────────────────
function _pfCollect() {
  switch (_pfStep) {
    case 1:
      _pfData.nome      = document.getElementById('pf_nome')?.value?.trim() || _pfData.nome || ''
      _pfData.categoria = document.getElementById('pf_cat')?.value  || _pfData.categoria || ''
      _pfData.duracao   = parseInt(document.getElementById('pf_dur')?.value || '60') || 60
      _pfData.descricao = document.getElementById('pf_desc')?.value?.trim() || ''
      _pfData.observacoes = document.getElementById('pf_obs')?.value?.trim() || ''
      break
    case 2: {
      // Source of truth: ler DOM em vez de confiar nos closures dos
      // pfToggleInsumo (eventos podem ter sido perdidos em re-renders).
      const checkedRows = document.querySelectorAll('[data-insumo-id]')
      const fromDom = []
      checkedRows.forEach(row => {
        const cb = row.querySelector('input[type=checkbox]')
        if (!cb || !cb.checked) return
        const injId = row.dataset.insumoId
        if (!injId) return
        const qtyEl = row.querySelector('input[type=number]')
        const qty = qtyEl ? (parseFloat(qtyEl.value) || 1) : 1
        // Preserva metadados (nome/unidade/custo) do estado anterior
        const prev = (Array.isArray(_pfData.insumos) ? _pfData.insumos : []).find(s => s.injId === injId)
        fromDom.push({
          injId,
          nome: prev?.nome || row.dataset.insumoNome || '',
          unidade: prev?.unidade || row.dataset.insumoUnidade || 'un',
          custo_unit: prev?.custo_unit || parseFloat(row.dataset.insumoCusto || '0') || 0,
          qtd_por_sessao: qty,
        })
      })
      // Só sobrescreve se conseguimos ler o DOM (step 2 ativo)
      if (checkedRows.length > 0 || _pfStep === 2) _pfData.insumos = fromDom
      _pfData.usa_tecnologia        = document.getElementById('pf_usa_tec')?.checked || false
      _pfData.tecnologia_protocolo  = document.getElementById('pf_tec_nome')?.value?.trim() || ''
      _pfData.tecnologia_sessoes    = parseInt(document.getElementById('pf_tec_ses')?.value || '1') || 1
      _pfData.tecnologia_custo      = parseFloat(document.getElementById('pf_tec_custo')?.value || '0') || 0
      break
    }
    case 3:
      // lists managed via pfAddListItem / pfRemoveListItem directly
      break
    case 4:
      _pfData.tipo       = document.querySelector('input[name="pf_tipo"]:checked')?.value || 'avulso'
      _pfData.sessoes    = parseInt(document.getElementById('pf_ses')?.value || '1') || 1
      _pfData.intervalo_sessoes_dias = parseInt(document.getElementById('pf_intervalo')?.value || '0') || null
      _pfData.custo_estimado = parseFloat(document.getElementById('pf_custo')?.value || '0') || 0
      _pfData.preco      = parseFloat(document.getElementById('pf_preco')?.value || '0') || 0
      _pfData.preco_promo = parseFloat(document.getElementById('pf_promo')?.value || '0') || 0
      _pfData.combo_sessoes = parseInt(document.getElementById('pf_combo_ses')?.value || '0') || 0
      _pfData.combo_desconto_pct = parseFloat(document.getElementById('pf_combo_pct')?.value || '0') || 0
      _pfData.combo_valor_final  = parseFloat(document.getElementById('pf_combo_total')?.value || '0') || 0
      _pfData.combo_bonus        = document.getElementById('pf_combo_bonus')?.value?.trim() || ''
      _pfData.combo_descricao    = document.getElementById('pf_combo_desc')?.value?.trim() || ''
      break
  }
}

function _pfRender() {
  const isEdit = !!_procFormId
  const mc = document.getElementById('proc-modal-content')
  if (!mc) return

  const stepsBar = PF_STEPS.map((lbl, i) => {
    const n = i + 1
    const active  = n === _pfStep
    const done    = n < _pfStep
    const bg      = active ? '#7C3AED' : done ? '#EDE9FE' : '#F3F4F6'
    const color   = active ? '#fff'    : done ? '#7C3AED' : '#9CA3AF'
    const weight  = active || done ? '700' : '500'
    return `
      <div style="display:flex;align-items:center;gap:4px;flex:1">
        <div style="width:22px;height:22px;border-radius:50%;background:${bg};color:${color};
          font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${done ? '✓' : n}
        </div>
        <span style="font-size:11px;font-weight:${weight};color:${active ? '#7C3AED' : done ? '#6B7280' : '#9CA3AF'};white-space:nowrap">${lbl}</span>
        ${n < PF_STEPS.length ? `<div style="flex:1;height:1px;background:#E5E7EB;margin:0 4px"></div>` : ''}
      </div>`
  }).join('')

  mc.innerHTML = `
    <div style="display:flex;flex-direction:column;max-height:86vh">
      <div style="padding:20px 24px 14px;border-bottom:1px solid #F3F4F6;flex-shrink:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div style="font-size:16px;font-weight:700;color:#111">${isEdit ? 'Editar Procedimento' : 'Novo Procedimento'}</div>
          <button onclick="procCloseModal()" style="width:30px;height:30px;border:none;background:#F3F4F6;border-radius:8px;cursor:pointer;font-size:16px;color:#6B7280;display:flex;align-items:center;justify-content:center">✕</button>
        </div>
        <div style="display:flex;align-items:center;gap:0">${stepsBar}</div>
      </div>
      <div id="pf-step-content" style="flex:1;overflow-y:auto;padding:24px"></div>
      <div style="padding:14px 24px;border-top:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <button onclick="pfPrev()" class="inj-btn-secondary inj-btn-sm" ${_pfStep === 1 ? 'style="visibility:hidden"' : ''}>
          <i data-feather="arrow-left" style="width:13px;height:13px"></i> Anterior
        </button>
        <span style="font-size:12px;color:#9CA3AF">Passo ${_pfStep} de ${PF_STEPS.length}</span>
        <div style="display:flex;gap:8px;align-items:center">
          ${isEdit ? `<button onclick="procSaveForm()" class="inj-btn-secondary inj-btn-sm"><i data-feather="save" style="width:12px;height:12px"></i> Salvar</button>` : ''}
          ${_pfStep < PF_STEPS.length
            ? `<button onclick="pfNext()" class="inj-btn-primary inj-btn-sm">Próximo <i data-feather="arrow-right" style="width:13px;height:13px"></i></button>`
            : `<button onclick="procSaveForm()" class="inj-btn-primary inj-btn-sm"><i data-feather="check" style="width:13px;height:13px"></i> Concluir</button>`}
        </div>
      </div>
    </div>
  `
  const stepContent = document.getElementById('pf-step-content')
  if (stepContent) stepContent.innerHTML = _pfStepHtml()
  featherIn(mc)
  if (_pfStep === 4 && typeof pfRenderFases === 'function') pfRenderFases()
}

function _pfStepHtml() {
  switch (_pfStep) {
    case 1: return _pfStep1()
    case 2: return _pfStep2()
    case 3: return _pfStep3()
    case 4: return _pfStep4()
    default: return ''
  }
}

// ── Passo 1: Dados Básicos ─────────────────────────────────────
function _pfStep1() {
  const d = _pfData
  return `
    <div style="display:grid;gap:14px">
      <div>
        <label class="proc-form-label">Nome do Procedimento *</label>
        <input id="pf_nome" type="text" class="proc-form-input" placeholder="Ex: Lifting 5D" value="${_escHtml(d.nome || '')}">
      </div>
      <div>
        <label class="proc-form-label">Categoria *</label>
        <select id="pf_cat" class="proc-form-input">
          <option value="">Selecione...</option>
          ${PROC_CATEGORIAS.map(c => `<option value="${c.id}" ${d.categoria === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="proc-form-label">Duração (min)</label>
          <input id="pf_dur" type="number" class="proc-form-input" placeholder="60" min="5" step="5" value="${d.duracao || 60}">
        </div>
        <div>
          <label class="proc-form-label" style="color:#9CA3AF">Categoria visual</label>
          <div id="pf_cat_preview" style="padding:9px 12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;color:#6B7280;min-height:38px;display:flex;align-items:center;gap:6px">
            ${d.categoria ? (() => { const c = _getCat(d.categoria); return `<i data-feather="${c.icon}" style="width:14px;height:14px;color:${c.color}"></i><span style="color:${c.color};font-weight:600">${c.nome}</span>` })() : '<span style="font-style:italic">Selecione a categoria</span>'}
          </div>
        </div>
      </div>
      <div>
        <label class="proc-form-label">Descrição</label>
        <textarea id="pf_desc" class="proc-form-input" rows="3" placeholder="Descreva o procedimento, técnica utilizada, resultados esperados...">${_escHtml(d.descricao || '')}</textarea>
      </div>
      <div>
        <label class="proc-form-label">Observações Clínicas <span style="font-weight:400;color:#9CA3AF;font-size:10px">interno</span></label>
        <textarea id="pf_obs" class="proc-form-input" rows="2" placeholder="Notas de protocolo, cuidados especiais, combinações...">${_escHtml(d.observacoes || '')}</textarea>
      </div>
    </div>
  `
}

// ── Passo 2: Insumos & Tecnologia ─────────────────────────────
function _pfStep2() {
  const d     = _pfData
  const injs  = (typeof getInj === 'function' ? getInj() : []).filter(i => i.ativo !== false)
  const insumos = Array.isArray(d.insumos) ? d.insumos : []
  const custoTotal = _pfCalcCusto()

  const injRows = injs.length ? injs.map(inj => {
    const sel    = insumos.find(s => s.injId === inj.id)
    const isChk  = !!sel
    const qty    = sel?.qtd_por_sessao || 1
    const catN   = (typeof _getCatNome === 'function' ? '' : '')
    return `
      <div data-insumo-id="${_escHtml(inj.id)}" data-insumo-nome="${_escHtml(inj.nome)}" data-insumo-unidade="${_escHtml(inj.unidade || 'un')}" data-insumo-custo="${inj.custo_unit || 0}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #F9FAFB;transition:.15s"
           onmouseenter="this.style.background='#FAFAFA'" onmouseleave="this.style.background=''">
        <input type="checkbox" id="pfc_${inj.id}" ${isChk ? 'checked' : ''}
          onchange="pfToggleInsumo('${inj.id}','${_escHtml(inj.nome)}','${inj.unidade||'un'}',${inj.custo_unit||0})"
          style="width:15px;height:15px;cursor:pointer;accent-color:#7C3AED;flex-shrink:0">
        <label for="pfc_${inj.id}" style="flex:1;cursor:pointer">
          <div style="font-size:13px;font-weight:600;color:#111">${_escHtml(inj.nome)}</div>
          <div style="font-size:11px;color:#9CA3AF">${inj.unidade || ''} ${inj.custo_unit ? '· Custo: R$ ' + _fmtMoney(inj.custo_unit) : ''}</div>
        </label>
        ${isChk ? `
          <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
            <span style="font-size:11px;color:#6B7280">Qtd/sessão:</span>
            <input type="number" min="0.1" step="0.1" value="${qty}"
              style="width:58px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;text-align:center"
              onchange="pfQtdInsumo('${inj.id}',this.value)">
            <span style="font-size:11px;color:#9CA3AF">${inj.unidade||'un'}</span>
          </div>` : ''}
      </div>`
  }).join('')
  : `<div style="padding:20px;text-align:center;font-size:13px;color:#9CA3AF;font-style:italic">Nenhum injetável cadastrado na clínica ainda.<br>Acesse a aba <strong>Injetáveis</strong> para cadastrar produtos.</div>`

  const custoHtml = custoTotal > 0
    ? `<div style="padding:10px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;font-size:12px;color:#166534;font-weight:600;display:flex;align-items:center;gap:6px;margin-top:12px">
        <i data-feather="dollar-sign" style="width:13px;height:13px"></i>
        Custo estimado por sessão (insumos): <strong style="margin-left:4px">R$ ${_fmtMoney(custoTotal)}</strong>
      </div>` : ''

  const tecShow = d.usa_tecnologia ? '' : 'display:none'
  return `
    <div style="display:grid;gap:18px">
      <!-- Injetáveis -->
      <div>
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <i data-feather="droplet" style="width:14px;height:14px;color:#7C3AED"></i>
          Injetáveis utilizados neste procedimento
        </div>
        <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;background:#fff;max-height:260px;overflow-y:auto">
          ${injRows}
        </div>
        ${custoHtml}
      </div>

      <!-- Tecnologia -->
      <div style="border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
        <div style="padding:12px 14px;background:#FFFBEB;display:flex;align-items:center;gap:10px;cursor:pointer"
             onclick="pfToggleTecnologia()">
          <input type="checkbox" id="pf_usa_tec" ${d.usa_tecnologia ? 'checked' : ''}
            style="width:15px;height:15px;accent-color:#D97706;pointer-events:none;flex-shrink:0">
          <label style="cursor:pointer;flex:1">
            <div style="font-size:13px;font-weight:700;color:#92400E;display:flex;align-items:center;gap:6px">
              <i data-feather="zap" style="width:14px;height:14px;color:#D97706"></i>
              Utiliza equipamento / tecnologia (Fotona, Laser, etc.)
            </div>
            <div style="font-size:11px;color:#A16207;margin-top:1px">Inclui protocolos de laser, radiofrequência, ultrassom focado, etc.</div>
          </label>
        </div>
        <div id="pf_tec_section" style="${tecShow};padding:14px;display:grid;gap:12px;background:#fff;border-top:1px solid #FEF3C7">
          <div>
            <label class="proc-form-label">Nome do protocolo / equipamento</label>
            <input id="pf_tec_nome" type="text" class="proc-form-input" list="pf_tec_list"
              placeholder="Ex: Fotona SmoothEye, Laser CO₂, HIFU..."
              value="${_escHtml(d.tecnologia_protocolo || '')}">
            <datalist id="pf_tec_list">
              <option value="Fotona SmoothEye"><option value="Fotona SmoothLiftin"><option value="Fotona Piano Mode">
              <option value="Fotona FRAC3"><option value="Fotona StarWalker"><option value="Fotona Dynamis">
              <option value="Fotona SP Spectro"><option value="Fotona LightWalker"><option value="Fotona NightLase">
              <option value="Fotona TightSculpting"><option value="Fotona SmoothEye Pro">
              <option value="Laser CO₂ Fracionado"><option value="Laser Nd:YAG"><option value="Laser Alexandrite">
              <option value="Radiofrequência Fracionada"><option value="HIFU (Ultrassom Focado)">
              <option value="Endermologia"><option value="Criolipólise"><option value="Ultrassom Microfocado">
            </datalist>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label class="proc-form-label">Sessões de tecnologia</label>
              <input id="pf_tec_ses" type="number" class="proc-form-input" min="1" placeholder="1"
                value="${d.tecnologia_sessoes || 1}">
            </div>
            <div>
              <label class="proc-form-label">Custo por sessão (R$) <span style="color:#9CA3AF;font-size:10px">opcional</span></label>
              <input id="pf_tec_custo" type="number" class="proc-form-input" min="0" step="0.01" placeholder="0,00"
                value="${d.tecnologia_custo > 0 ? d.tecnologia_custo : ''}">
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

// ── Passo 3: Protocolo Clínico ─────────────────────────────────
function _pfStep3() {
  const d = _pfData
  // Preenche defaults pela categoria se listas vazias
  const proto = PROC_PROTOCOLS[d.categoria] || PROC_PROTOCOLS.injetavel
  if (!d.cuidados_pre?.length)   d.cuidados_pre   = [...(proto.cuidados_pre   || [])]
  if (!d.cuidados_pos?.length)   d.cuidados_pos   = [...(proto.cuidados_pos   || [])]
  if (!d.contraindicacoes?.length) d.contraindicacoes = [...(proto.contraindicacoes || [])]

  return `
    <div style="display:grid;gap:20px">
      <div>
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <i data-feather="alert-triangle" style="width:14px;height:14px;color:#D97706"></i>
          Cuidados Pré-procedimento
        </div>
        ${_pfEditableList('cuidados_pre', PF_SUGEST_PRE)}
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <i data-feather="heart" style="width:14px;height:14px;color:#059669"></i>
          Cuidados Pós-procedimento
        </div>
        ${_pfEditableList('cuidados_pos', PF_SUGEST_POS)}
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <i data-feather="x-circle" style="width:14px;height:14px;color:#DC2626"></i>
          Contraindicações
        </div>
        ${_pfEditableList('contraindicacoes', PF_SUGEST_CONTRA)}
      </div>
    </div>
  `
}

// ── Passo 4: Precificação ──────────────────────────────────────
function _pfStep4() {
  const d   = _pfData
  const tipo = d.tipo || 'avulso'
  const custo = _pfCalcCusto()
  if (custo > 0 && !d.custo_estimado) d.custo_estimado = custo

  const finPreview = _pfFinPreview(d.custo_estimado || 0, d.preco || 0)
  const cfg = typeof getPrecCfg === 'function' ? getPrecCfg() : { overhead_pct:12, imposto_pct:13.5 }

  const comboTotal = (d.preco || 0) * (d.combo_sessoes || 0)
  const comboDsc   = comboTotal * ((d.combo_desconto_pct || 0) / 100)
  const comboFinal = d.combo_valor_final || Math.max(0, comboTotal - comboDsc)

  return `
    <div style="display:grid;gap:18px">
      <!-- Tipo: Avulso / Combo -->
      <div>
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px">Tipo de venda</div>
        <div style="display:flex;gap:8px">
          <label style="flex:1;cursor:pointer">
            <input type="radio" name="pf_tipo" value="avulso" ${tipo==='avulso'?'checked':''} onchange="pfToggleTipo('avulso')" style="display:none">
            <div style="padding:12px;border:2px solid ${tipo==='avulso'?'#7C3AED':'#E5E7EB'};border-radius:10px;text-align:center;background:${tipo==='avulso'?'#F5F3FF':'#fff'};transition:.15s">
              <i data-feather="tag" style="width:18px;height:18px;color:${tipo==='avulso'?'#7C3AED':'#9CA3AF'}"></i>
              <div style="font-size:13px;font-weight:700;color:${tipo==='avulso'?'#7C3AED':'#374151'};margin-top:4px">Avulso</div>
              <div style="font-size:11px;color:#9CA3AF">Sessão individual</div>
            </div>
          </label>
          <label style="flex:1;cursor:pointer">
            <input type="radio" name="pf_tipo" value="combo" ${tipo==='combo'?'checked':''} onchange="pfToggleTipo('combo')" style="display:none">
            <div style="padding:12px;border:2px solid ${tipo==='combo'?'#7C3AED':'#E5E7EB'};border-radius:10px;text-align:center;background:${tipo==='combo'?'#F5F3FF':'#fff'};transition:.15s">
              <i data-feather="package" style="width:18px;height:18px;color:${tipo==='combo'?'#7C3AED':'#9CA3AF'}"></i>
              <div style="font-size:13px;font-weight:700;color:${tipo==='combo'?'#7C3AED':'#374151'};margin-top:4px">Combo / Pacote</div>
              <div style="font-size:11px;color:#9CA3AF">Múltiplas sessões</div>
            </div>
          </label>
        </div>
      </div>

      <!-- Sessões -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div>
          <label class="proc-form-label">N.º de Sessões (avulso)</label>
          <input id="pf_ses" type="number" class="proc-form-input" min="1" value="${d.sessoes || 1}" ${Array.isArray(d.fases) && d.fases.length ? 'disabled title="Derivado das fases"' : ''}>
        </div>
        <div>
          <label class="proc-form-label">Intervalo entre sessões (dias)</label>
          <input id="pf_intervalo" type="number" class="proc-form-input" min="1" max="365"
            placeholder="Ex: 7 (semanal), 30 (mensal)"
            value="${d.intervalo_sessoes_dias > 0 ? d.intervalo_sessoes_dias : ''}"
            ${Array.isArray(d.fases) && d.fases.length ? 'disabled title="Cadência controlada pelas fases"' : ''}>
          <div style="font-size:10px;color:#9CA3AF;margin-top:3px">Auto-preenche recorrência no agendamento</div>
        </div>
        <div>
          <label class="proc-form-label">Custo estimado / sessão (R$)</label>
          <input id="pf_custo" type="number" class="proc-form-input" min="0" step="0.01"
            placeholder="${custo > 0 ? _fmtMoney(custo) + ' (auto)' : '0,00'}"
            value="${d.custo_estimado > 0 ? d.custo_estimado : custo > 0 ? custo : ''}"
            oninput="pfUpdateFinPreview()">
        </div>
      </div>

      <!-- Cadência multi-fase -->
      <div style="border:1px dashed #E5E7EB;border-radius:10px;padding:12px 14px;background:#FAFAFA">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
          <input id="pf_fases_toggle" type="checkbox" ${Array.isArray(d.fases) && d.fases.length ? 'checked' : ''} onchange="pfToggleFases(this)">
          <span style="font-size:13px;font-weight:700;color:#374151">Cadência multi-fase</span>
          <span style="font-size:11px;color:#9CA3AF">(ex: Tirzepatida 8x semanal + 2x quinzenal)</span>
        </label>
        <div id="pf_fases_wrap" style="margin-top:10px;${Array.isArray(d.fases) && d.fases.length ? '' : 'display:none'}">
          <div id="pf_fases_list"></div>
          <button type="button" onclick="pfAddFase()" style="margin-top:6px;padding:7px 12px;background:#fff;border:1px dashed #7C3AED;color:#7C3AED;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700">
            + Adicionar fase
          </button>
          <div id="pf_fases_resumo" style="margin-top:10px;font-size:11px;color:#6B7280"></div>
        </div>
      </div>

      <!-- Preço avulso + promo -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="proc-form-label">Preço por sessão (R$) *</label>
          <input id="pf_preco" type="number" class="proc-form-input" min="0" step="0.01" placeholder="0,00"
            value="${d.preco > 0 ? d.preco : ''}" oninput="pfUpdateFinPreview()">
        </div>
        <div>
          <label class="proc-form-label">Preço promocional (R$) <span style="color:#9CA3AF;font-size:10px">opcional</span></label>
          <input id="pf_promo" type="number" class="proc-form-input" min="0" step="0.01" placeholder="0,00"
            value="${d.preco_promo > 0 ? d.preco_promo : ''}">
        </div>
      </div>

      <!-- Preview financeiro -->
      <div id="pf-fin-preview">${finPreview}</div>

      <!-- Combo -->
      <div id="pf-combo-section" style="${tipo==='combo'?'':'display:none'}">
        <div style="height:1px;background:#E5E7EB;margin-bottom:18px"></div>
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-feather="package" style="width:14px;height:14px;color:#7C3AED"></i>
          Configuração do Combo / Pacote
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="proc-form-label">Sessões no pacote</label>
            <input id="pf_combo_ses" type="number" class="proc-form-input" min="2" placeholder="Ex: 10"
              value="${d.combo_sessoes || ''}" oninput="pfUpdateCombo()">
          </div>
          <div>
            <label class="proc-form-label">Desconto do combo (%)</label>
            <input id="pf_combo_pct" type="number" class="proc-form-input" min="0" max="100" step="0.5" placeholder="Ex: 20"
              value="${d.combo_desconto_pct || ''}" oninput="pfUpdateCombo()">
          </div>
        </div>
        <div id="pf-combo-calc" style="padding:12px 14px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;margin-bottom:12px">
          ${_pfComboCalc(d)}
        </div>
        <div style="display:grid;gap:10px">
          <div>
            <label class="proc-form-label">Valor final do combo (R$)</label>
            <input id="pf_combo_total" type="number" class="proc-form-input" min="0" step="0.01"
              placeholder="Calculado automaticamente" value="${d.combo_valor_final > 0 ? d.combo_valor_final : comboFinal > 0 ? comboFinal : ''}">
          </div>
          <div>
            <label class="proc-form-label">Bônus / Benefício <span style="color:#9CA3AF;font-size:10px">opcional</span></label>
            <input id="pf_combo_bonus" type="text" class="proc-form-input"
              placeholder='Ex: "Ganhe 1 sessão de Fotona grátis"'
              value="${_escHtml(d.combo_bonus || '')}">
          </div>
          <div>
            <label class="proc-form-label">Descrição do pacote <span style="color:#9CA3AF;font-size:10px">opcional</span></label>
            <textarea id="pf_combo_desc" class="proc-form-input" rows="2"
              placeholder='Ex: "Pacote de 10 sessões de Drenagem Linfática com desconto especial"'>${_escHtml(d.combo_descricao || '')}</textarea>
          </div>
        </div>
      </div>
    </div>
  `
}

function _pfComboCalc(d) {
  const preco = d.preco || 0
  const ses   = d.combo_sessoes || 0
  const pct   = d.combo_desconto_pct || 0
  if (!preco || !ses) return `<div style="font-size:12px;color:#9CA3AF;font-style:italic">Preencha o preço por sessão e o número de sessões do pacote para ver o cálculo.</div>`
  const total  = preco * ses
  const dscR   = total * (pct / 100)
  const final_ = total - dscR
  const eco    = dscR
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:12px">
      <div>
        <div style="color:#6B7280;margin-bottom:2px">Total sem desconto</div>
        <div style="font-size:16px;font-weight:700;color:#374151">R$ ${_fmtMoney(total)}</div>
        <div style="color:#9CA3AF;font-size:10px">${ses} × R$ ${_fmtMoney(preco)}</div>
      </div>
      <div>
        <div style="color:#DC2626;margin-bottom:2px">Desconto (${pct}%)</div>
        <div style="font-size:16px;font-weight:700;color:#DC2626">− R$ ${_fmtMoney(dscR)}</div>
        <div style="color:#9CA3AF;font-size:10px">economia do paciente</div>
      </div>
      <div>
        <div style="color:#059669;margin-bottom:2px">Valor final</div>
        <div style="font-size:16px;font-weight:800;color:#7C3AED">R$ ${_fmtMoney(final_)}</div>
        <div style="color:#9CA3AF;font-size:10px">≈ R$ ${_fmtMoney(ses > 0 ? final_/ses : 0)}/sessão</div>
      </div>
    </div>
  `
}

function _pfFinPreview(custo, preco) {
  if (!preco) return `<div style="padding:12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;font-size:12px;color:#9CA3AF;text-align:center;font-style:italic">Informe o preço por sessão para ver a análise financeira.</div>`
  const cfg = typeof getPrecCfg === 'function' ? getPrecCfg() : { overhead_pct:12, imposto_pct:13.5, meta_margem_min:55 }
  const c = parseFloat(custo) || 0
  const p = parseFloat(preco) || 0
  const lucro   = p - c
  const markup  = c > 0 ? ((p - c) / c * 100) : 0
  const margem  = p > 0 ? ((p - c) / p * 100) : 0
  const overhead = c * (cfg.overhead_pct / 100)
  const imposto  = p * (cfg.imposto_pct  / 100)
  const breakevenV = c + overhead + imposto

  const margemColor = margem >= cfg.meta_margem_min ? '#059669' : margem >= 40 ? '#D97706' : '#DC2626'
  const margemBg    = margem >= cfg.meta_margem_min ? '#F0FDF4' : margem >= 40 ? '#FFFBEB' : '#FEF2F2'
  const margemBdr   = margem >= cfg.meta_margem_min ? '#BBF7D0' : margem >= 40 ? '#FCD34D' : '#FECACA'

  return `
    <div style="background:${margemBg};border:1px solid ${margemBdr};border-radius:10px;padding:12px 14px">
      <div style="font-size:11px;font-weight:700;color:${margemColor};text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;display:flex;align-items:center;gap:4px">
        <i data-feather="${margem >= cfg.meta_margem_min ? 'check-circle' : 'alert-circle'}" style="width:12px;height:12px"></i>
        Análise Financeira
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div>
          <div style="font-size:10px;color:#6B7280;margin-bottom:2px">Lucro</div>
          <div style="font-size:15px;font-weight:800;color:${lucro>=0?'#059669':'#DC2626'}">R$ ${_fmtMoney(lucro)}</div>
        </div>
        <div>
          <div style="font-size:10px;color:#6B7280;margin-bottom:2px">Markup</div>
          <div style="font-size:15px;font-weight:800;color:#7C3AED">${markup.toFixed(0)}%</div>
        </div>
        <div>
          <div style="font-size:10px;color:#6B7280;margin-bottom:2px">Margem</div>
          <div style="font-size:15px;font-weight:800;color:${margemColor}">${margem.toFixed(1)}%</div>
        </div>
        <div>
          <div style="font-size:10px;color:#6B7280;margin-bottom:2px">Break-even</div>
          <div style="font-size:15px;font-weight:800;color:#374151">R$ ${_fmtMoney(breakevenV)}</div>
        </div>
      </div>
      ${margem < cfg.meta_margem_min && preco > 0 ? `
        <div style="margin-top:8px;font-size:11px;color:${margemColor}">
          Margem abaixo da meta (${cfg.meta_margem_min}%). Preço sugerido: <strong>R$ ${_fmtMoney(c / (1 - cfg.meta_margem_min/100))}</strong>
        </div>` : ''}
    </div>
  `
}

// ── Lista editável de chips ────────────────────────────────────
function _pfEditableList(fieldKey, suggestions) {
  const items  = _pfData[fieldKey] || []
  const listId = 'pfdl_' + fieldKey
  const inpId  = 'pfeli_' + fieldKey
  return `
    <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;background:#fff">
      <div style="max-height:200px;overflow-y:auto">
        ${items.length
          ? items.map((item, idx) => `
            <div style="display:flex;align-items:flex-start;padding:7px 12px;border-bottom:1px solid #F3F4F6;gap:8px">
              <span style="flex:1;font-size:12.5px;color:#374151;line-height:1.45">${_escHtml(item)}</span>
              <button type="button" onclick="pfRemoveListItem('${fieldKey}',${idx})"
                style="background:none;border:none;cursor:pointer;color:#DC2626;font-size:17px;line-height:1;padding:0 2px;flex-shrink:0" title="Remover">×</button>
            </div>`).join('')
          : `<div style="padding:14px;text-align:center;font-size:12px;color:#9CA3AF;font-style:italic">Nenhum item — adicione abaixo</div>`}
      </div>
      <div style="padding:8px;background:#FAFAFA;display:flex;gap:8px;border-top:1px solid #F3F4F6">
        <input type="text" id="${inpId}" class="inj-input" list="${listId}"
          placeholder="Adicionar item..." style="flex:1;font-size:12px;margin:0;padding:7px 10px">
        <button type="button" onclick="pfAddListItem('${fieldKey}')"
          style="padding:6px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">+ Adicionar</button>
      </div>
    </div>
    <datalist id="${listId}">${(suggestions||[]).map(s=>`<option value="${_escHtml(s)}">`).join('')}</datalist>
  `
}

// ── Cálculo de custo dos insumos ───────────────────────────────
function _pfCalcCusto() {
  const insumos = _pfData.insumos || []
  const tecCusto = (_pfData.usa_tecnologia && _pfData.tecnologia_custo > 0) ? _pfData.tecnologia_custo : 0
  const insCusto = insumos.reduce((acc, s) => acc + (parseFloat(s.custo_unit || 0) * parseFloat(s.qtd_por_sessao || 1)), 0)
  return insCusto + tecCusto
}

// ── Controles do wizard ────────────────────────────────────────
function procOpenForm(id) {
  const p = id ? _getProc(id) : null
  _procFormId = id || null
  _pfStep = 1

  if (p) {
    // Insumos do RPC vêm como { injetavel_id, injetavel_nome, qtd_por_sessao }.
    // O wizard local usa { injId, nome, custo_unit, qtd_por_sessao } —
    // normalizamos pra evitar quebra do toggle/edit.
    const insumosNorm = (p.insumos || []).map(i => ({
      injId:          i.injetavel_id || i.injId,
      injetavel_id:   i.injetavel_id || i.injId,
      nome:           i.injetavel_nome || i.nome || '',
      unidade:        i.unidade || 'un',
      custo_unit:     parseFloat(i.custo_unit) || 0,
      qtd_por_sessao: parseFloat(i.qtd_por_sessao) || 1,
    }))
    _pfData = {
      nome:                 p.nome || '',
      categoria:            p.categoria || '',
      duracao:              p.duracao_min || p.duracao || 60,
      descricao:            p.descricao || '',
      observacoes:          p.observacoes || '',
      insumos:              insumosNorm,
      usa_tecnologia:       !!p.usa_tecnologia,
      tecnologia_protocolo: p.tecnologia_protocolo || '',
      tecnologia_sessoes:   p.tecnologia_sessoes || 1,
      tecnologia_custo:     parseFloat(p.tecnologia_custo) || 0,
      cuidados_pre:         [...(p.cuidados_pre || [])],
      cuidados_pos:         [...(p.cuidados_pos || [])],
      contraindicacoes:     [...(p.contraindicacoes || [])],
      tipo:                 p.tipo || 'avulso',
      sessoes:              p.sessoes || 1,
      intervalo_sessoes_dias: parseInt(p.intervalo_sessoes_dias) || 0,
      fases:                Array.isArray(p.fases) ? p.fases.map(f => ({
        nome: String(f.nome || ''),
        sessoes: parseInt(f.sessoes) || 0,
        intervalo_dias: parseInt(f.intervalo_dias) || 0,
      })) : [],
      custo_estimado:       parseFloat(p.custo_estimado) || 0,
      preco:                parseFloat(p.preco) || 0,
      preco_promo:          parseFloat(p.preco_promo) || 0,
      combo_sessoes:        p.combo_sessoes || 0,
      combo_desconto_pct:   parseFloat(p.combo_desconto_pct) || 0,
      combo_valor_final:    parseFloat(p.combo_valor_final) || 0,
      combo_bonus:          p.combo_bonus || '',
      combo_descricao:      p.combo_descricao || '',
    }
  } else {
    _pfData = {
      nome:'', categoria:'', duracao:60, descricao:'', observacoes:'',
      insumos:[], usa_tecnologia:false, tecnologia_protocolo:'', tecnologia_sessoes:1, tecnologia_custo:0,
      cuidados_pre:[], cuidados_pos:[], contraindicacoes:[],
      tipo:'avulso', sessoes:1, intervalo_sessoes_dias:0, fases:[],
      custo_estimado:0, preco:0, preco_promo:0,
      combo_sessoes:0, combo_desconto_pct:0, combo_valor_final:0, combo_bonus:'', combo_descricao:'',
    }
  }

  _pfRender()
  _showModal()
  document.getElementById('pf_nome')?.focus()
}

function pfNext() {
  _pfCollect()
  if (_pfStep === 1) {
    if (!_pfData.nome?.trim()) { _toastWarn('Informe o nome do procedimento.'); return }
    if (!_pfData.categoria)    { _toastWarn('Selecione a categoria.'); return }
  }
  if (_pfStep < PF_STEPS.length) { _pfStep++; _pfRender() }
}

function pfPrev() {
  _pfCollect()
  if (_pfStep > 1) { _pfStep--; _pfRender() }
}

function pfGoStep(n) {
  _pfCollect()
  if (n >= 1 && n <= PF_STEPS.length) { _pfStep = n; _pfRender() }
}

function pfToggleInsumo(injId, nome, unidade, custoUnit) {
  if (!Array.isArray(_pfData.insumos)) _pfData.insumos = []
  const idx = _pfData.insumos.findIndex(s => s.injId === injId)
  if (idx >= 0) {
    _pfData.insumos.splice(idx, 1)
  } else {
    _pfData.insumos.push({ injId, nome, unidade, custo_unit: parseFloat(custoUnit) || 0, qtd_por_sessao: 1 })
  }
  // Re-render only step 2 content
  const stepEl = document.getElementById('pf-step-content')
  if (stepEl) { stepEl.innerHTML = _pfStep2(); featherIn(stepEl) }
}

function pfQtdInsumo(injId, val) {
  if (!Array.isArray(_pfData.insumos)) return
  const ins = _pfData.insumos.find(s => s.injId === injId)
  if (ins) ins.qtd_por_sessao = parseFloat(val) || 1
}

function pfToggleTecnologia() {
  _pfData.usa_tecnologia = !_pfData.usa_tecnologia
  const cb  = document.getElementById('pf_usa_tec')
  const sec = document.getElementById('pf_tec_section')
  if (cb)  cb.checked = _pfData.usa_tecnologia
  if (sec) sec.style.display = _pfData.usa_tecnologia ? '' : 'none'
}

function pfToggleTipo(tipo) {
  _pfCollect()
  _pfData.tipo = tipo
  // Re-render step 4 content only
  const stepEl = document.getElementById('pf-step-content')
  if (stepEl) { stepEl.innerHTML = _pfStep4(); featherIn(stepEl); pfRenderFases() }
}

// ── Fases (cadencia multi-etapa) ─────────────────────────────
function pfToggleFases(cb) {
  const wrap = document.getElementById('pf_fases_wrap')
  if (!wrap) return
  if (cb.checked) {
    if (!Array.isArray(_pfData.fases) || !_pfData.fases.length) {
      _pfData.fases = [{ nome: 'Inducao', sessoes: 8, intervalo_dias: 7 }]
    }
    wrap.style.display = ''
    pfRenderFases()
  } else {
    _pfData.fases = []
    wrap.style.display = 'none'
    pfRenderFases()
  }
  pfSyncFasesInputs()
}

function pfSyncFasesInputs() {
  const has = Array.isArray(_pfData.fases) && _pfData.fases.length > 0
  const ses = document.getElementById('pf_ses')
  const intv = document.getElementById('pf_intervalo')
  if (ses) {
    ses.disabled = has
    ses.title = has ? 'Derivado das fases' : ''
    if (has) ses.value = _pfData.fases.reduce((s, f) => s + (parseInt(f.sessoes) || 0), 0)
  }
  if (intv) {
    intv.disabled = has
    intv.title = has ? 'Cadencia controlada pelas fases' : ''
  }
}

function pfAddFase() {
  if (!Array.isArray(_pfData.fases)) _pfData.fases = []
  _pfData.fases.push({ nome: 'Fase ' + (_pfData.fases.length + 1), sessoes: 2, intervalo_dias: 15 })
  pfRenderFases()
  pfSyncFasesInputs()
}

function pfRemoveFase(idx) {
  if (!Array.isArray(_pfData.fases)) return
  _pfData.fases.splice(idx, 1)
  if (_pfData.fases.length === 0) {
    const tog = document.getElementById('pf_fases_toggle')
    if (tog) tog.checked = false
    pfToggleFases(tog)
    return
  }
  pfRenderFases()
  pfSyncFasesInputs()
}

function pfUpdateFase(idx, field, value) {
  if (!_pfData.fases || !_pfData.fases[idx]) return
  if (field === 'sessoes' || field === 'intervalo_dias') {
    _pfData.fases[idx][field] = parseInt(value) || 0
  } else {
    _pfData.fases[idx][field] = String(value || '').trim()
  }
  pfRenderFasesResumo()
  pfSyncFasesInputs()
}

function pfRenderFasesResumo() {
  const el = document.getElementById('pf_fases_resumo')
  if (!el) return
  const fases = _pfData.fases || []
  if (!fases.length) { el.innerHTML = ''; return }
  const total = fases.reduce((s, f) => s + (parseInt(f.sessoes) || 0), 0)
  const resumo = fases.map(f =>
    `<b>${(f.nome || 'Fase').replace(/[<>]/g, '')}</b> ${f.sessoes || 0}x / ${f.intervalo_dias || 0}d`
  ).join(' → ')
  el.innerHTML = `Total: <b>${total}</b> sessoes · ${resumo}`
}

function pfRenderFases() {
  const list = document.getElementById('pf_fases_list')
  if (!list) return
  const fases = _pfData.fases || []
  if (!fases.length) { list.innerHTML = ''; pfRenderFasesResumo(); return }
  list.innerHTML = fases.map((f, i) => `
    <div style="display:grid;grid-template-columns:1fr 90px 110px 36px;gap:8px;align-items:end;margin-bottom:8px;padding:8px;background:#fff;border:1px solid #E5E7EB;border-radius:8px">
      <div>
        <label style="font-size:10px;color:#6B7280;font-weight:600">Nome da fase</label>
        <input type="text" value="${(f.nome || '').replace(/"/g, '&quot;')}"
          oninput="pfUpdateFase(${i},'nome',this.value)"
          style="width:100%;padding:6px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px">
      </div>
      <div>
        <label style="font-size:10px;color:#6B7280;font-weight:600">Sessões</label>
        <input type="number" min="1" value="${f.sessoes || 0}"
          oninput="pfUpdateFase(${i},'sessoes',this.value)"
          style="width:100%;padding:6px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px">
      </div>
      <div>
        <label style="font-size:10px;color:#6B7280;font-weight:600">Intervalo (dias)</label>
        <input type="number" min="1" max="365" value="${f.intervalo_dias || 0}"
          oninput="pfUpdateFase(${i},'intervalo_dias',this.value)"
          style="width:100%;padding:6px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:12px">
      </div>
      <button type="button" onclick="pfRemoveFase(${i})"
        style="padding:8px;background:#FEE2E2;color:#991B1B;border:none;border-radius:6px;cursor:pointer;font-size:14px"
        title="Remover fase">×</button>
    </div>
  `).join('')
  pfRenderFasesResumo()
}

function pfUpdateFinPreview() {
  const custo = parseFloat(document.getElementById('pf_custo')?.value || '0') || _pfCalcCusto()
  const preco = parseFloat(document.getElementById('pf_preco')?.value || '0') || 0
  const el = document.getElementById('pf-fin-preview')
  if (el) { el.innerHTML = _pfFinPreview(custo, preco); featherIn(el) }
}

function pfUpdateCombo() {
  _pfData.preco            = parseFloat(document.getElementById('pf_preco')?.value || '0') || 0
  _pfData.combo_sessoes    = parseInt(document.getElementById('pf_combo_ses')?.value || '0') || 0
  _pfData.combo_desconto_pct = parseFloat(document.getElementById('pf_combo_pct')?.value || '0') || 0
  const el = document.getElementById('pf-combo-calc')
  if (el) { el.innerHTML = _pfComboCalc(_pfData); featherIn(el) }
  // Auto-fill combo total
  const preco = _pfData.preco
  const ses   = _pfData.combo_sessoes
  const pct   = _pfData.combo_desconto_pct
  if (preco && ses && pct >= 0) {
    const total = preco * ses
    const finalV = Math.max(0, total - total * (pct / 100))
    const totEl = document.getElementById('pf_combo_total')
    if (totEl && !parseFloat(totEl.value)) totEl.value = finalV.toFixed(2)
  }
}

function pfAddListItem(fieldKey) {
  const val = document.getElementById('pfeli_' + fieldKey)?.value?.trim()
  if (!val) return
  if (!Array.isArray(_pfData[fieldKey])) _pfData[fieldKey] = []
  if (!_pfData[fieldKey].includes(val)) _pfData[fieldKey].push(val)
  const stepEl = document.getElementById('pf-step-content')
  if (stepEl) { stepEl.innerHTML = _pfStep3(); featherIn(stepEl) }
}

function pfRemoveListItem(fieldKey, idx) {
  if (!Array.isArray(_pfData[fieldKey])) return
  _pfData[fieldKey].splice(idx, 1)
  const stepEl = document.getElementById('pf-step-content')
  if (stepEl) { stepEl.innerHTML = _pfStep3(); featherIn(stepEl) }
}

async function procSaveForm() {
  _pfCollect()
  const nome = _pfData.nome?.trim()
  if (!nome)          { _toastWarn('Informe o nome do procedimento.'); _pfStep = 1; _pfRender(); return }
  if (!_pfData.categoria) { _toastWarn('Selecione a categoria.');     _pfStep = 1; _pfRender(); return }

  const existing = _procFormId ? _getProc(_procFormId) : null
  const proc = {
    ...(existing || {}),
    id:                   _procFormId || _newId(nome),
    nome,
    categoria:            _pfData.categoria,
    duracao:              _pfData.duracao || 60,
    descricao:            _pfData.descricao || '',
    observacoes:          _pfData.observacoes || '',
    insumos:              _pfData.insumos || [],
    usa_tecnologia:       !!_pfData.usa_tecnologia,
    tecnologia_protocolo: _pfData.tecnologia_protocolo || '',
    tecnologia_sessoes:   _pfData.tecnologia_sessoes || 1,
    tecnologia_custo:     _pfData.tecnologia_custo || 0,
    cuidados_pre:         _pfData.cuidados_pre || [],
    cuidados_pos:         _pfData.cuidados_pos || [],
    contraindicacoes:     _pfData.contraindicacoes || [],
    tipo:                 _pfData.tipo || 'avulso',
    sessoes:              _pfData.sessoes || 1,
    intervalo_sessoes_dias: _pfData.intervalo_sessoes_dias || null,
    fases:                Array.isArray(_pfData.fases) && _pfData.fases.length ? _pfData.fases : null,
    custo_estimado:       _pfData.custo_estimado || _pfCalcCusto(),
    preco:                _pfData.preco || 0,
    preco_promo:          _pfData.preco_promo || 0,
    combo_sessoes:        _pfData.combo_sessoes || 0,
    combo_desconto_pct:   _pfData.combo_desconto_pct || 0,
    combo_valor_final:    _pfData.combo_valor_final || 0,
    combo_bonus:          _pfData.combo_bonus || '',
    combo_descricao:      _pfData.combo_descricao || '',
    ativo: true,
  }

  try {
    await _saveProc(proc)
  } catch (e) {
    _toastErr(e.message || 'Erro ao salvar')
    return
  }
  procCloseModal()
  _procRefreshContent()
}

async function procDelete(id) {
  const p = _getProc(id)
  if (!p) return
  if (!confirm(`Remover "${p.nome}"?`)) return
  try {
    await _deleteProc(id)
  } catch (e) {
    _toastErr(e.message || 'Erro ao excluir')
    return
  }
  renderProcedimentos()
}

// ── Modal helpers ─────────────────────────────────────────────
function _showModal() {
  _ensureOverlay()
  document.getElementById('proc-modal-overlay').style.display = 'flex'
}

function procCloseModal() {
  const ov = document.getElementById('proc-modal-overlay')
  if (ov) ov.style.display = 'none'
}

// ── Controles view/filter ─────────────────────────────────────
function procSetView(v)      { _procView = v; _procRefreshContent() }
let _procSearchTimer = null
function procSetFilter(k, v) {
  _procFilter[k] = v
  // Debounce search (Q) pra evitar render-storm a cada keystroke
  if (k === 'q') {
    clearTimeout(_procSearchTimer)
    _procSearchTimer = setTimeout(function () { _procRefreshContent() }, 180)
  } else {
    _procRefreshContent()
  }
}

// ── Helpers ───────────────────────────────────────────────────
function _escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function _fmtMoney(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── CSS Embutido (apenas o que não existe no injetaveis.js) ───
;(function injectCSS() {
  if (document.getElementById('proc-style')) return
  const css = `
    .proc-form-label { display:block;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px }
    .proc-form-input { width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;color:#374151;outline:none;box-sizing:border-box;transition:border .15s;font-family:inherit }
    .proc-form-input:focus { border-color:#7C3AED;box-shadow:0 0 0 3px rgba(124,58,237,.1) }
    textarea.proc-form-input { resize:vertical }
  `
  const s = document.createElement('style')
  s.id = 'proc-style'
  s.textContent = css
  document.head.appendChild(s)
})()

// ── Init / Expose ─────────────────────────────────────────────
function initProcedimentos() {
  if (_initialized) return
  _initialized = true
  _ensureSeeds()
}

window.renderProcedimentos  = renderProcedimentos
window._procRefreshContent  = _procRefreshContent
window.procSetView          = procSetView
window.procSetFilter        = procSetFilter
window.procOpenDetail       = procOpenDetail
window.procOpenForm         = procOpenForm
window.procSaveForm         = procSaveForm
window.procDelete           = procDelete
window.procCloseModal       = procCloseModal
window.initProcedimentos    = initProcedimentos
// Wizard
window.pfNext               = pfNext
window.pfPrev               = pfPrev
window.pfGoStep             = pfGoStep
window.pfToggleInsumo       = pfToggleInsumo
window.pfQtdInsumo          = pfQtdInsumo
window.pfToggleTecnologia   = pfToggleTecnologia
window.pfToggleTipo         = pfToggleTipo
window.pfUpdateFinPreview   = pfUpdateFinPreview
window.pfUpdateCombo        = pfUpdateCombo
window.pfAddListItem        = pfAddListItem
window.pfRemoveListItem     = pfRemoveListItem
window.pfToggleFases        = pfToggleFases
window.pfAddFase            = pfAddFase
window.pfRemoveFase         = pfRemoveFase
window.pfUpdateFase         = pfUpdateFase

// Auto-init
initProcedimentos()

})()
