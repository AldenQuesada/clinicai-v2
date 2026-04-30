;(function () {
'use strict'

// Fallback: if store not yet loaded, create a simple localStorage wrapper
if (typeof store === 'undefined') {
  var store = {
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} },
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : (d || null) } catch (e) { return d || null } }
  }
}

// ══════════════════════════════════════════════════════════════
//  INJETÁVEIS — Módulo completo de cadastro e gestão
// ══════════════════════════════════════════════════════════════

// ── Storage helpers ──────────────────────────────────────────
const INJ_KEY  = 'clinic_injetaveis'
const PROT_KEY = 'clinic_inj_protocolos'
const PREC_KEY = 'clinic_inj_precificacao'

// Cache Supabase
let _injCache = null

function _isUuid(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) }

function getInj() {
  if (_injCache !== null) return _injCache
  try { return JSON.parse(localStorage.getItem(INJ_KEY) || '[]') } catch { return [] }
}
function saveInj(d) { try { store.set(INJ_KEY, d) } catch (e) { if (e.name === 'QuotaExceededError') console.warn('ClinicAI: localStorage cheio.') } }

async function _loadInjetaveis() {
  if (!window.InjetaveisRepository) return
  const r = await window.InjetaveisRepository.getAll(false)
  if (r.ok) _injCache = r.data ?? []
}
function getProtocolos()   { try { return JSON.parse(localStorage.getItem(PROT_KEY) || '[]') } catch { return [] } }
function saveProtocolos(d) { try { store.set(PROT_KEY, d) } catch (e) { if (e.name === 'QuotaExceededError') console.warn('ClinicAI: localStorage cheio.') } }
function getPrecCfg()   { try { return JSON.parse(localStorage.getItem(PREC_KEY) || 'null') || _defaultPrecCfg() } catch { return _defaultPrecCfg() } }
function savePrecCfg(d) { try { store.set(PREC_KEY, d) } catch (e) { if (e.name === 'QuotaExceededError') console.warn('ClinicAI: localStorage cheio.') } }
const INJ_CATS_CUSTOM_KEY = 'clinic_inj_cats_custom'
const INJ_FABS_CUSTOM_KEY = 'clinic_inj_fabs_custom'
function getCustomCats() { try { return JSON.parse(localStorage.getItem(INJ_CATS_CUSTOM_KEY)||'[]') } catch { return [] } }
function saveCustomCats(d) { store.set(INJ_CATS_CUSTOM_KEY, d) }
function getCustomFabs() { try { return JSON.parse(localStorage.getItem(INJ_FABS_CUSTOM_KEY)||'[]') } catch { return [] } }
function saveCustomFabs(d) { store.set(INJ_FABS_CUSTOM_KEY, d) }
const CUSTOM_TPL_KEY = 'clinic_inj_tpl_custom'
function getCustomTpls() { try { return JSON.parse(localStorage.getItem(CUSTOM_TPL_KEY)||'{}') } catch { return {} } }
function saveCustomTpls(d) { try { store.set(CUSTOM_TPL_KEY, d) } catch (e) { console.warn('ClinicAI: localStorage cheio.') } }
function _tplSlug(nome) {
  return 'custom_' + nome.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/__+/g,'_').replace(/^_|_$/g,'') + '_' + Date.now()
}
function _defaultPrecCfg() {
  return { margem_padrao: 60, markup_padrao: 150, imposto_pct: 13.5, overhead_pct: 12, meta_margem_min: 55 }
}

// ── Dados de referência ───────────────────────────────────────
const INJ_FABRICANTES = [
  { id:'allergan',   nome:'Allergan (AbbVie)' },
  { id:'galderma',   nome:'Galderma' },
  { id:'merz',       nome:'Merz Aesthetics' },
  { id:'sinclair',   nome:'Sinclair Pharma' },
  { id:'reviance',   nome:'Reviance Therapeutics' }
]

const INJ_CATEGORIAS = [
  { id:'neuro',      nome:'Neurotoxina Botulínica', icon:'zap' },
  { id:'ha',         nome:'Ácido Hialurônico',      icon:'droplet' },
  { id:'biorev',     nome:'Biorevitalizador',        icon:'refresh-cw' },
  { id:'biopoten',   nome:'Bioestimulador',          icon:'trending-up' },
  { id:'enzima',     nome:'Enzima (Hialuronidase)',        icon:'scissors' },
  { id:'fio',        nome:'Fio de PDO/PLLA',              icon:'minus' },
  { id:'lipolitico', nome:'Lipolítico (Gordura Localizada)',  icon:'zap-off' },
  { id:'mesoterapia', nome:'Mesoterapia (Vitaminas / Ativos)', icon:'activity' },
  { id:'prp',         nome:'PRP (Plasma Rico em Plaquetas)',    icon:'droplet' },
  { id:'exossomo',      nome:'Exossomos (Regeneração Avançada)', icon:'cpu' },
  { id:'polinucleotideo',  nome:'Polinucleotídeos (DNA Regenerativo)', icon:'git-branch' },
  { id:'fatorcrescimento', nome:'Fatores de Crescimento',              icon:'sunrise' }
]

const INJ_UNIDADES = ['U (unidades)', 'mL', 'mg', 'vial', 'seringa', 'frasco']
const INJ_APRESENTACOES = ['Pó liofilizado', 'Solução pronta', 'Gel', 'Suspensão', 'Microesferas', 'Fios']
const INJ_DURACOES = ['3 meses', '4 meses', '6 meses', '9 meses', '12 meses', '18 meses', '24 meses', '36 meses', 'Permanente']
const INJ_DOWNTIMES = ['Nenhum', '24h', '48h', '3-5 dias', '7 dias', '10-14 dias', '3-4 semanas']

const INJ_AREAS = [
  'Glabela', 'Frontal', 'Pés de galinha', 'Sobrancelha (browlift)',
  'Pescoço (platisma)', 'Nariz (bunny lines)', 'Lábios (RL)', 'Mento (queixo)',
  'Masseter (bruxismo)', 'Axila (hiperidrose)', 'Palma das mãos', 'Pés',
  'Bigode chinês', 'Sorriso gengival',
  'Têmporas', 'Maçãs do rosto', 'Sulco nasolabial', 'Bigode chinês',
  'Linha mandibular', 'Lábios (preenchimento)', 'Olheiras', 'Papada (mento)',
  'Nariz (rinoplastia química)', 'Orelhas', 'Mãos',
  'Pescoço e décolletê', 'Face completa', 'Corpo (celulite)', 'Stretch marks'
]

const INJ_INDICACOES = [
  'Rugas de expressão', 'Rugas estáticas', 'Assimetria facial',
  'Bruxismo', 'Hiperidrose', 'Dor miofascial',
  'Preenchimento de volume', 'Restauração de contornos', 'Hidratação profunda',
  'Lifting não-cirúrgico', 'Rejuvenescimento', 'Cicatrizes de acne',
  'Flacidez cutânea', 'Bioremodelação', 'Bioestimulação de colágeno'
]

const INJ_CUIDADOS_PRE = [
  'Evitar anti-inflamatórios 7 dias antes',
  'Evitar álcool 24h antes',
  'Evitar exercícios intensos no dia',
  'Fazer limpeza de pele 2-3 dias antes',
  'Informar uso de anticoagulantes',
  'Realizar teste de sensibilidade',
  'Remover maquiagem antes do procedimento',
  'Jejum não necessário'
]

const INJ_CUIDADOS_POS = [
  'Não deitar nas primeiras 4h (toxina)',
  'Evitar exercícios intensos por 24h',
  'Evitar exposição solar direta por 48h',
  'Não massagear a área tratada por 7 dias',
  'Aplicar compressa fria se necessário',
  'Hidratante suave após 24h',
  'Retornar em 15 dias para revisão',
  'Evitar álcool por 24h',
  'Não fazer procedimentos estéticos por 7 dias',
  'Protetor solar FPS 30+ diariamente'
]

const INJ_CONTRAINDICACOES = [
  'Gestação e amamentação',
  'Infecção ativa na área de aplicação',
  'Hipersensibilidade ao produto',
  'Doenças autoimunes ativas',
  'Distúrbios neuromusculares (toxina)',
  'Uso de aminoglicosídeos',
  'Coagulopatias não controladas',
  'Menores de 18 anos',
  'Procedimento prévio com produto permanente'
]

const INJ_EFEITOS_ADV = [
  'Equimose (hematoma)',
  'Edema local',
  'Eritema',
  'Dor no local de aplicação',
  'Ptose palpebral transitória (toxina)',
  'Assimetria temporária',
  'Nódulo palpável (HA)',
  'Efeito Tyndall (HA superficial)',
  'Granuloma (raro)',
  'Oclusão vascular (raro, emergência)'
]

// ── Flags de contraindicações (integração futura com anamnese) ─
const CONTRAINDICATION_FLAGS = {
  gestacao:                { label:'Gestação',                                         group:'obstetrico'    },
  amamentacao:             { label:'Amamentação',                                      group:'obstetrico'    },
  autoimune:               { label:'Doença autoimune ativa',                           group:'sistemico'     },
  coagulacao:              { label:'Coagulopatia / uso de anticoagulante',             group:'hematologico'  },
  infeccao_ativa:          { label:'Infecção ativa na área de aplicação',              group:'local'         },
  menor_18:                { label:'Menor de 18 anos',                                 group:'geral'         },
  cancer_ativo:            { label:'Câncer ativo ou em tratamento recente (<2 anos)', group:'sistemico'     },
  queloide:                { label:'Tendência a queloides / cicatrizes hipertróficas', group:'local'         },
  implante_permanente:     { label:'Implante permanente na área',                      group:'local'         },
  disturbio_neuromuscular: { label:'Distúrbio neuromuscular (miastenia gravis, ELA)',  group:'neurologico'   },
  aminoglicosideos:        { label:'Uso de aminoglicosídeos',                          group:'farmacologico' },
  alergia_toxina:          { label:'Hipersensibilidade à toxina botulínica',           group:'alergia'       },
  alergia_ha:              { label:'Hipersensibilidade ao ácido hialurônico',          group:'alergia'       },
  alergia_lidocaina:       { label:'Hipersensibilidade à lidocaína',                  group:'alergia'       },
  alergia_plla:            { label:'Hipersensibilidade ao PLLA',                       group:'alergia'       },
  alergia_caha:            { label:'Hipersensibilidade ao CaHA',                       group:'alergia'       },
  alergia_pdrn:            { label:'Hipersensibilidade ao PDRN / polinucleotídeos',   group:'alergia'       },
  alergia_peixe:           { label:'Alergia a proteínas de peixe / salmão',           group:'alergia'       },
  alergia_hialuronidase:   { label:'Hipersensibilidade à hialuronidase',              group:'alergia'       },
  alergia_produto:         { label:'Hipersensibilidade ao produto (genérico)',         group:'alergia'       },
  diabetes_descompensada:  { label:'Diabetes descompensada',                          group:'sistemico'     },
  doenca_hepatica:         { label:'Doença hepática grave',                           group:'sistemico'     },
  trombocitopenia:         { label:'Trombocitopenia ou disfunção plaquetária',        group:'hematologico'  },
}

// ── Protocolos padrão por categoria ───────────────────────────
const CATEGORY_PROTOCOLS = {
  neuro: {
    indicacoes:['Rugas de expressão dinâmicas','Bruxismo e hipertrofia do masseter','Hiperidrose (axilar, palmar, plantar)','Sorriso gengival','Lifting de sobrancelha (brow lift)','Assimetria de sorriso','Pescoço — bandas platismais','Nariz (bunny lines)','Mento (queixo pontudo ou dimples)','Dor miofascial','Pés de galinha (canto dos olhos)'],
    cuidados_pre:['Evitar anti-inflamatórios (AAS, ibuprofeno) 7 dias antes','Evitar álcool 24h antes','Não fazer exercícios intensos no dia do procedimento','Remover maquiagem e protetor solar antes da aplicação','Informar todos os medicamentos em uso','Informar uso de anticoagulantes ou antiagregantes','Evitar vacinas nas 2 semanas anteriores','Não realizar tratamentos faciais agressivos 2 semanas antes'],
    cuidados_pos:['Não deitar nem curvar a cabeça para baixo nas primeiras 4h','Não massagear ou espremer a região tratada por 24h','Evitar exercícios físicos intensos por 24h','Evitar calor excessivo (sauna, banho muito quente, sol intenso) por 48h','Não consumir álcool por 24h','Não realizar outros procedimentos faciais por 15 dias','Usar protetor solar FPS 30+ diariamente','Retornar em 14 dias para avaliação e retoque se necessário','Em caso de ptose ou assimetria, entrar em contato imediatamente'],
    contraindicacoes:['Gestação e amamentação','Distúrbios neuromusculares (miastenia gravis, esclerose lateral amiotrófica, síndrome de Lambert-Eaton)','Hipersensibilidade à toxina botulínica ou albumina humana','Infecção ativa no local de aplicação','Uso concomitante de aminoglicosídeos','Coagulopatias não controladas','Menores de 18 anos'],
    efeitos_adv:['Equimose (hematoma) local','Ptose palpebral transitória','Ptose de sobrancelha transitória','Assimetria temporária','Cefaleia transitória','Resistência ao produto (formação de anticorpos)'],
    contraindicacoes_flags:['gestacao','amamentacao','disturbio_neuromuscular','alergia_toxina','infeccao_ativa','aminoglicosideos','menor_18','coagulacao']
  },
  ha: {
    indicacoes:['Preenchimento de lábios (volume e definição)','Sulco nasolabial (bigode chinês)','Sulco lacrimal (olheiras)','Preenchimento de maçãs do rosto','Harmonização do mento (queixo)','Rinoplastia não-cirúrgica','Linha mandibular','Restauração de volume das têmporas','Preenchimento de rugas estáticas','Harmonização facial global','Mãos (rejuvenescimento)','Cicatrizes deprimidas'],
    cuidados_pre:['Evitar anti-inflamatórios (AAS, ibuprofeno) 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele suave 2–3 dias antes','Informar uso de anticoagulantes ou antiagregantes','Informar histórico de herpes labial (profilaxia antiviral se indicado)','Informar procedimentos anteriores na área (especialmente produtos permanentes)','Informar alergias a lidocaína ou produtos de origem aviária','Não fazer atividade física intensa no dia'],
    cuidados_pos:['Evitar pressão, massagem ou manipulação da área por 48h','Aplicar compressa fria (não gelo direto) para reduzir edema — sem pressão','Evitar calor excessivo (sauna, sol direto, banho quente) por 72h','Não fazer exercícios físicos por 24h','Dormir com cabeça levemente elevada nas primeiras 2 noites','Evitar maquiagem no local por 24h','Usar protetor solar FPS 30+ diariamente','Não realizar outros procedimentos estéticos por 15 dias','Hidratação oral abundante','Retornar em 15 dias para avaliação do resultado','Em caso de dor intensa, palidez ou manchas roxas — acionar emergência imediatamente (oclusão vascular)'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico ou lidocaína','Infecção ativa no local de aplicação','Tendência a queloides ou cicatrizes hipertróficas','Doenças autoimunes ativas','Coagulopatias não controladas','Menores de 18 anos','Implante dérmico permanente na área a ser tratada','Herpes ativo no local'],
    efeitos_adv:['Equimose (hematoma)','Edema local (esperado, transitório)','Eritema e sensibilidade','Nódulo palpável (geralmente transitório)','Efeito Tyndall (coloração azulada por aplicação superficial)','Assimetria transitória','Granuloma (raro, tardio)','Oclusão vascular (raro — emergência médica)'],
    contraindicacoes_flags:['gestacao','amamentacao','alergia_ha','alergia_lidocaina','infeccao_ativa','queloide','autoimune','coagulacao','menor_18','implante_permanente']
  },
  biorev: {
    indicacoes:['Hidratação profunda da pele','Rejuvenescimento cutâneo','Melhora da textura e luminosidade','Fotoenvelhecimento leve a moderado','Pele ressecada ou sem viço','Manchas superficiais e discromias','Prevenção do envelhecimento (skin aging)','Pescoço e décolletê ressecados','Mãos envelhecidas','Bioestimulação de colágeno'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar uso de anticoagulantes','Informar histórico de herpes labial (profilaxia se indicado)','Informar alergias a componentes do produto','Não realizar procedimentos agressivos na área 2 semanas antes','Evitar sol intenso 48h antes'],
    cuidados_pos:['Evitar pressão ou massagem na área por 24h','Aplicar compressa fria suavemente se necessário','Evitar exposição solar direta por 48h','Evitar maquiagem por 24h','Hidratação tópica extra nos dias seguintes','Usar protetor solar FPS 30+ diariamente','Evitar exercícios físicos por 24h','Não realizar outros procedimentos por 7 dias','Seguir o número de sessões recomendado pelo protocolo'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico ou componentes do produto','Infecção ativa no local de aplicação','Doenças autoimunes ativas','Coagulopatias não controladas','Herpes ativo no local','Menores de 18 anos'],
    efeitos_adv:['Pápulas transitórias nos pontos de injeção (24–48h)','Edema local','Equimose (hematoma)','Eritema transitório','Sensibilidade local'],
    contraindicacoes_flags:['gestacao','amamentacao','alergia_ha','alergia_produto','infeccao_ativa','autoimune','coagulacao','menor_18']
  },
  biopoten: {
    indicacoes:['Flacidez cutânea facial e corporal','Perda de volume facial (envelhecimento)','Restauração de contornos faciais','Lifting não-cirúrgico','Bioestimulação de colágeno','Bioremodelação tecidual','Sulcos profundos (nasolabial, marionete)','Tratamento de celulite (corpo)','Pós-emagrecimento (flacidez residual)'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar uso de anticoagulantes','Evitar exposição solar intensa 2 semanas antes','Informar procedimentos anteriores na área','Não realizar outros tratamentos na área 4 semanas antes'],
    cuidados_pos:['Realizar massagem conforme protocolo do produto (PLLA: regra 5-5-5)','Evitar exposição solar intensa por 7 dias','Não fazer exercícios físicos intensos por 48h','Aplicar compressa fria suavemente se necessário','Hidratação tópica intensa','Usar protetor solar FPS 30+ diariamente','Evitar calor excessivo por 72h','Não manipular excessivamente a área por 48h (exceto protocolo de massagem PLLA)','Retornar conforme protocolo de sessões (geralmente 2–3 sessões)','Comunicar ao profissional se houver nódulo persistente'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao produto (PLLA, CaHA, PCL ou HA)','Infecção ativa no local de aplicação','Tendência a queloides ou cicatrizes hipertróficas','Doenças autoimunes ativas','Coagulopatias não controladas','Menores de 18 anos','Câncer ativo ou em tratamento oncológico','Implante dérmico permanente na área'],
    efeitos_adv:['Edema local (esperado)','Equimose (hematoma)','Nódulos subcutâneos (se massagem insuficiente — PLLA)','Eritema transitório','Sensibilidade e dor local','Resultado progressivo em semanas/meses'],
    contraindicacoes_flags:['gestacao','amamentacao','alergia_plla','alergia_caha','alergia_produto','infeccao_ativa','queloide','autoimune','coagulacao','menor_18','cancer_ativo','implante_permanente']
  },
  enzima: {
    indicacoes:['Dissolução de ácido hialurônico (correção de preenchimento)','Preenchimento excessivo ou mal distribuído','Oclusão vascular por HA (emergência)','Efeito Tyndall','Nódulos de HA persistentes','Migração de HA','Granuloma relacionado a HA','Assimetria por HA'],
    cuidados_pre:['Realizar teste de sensibilidade intradérmico antes da aplicação (salvo emergência vascular)','Confirmar o produto a ser dissolvido (tipo e localização)','Documentação fotográfica pré-procedimento','Informar ao paciente sobre a possibilidade de dissolução além do esperado','Em caso de oclusão vascular: aplicar imediatamente sem aguardar teste','Ter adrenalina disponível (reação anafilática rara)'],
    cuidados_pos:['Observar paciente por 30 minutos após a aplicação','Reavaliar resultado em 24–48h (efeito completo em 24h)','Pode ser necessária aplicação adicional','Aguardar mínimo de 4 semanas antes de novo preenchimento na área','Hidratação tópica intensa','Usar protetor solar FPS 30+','Em oclusão vascular: seguimento rigoroso e acionamento de serviço de emergência se necessário'],
    contraindicacoes:['Hipersensibilidade à hialuronidase','Hipersensibilidade a proteínas de origem bovina (alguns produtos)','Infecção ativa no local de aplicação','Gestação e amamentação (relativo — ponderar em emergência vascular)'],
    efeitos_adv:['Reação alérgica local (urticária, eritema)','Reação anafilática (rara — ter adrenalina disponível)','Dissolução excessiva de HA','Equimose local','Edema temporário'],
    contraindicacoes_flags:['alergia_hialuronidase','alergia_produto','infeccao_ativa','gestacao','amamentacao']
  },
  fio: {
    indicacoes:['Flacidez cutânea facial (oval do rosto)','Lifting não-cirúrgico de bochecha','Lifting de sobrancelha (brow lift)','Papada e região submentoniana','Flacidez cervical (pescoço)','Linhas da marionete','Bioestimulação de colágeno (fios lisos)','Melhora do contorno mandibular','Flacidez corporal (braços, abdômen, coxas)','Estrias e cicatrizes (fios lisos)'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar uso de anticoagulantes','Não fazer depilação facial 1 semana antes','Não realizar outros procedimentos na área 4 semanas antes','Informar histórico de herpes (profilaxia antiviral se indicado)','Remover maquiagem antes do procedimento','Fotografar área antes do procedimento'],
    cuidados_pos:['Compresas frias (sem pressão) nas primeiras 48h','Dormir de costas com cabeça elevada por 7 dias','Evitar expressões faciais exageradas por 7 dias','Não realizar massagem facial por 30 dias','Evitar atividade física intensa por 7 dias','Tomar antibiótico profilático oral conforme prescrição médica','Usar protetor solar FPS 30+ diariamente','Evitar calor excessivo (sauna, banho muito quente) por 2 semanas','Não dormir de lado ou de bruços por 7 dias','Retornar em 7 dias para avaliação','Evitar procedimentos injetáveis na área por 4 semanas'],
    contraindicacoes:['Gestação e amamentação','Infecção ativa no local de aplicação','Tendência a queloides ou cicatrizes hipertróficas','Doenças autoimunes ativas','Coagulopatias não controladas','Menores de 18 anos','Implante permanente na área a ser tratada','Diabetes descompensada','Câncer ativo ou em tratamento oncológico','Histórico de reação a fios de sutura'],
    efeitos_adv:['Equimose e edema (esperados, transitórios)','Dor e sensibilidade local','Assimetria transitória','Infecção (raro — requer antibioticoterapia)','Extrusão do fio (raro)','Irregularidade na pele (covinhas transitórias)','Reação inflamatória ao fio'],
    contraindicacoes_flags:['gestacao','amamentacao','infeccao_ativa','queloide','autoimune','coagulacao','menor_18','implante_permanente','diabetes_descompensada','cancer_ativo']
  },
  lipolitico: {
    indicacoes:['Adiposidade submentoniana (papada)','Gordura localizada abdominal','Flancos e "gordurinhas" laterais','Lipodistrofia localizada resistente a dieta e exercício','Modelagem corporal não-cirúrgica'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Jejum de 2 horas antes do procedimento','Informar uso de anticoagulantes','Informar histórico de dislipidemia','Fotografar a área antes','Não realizar exercícios físicos intensos no dia'],
    cuidados_pos:['Compresas frias na área por 48h (20 min ligado / 20 min desligado)','Iniciar drenagem linfática após 72h','Evitar exercícios físicos intensos por 48h','Usar cinta modeladora se indicado pelo profissional','Hidratação oral abundante','Usar protetor solar FPS 30+ se área exposta','Retornar em 30 dias para avaliação do resultado','Manter dieta saudável e atividade física regular','Edema e dor são esperados nas primeiras 72h'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido desoxicólico ou componentes','Infecção ativa no local de aplicação','Doenças hepáticas graves','Dislipidemia grave não controlada','Coagulopatias não controladas','Menores de 18 anos','Doenças autoimunes ativas','Câncer ativo'],
    efeitos_adv:['Edema intenso (esperado, transitório)','Equimose','Dor e ardência local (esperados)','Endurecimento local transitório','Disfagia se aplicado próximo à laringe','Lesão de nervo marginal mandibular (raro — papada)'],
    contraindicacoes_flags:['gestacao','amamentacao','alergia_produto','infeccao_ativa','doenca_hepatica','coagulacao','menor_18','autoimune','cancer_ativo']
  },
  mesoterapia: {
    indicacoes:['Rejuvenescimento facial','Hidratação profunda da pele','Manchas e melasma','Queda capilar (alopecia)','Celulite (fibroedema geloide)','Flacidez cutânea','Perda de luminosidade','Olheiras','Estrias','Fotoenvelhecimento'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele suave antes','Informar alergias a vitaminas, aminoácidos ou ativos injetáveis','Informar uso de anticoagulantes','Não realizar outros procedimentos agressivos 1 semana antes','Informar histórico de herpes (profilaxia se indicado)','Evitar sol intenso 48h antes'],
    cuidados_pos:['Evitar maquiagem por 24h','Não expor ao sol por 48h','Usar protetor solar FPS 30+ diariamente','Evitar exercícios físicos por 24h','Hidratação tópica intensa','Não lavar o rosto por 4h após procedimento facial','Seguir o protocolo de sessões prescrito'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade a qualquer componente da fórmula','Infecção ativa no local de aplicação','Doenças autoimunes ativas','Coagulopatias não controladas','Diabetes descompensada','Câncer ativo'],
    efeitos_adv:['Equimose local','Edema transitório','Eritema e sensibilidade','Pápulas transitórias','Reação alérgica local (raro)'],
    contraindicacoes_flags:['gestacao','amamentacao','alergia_produto','infeccao_ativa','autoimune','coagulacao','diabetes_descompensada','cancer_ativo']
  },
  prp: {
    indicacoes:['Rejuvenescimento facial','Alopecia androgenética (queda capilar)','Alopecia areata','Cicatrizes de acne deprimidas','Estrias','Melhora de textura e luminosidade','Potencialização pós-procedimento (laser, microagulhamento)'],
    cuidados_pre:['Evitar anti-inflamatórios e AAS 7 dias antes (interferem na ação do PRP)','Evitar álcool 48h antes','Boa hidratação e alimentação antes da coleta','Informar uso de anticoagulantes ou antiplaquetários','Exames de sangue recentes se indicado','Não estar com anemia ou plaquetas baixas','Não realizar outros procedimentos faciais 2 semanas antes'],
    cuidados_pos:['NÃO usar anti-inflamatórios por 7 dias (inibem a ação do PRP)','Não lavar o rosto por 6h após procedimento facial','Evitar sol por 48h','Usar protetor solar FPS 30+','Evitar exercícios físicos por 24h','Hidratação tópica intensa','Não fazer maquiagem por 24h','Eritema e edema leve nas primeiras 24h são esperados','Retornar conforme protocolo (geralmente 3 sessões com intervalo de 4 semanas)'],
    contraindicacoes:['Infecção ativa no local de aplicação','Trombocitopenia ou disfunção plaquetária','Uso de anticoagulantes (warfarina, heparina)','Doenças hematológicas','Câncer ativo ou em tratamento oncológico','Infecções sistêmicas (sepse)','Gestação e amamentação','Doenças autoimunes ativas em surto','Anemia grave'],
    efeitos_adv:['Equimose no local de coleta e aplicação','Edema transitório','Eritema e sensibilidade','Infecção (raro)'],
    contraindicacoes_flags:['gestacao','amamentacao','infeccao_ativa','trombocitopenia','coagulacao','cancer_ativo','autoimune']
  },
  exossomo: {
    indicacoes:['Rejuvenescimento avançado','Reparação celular intensiva','Pós-procedimentos agressivos (laser ablativo, peeling profundo)','Alopecia androgenética','Cicatrizes e sequelas de acne','Melhora de textura, elasticidade e luminosidade','Fotoenvelhecimento intenso'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar alergias a componentes biológicos','Informar uso de imunossupressores','Não realizar outros procedimentos na área 2 semanas antes'],
    cuidados_pos:['Não lavar o rosto por 6–8h','Evitar sol por 48h','Usar protetor solar FPS 30+ diariamente','Hidratação tópica intensa','Evitar exercícios físicos por 24h','Não fazer maquiagem por 24h','Evitar anti-inflamatórios por 7 dias','Seguir protocolo de sessões recomendado'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade aos componentes','Infecção ativa no local','Câncer ativo ou em tratamento oncológico','Doenças autoimunes ativas','Uso de imunossupressores (relativo — avaliar com médico)'],
    efeitos_adv:['Eritema transitório','Edema leve','Sensibilidade local','Reação alérgica (raro)'],
    contraindicacoes_flags:['gestacao','amamentacao','alergia_produto','infeccao_ativa','cancer_ativo','autoimune']
  },
  polinucleotideo: {
    indicacoes:['Rejuvenescimento tecidual (regeneração celular)','Hidratação profunda da derme','Melhora de textura, poros e luminosidade','Fotoenvelhecimento','Cicatrizes de acne','Manchas e discromias','Flacidez cutânea leve a moderada','Olheiras (região periorbital)','Pescoço e décolletê','Alopecia androgenética'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar alergias a proteínas de peixe/salmão','Informar uso de anticoagulantes','Não realizar outros procedimentos na área 1 semana antes','Informar histórico de herpes (profilaxia se indicado)'],
    cuidados_pos:['Evitar pressão na área por 24h','Aplicar compressa fria suavemente se necessário','Evitar exposição solar por 48h','Usar protetor solar FPS 30+','Não fazer maquiagem por 24h','Hidratação tópica intensa','Evitar exercícios físicos por 24h','Seguir número de sessões do protocolo (geralmente 3–4 sessões)'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao PDRN ou polinucleotídeos','Alergia a proteínas de peixe/salmão','Infecção ativa no local de aplicação','Doenças autoimunes ativas','Coagulopatias não controladas','Câncer ativo'],
    efeitos_adv:['Eritema transitório','Edema leve','Equimose','Pápulas transitórias','Reação alérgica (raro)'],
    contraindicacoes_flags:['gestacao','amamentacao','alergia_pdrn','alergia_peixe','infeccao_ativa','autoimune','coagulacao','cancer_ativo']
  },
  fatorcrescimento: {
    indicacoes:['Rejuvenescimento avançado','Regeneração e reparação cutânea','Melhora de elasticidade e firmeza','Melhora de textura e luminosidade','Cicatrizes de acne e cirúrgicas','Fotoenvelhecimento intenso','Potencialização pós-procedimento (laser, microagulhamento, peelings)'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar alergias a componentes biológicos','Informar medicamentos imunossupressores','Não realizar outros procedimentos na área 2 semanas antes'],
    cuidados_pos:['Não lavar o rosto por 6h','Usar protetor solar FPS 30+','Evitar sol por 48h','Hidratação tópica intensa','Evitar maquiagem por 24h','Evitar exercícios físicos por 24h','Não usar anti-inflamatórios por 7 dias'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade aos componentes','Câncer ativo ou histórico recente (<2 anos)','Infecção ativa no local','Doenças autoimunes ativas'],
    efeitos_adv:['Eritema transitório','Edema leve','Sensibilidade local','Reação alérgica (raro)'],
    contraindicacoes_flags:['gestacao','amamentacao','alergia_produto','cancer_ativo','infeccao_ativa','autoimune']
  }
}

// ── Helper: retorna protocolo do produto (template + fallback da categoria) ──
function _getProductProtocol(t) {
  const cat = CATEGORY_PROTOCOLS[t?.categoria] || {}
  return {
    indicacoes:             t?.indicacoes?.length       ? t.indicacoes       : (cat.indicacoes       || []),
    cuidados_pre:           t?.cuidados_pre?.length     ? t.cuidados_pre     : (cat.cuidados_pre     || []),
    cuidados_pos:           t?.cuidados_pos?.length     ? t.cuidados_pos     : (cat.cuidados_pos     || []),
    contraindicacoes:       t?.contraindicacoes?.length ? t.contraindicacoes : (cat.contraindicacoes || []),
    efeitos_adv:            t?.efeitos_adv?.length      ? t.efeitos_adv      : (cat.efeitos_adv      || []),
    contraindicacoes_flags: t?.contraindicacoes_flags   || cat.contraindicacoes_flags || []
  }
}

// ── Seeds de produtos ─────────────────────────────────────────
const BRAND_TEMPLATES = {
  botox: {
    nome:'Botox', fabricante:'Allergan (AbbVie)', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 50U / 100U',
    dose_padrao:100, duracao:'4 meses', downtime:'Nenhum',
    areas:['Glabela','Frontal','Pés de galinha','Masseter (bruxismo)','Pescoço (platisma)'],
    indicacoes:['Rugas de expressão','Bruxismo','Hiperidrose'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Evitar exercícios intensos no dia','Remover maquiagem antes do procedimento','Informar uso de anticoagulantes'],
    cuidados_pos:['Não deitar nas primeiras 4h','Evitar exercícios intensos por 24h','Não massagear a região tratada por 24h','Evitar calor excessivo (sauna, banho quente) por 48h','Não fazer procedimentos faciais por 15 dias'],
    contraindicacoes:['Gestação e amamentação','Distúrbios neuromusculares (miastenia gravis, esclerose lateral)','Hipersensibilidade à toxina botulínica','Infecção ativa no local de aplicação','Uso de aminoglicosídeos'],
    efeitos_adv:['Equimose (hematoma)','Ptose palpebral transitória'],
    observacoes:'Reconstituir com 2,5mL de SF 0,9% para 4U/0,1mL. Refrigerar após reconstituição.'
  },
  dysport: {
    nome:'Dysport', fabricante:'Ipsen', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 300U / 500U',
    dose_padrao:300, duracao:'4 meses', downtime:'Nenhum',
    areas:['Glabela','Frontal','Pés de galinha'],
    indicacoes:['Rugas de expressão'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Evitar exercícios intensos no dia','Remover maquiagem antes do procedimento','Informar uso de anticoagulantes'],
    cuidados_pos:['Não deitar nas primeiras 4h','Evitar exercícios intensos por 24h','Não massagear a região tratada por 24h','Evitar calor excessivo por 48h'],
    contraindicacoes:['Gestação e amamentação','Distúrbios neuromusculares','Hipersensibilidade à toxina botulínica','Infecção ativa no local de aplicação','Uso de aminoglicosídeos'],
    efeitos_adv:['Equimose (hematoma)','Ptose palpebral transitória'],
    observacoes:'Equivalência ~3:1 em relação ao Botox. Reconstituir com 2,5mL SF.'
  },
  xeomin: {
    nome:'Xeomin', fabricante:'Merz Pharma', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 50U / 100U',
    dose_padrao:100, duracao:'3 meses', downtime:'Nenhum',
    areas:['Glabela','Frontal','Pés de galinha'],
    indicacoes:['Rugas de expressão'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Evitar exercícios intensos no dia','Remover maquiagem antes do procedimento'],
    cuidados_pos:['Não deitar nas primeiras 4h','Evitar exercícios intensos por 24h','Não massagear a região tratada por 24h','Evitar calor excessivo por 48h'],
    contraindicacoes:['Gestação e amamentação','Distúrbios neuromusculares','Hipersensibilidade à toxina botulínica','Infecção ativa no local de aplicação'],
    efeitos_adv:['Equimose (hematoma)','Ptose palpebral transitória'],
    observacoes:'Toxina pura — sem proteínas complexantes. Menor risco de anticorpos.'
  },
  jeuveau: {
    nome:'Jeuveau', fabricante:'Evolus', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 100U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  nabota: {
    nome:'Nabota', fabricante:'Daewoong Pharmaceutical', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 100U / 200U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  botulift: {
    nome:'Botulift', fabricante:'Medytox', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 50U / 100U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  prosigne: {
    nome:'Prosigne', fabricante:'Lanzhou Institute (China)', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 50U / 100U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  letybo: {
    nome:'Letybo', fabricante:'Hugel', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 50U / 100U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  rentox: {
    nome:'ReNTox', fabricante:'Pharma Research Bio (Coreia)', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 100U / 200U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  azzalure: {
    nome:'Azzalure', fabricante:'Ipsen / Galderma (distrib.)', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 125U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  bocouture: {
    nome:'Bocouture', fabricante:'Merz Pharma', categoria:'neuro',
    unidade:'U', apresentacao:'Frasco-ampola 50U / 100U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  alluzience: {
    nome:'Alluzience', fabricante:'Ipsen / Galderma', categoria:'neuro',
    unidade:'U', apresentacao:'Solução pronta 200U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  juvederm: {
    nome:'Juvéderm Ultra', fabricante:'Allergan (AbbVie)', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:1, duracao:'12 meses', downtime:'48h',
    areas:['Lábios (preenchimento)','Sulco nasolabial','Bigode chinês'],
    indicacoes:['Preenchimento de volume','Restauração de contornos'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele 2-3 dias antes','Realizar teste de sensibilidade','Informar uso de anticoagulantes'],
    cuidados_pos:['Evitar pressão ou massagem na área por 48h','Aplicar gelo para reduzir edema (sem pressão)','Evitar calor excessivo (sauna, sol) por 72h','Não fazer exercícios por 24h','Dormir com cabeça elevada nas primeiras noites'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico','Infecção ativa no local','Tendência a queloides ou cicatrizes hipertróficas','Doenças autoimunes ativas'],
    efeitos_adv:['Equimose (hematoma)','Edema local','Nódulo palpável'],
    observacoes:'Contém lidocaína 0,3%. Disponível em volumes 0,55mL e 1mL.'
  },
  juvederm_voluma: {
    nome:'Juvederm Voluma', fabricante:'Allergan (AbbVie)', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  juvederm_volift: {
    nome:'Juvederm Volift', fabricante:'Allergan (AbbVie)', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  juvederm_volbella: {
    nome:'Juvederm Volbella', fabricante:'Allergan (AbbVie)', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  juvederm_volite: {
    nome:'Juvederm Volite', fabricante:'Allergan (AbbVie)', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  juvederm_ultra_xc: {
    nome:'Juvederm Ultra XC', fabricante:'Allergan (AbbVie)', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  restylane: {
    nome:'Restylane', fabricante:'Galderma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:1, duracao:'12 meses', downtime:'48h',
    areas:['Sulco nasolabial','Lábios (preenchimento)','Linha mandibular'],
    indicacoes:['Preenchimento de volume','Restauração de contornos'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele 2-3 dias antes','Informar uso de anticoagulantes'],
    cuidados_pos:['Evitar pressão ou massagem na área por 48h','Aplicar gelo para reduzir edema (sem pressão)','Evitar calor excessivo por 72h','Não fazer exercícios por 24h'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico','Infecção ativa no local','Tendência a queloides','Doenças autoimunes ativas'],
    efeitos_adv:['Equimose (hematoma)','Edema local','Nódulo palpável'],
    observacoes:'Tecnologia NASHA. Alta G\'. Ideal para áreas com movimento.'
  },
  restylane_lyft: {
    nome:'Restylane Lyft', fabricante:'Galderma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  restylane_defyne: {
    nome:'Restylane Defyne', fabricante:'Galderma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  restylane_refyne: {
    nome:'Restylane Refyne', fabricante:'Galderma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  restylane_kysse: {
    nome:'Restylane Kysse', fabricante:'Galderma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  restylane_vital: {
    nome:'Restylane Vital', fabricante:'Galderma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  belotero: {
    nome:'Belotero Balance', fabricante:'Merz Pharma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:1, duracao:'9 meses', downtime:'24h',
    areas:['Olheiras','Rugas finas periorais','Têmporas'],
    indicacoes:['Rugas estáticas','Preenchimento de volume'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele 2-3 dias antes','Informar uso de anticoagulantes'],
    cuidados_pos:['Evitar pressão na área por 24h','Aplicar gelo suavemente para reduzir edema','Evitar calor excessivo por 48h','Não fazer exercícios por 24h'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico','Infecção ativa no local','Tendência a queloides'],
    efeitos_adv:['Equimose (hematoma)','Edema local'],
    observacoes:'Tecnologia CPM. Integração homogênea. Ideal para planos superficiais.'
  },
  belotero_intense: {
    nome:'Belotero Intense', fabricante:'Merz Pharma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  belotero_volume: {
    nome:'Belotero Volume', fabricante:'Merz Pharma', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  stylage_s: {
    nome:'Stylage S', fabricante:'Vivacy', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  stylage_m: {
    nome:'Stylage M', fabricante:'Vivacy', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  stylage_l: {
    nome:'Stylage L', fabricante:'Vivacy', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  stylage_xl: {
    nome:'Stylage XL', fabricante:'Vivacy', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  rennova_fill: {
    nome:'Rennova Fill', fabricante:'Rennova', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  rennova_lift: {
    nome:'Rennova Lift', fabricante:'Rennova', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  yvoire_classic: {
    nome:'Yvoire Classic', fabricante:'LG Chem', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  yvoire_volume: {
    nome:'Yvoire Volume', fabricante:'LG Chem', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  teosyal_rha2: {
    nome:'Teosyal RHA 2', fabricante:'Teoxane', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  teosyal_rha3: {
    nome:'Teosyal RHA 3', fabricante:'Teoxane', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  teosyal_rha4: {
    nome:'Teosyal RHA 4', fabricante:'Teoxane', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  revolax_deep: {
    nome:'Revolax Deep', fabricante:'Across (Coreia)', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  revolax_subq: {
    nome:'Revolax Sub-Q', fabricante:'Across (Coreia)', categoria:'ha',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  sculptra: {
    nome:'Sculptra', fabricante:'Galderma', categoria:'biopoten',
    unidade:'vial', apresentacao:'Frasco-ampola 150mg',
    dose_padrao:1, duracao:'24 meses', downtime:'24h',
    areas:['Face completa','Têmporas','Maçãs do rosto','Corpo (celulite)'],
    indicacoes:['Flacidez cutânea','Bioremodelação','Bioestimulação de colágeno'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar uso de anticoagulantes'],
    cuidados_pos:['Massagem 5x ao dia por 5 dias (regra 5-5-5)','Evitar exposição solar intensa por 7 dias','Não fazer exercícios intensos por 48h','Aplicar gelo suavemente se necessário'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao PLLA','Infecção ativa no local','Tendência a queloides ou cicatrizes hipertróficas','Doenças autoimunes ativas'],
    efeitos_adv:['Nódulos subcutâneos (se massagem insuficiente)','Edema local','Equimose'],
    observacoes:'Reconstituir 72h antes. Massagem 5x ao dia por 5 dias.'
  },
  lanluma_v: {
    nome:'Lanluma V', fabricante:'Sinclair Pharma', categoria:'biopoten',
    unidade:'vial', apresentacao:'Frasco-ampola 210mg',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  lanluma_x: {
    nome:'Lanluma X', fabricante:'Sinclair Pharma', categoria:'biopoten',
    unidade:'vial', apresentacao:'Frasco-ampola 630mg',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  radiesse: {
    nome:'Radiesse', fabricante:'Merz Pharma', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 1.5ml',
    dose_padrao:1.5, duracao:'18 meses', downtime:'48h',
    areas:['Linha mandibular','Maçãs do rosto','Mãos','Pescoço e décolletê'],
    indicacoes:['Flacidez cutânea','Restauração de contornos','Bioestimulação de colágeno'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar uso de anticoagulantes'],
    cuidados_pos:['Evitar pressão ou massagem excessiva por 48h','Aplicar gelo suavemente','Evitar calor excessivo por 72h','Não fazer exercícios intensos por 24h'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao CaHA','Infecção ativa no local','Tendência a queloides','Pacientes com implantes dérmicos recentes na área'],
    efeitos_adv:['Equimose (hematoma)','Edema local','Nódulo palpável'],
    observacoes:'Microesferas de CaHA. Efeito imediato + tardio. Pode ser diluído para bioremodelação.'
  },
  radiesse_plus: {
    nome:'Radiesse (+)', fabricante:'Merz Pharma', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 1.5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  ellanse_s: {
    nome:'Ellansé S', fabricante:'Sinclair Pharma', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  ellanse_m: {
    nome:'Ellansé M', fabricante:'Sinclair Pharma', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  ellanse_l: {
    nome:'Ellansé L', fabricante:'Sinclair Pharma', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  ellanse_e: {
    nome:'Ellansé E', fabricante:'Sinclair Pharma', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  harmonyca: {
    nome:'HarmonyCa', fabricante:'Allergan (AbbVie)', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 1.25ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  rennova_elleva: {
    nome:'Rennova Elleva', fabricante:'Rennova', categoria:'biopoten',
    unidade:'vial', apresentacao:'Frasco-ampola 210mg',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  rennova_diamond: {
    nome:'Rennova Diamond', fabricante:'Rennova', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 1.25ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  gana_v: {
    nome:'Gana V', fabricante:'BioPlus (Coreia)', categoria:'biopoten',
    unidade:'vial', apresentacao:'Frasco-ampola 200mg',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  aesthefill: {
    nome:'AestheFill', fabricante:'REGEN Biotech', categoria:'biopoten',
    unidade:'vial', apresentacao:'Frasco-ampola 200mg',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  rejuran_healer: {
    nome:'Rejuran Healer', fabricante:'Pharma Research', categoria:'polinucleotideo',
    unidade:'mL', apresentacao:'Seringa 2ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  skinbooster: {
    nome:'Restylane Skinboosters Vital', fabricante:'Galderma', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:1, duracao:'6 meses', downtime:'24h',
    areas:['Face completa','Pescoço e décolletê','Mãos'],
    indicacoes:['Hidratação profunda','Rejuvenescimento'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar uso de anticoagulantes'],
    cuidados_pos:['Evitar pressão na área por 24h','Aplicar gelo suavemente se necessário','Evitar exposição solar direta por 48h','Hidratação extra nos dias seguintes'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico','Infecção ativa no local','Doenças autoimunes ativas'],
    efeitos_adv:['Pápulas transitórias','Edema local','Equimose'],
    observacoes:'Protocolo: 3 sessões com intervalo de 4 semanas. Manutenção a cada 6 meses.'
  },
  restylane_skinboosters: {
    nome:'Restylane Skinboosters', fabricante:'Galderma', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  restylane_vital_light: {
    nome:'Restylane Skinboosters Vital Light', fabricante:'Galderma', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  belotero_revive: {
    nome:'Belotero Revive', fabricante:'Merz Pharma', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:1, duracao:'6 meses', downtime:'24h',
    areas:['Face completa','Pescoço e décolletê'],
    indicacoes:['Hidratação profunda','Rejuvenescimento'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia'],
    cuidados_pos:['Evitar pressão na área por 24h','Aplicar gelo suavemente se necessário','Evitar exposição solar direta por 48h'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico','Infecção ativa no local','Doenças autoimunes ativas'],
    efeitos_adv:['Pápulas transitórias','Edema local','Equimose'],
    observacoes:'Contém glicerol e vitamina B3. Estimula produção de colágeno III.'
  },
  profhilo: {
    nome:'Profhilo', fabricante:'IBSA Farmaceutici', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 2ml',
    dose_padrao:2, duracao:'6 meses', downtime:'24h',
    areas:['Face completa','Pescoço e décolletê','Braços','Abdômen'],
    indicacoes:['Flacidez cutânea','Hidratação profunda','Bioremodelação'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar uso de anticoagulantes'],
    cuidados_pos:['Não massagear os pontos de injeção por 24h','Aplicar gelo suavemente se necessário','Evitar calor excessivo por 48h','Não fazer exercícios intensos por 24h'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico','Infecção ativa no local','Doenças autoimunes ativas'],
    efeitos_adv:['Pápulas nos pontos BAP (transitórias 24-48h)','Edema local','Equimose'],
    observacoes:'64mg/2mL de HA híbrido H-HA+L-HA. BAP Technique: 5 pontos por face.'
  },
  profhilo_body: {
    nome:'Profhilo Body', fabricante:'IBSA Farmaceutici', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 2ml',
    dose_padrao:4, duracao:'6 meses', downtime:'48h',
    areas:['Corpo (celulite)','Braços','Abdômen','Coxas'],
    indicacoes:['Flacidez cutânea','Hidratação profunda'],
    cuidados_pre:['Evitar anti-inflamatórios 5 dias antes','Evitar álcool 24h antes','Fazer limpeza da área prévia','Informar uso de anticoagulantes'],
    cuidados_pos:['Não massagear os pontos por 48h','Aplicar gelo suavemente se necessário','Evitar calor excessivo por 48h','Não fazer exercícios intensos por 48h'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico','Infecção ativa no local','Doenças autoimunes ativas'],
    efeitos_adv:['Pápulas nos pontos (transitórias)','Edema local','Equimose'],
    observacoes:'160mg/4mL. Ideal para áreas corporais com flacidez e celulite.'
  },
  profhilo_structura: {
    nome:'Profhilo Structura', fabricante:'IBSA Farmaceutici', categoria:'biopoten',
    unidade:'mL', apresentacao:'Seringa 2ml',
    dose_padrao:1, duracao:'12 meses', downtime:'48h',
    areas:['Maçãs do rosto','Linha mandibular','Têmporas'],
    indicacoes:['Restauração de contornos','Lifting não-cirúrgico'],
    cuidados_pre:['Evitar anti-inflamatórios 7 dias antes','Evitar álcool 24h antes','Fazer limpeza de pele prévia','Informar uso de anticoagulantes'],
    cuidados_pos:['Evitar pressão ou massagem excessiva por 48h','Aplicar gelo suavemente','Evitar calor excessivo por 72h','Não fazer exercícios intensos por 24h'],
    contraindicacoes:['Gestação e amamentação','Hipersensibilidade ao ácido hialurônico','Infecção ativa no local','Tendência a queloides','Doenças autoimunes ativas'],
    efeitos_adv:['Equimose (hematoma)','Edema local','Nódulo palpável'],
    observacoes:'HA reticulado de alta concentração. Bioestimulador estrutural.'
  },
  redensity1: {
    nome:'Redensity 1', fabricante:'Teoxane', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  nctf_135: {
    nome:'NCTF 135 HA', fabricante:'Filorga', categoria:'biorev',
    unidade:'mL', apresentacao:'Ampola 3ml / 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  nctf_135_plus: {
    nome:'NCTF 135 HA+', fabricante:'Filorga', categoria:'biorev',
    unidade:'mL', apresentacao:'Ampola 3ml / 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  jalupro_classic: {
    nome:'Jalupro Classic', fabricante:'Professional Derma', categoria:'biorev',
    unidade:'mL', apresentacao:'Frasco + Ampola 3ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  jalupro_hmw: {
    nome:'Jalupro HMW', fabricante:'Professional Derma', categoria:'biorev',
    unidade:'mL', apresentacao:'Frasco + Ampola 2.5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  jalupro_super_hydro: {
    nome:'Jalupro Super Hydro', fabricante:'Professional Derma', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 2.5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  teosyal_redensity1: {
    nome:'Teosyal Redensity 1 Skinbooster', fabricante:'Teoxane', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  viscoderm_08: {
    nome:'Viscoderm 0.8', fabricante:'IBSA Farmaceutici', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  viscoderm_16: {
    nome:'Viscoderm 1.6', fabricante:'IBSA Farmaceutici', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  viscoderm_20: {
    nome:'Viscoderm 2.0', fabricante:'IBSA Farmaceutici', categoria:'biorev',
    unidade:'mL', apresentacao:'Seringa 1ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  cytocare_502: {
    nome:'Cytocare 502', fabricante:'Revitacare', categoria:'biorev',
    unidade:'mL', apresentacao:'Ampola 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  cytocare_516: {
    nome:'Cytocare 516', fabricante:'Revitacare', categoria:'biorev',
    unidade:'mL', apresentacao:'Ampola 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  cytocare_532: {
    nome:'Cytocare 532', fabricante:'Revitacare', categoria:'biorev',
    unidade:'mL', apresentacao:'Ampola 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },

  // ── Enzima (Hialuronidase) ────────────────────────────────────
  hyalase: {
    nome:'Hyalase', fabricante:'Apsen Farmacêutica', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 20.000U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  hyalozima: {
    nome:'Hyalozima', fabricante:'Blau Farmacêutica', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 20.000U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  hialuronidase_cristalia: {
    nome:'Hialuronidase Cristália', fabricante:'Cristália', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 20.000U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  hylenex: {
    nome:'Hylenex', fabricante:'Halozyme Therapeutics', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 150U / 200U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  vitrase: {
    nome:'Vitrase', fabricante:'Bausch & Lomb', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 200U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  hylase_dessau: {
    nome:'Hylase Dessau', fabricante:'Riemser Pharma', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 1.500U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  liporase: {
    nome:'Liporase', fabricante:'Daehan New Pharm (Coreia)', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 1.500U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  hirax: {
    nome:'Hirax', fabricante:'Bharat Serums and Vaccines (Índia)', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 1.500U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  lydase: {
    nome:'Lydase', fabricante:'Jiangsu Wanbang (China)', categoria:'enzima',
    unidade:'U', apresentacao:'Frasco-ampola 1.500U',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },

  // ── Fios de PDO / PLLA ────────────────────────────────────────
  mint_pdo: {
    nome:'Mint PDO', fabricante:'HansBiomed', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 10–20 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  mint_lift: {
    nome:'Mint Lift', fabricante:'HansBiomed', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 10–20 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  aptos_thread: {
    nome:'Aptos Thread', fabricante:'Aptos', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 2–10 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  silhouette_soft: {
    nome:'Silhouette Soft (PLLA)', fabricante:'Sinclair Pharma', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 2 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  happy_lift: {
    nome:'Happy Lift', fabricante:'Promoitalia', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 2–10 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  i_thread: {
    nome:'i-Thread', fabricante:'i-Thread Medical (Coreia)', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 20–100 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  lead_fine_lift: {
    nome:'Lead Fine Lift', fabricante:'Medifirst (Coreia)', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 20–100 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  vloc_pdo: {
    nome:'V-Loc PDO', fabricante:'Covidien (Medtronic)', categoria:'fio',
    unidade:'unidade', apresentacao:'Unidade estéril',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  spring_thread: {
    nome:'Spring Thread', fabricante:'Spring Thread', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 2 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  ultra_v_line: {
    nome:'Ultra V Line', fabricante:'Ultra V (Coreia)', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 20–100 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  first_lift: {
    nome:'First Lift', fabricante:'Menarini', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 2–10 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  beaute_lift_v_line: {
    nome:'Beaute Lift V Line', fabricante:'Beauty Medical (Coreia)', categoria:'fio',
    unidade:'unidade', apresentacao:'Caixa com 20–100 fios',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },

  // ── Lipolítico (Gordura Localizada) ───────────────────────────
  aqualyx: {
    nome:'Aqualyx', fabricante:'Marllor Biomedical', categoria:'lipolitico',
    unidade:'mL', apresentacao:'Ampola 8ml / 10ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  belkyra: {
    nome:'Belkyra (Kybella)', fabricante:'Allergan (AbbVie)', categoria:'lipolitico',
    unidade:'mL', apresentacao:'Frasco 2ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },

  // ── Mesoterapia (Vitaminas / Ativos) ──────────────────────────
  filorga_nctf: {
    nome:'Filorga NCTF', fabricante:'Filorga', categoria:'mesoterapia',
    unidade:'mL', apresentacao:'Ampola 3ml / 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  cytocare: {
    nome:'Cytocare', fabricante:'Revitacare', categoria:'mesoterapia',
    unidade:'mL', apresentacao:'Ampola 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  dermaheal_hsr: {
    nome:'Dermaheal HSR', fabricante:'Caregen', categoria:'mesoterapia',
    unidade:'mL', apresentacao:'Ampola 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  dermaheal_sr: {
    nome:'Dermaheal SR', fabricante:'Caregen', categoria:'mesoterapia',
    unidade:'mL', apresentacao:'Ampola 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },

  // ── PRP (Plasma Rico em Plaquetas) ────────────────────────────
  prp_regenlab: {
    nome:'Kit PRP RegenLab', fabricante:'RegenLab', categoria:'prp',
    unidade:'mL', apresentacao:'Kit tubos coleta',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  prp_emcyte: {
    nome:'Kit PRP EmCyte', fabricante:'EmCyte', categoria:'prp',
    unidade:'mL', apresentacao:'Kit tubos coleta',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },

  // ── Polinucleotídeos (DNA Regenerativo) ──────────────────────
  plinest: {
    nome:'Plinest', fabricante:'Mastelli', categoria:'polinucleotideo',
    unidade:'mL', apresentacao:'Seringa 2ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  nucleofill: {
    nome:'Nucleofill', fabricante:'Promoitalia', categoria:'polinucleotideo',
    unidade:'mL', apresentacao:'Seringa 1.5ml / 2ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },

  // ── Exossomos (Regeneração Avançada) ──────────────────────────
  asce_exosome: {
    nome:'ASCE+ Exosome', fabricante:'ExoCoBio', categoria:'exossomo',
    unidade:'mL', apresentacao:'Frasco 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  exoxe_exosomes: {
    nome:'Exoxe Exosomes', fabricante:'Exoxe', categoria:'exossomo',
    unidade:'mL', apresentacao:'Frasco 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },

  // ── Fatores de Crescimento ────────────────────────────────────
  aq_skin_solutions: {
    nome:'AQ Skin Solutions', fabricante:'AQ Skin Solutions', categoria:'fatorcrescimento',
    unidade:'mL', apresentacao:'Frasco 5ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  },
  tns_skinmedica: {
    nome:'TNS (SkinMedica)', fabricante:'Allergan (AbbVie)', categoria:'fatorcrescimento',
    unidade:'mL', apresentacao:'Frasco 1ml–3ml',
    dose_padrao:null, duracao:'', downtime:'',
    areas:[], indicacoes:[], cuidados_pre:[], cuidados_pos:[],
    contraindicacoes:[], efeitos_adv:[], observacoes:''
  }
}

// ── Estado do formulário multi-step ──────────────────────────
let _injFormStep  = 1
let _injFormData  = {}
let _injEditId    = null
let _injView      = 'grid'  // 'grid' | 'list'
let _injFilter    = { q:'', categoria:'', fabricante:'' }

// ── Utilitários ───────────────────────────────────────────────
function _uid()  { return 'inj_' + Date.now() + '_' + Math.random().toString(36).slice(2,7) }
function _fmtBRL(v) { return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }

function _getCatNome(id) { return (INJ_CATEGORIAS.find(c=>c.id===id)||getCustomCats().find(c=>c.id===id)||{nome:id}).nome }
function _getCatIcon(id) { return (INJ_CATEGORIAS.find(c=>c.id===id)||{icon:'package'}).icon }

function _getAllFabricantesForFilter() {
  const rd = getRepoData()
  const set = new Set()
  // Derivar de itens (novo formato)
  Object.values(rd).forEach(cat => { (cat.itens||[]).forEach(i => { if (i.fabricante) set.add(i.fabricante) }) })
  // Também incluir fabricantes de produtos já cadastrados
  getInj().forEach(i => { if (i.fabricante) set.add(_getFabNome(i.fabricante)) })
  return Array.from(set).sort()
}

function _getFabNome(id) {
  if (!id) return ''
  const byId = INJ_FABRICANTES.find(f=>f.id===id) || getCustomFabs().find(f=>f.id===id)
  if (byId) return byId.nome
  return id // already a full name (repo-based)
}

// ── Cálculos financeiros ──────────────────────────────────────
function calcFinanceiro(custo, prec) {
  const cfg = getPrecCfg()
  const c   = parseFloat(custo) || 0
  const p   = parseFloat(prec)  || 0
  if (!c) return { markup:0, margem:0, lucro:0, break_even:0 }
  const lucro     = p - c
  const markup    = c > 0 ? ((p - c) / c * 100) : 0
  const margem    = p > 0 ? (lucro / p * 100)    : 0
  const overhead  = c * (cfg.overhead_pct / 100)
  const imposto   = p * (cfg.imposto_pct  / 100)
  const break_even = c + overhead + imposto
  return { markup: markup.toFixed(1), margem: margem.toFixed(1), lucro: lucro.toFixed(2), break_even: break_even.toFixed(2) }
}

function _precoSugerido(custo) {
  const cfg = getPrecCfg()
  const c   = parseFloat(custo) || 0
  if (!c) return 0
  const fator = 1 + (cfg.markup_padrao / 100)
  return (c * fator).toFixed(2)
}

// ══════════════════════════════════════════════════════════════
//  RENDER — Página principal de Injetáveis
// ══════════════════════════════════════════════════════════════
async function renderInjetaveis() {
  const page = document.getElementById('page-injetaveis')
  if (!page) return

  await _loadInjetaveis()
  const items = _filteredInj()

  page.innerHTML = `
    <div class="inj-page">

      <!-- Filtros + Ações -->
      <div class="inj-header">
        <div class="inj-header-right">
          <div class="inj-view-toggle">
            <button class="inj-view-btn ${_injView==='grid'?'active':''}" onclick="injSetView('grid')" title="Blocos">
              <i data-feather="grid" style="width:14px;height:14px"></i>
            </button>
            <button class="inj-view-btn ${_injView==='list'?'active':''}" onclick="injSetView('list')" title="Lista">
              <i data-feather="list" style="width:14px;height:14px"></i>
            </button>
          </div>
          <div class="inj-search-wrap">
            <i data-feather="search" style="width:14px;height:14px;color:#9CA3AF;flex-shrink:0"></i>
            <input class="inj-search" type="text" placeholder="Buscar por nome ou marca..."
              value="${_injFilter.q}"
              oninput="injSetFilter('q',this.value)">
          </div>
          <select class="inj-select" onchange="injSetFilter('categoria',this.value)">
            <option value="">Todas categorias</option>
            ${INJ_CATEGORIAS.map(c=>`<option value="${c.id}" ${_injFilter.categoria===c.id?'selected':''}>${c.nome}</option>`).join('')}
          </select>
          <select class="inj-select" onchange="injSetFilter('fabricante',this.value)">
            <option value="">Todos fabricantes</option>
            ${_getAllFabricantesForFilter().map(f=>`<option value="${f}" ${_injFilter.fabricante===f?'selected':''}>${f}</option>`).join('')}
          </select>
          <div class="inj-header-sep"></div>
          <button class="inj-btn-secondary inj-btn-sm" onclick="openInjRepositorio()" title="Repositório">
            <i data-feather="database" style="width:13px;height:13px"></i> Repositório
          </button>
          <button class="inj-btn-primary inj-btn-sm" onclick="openInjTemplateModal()" title="Templates / Novo produto">
            <i data-feather="zap" style="width:13px;height:13px"></i> Templates
          </button>
        </div>
      </div>

      <!-- Conteúdo agrupado por categoria -->
      ${items.length === 0 ? _injEmpty() : (_injView === 'grid' ? _injGrid(items) : _injList(items))}

    </div>
  `
  featherIn(page)
}

function _statCard(label, count, icon, color) {
  return `
    <div class="inj-stat-card" style="border-top:3px solid ${color}">
      <div class="inj-stat-icon" style="background:${color}20;color:${color}">
        <i data-feather="${icon}" style="width:18px;height:18px"></i>
      </div>
      <div>
        <div class="inj-stat-num" style="color:${color}">${count}</div>
        <div class="inj-stat-label">${label}</div>
      </div>
    </div>
  `
}

function _statsCategoria() {
  const out = {}
  getInj().forEach(i => { out[i.categoria] = (out[i.categoria]||0) + 1 })
  return out
}

function _filteredInj() {
  const { q, categoria, fabricante } = _injFilter
  return getInj().filter(i => {
    if (q) {
      const ql = q.toLowerCase()
      const fabName = _getFabNome(i.fabricante).toLowerCase()
      const catName = _getCatNome(i.categoria).toLowerCase()
      if (!i.nome.toLowerCase().includes(ql) && !fabName.includes(ql) && !catName.includes(ql)) return false
    }
    if (categoria && i.categoria !== categoria) return false
    if (fabricante && _getFabNome(i.fabricante) !== fabricante) return false
    return true
  })
}

function _injEmpty() {
  return `
    <div class="inj-empty">
      <i data-feather="package" style="width:48px;height:48px;color:#D1D5DB"></i>
      <h3>Nenhum injetável cadastrado</h3>
      <p>Adicione produtos com o botão "Novo Injetável" ou use os Templates Rápidos.</p>
      <button class="inj-btn-primary" onclick="openInjTemplateModal()">
        <i data-feather="zap" style="width:14px;height:14px"></i> Começar com Templates
      </button>
    </div>
  `
}

// Agrupa itens na ordem de INJ_CATEGORIAS
function _groupByCategory(items) {
  const grupos = {}
  items.forEach(i => {
    const k = i.categoria || '__outro__'
    if (!grupos[k]) grupos[k] = []
    grupos[k].push(i)
  })
  const ordered = []
  ;[...INJ_CATEGORIAS, ...getCustomCats()].forEach(cat => {
    if (grupos[cat.id]?.length) ordered.push({ cat, items: grupos[cat.id] })
  })
  if (grupos.__outro__?.length) {
    ordered.push({ cat:{ id:'__outro__', nome:'Outros', icon:'package' }, items: grupos.__outro__ })
  }
  return ordered
}

function _injGrid(items) {
  return _groupByCategory(items).map(({ cat, items: catItems }) => {
    const color = _catColor(cat.id)
    const icon  = _getCatIcon(cat.id)
    return `
      <div style="margin-bottom:28px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${color}22">
          <div style="width:28px;height:28px;border-radius:7px;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-feather="${icon}" style="width:13px;height:13px"></i>
          </div>
          <span style="font-size:13px;font-weight:700;color:#374151">${cat.nome}</span>
          <span style="background:${color}15;color:${color};font-size:11px;font-weight:700;padding:1px 8px;border-radius:20px">${catItems.length}</span>
        </div>
        <div class="inj-grid">${catItems.map(i => _injCard(i)).join('')}</div>
      </div>`
  }).join('')
}

function _margemColor(pct) {
  const v = parseFloat(pct)
  if (v >= 65) return '#059669'
  if (v >= 50) return '#10B981'
  if (v >= 35) return '#D97706'
  if (v >= 20) return '#EA580C'
  return '#DC2626'
}

function _injCard(i) {
  const catColor = _catColor(i.categoria)
  const fin = i.preco_venda && i.custo_unit ? calcFinanceiro(i.custo_unit, i.preco_venda) : null
  const mc  = fin ? _margemColor(fin.margem) : null
  const pct = fin ? Math.min(parseFloat(fin.margem), 100) : 0
  return `
    <div class="inj-card" onclick="openInjDetail('${i.id}')">
      <div style="height:3px;background:${catColor};border-radius:12px 12px 0 0"></div>
      <div class="inj-card-header">
        <div class="inj-card-icon" style="background:${catColor}18;color:${catColor}">
          <i data-feather="${_getCatIcon(i.categoria)}" style="width:18px;height:18px"></i>
        </div>
        <div class="inj-card-info">
          <div class="inj-card-nome">${i.nome}</div>
          <div class="inj-card-fab">${_getFabNome(i.fabricante)}</div>
        </div>
      </div>

      <div class="inj-card-body">
        <div class="inj-card-cat-badge" style="background:${catColor}15;color:${catColor}">${_getCatNome(i.categoria)}</div>

        ${fin ? `
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:7px">
          <div style="padding:7px 9px;background:#F9FAFB;border-radius:7px;border:1px solid #F3F4F6">
            <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Custo</div>
            <div style="font-size:13px;font-weight:700;color:#6B7280">${_fmtBRL(i.custo_unit)}</div>
          </div>
          <div style="padding:7px 9px;background:#EFF6FF;border-radius:7px;border:1px solid #DBEAFE">
            <div style="font-size:9px;font-weight:700;color:#93C5FD;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Venda</div>
            <div style="font-size:13px;font-weight:700;color:#2563EB">${_fmtBRL(i.preco_venda)}</div>
          </div>
        </div>
        <div style="margin-top:7px;padding:8px 10px;background:#F9FAFB;border-radius:7px;border:1px solid #F3F4F6">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.04em">Margem</div>
            <div style="font-size:14px;font-weight:800;color:${mc}">${fin.margem}%</div>
          </div>
          <div style="height:5px;background:#E5E7EB;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${mc};border-radius:3px;transition:width .3s"></div>
          </div>
        </div>
        ` : `
        <div style="margin-top:10px;padding:10px;background:#F9FAFB;border-radius:7px;border:1px dashed #E5E7EB;text-align:center">
          <i data-feather="dollar-sign" style="width:16px;height:16px;color:#D1D5DB;display:block;margin:0 auto 4px"></i>
          <div style="font-size:11px;color:#D1D5DB">Sem precificação</div>
        </div>
        `}
      </div>

      <div class="inj-card-actions" onclick="event.stopPropagation()">
        <button class="inj-card-btn" onclick="openInjDetailFin('${i.id}')" title="Ver financeiro"
          style="width:26px;height:26px;border-radius:50%;background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0">
          <i data-feather="bar-chart-2" style="width:13px;height:13px"></i>
        </button>
        <button class="inj-card-btn" onclick="openInjForm('${i.id}')" title="Editar">
          <i data-feather="edit-2" style="width:13px;height:13px"></i>
        </button>
        <button class="inj-card-btn" onclick="printInj('${i.id}')" title="Imprimir" style="color:#2563EB">
          <i data-feather="printer" style="width:13px;height:13px"></i>
        </button>
        <button class="inj-card-btn danger" onclick="deleteInj('${i.id}')" title="Excluir">
          <i data-feather="trash-2" style="width:13px;height:13px"></i>
        </button>
      </div>
    </div>
  `
}

function _injList(items) {
  return _groupByCategory(items).map(({ cat, items: catItems }) => {
    const color = _catColor(cat.id)
    const icon  = _getCatIcon(cat.id)
    const rows  = catItems.map(i => {
      const fin = i.preco_venda && i.custo_unit ? calcFinanceiro(i.custo_unit, i.preco_venda) : null
      return `
        <tr onclick="openInjDetail('${i.id}')" style="cursor:pointer">
          <td><strong>${i.nome}</strong></td>
          <td>${_getFabNome(i.fabricante)}</td>
          <td>${i.duracao||'—'}</td>
          <td>${i.custo_unit ? _fmtBRL(i.custo_unit) : '—'}</td>
          <td>${i.preco_venda ? _fmtBRL(i.preco_venda) : '—'}</td>
          <td>${fin ? `<span class="${parseFloat(fin.margem)>=55?'inj-ok':'inj-low'}">${fin.margem}%</span>` : '—'}</td>
          <td onclick="event.stopPropagation()">
            <div style="display:flex;align-items:center;gap:4px">
              <button class="inj-card-btn" onclick="openInjDetailFin('${i.id}')" title="Ver financeiro"
                style="width:24px;height:24px;border-radius:50%;background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0">
                <i data-feather="bar-chart-2" style="width:11px;height:11px"></i>
              </button>
              <button class="inj-card-btn" onclick="openInjForm('${i.id}')" title="Editar"><i data-feather="edit-2" style="width:12px;height:12px"></i></button>
              <button class="inj-card-btn" onclick="printInj('${i.id}')" title="Imprimir" style="color:#2563EB"><i data-feather="printer" style="width:12px;height:12px"></i></button>
              <button class="inj-card-btn danger" onclick="deleteInj('${i.id}')" title="Excluir"><i data-feather="trash-2" style="width:12px;height:12px"></i></button>
            </div>
          </td>
        </tr>`
    }).join('')

    return `
      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid ${color}22">
          <div style="width:26px;height:26px;border-radius:6px;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-feather="${icon}" style="width:12px;height:12px"></i>
          </div>
          <span style="font-size:13px;font-weight:700;color:#374151">${cat.nome}</span>
          <span style="background:${color}15;color:${color};font-size:11px;font-weight:700;padding:1px 8px;border-radius:20px">${catItems.length}</span>
        </div>
        <div class="inj-list-table">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Fabricante</th>
                <th>Duração</th>
                <th>Custo</th>
                <th>Preço Venda</th>
                <th>Margem</th>
                <th style="width:120px">Ações</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`
  }).join('')
}

function _catColor(cat) {
  const colors = { neuro:'#7C3AED', ha:'#2563EB', biorev:'#059669', biopoten:'#D97706', enzima:'#DC2626', fio:'#0891B2', outro:'#6B7280' }
  return colors[cat] || '#6B7280'
}

// ══════════════════════════════════════════════════════════════
//  MODAL DE DETALHE
// ══════════════════════════════════════════════════════════════
function openInjDetail(id) {
  const inj = getInj().find(i => i.id === id)
  if (!inj) return

  const fin = inj.preco_venda && inj.custo_unit ? calcFinanceiro(inj.custo_unit, inj.preco_venda) : null
  const catColor = _catColor(inj.categoria)

  const el = document.createElement('div')
  el.id = 'injDetailModal'
  el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px'
  el.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:780px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <!-- Header -->
      <div style="padding:24px 28px 20px;border-bottom:1px solid #F3F4F6;display:flex;align-items:flex-start;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:48px;height:48px;border-radius:12px;background:${catColor}20;color:${catColor};display:flex;align-items:center;justify-content:center">
            <i data-feather="${_getCatIcon(inj.categoria)}" style="width:24px;height:24px"></i>
          </div>
          <div>
            <h2 style="margin:0;font-size:20px;font-weight:700;color:#111827">${inj.nome}</h2>
            <p style="margin:4px 0 0;font-size:13px;color:#6B7280">${_getFabNome(inj.fabricante)} · <span style="color:${catColor}">${_getCatNome(inj.categoria)}</span></p>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button onclick="printInj('${id}')"
            style="padding:7px 14px;background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px">
            <i data-feather="printer" style="width:13px;height:13px"></i> Imprimir
          </button>
          <button onclick="document.getElementById('injDetailModal').remove();openInjForm('${id}')"
            style="padding:7px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px">
            <i data-feather="edit-2" style="width:13px;height:13px"></i> Editar
          </button>
          <button onclick="document.getElementById('injDetailModal').remove()"
            style="width:32px;height:32px;border:none;background:#F9FAFB;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center">
            <i data-feather="x" style="width:16px;height:16px;color:#6B7280"></i>
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:0;border-bottom:1px solid #F3F4F6;padding:0 28px">
        <button id="injDtab-cli" onclick="injDetailTab('cli')"
          style="padding:12px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#7C3AED;border-bottom:2px solid #7C3AED">
          Clínico
        </button>
        <button id="injDtab-fin" onclick="injDetailTab('fin')"
          style="padding:12px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:500;color:#6B7280;border-bottom:2px solid transparent">
          Financeiro
        </button>
      </div>

      <!-- Aba Clínico -->
      <div id="injDpanel-cli" style="padding:24px 28px">
        ${(()=>{
          const proto = _getProductProtocol(inj)
          const areas       = inj.areas?.length       ? inj.areas       : []
          const indicacoes  = proto.indicacoes
          const cpre        = proto.cuidados_pre
          const cpos        = proto.cuidados_pos
          const contras     = proto.contraindicacoes
          const efeitos     = proto.efeitos_adv

          // ── Dados gerais ─────────────────────────────
          const camposHtml = `
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #F3F4F6">
              ${_detailField('Apresentação', inj.apresentacao||'—')}
              ${_detailField('Unidade', inj.unidade||'—')}
              ${_detailField('Dose padrão', inj.dose_padrao ? inj.dose_padrao+' '+(inj.unidade||'') : '—')}
              ${_detailField('Duração', inj.duracao||'—')}
              ${_detailField('Downtime', inj.downtime||'—')}
              ${_detailField('Lote', inj.lote||'—')}
              ${_detailField('Validade', inj.validade||'—')}
              ${_detailField('Estoque', inj.estoque!=null ? inj.estoque+' '+(inj.unidade||'un.') : '—')}
            </div>`

          // ── Áreas (chips compactos) ──────────────────
          const areasHtml = areas.length ? `
            <div style="margin-bottom:20px">
              <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Áreas de Aplicação</div>
              <div style="display:flex;flex-wrap:wrap;gap:5px">
                ${areas.map(v=>`<span style="padding:3px 10px;background:#F3F4F6;border-radius:20px;font-size:11.5px;color:#374151">${v}</span>`).join('')}
              </div>
            </div>` : ''

          // ── Indicações (numeradas, verde) ────────────
          const indHtml = _detailListNum('Indicações Clínicas', indicacoes, '#059669', 'check-circle')

          // ── Cuidados pré/pós — 2 colunas ────────────
          const cuidadosHtml = (cpre.length || cpos.length) ? `
            <div style="margin-bottom:20px;padding:16px;background:#FAFAFA;border-radius:12px">
              <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px">Protocolo do Procedimento</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                <div>
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
                    <div style="width:6px;height:6px;border-radius:50%;background:#D97706;flex-shrink:0"></div>
                    <span style="font-size:11px;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:.5px">Pré-procedimento</span>
                  </div>
                  <ol style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px">
                    ${cpre.map((v,i)=>`
                      <li style="display:flex;align-items:flex-start;gap:8px">
                        <span style="flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#FEF3C7;color:#D97706;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px">${i+1}</span>
                        <span style="font-size:12.5px;color:#374151;line-height:1.5">${v}</span>
                      </li>`).join('')}
                  </ol>
                </div>
                <div>
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
                    <div style="width:6px;height:6px;border-radius:50%;background:#2563EB;flex-shrink:0"></div>
                    <span style="font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:.5px">Pós-procedimento</span>
                  </div>
                  <ol style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px">
                    ${cpos.map((v,i)=>`
                      <li style="display:flex;align-items:flex-start;gap:8px">
                        <span style="flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#EFF6FF;color:#2563EB;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px">${i+1}</span>
                        <span style="font-size:12.5px;color:#374151;line-height:1.5">${v}</span>
                      </li>`).join('')}
                  </ol>
                </div>
              </div>
            </div>` : ''

          // ── Contraindicações (numeradas, vermelho) ───
          const contraHtml = _detailListNum('Contraindicações', contras, '#DC2626', 'alert-triangle')

          // ── Efeitos adversos (numerados, âmbar) ─────
          const efeitosHtml = _detailListNum('Efeitos Adversos', efeitos, '#92400E', 'alert-circle')

          // ── Observações ──────────────────────────────
          const obsHtml = inj.observacoes ? `
            <div style="margin-top:4px;padding:12px 14px;background:#F9FAFB;border-radius:10px;border-left:3px solid ${catColor}">
              <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Observações</div>
              <div style="font-size:13px;color:#374151;line-height:1.6">${inj.observacoes}</div>
            </div>` : ''

          return camposHtml + areasHtml + indHtml + cuidadosHtml + contraHtml + efeitosHtml + obsHtml
        })()}
      </div>

      <!-- Aba Financeiro -->
      <div id="injDpanel-fin" style="display:none;padding:24px 28px">
        ${fin ? `
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
            ${_finCard('Custo Unitário', _fmtBRL(inj.custo_unit), '#6B7280', 'Valor pago pela clínica ao fornecedor (nota fiscal). Base de todos os cálculos.')}
            ${_finCard('Preço de Venda', _fmtBRL(inj.preco_venda), '#2563EB', 'Valor cobrado do paciente pelo procedimento completo.')}
            ${_finCard('Lucro por Unidade', _fmtBRL(fin.lucro), parseFloat(fin.lucro)>0?'#059669':'#DC2626', 'Receita líquida por aplicação = Preço de venda − Custo. Ainda antes de overhead e impostos.')}
            ${_finCard('Markup', fin.markup+'%', '#7C3AED', 'Quanto o preço de venda está acima do custo. Fórmula: (Venda − Custo) ÷ Custo × 100.')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
            <div style="padding:16px;background:#F9FAFB;border-radius:10px">
              <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Margem de Contribuição</div>
              <div style="font-size:11px;color:#9CA3AF;margin-bottom:8px">Quanto do preço de venda representa lucro real. Fórmula: (Venda − Custo) ÷ Venda × 100.</div>
              <div style="font-size:28px;font-weight:800;color:${parseFloat(fin.margem)>=55?'#059669':'#DC2626'}">${fin.margem}%</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:4px">Meta mínima: ${getPrecCfg().meta_margem_min}%</div>
              <div style="margin-top:10px;height:6px;background:#E5E7EB;border-radius:4px">
                <div style="height:100%;background:${parseFloat(fin.margem)>=55?'#059669':'#DC2626'};border-radius:4px;width:${Math.min(parseFloat(fin.margem),100)}%;transition:width .4s"></div>
              </div>
            </div>
            <div style="padding:16px;background:#F9FAFB;border-radius:10px">
              <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Ponto de Break-Even</div>
              <div style="font-size:11px;color:#9CA3AF;margin-bottom:8px">Preço mínimo para não ter prejuízo. Inclui: custo + overhead (${getPrecCfg().overhead_pct}% — aluguel, salários, energia) + impostos (${getPrecCfg().imposto_pct}%).</div>
              <div style="font-size:28px;font-weight:800;color:#374151">${_fmtBRL(fin.break_even)}</div>
              <div style="font-size:12px;color:${parseFloat(inj.preco_venda)>=parseFloat(fin.break_even)?'#059669':'#DC2626'};margin-top:6px;font-weight:600">
                ${parseFloat(inj.preco_venda) >= parseFloat(fin.break_even) ? 'Acima do break-even — operação viável' : 'Abaixo do break-even — prejuízo operacional'}
              </div>
            </div>
          </div>
          ${inj.preco_promo ? (() => {
            const finPromo = calcFinanceiro(inj.custo_unit, inj.preco_promo)
            const ok = parseFloat(finPromo.margem) >= getPrecCfg().meta_margem_min
            return `<div style="padding:14px;background:#FFFBEB;border-radius:10px;border:1px solid #FDE68A;margin-bottom:20px">
              <div style="font-size:11px;font-weight:700;color:#92400E;text-transform:uppercase;margin-bottom:10px">Preço Promocional — Impacto no resultado</div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                <div style="text-align:center"><div style="font-size:10px;color:#9CA3AF">Preço Promo</div><div style="font-size:16px;font-weight:700;color:#D97706">${_fmtBRL(inj.preco_promo)}</div></div>
                <div style="text-align:center"><div style="font-size:10px;color:#9CA3AF">Desconto s/ venda</div><div style="font-size:16px;font-weight:700;color:#D97706">${inj.promo_pct||'—'}%</div></div>
                <div style="text-align:center"><div style="font-size:10px;color:#9CA3AF">Markup promo</div><div style="font-size:16px;font-weight:700;color:#374151">${finPromo.markup}%</div></div>
                <div style="text-align:center"><div style="font-size:10px;color:#9CA3AF">Margem promo</div><div style="font-size:16px;font-weight:700;color:${ok?'#059669':'#DC2626'}">${finPromo.margem}%</div></div>
              </div>
            </div>`
          })() : ''}
          ${Array.isArray(inj.historico_custos) && inj.historico_custos.length > 0 ? `
            <div style="padding:14px;background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB">
              <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:10px">Histórico de Preços de Custo</div>
              ${[...inj.historico_custos].sort((a,b)=>new Date(a.data)-new Date(b.data)).map((h,i,arr) => {
                const prev = i > 0 ? arr[i-1].custo : null
                const diff = prev ? h.custo - prev : null
                const isLast = i === arr.length - 1
                return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:${isLast?'none':'1px solid #F3F4F6'}">
                  <span style="font-size:11px;color:#9CA3AF;min-width:90px">${new Date(h.data+'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  <span style="font-size:13px;font-weight:${isLast?700:400};color:${isLast?'#111827':'#6B7280'}">R$${parseFloat(h.custo).toFixed(2)}</span>
                  ${diff !== null ? `<span style="font-size:11px;color:${diff>0?'#DC2626':'#059669'}">${diff>0?'▲ alta de':'▼ queda de'} R$${Math.abs(diff).toFixed(2)}</span>` : ''}
                  ${isLast ? '<span style="font-size:10px;background:#EFF6FF;color:#2563EB;padding:2px 7px;border-radius:10px">custo atual</span>' : ''}
                </div>`
              }).join('')}
            </div>
          ` : ''}
        ` : `
          <div style="text-align:center;padding:40px;color:#9CA3AF">
            <i data-feather="dollar-sign" style="width:40px;height:40px;margin-bottom:12px"></i>
            <p>Adicione custo e preço de venda para ver análise financeira.</p>
            <button onclick="document.getElementById('injDetailModal').remove();openInjForm('${id}')"
              style="margin-top:12px;padding:8px 20px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px">
              Editar produto
            </button>
          </div>
        `}
      </div>
    </div>
  `
  document.body.appendChild(el)
  el.addEventListener('click', e => { if (e.target === el) el.remove() })
  featherIn(el)
}

function injDetailTab(tab) {
  document.getElementById('injDpanel-cli').style.display = tab === 'cli' ? '' : 'none'
  document.getElementById('injDpanel-fin').style.display = tab === 'fin' ? '' : 'none'
  document.getElementById('injDtab-cli').style.cssText = tab === 'cli'
    ? 'padding:12px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#7C3AED;border-bottom:2px solid #7C3AED'
    : 'padding:12px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:500;color:#6B7280;border-bottom:2px solid transparent'
  document.getElementById('injDtab-fin').style.cssText = tab === 'fin'
    ? 'padding:12px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#7C3AED;border-bottom:2px solid #7C3AED'
    : 'padding:12px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:500;color:#6B7280;border-bottom:2px solid transparent'
}

function openInjDetailFin(id) {
  openInjDetail(id)
  // Aguarda o modal ser inserido no DOM antes de mudar a aba
  requestAnimationFrame(() => injDetailTab('fin'))
}

function _detailField(label, val) {
  return `
    <div>
      <div style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">${label}</div>
      <div style="font-size:14px;color:#374151;font-weight:500">${val}</div>
    </div>
  `
}

function _detailList(label, arr) {
  if (!arr || !arr.length) return ''
  return `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;margin-bottom:8px">${label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${arr.map(v => `<span style="padding:3px 10px;background:#F3F4F6;border-radius:20px;font-size:12px;color:#374151">${v}</span>`).join('')}
      </div>
    </div>
  `
}

// Lista numerada para o modal de detalhe
function _detailListNum(label, arr, accent, icon) {
  if (!arr || !arr.length) return ''
  return `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #F3F4F6">
        <i data-feather="${icon}" style="width:13px;height:13px;color:${accent};flex-shrink:0"></i>
        <span style="font-size:10px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:.6px">${label}</span>
        <span style="margin-left:auto;font-size:10px;color:#9CA3AF">${arr.length} item${arr.length>1?'s':''}</span>
      </div>
      <ol style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px">
        ${arr.map((v,i) => `
          <li style="display:flex;align-items:flex-start;gap:10px">
            <span style="flex-shrink:0;min-width:20px;height:20px;border-radius:50%;background:${accent}18;color:${accent};font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px">${i+1}</span>
            <span style="font-size:13px;color:#374151;line-height:1.5">${v}</span>
          </li>`).join('')}
      </ol>
    </div>
  `
}

function _finCard(label, val, color, desc) {
  return `
    <div style="padding:16px;background:#F9FAFB;border-radius:10px;border-top:3px solid ${color}">
      <div style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;margin-bottom:6px">${label}</div>
      <div style="font-size:22px;font-weight:800;color:${color}">${val}</div>
      ${desc ? `<div style="font-size:11px;color:#9CA3AF;margin-top:5px;line-height:1.4">${desc}</div>` : ''}
    </div>
  `
}

// ══════════════════════════════════════════════════════════════
//  FORMULÁRIO MULTI-STEP
// ══════════════════════════════════════════════════════════════
function openInjForm(id) {
  _injEditId = id || null
  _injFormStep = 1
  _injFormData = {}

  if (id) {
    const existing = getInj().find(i => i.id === id)
    if (existing) _injFormData = Object.assign({}, existing)
  }

  _renderInjForm()
}

function _renderInjForm() {
  document.getElementById('injDetailModal')?.remove()
  let el = document.getElementById('injFormModal')
  if (!el) {
    el = document.createElement('div')
    el.id = 'injFormModal'
    el.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px'
    document.body.appendChild(el)
  }

  const steps = ['Identificação', 'Clínico', 'Áreas & Indicações', 'Protocolos', 'Financeiro', 'Estoque']
  const isEdit     = !!_injEditId
  const isDecision = _injFormStep === 7

  const headerTitle = isDecision
    ? `<h3 style="margin:0;font-size:17px;font-weight:700;color:#059669">✓ Template salvo!</h3>`
    : `<h3 style="margin:0;font-size:17px;font-weight:700;color:#111827">${isEdit ? 'Editar Injetável' : 'Novo Template'}</h3>
       ${_injFormStep > 1 && _injFormData.nome ? `<div style="font-size:12px;color:#7C3AED;font-weight:600;margin-top:3px;display:flex;align-items:center;gap:5px"><i data-feather="package" style="width:12px;height:12px"></i> ${_injFormData.nome}</div>` : ''}`

  const stepIcons = ['tag', 'activity', 'map-pin', 'clipboard', 'bar-chart-2', 'package']
  const stepsBar = isDecision ? '' : `
    <div style="display:flex;gap:4px;margin-top:14px">
      ${steps.map((s,i) => {
        const done    = i+1 < _injFormStep
        const active  = i+1 === _injFormStep
        const barColor = done ? '#7C3AED' : active ? '#A78BFA' : '#E5E7EB'
        const textColor = active ? '#7C3AED' : done ? '#7C3AED' : '#9CA3AF'
        const weight  = active ? '700' : done ? '600' : '400'
        if (isEdit) {
          return `
            <button type="button" onclick="injFormGoStep(${i+1})"
              style="flex:1;background:none;border:none;cursor:pointer;padding:0;text-align:center;border-radius:6px;transition:background .15s"
              onmouseenter="this.style.background='#F5F3FF'" onmouseleave="this.style.background='none'"
              title="Ir para ${s}">
              <div style="height:4px;border-radius:2px;background:${barColor};margin-bottom:5px"></div>
              <div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;padding-bottom:4px">
                <div style="width:22px;height:22px;border-radius:50%;background:${active?'#7C3AED':done?'#EDE9FE':'#F3F4F6'};color:${active?'#fff':done?'#7C3AED':'#9CA3AF'};display:flex;align-items:center;justify-content:center">
                  <i data-feather="${stepIcons[i]}" style="width:11px;height:11px"></i>
                </div>
                <div style="font-size:10px;font-weight:${weight};color:${textColor}">${s}</div>
              </div>
            </button>`
        }
        return `
          <div style="flex:1;text-align:center">
            <div style="height:4px;border-radius:2px;background:${barColor};margin-bottom:4px"></div>
            <div style="font-size:10px;font-weight:${weight};color:${textColor}">${s}</div>
          </div>`
      }).join('')}
    </div>`

  const footer = isDecision ? '' : `
    <div style="padding:16px 24px;border-top:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center;gap:8px">
      <button onclick="injFormPrev()" style="padding:9px 18px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;color:#374151;${_injFormStep===1?'visibility:hidden':''}"
        >← Anterior</button>
      <span style="font-size:12px;color:#9CA3AF;flex:1;text-align:center">${_injFormStep} de ${steps.length}</span>
      <div style="display:flex;gap:8px;align-items:center">
        ${isEdit ? `<button onclick="saveInjForm()" style="padding:9px 18px;background:#059669;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px"><i data-feather="save" style="width:13px;height:13px"></i> Salvar Alterações</button>` : ''}
        ${_injFormStep < steps.length
          ? `<button onclick="injFormNext()" style="padding:9px 20px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600">Próximo →</button>`
          : !isEdit ? `<button onclick="saveInjForm()" style="padding:9px 20px;background:#059669;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600">Concluir</button>` : ''
        }
      </div>
    </div>`

  el.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <!-- Header do form -->
      <div style="padding:20px 24px ${isDecision?'20px':'16px'};border-bottom:1px solid #F3F4F6">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>${headerTitle}</div>
          <button onclick="closeInjForm()" style="width:30px;height:30px;border:none;background:#F9FAFB;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center">
            <i data-feather="x" style="width:15px;height:15px;color:#6B7280"></i>
          </button>
        </div>
        ${stepsBar}
      </div>

      <!-- Conteúdo do step -->
      <div style="flex:1;overflow-y:auto;padding:24px">
        <div id="injFormStepContent"></div>
      </div>

      ${footer}
    </div>
  `

  _renderInjStep()
  featherIn(el)
  el.addEventListener('click', e => { if (e.target === el) closeInjForm() })
}

function _renderInjStep() {
  const c = document.getElementById('injFormStepContent')
  if (!c) return

  switch (_injFormStep) {
    case 1: c.innerHTML = _stepIdent();     break
    case 2: c.innerHTML = _stepClinico();   break
    case 3: c.innerHTML = _stepAreas();     break
    case 4: c.innerHTML = _stepProtocolo(); break
    case 5: c.innerHTML = _stepFinanceiro();break
    case 6: c.innerHTML = _stepEstoque();   break
    case 7: c.innerHTML = _stepDecision();  break
  }
  featherIn(c)
}

// Step 1 — Identificação
function _stepIdent() {
  const d = _injFormData
  const allCats = [...INJ_CATEGORIAS, ...getCustomCats()]

  // Repo data para a categoria já selecionada (se houver)
  const repoNomes = d.categoria ? _repoCatNomes(d.categoria) : []
  const repoFabs  = d.categoria ? _repoCatFabs(d.categoria)  : []
  const repoUnits = d.categoria ? _repoCatUnidades(d.categoria) : []
  const repoApres = d.categoria ? _repoCatApres(d.categoria)    : []
  const unitSugest = repoUnits.length ? repoUnits : INJ_UNIDADES
  const apresSugest = repoApres.length ? repoApres : INJ_APRESENTACOES

  // Auto-preencher do repo ao editar (repo é fonte de verdade)
  if (d.nome && d.categoria && d.categoria !== '__novo__') {
    const match = _repoFindItem(d.categoria, d.nome)
    if (match) {
      if (match.fabricante)   d.fabricante   = match.fabricante
      if (match.unidade)      d.unidade      = match.unidade
      if (match.apresentacao) d.apresentacao = match.apresentacao
    }
  }

  const existingNames = getInj().filter(i => i.id !== _injEditId).map(i => i.nome)
  const allNomeSugest = [...new Set([...repoNomes, ...existingNames])]

  // Fabricante: sugestões da categoria no repo + fallback geral
  const allFabSugest = repoFabs.length ? repoFabs : [...new Set([
    ...INJ_FABRICANTES.map(f=>f.nome),
    ...Object.values(BRAND_TEMPLATES).map(t=>t.fabricante),
    ...Object.values(getCustomTpls()).map(t=>t.fabricante).filter(Boolean),
    ...getInj().map(i=>i.fabricante).filter(Boolean)
  ])].sort()

  // Estado do aviso de repo (calculado no render, reage a mudanças via injNomeChange)
  const repoMatch = d.nome && d.categoria && d.categoria !== '__novo__' ? _repoFindItem(d.categoria, d.nome) : null
  const showWarning = d.nome && d.nome.trim().length > 2 && d.categoria && d.categoria !== '__novo__' && !repoMatch

  return `
    ${_fGroup('Nome do produto *', `
      <input id="if_nome" class="inj-input" type="text" list="if_nome_list" placeholder="Ex: Botox 100U" value="${d.nome||''}" oninput="injNomeChange(this.value)" required>
      <datalist id="if_nome_list">${allNomeSugest.map(n=>`<option value="${n}">`).join('')}</datalist>
    `)}

    <div id="if_repo_warning" style="display:${showWarning?'flex':'none'};background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:10px 12px;margin-bottom:12px;align-items:center;gap:8px">
      <i data-feather="alert-triangle" style="width:15px;height:15px;color:#F97316;flex-shrink:0"></i>
      <span style="flex:1;font-size:12px;color:#92400E;line-height:1.4">Produto não encontrado no repositório. Adicione-o lá para garantir dados consistentes.</span>
      <button type="button" onclick="injOpenRepoForCat()" style="padding:5px 10px;background:#F97316;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">Abrir Repositório</button>
    </div>
    <div id="if_repo_ok" style="display:${repoMatch?'flex':'none'};align-items:center;gap:6px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#166534">
      <i data-feather="check-circle" style="width:14px;height:14px;color:#16A34A;flex-shrink:0"></i>
      <span>Produto encontrado no repositório — dados preenchidos automaticamente</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">
      <div class="inj-form-group">
        <label class="inj-form-label">Categoria *</label>
        <select id="if_cat" class="inj-input" onchange="injCatChange(this.value)">
          <option value="">Selecionar...</option>
          ${allCats.map(c=>`<option value="${c.id}" ${d.categoria===c.id?'selected':''}>${c.nome}</option>`).join('')}
          <option value="__novo__" style="color:#7C3AED;font-weight:600">+ Adicionar categoria</option>
        </select>
        <div id="cat_novo_wrap" style="display:none;margin-top:8px">
          <input id="cat_novo_val" class="inj-input" type="text" placeholder="Nome da nova categoria" style="font-size:12px;margin-bottom:6px">
          <div style="display:flex;gap:6px">
            <button type="button" onclick="injSaveNewCat()" style="flex:1;padding:6px 10px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Salvar</button>
            <button type="button" onclick="injCancelNewCat()" style="padding:6px 10px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>
          </div>
        </div>
      </div>
      <div class="inj-form-group">
        <label class="inj-form-label">Fabricante *</label>
        <input id="if_fab" class="inj-input" type="text" list="if_fab_list"
          placeholder="Ex: Allergan, Galderma..." value="${d.fabricante||''}"
          oninput="_injFormData.fabricante=this.value">
        <datalist id="if_fab_list">${allFabSugest.map(f=>`<option value="${f}">`).join('')}</datalist>
      </div>
    </div>

    ${_fRow([
      _fGroup('Unidade', `
        <input id="if_unidade" class="inj-input" type="text" list="if_unidade_list" placeholder="Ex: mL, U, vial..." value="${d.unidade||unitSugest[0]||''}">
        <datalist id="if_unidade_list">${unitSugest.map(u=>`<option value="${u}">`).join('')}</datalist>
      `),
      _fGroup('Apresentação', `
        <input id="if_apres" class="inj-input" type="text" list="if_apres_list" placeholder="Ex: Pó liofilizado, Gel..." value="${d.apresentacao||apresSugest[0]||''}">
        <datalist id="if_apres_list">${apresSugest.map(a=>`<option value="${a}">`).join('')}</datalist>
      `)
    ])}
    ${_fGroup('Observações gerais', `<textarea id="if_obs" class="inj-input" rows="3" placeholder="Informações sobre reconstituição, armazenamento, temperatura, etc.">${d.observacoes||''}</textarea>`)}
  `
}

function injCatChange(val) {
  const wrap = document.getElementById('cat_novo_wrap')
  if (!wrap) return
  if (val === '__novo__') {
    wrap.style.display = 'block'
    document.getElementById('if_cat').value = ''
  } else {
    wrap.style.display = 'none'
    if (val) _injPopulateFromCat(val)
  }
}

function _injPopulateFromCat(catId, filtroFab) {
  const itens = _repoCatData(catId).itens || []

  // Filtra por fabricante se especificado
  const itensVisiveis = filtroFab ? itens.filter(i => i.fabricante === filtroFab) : itens

  // Nome: datalist dos itens filtrados + produtos já cadastrados desta categoria
  const dl = document.getElementById('if_nome_list')
  if (dl) {
    const repoNomes = [...new Set(itensVisiveis.map(i => i.nome))]
    const existing  = getInj().filter(i => i.id !== _injEditId && i.categoria === catId).map(i => i.nome)
    const all = [...new Set([...repoNomes, ...existing])]
    dl.innerHTML = all.map(n => `<option value="${n}">`).join('')
  }

  // Fabricante: atualiza datalist do input[text] (não innerHTML do input em si)
  const fabDl = document.getElementById('if_fab_list')
  if (fabDl) {
    const fabs = [...new Set(itens.map(i => i.fabricante).filter(Boolean))]
    const allFabs = fabs.length ? fabs : INJ_FABRICANTES.map(f => f.nome)
    fabDl.innerHTML = allFabs.map(f => `<option value="${f}">`).join('')
  }

  // Unidade e Apresentação: datalists dos itens filtrados
  const unitDl  = document.getElementById('if_unidade_list')
  const apresDl = document.getElementById('if_apres_list')
  const units = [...new Set(itensVisiveis.map(i => i.unidade).filter(Boolean))]
  const apres = [...new Set(itensVisiveis.map(i => i.apresentacao).filter(Boolean))]
  if (unitDl)  unitDl.innerHTML  = (units.length ? units : INJ_UNIDADES).map(u => `<option value="${u}">`).join('')
  if (apresDl) apresDl.innerHTML = (apres.length ? apres : INJ_APRESENTACOES).map(a => `<option value="${a}">`).join('')
}
window._injPopulateFromCat = _injPopulateFromCat

// Ao digitar o nome: auto-preenche campos vinculados e exibe status do repo
function injNomeChange(val) {
  _injFormData.nome = val
  const catId   = document.getElementById('if_cat')?.value
  const warning = document.getElementById('if_repo_warning')
  const success = document.getElementById('if_repo_ok')

  if (!catId || catId === '__novo__' || !val.trim()) {
    if (warning) warning.style.display = 'none'
    if (success) success.style.display = 'none'
    return
  }

  const match = _repoFindItem(catId, val.trim())
  if (match) {
    // Auto-preenche do repo (fonte de verdade)
    const fabInput = document.getElementById('if_fab')
    if (fabInput && match.fabricante) { fabInput.value = match.fabricante; _injFormData.fabricante = match.fabricante }
    if (match.unidade)     { const el = document.getElementById('if_unidade'); if (el) { el.value = match.unidade;     _injFormData.unidade      = match.unidade } }
    if (match.apresentacao){ const el = document.getElementById('if_apres');   if (el) { el.value = match.apresentacao; _injFormData.apresentacao = match.apresentacao } }
    if (warning) warning.style.display = 'none'
    if (success) success.style.display = 'flex'
  } else {
    if (success) success.style.display = 'none'
    if (val.trim().length > 2) {
      if (warning) warning.style.display = 'flex'
    } else {
      if (warning) warning.style.display = 'none'
    }
  }
}
window.injNomeChange = injNomeChange

function injCancelNewCat() {
  const wrap = document.getElementById('cat_novo_wrap')
  if (wrap) wrap.style.display = 'none'
  const val = document.getElementById('cat_novo_val')
  if (val) val.value = ''
}

function injSaveNewCat() {
  const val = document.getElementById('cat_novo_val')?.value?.trim()
  if (!val) return
  const id = 'custom_' + val.toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,20) + '_' + Date.now()
  const cats = getCustomCats()
  cats.push({ id, nome: val })
  saveCustomCats(cats)
  _injFormData.categoria = id
  _renderInjStep()
}

function injFabChange(val) {
  const wrap = document.getElementById('fab_novo_wrap')
  if (!wrap) return
  if (val === '__novo__') {
    wrap.style.display = 'block'
    document.getElementById('if_fab').value = ''
  } else {
    wrap.style.display = 'none'
    // Filtra datalist de nomes para mostrar só os desta fabricante
    const catId = document.getElementById('if_cat')?.value
    if (catId && catId !== '__novo__' && val) {
      _injPopulateFromCat(catId, val)
    }
  }
}

function injCancelNewFab() {
  const wrap = document.getElementById('fab_novo_wrap')
  if (wrap) wrap.style.display = 'none'
  const val = document.getElementById('fab_novo_val')
  if (val) val.value = ''
}

function injSaveNewFab() {
  const val = document.getElementById('fab_novo_val')?.value?.trim()
  if (!val) return
  // Save to current category's repo data
  const catId = _injFormData.categoria || document.getElementById('if_cat')?.value
  if (catId && catId !== '__novo__') {
    const rd = getRepoData()
    if (!rd[catId]) rd[catId] = { nomes:[], fabricantes:[], unidades:[], apresentacoes:[] }
    if (!rd[catId].fabricantes.includes(val)) {
      rd[catId].fabricantes.push(val)
      saveRepoData(rd)
    }
  }
  _injFormData.fabricante = val
  _renderInjStep()
}

// Botão "Abrir Repositório" no aviso de produto não encontrado
function injOpenRepoForCat() {
  const catId = document.getElementById('if_cat')?.value
  // Salva o estado do form antes de fechar
  _collectStep()
  document.getElementById('injModal')?.remove()
  openInjRepositorio(catId || null)
}

window.injCatChange = injCatChange
window.injCancelNewCat = injCancelNewCat
window.injSaveNewCat = injSaveNewCat
window.injFabChange = injFabChange
window.injCancelNewFab = injCancelNewFab
window.injSaveNewFab = injSaveNewFab
window.injOpenRepoForCat = injOpenRepoForCat

// Step 2 — Clínico
function _stepClinico() {
  const d = _injFormData
  // Auto-init fields from category protocol when empty
  const proto = _getProductProtocol(d)
  if (!d.contraindicacoes?.length) d.contraindicacoes = [...proto.contraindicacoes]
  if (!d.efeitos_adv?.length)      d.efeitos_adv      = [...proto.efeitos_adv]

  // Flags de contraindicação ativos (base para futura integração com anamnese)
  const flags = proto.contraindicacoes_flags || []
  const flagsHtml = flags.length ? `
    <div style="margin-bottom:16px;padding:10px 14px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px">
      <div style="font-size:11px;font-weight:700;color:#92400E;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:5px"><i data-feather="alert-triangle" style="width:11px;height:11px"></i> Flags de contraindicação — integração anamnese</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${flags.map(f => {
          const info = CONTRAINDICATION_FLAGS[f]
          return info ? `<span style="padding:3px 8px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;font-size:11px;color:#78350F;font-weight:500">${info.label}</span>` : ''
        }).join('')}
      </div>
    </div>` : ''

  return `
    ${_fRow([
      _fGroup('Duração do efeito', `<select id="if_dur" class="inj-input">
        <option value="">Selecionar...</option>
        ${INJ_DURACOES.map(dur=>`<option value="${dur}" ${d.duracao===dur?'selected':''}>${dur}</option>`).join('')}
      </select>`),
      _fGroup('Downtime', `<select id="if_down" class="inj-input">
        <option value="">Selecionar...</option>
        ${INJ_DOWNTIMES.map(dw=>`<option value="${dw}" ${d.downtime===dw?'selected':''}>${dw}</option>`).join('')}
      </select>`)
    ])}
    ${flagsHtml}
    ${_fGroup('Contraindicações', _editableList('contraindicacoes', INJ_CONTRAINDICACOES))}
    ${_fGroup('Efeitos Adversos', _editableList('efeitos_adv', INJ_EFEITOS_ADV))}
  `
}

// Step 3 — Áreas & Indicações
function _stepAreas() {
  const d = _injFormData
  const proto = _getProductProtocol(d)
  if (!d.indicacoes?.length) d.indicacoes = [...proto.indicacoes]
  if (!Array.isArray(d.areas)) d.areas = []
  return `
    ${_fGroup('Áreas de Aplicação', _editableList('areas', INJ_AREAS))}
    ${_fGroup('Indicações Clínicas', _editableList('indicacoes', INJ_INDICACOES))}
  `
}

// Step 4 — Protocolos
function _stepProtocolo() {
  const d = _injFormData
  const proto = _getProductProtocol(d)
  if (!d.cuidados_pre?.length) d.cuidados_pre = [...proto.cuidados_pre]
  if (!d.cuidados_pos?.length) d.cuidados_pos = [...proto.cuidados_pos]
  return `
    ${_fGroup('Cuidados Pré-procedimento', _editableList('cuidados_pre', INJ_CUIDADOS_PRE))}
    ${_fGroup('Cuidados Pós-procedimento', _editableList('cuidados_pos', INJ_CUIDADOS_POS))}
  `
}

// Step 6 — Decisão (novo template: adicionar à clínica ou só salvar)
function _stepDecision() {
  const d    = _injFormData
  const cat  = _getCatNome(d.categoria)
  const color = _catColor(d.categoria)
  const icon  = _getCatIcon(d.categoria)
  return `
    <div style="text-align:center;padding:8px 0 16px">
      <div style="width:60px;height:60px;border-radius:16px;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
        <i data-feather="${icon}" style="width:26px;height:26px"></i>
      </div>
      <div style="font-size:18px;font-weight:800;color:#111827;margin-bottom:4px">${d.nome}</div>
      <div style="font-size:13px;color:#6B7280;margin-bottom:4px">${d.fabricante || ''}</div>
      <div style="font-size:12px;color:${color};font-weight:600;margin-bottom:28px">${cat}</div>

      <div style="padding:14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;margin-bottom:24px;text-align:left">
        <div style="font-size:12px;color:#166534;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:5px"><i data-feather="check-circle" style="width:12px;height:12px"></i> Template personalizado salvo</div>
        <div style="font-size:12px;color:#15803D">Este template ficará disponível na janela de Templates para você adicionar à clínica quando quiser.</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="injAddToClinic()"
          style="width:100%;padding:13px 20px;background:#7C3AED;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px">
          <i data-feather="plus-circle" style="width:16px;height:16px"></i>
          Adicionar à clínica agora
        </button>
        <button onclick="closeInjForm();openInjTemplateModal()"
          style="width:100%;padding:13px 20px;background:#fff;color:#374151;border:1.5px solid #E5E7EB;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px"
          onmouseenter="this.style.background='#F9FAFB'" onmouseleave="this.style.background='#fff'">
          <i data-feather="bookmark" style="width:16px;height:16px"></i>
          Salvar só como template — adicionar depois
        </button>
      </div>
    </div>
  `
}

// Step 5 — Financeiro
function _stepFinanceiro() {
  const d = _injFormData
  const cfg = getPrecCfg()
  const sugerido = d.custo_unit ? _precoSugerido(d.custo_unit) : ''
  const promoValor = d.preco_promo || ''

  return `
    <!-- Glossário financeiro -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      <div style="padding:10px 12px;background:#F5F3FF;border-radius:8px;border-left:3px solid #7C3AED">
        <div style="font-size:10px;font-weight:700;color:#7C3AED;text-transform:uppercase;margin-bottom:2px;display:flex;align-items:center;gap:4px"><i data-feather="trending-up" style="width:10px;height:10px"></i> Markup</div>
        <div style="font-size:11px;color:#374151;line-height:1.4">Quanto você aplica <em>sobre o custo</em> para chegar no preço de venda.<br><strong>Fórmula:</strong> (Venda − Custo) ÷ Custo × 100</div>
      </div>
      <div style="padding:10px 12px;background:#F0FDF4;border-radius:8px;border-left:3px solid #059669">
        <div style="font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;margin-bottom:2px;display:flex;align-items:center;gap:4px"><i data-feather="crosshair" style="width:10px;height:10px"></i> Margem</div>
        <div style="font-size:11px;color:#374151;line-height:1.4">Quanto do preço de venda é lucro real.<br><strong>Fórmula:</strong> (Venda − Custo) ÷ Venda × 100</div>
      </div>
      <div style="padding:10px 12px;background:#FFF7ED;border-radius:8px;border-left:3px solid #D97706">
        <div style="font-size:10px;font-weight:700;color:#D97706;text-transform:uppercase;margin-bottom:2px;display:flex;align-items:center;gap:4px"><i data-feather="briefcase" style="width:10px;height:10px"></i> Overhead ${cfg.overhead_pct}%</div>
        <div style="font-size:11px;color:#374151;line-height:1.4">Custos fixos da clínica rateados por procedimento: aluguel, salários, energia, internet, etc.</div>
      </div>
      <div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;border-left:3px solid #2563EB">
        <div style="font-size:10px;font-weight:700;color:#2563EB;text-transform:uppercase;margin-bottom:2px;display:flex;align-items:center;gap:4px"><i data-feather="file-text" style="width:10px;height:10px"></i> Impostos ${cfg.imposto_pct}%</div>
        <div style="font-size:11px;color:#374151;line-height:1.4">Carga tributária sobre o faturamento: Simples Nacional, ISS, PIS, COFINS — já incluídos no break-even.</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">
      <div class="inj-form-group">
        <label class="inj-form-label" style="display:flex;align-items:center;justify-content:space-between">
          <span>Custo unitário (R$)</span>
          <button type="button" onclick="injShowAddCusto()"
            style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;line-height:1">
            <i data-feather="plus" style="width:10px;height:10px"></i> Atualizar preço
          </button>
        </label>
        <input id="if_custo" class="inj-input" type="number" step="0.01"
          placeholder="Ex: 150,00 — valor da nota fiscal do produto"
          value="${d.custo_unit||''}" oninput="injUpdatePrecoSugerido(this.value)">
        <div id="inj_custo_add_form" style="display:none;margin-top:8px;padding:10px;background:#EFF6FF;border-radius:8px;border:1px solid #BFDBFE">
          <div style="font-size:11px;font-weight:700;color:#2563EB;margin-bottom:8px">Novo preço de custo</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:10px;color:#6B7280;font-weight:600;display:block;margin-bottom:3px">Data do aumento</label>
              <input id="if_custo_nova_data" type="date" class="inj-input"
                style="font-size:12px;padding:6px 10px"
                value="${new Date().toISOString().slice(0,10)}">
            </div>
            <div>
              <label style="font-size:10px;color:#6B7280;font-weight:600;display:block;margin-bottom:3px">Novo custo (R$)</label>
              <input id="if_custo_novo_valor" type="number" step="0.01" class="inj-input"
                style="font-size:12px;padding:6px 10px"
                placeholder="Ex: 180,00">
            </div>
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" onclick="injConfirmAddCusto()"
              style="flex:1;padding:6px;background:#2563EB;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700">
              Confirmar
            </button>
            <button type="button" onclick="document.getElementById('inj_custo_add_form').style.display='none'"
              style="padding:6px 12px;background:#fff;color:#6B7280;border:1px solid #E5E7EB;border-radius:6px;cursor:pointer;font-size:12px">
              Cancelar
            </button>
          </div>
        </div>
        <div id="inj_custo_history">${_renderCustoHistory(d.historico_custos)}</div>
      </div>
      <div class="inj-form-group">
        <label class="inj-form-label">Preço de venda (R$)</label>
        <input id="if_preco" class="inj-input" type="number" step="0.01"
          placeholder="Ex: 450,00 — valor cobrado do paciente"
          value="${d.preco_venda||sugerido}" oninput="injUpdateMargem()">
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">
      <div class="inj-form-group">
        <label class="inj-form-label">Preço Promocional (R$) <span style="font-weight:400;color:#9CA3AF;font-size:10px">opcional</span></label>
        <input id="if_preco_promo" class="inj-input" type="number" step="0.01"
          placeholder="Ex: 360,00 — ou preencha o % ao lado"
          value="${promoValor}" oninput="injUpdatePromo()">
      </div>
      <div class="inj-form-group">
        <label class="inj-form-label">Desconto (% sobre o preço de venda)</label>
        <input id="if_promo_pct" class="inj-input" type="number" step="1" min="1" max="99"
          placeholder="Ex: 20 → paciente paga 20% menos que o preço cheio"
          value="${d.promo_pct||''}" oninput="injUpdatePromoFromPct()">
      </div>
    </div>
    <div id="inj_promo_margin" style="margin-bottom:16px"></div>

    <div id="inj_fin_preview" style="padding:14px;background:#F9FAFB;border-radius:10px;margin-bottom:12px">
      ${_injFinPreview(d.custo_unit, d.preco_venda)}
    </div>

    <div style="text-align:right">
      <a href="#" onclick="event.preventDefault();closeInjForm();navigateTo('inj-config-prec')" style="font-size:12px;color:#7C3AED;font-weight:600;display:inline-flex;align-items:center;gap:4px"><i data-feather="settings" style="width:11px;height:11px"></i> Ajustar markup/overhead/impostos</a>
    </div>
  `
}

// ── Histórico de custos ───────────────────────────────────────
function _renderCustoHistory(hist) {
  if (!Array.isArray(hist) || hist.length === 0) return ''
  const sorted = [...hist].sort((a,b) => new Date(a.data) - new Date(b.data))
  const rows = sorted.map((h, i) => {
    const isLast = i === sorted.length - 1
    const prev = i > 0 ? sorted[i-1].custo : null
    const diff = prev ? h.custo - prev : null
    const diffHtml = diff !== null
      ? `<span style="font-size:10px;color:${diff>0?'#DC2626':'#059669'};margin-left:4px">${diff>0?'▲':'▼'} R$${Math.abs(diff).toFixed(2)}</span>`
      : ''
    return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;${isLast?'font-weight:700;color:#111827':'color:#6B7280'}">
      <span style="font-size:10px;color:${isLast?'#2563EB':'#9CA3AF'};min-width:80px">${h.data ? new Date(h.data+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span>
      <span style="font-size:12px">R$${parseFloat(h.custo).toFixed(2)}</span>
      ${diffHtml}
      ${isLast ? '<span style="font-size:10px;background:#EFF6FF;color:#2563EB;padding:1px 6px;border-radius:10px;margin-left:2px">atual</span>' : ''}
    </div>`
  }).join('')
  return `<div style="margin-top:8px;padding:8px 10px;background:#F9FAFB;border-radius:8px;border:1px solid #E5E7EB">
    <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:6px">Histórico de preços de custo</div>
    ${rows}
  </div>`
}

function injShowAddCusto() {
  const form = document.getElementById('inj_custo_add_form')
  if (form) { form.style.display = form.style.display === 'none' ? 'block' : 'none' }
}

function injConfirmAddCusto() {
  const novoValor = parseFloat(document.getElementById('if_custo_novo_valor')?.value)
  const novaData  = document.getElementById('if_custo_nova_data')?.value
  if (!novoValor || novoValor <= 0) { _toastWarn('Informe o novo valor de custo.'); return }
  if (!novaData) { _toastWarn('Informe a data do aumento de preço.'); return }
  if (!Array.isArray(_injFormData.historico_custos)) _injFormData.historico_custos = []
  _injFormData.historico_custos.push({ custo: novoValor, data: novaData })
  _injFormData.custo_unit = novoValor
  // Atualiza o campo custo no form e re-renderiza o preview
  const custoEl = document.getElementById('if_custo')
  if (custoEl) { custoEl.value = novoValor; injUpdatePrecoSugerido(novoValor) }
  // Re-renderiza o histórico
  const histEl = document.getElementById('inj_custo_history')
  if (histEl) histEl.innerHTML = _renderCustoHistory(_injFormData.historico_custos)
  // Fecha o mini-form
  const form = document.getElementById('inj_custo_add_form')
  if (form) form.style.display = 'none'
  featherIn(document.getElementById('injFormStepContent'))
}

// ── Preview de margem sobre custo para preço promo ───────────
function _updatePromoMargem() {
  const el = document.getElementById('inj_promo_margin')
  if (!el) return
  const custo = parseFloat(document.getElementById('if_custo')?.value) || 0
  const promo = parseFloat(document.getElementById('if_preco_promo')?.value) || 0
  if (!custo || !promo) { el.innerHTML = ''; return }
  const markupPromo = ((promo - custo) / custo * 100)
  const margemPromo = ((promo - custo) / promo * 100)
  const abaixoCusto = promo < custo
  const ok = margemPromo >= getPrecCfg().meta_margem_min
  el.innerHTML = `
    <div style="padding:10px 12px;background:${abaixoCusto?'#FEF2F2':ok?'#F0FDF4':'#FFFBEB'};border-radius:8px;border:1px solid ${abaixoCusto?'#FECACA':ok?'#BBF7D0':'#FDE68A'};display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="font-size:10px;color:#9CA3AF;font-weight:600;text-transform:uppercase;margin-right:4px">Impacto do desconto sobre o custo:</div>
      <div style="display:flex;align-items:center;gap:4px">
        <span style="font-size:11px;color:#6B7280">Markup promo:</span>
        <span style="font-size:13px;font-weight:700;color:${abaixoCusto?'#DC2626':'#374151'}">${abaixoCusto?'Abaixo do custo':markupPromo.toFixed(1)+'%'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <span style="font-size:11px;color:#6B7280">Margem promo:</span>
        <span style="font-size:13px;font-weight:700;color:${abaixoCusto?'#DC2626':ok?'#059669':'#D97706'}">${abaixoCusto?'—':margemPromo.toFixed(1)+'%'}</span>
      </div>
      ${abaixoCusto ? `<div style="font-size:11px;color:#DC2626;font-weight:700">Preço promocional abaixo do custo — prejuízo garantido!</div>` : ''}
    </div>`
}

function injUpdatePromo() {
  const promoEl = document.getElementById('if_preco_promo')
  const pctEl   = document.getElementById('if_promo_pct')
  const precoEl = document.getElementById('if_preco')
  if (!promoEl || !pctEl || !precoEl) return
  if (!promoEl.value.trim()) {
    pctEl.value = ''
    _updatePromoMargem()
    return
  }
  const preco = parseFloat(precoEl.value) || 0
  const promo = parseFloat(promoEl.value) || 0
  if (preco > 0 && promo > 0 && promo < preco) {
    pctEl.value = Math.round((1 - promo / preco) * 100)
  }
  _updatePromoMargem()
}

function injUpdatePromoFromPct() {
  const promoEl = document.getElementById('if_preco_promo')
  const pctEl   = document.getElementById('if_promo_pct')
  const precoEl = document.getElementById('if_preco')
  if (!promoEl || !pctEl || !precoEl) return
  if (!pctEl.value.trim()) {
    promoEl.value = ''
    _updatePromoMargem()
    return
  }
  const preco = parseFloat(precoEl.value) || 0
  const pct   = parseFloat(pctEl.value) || 0
  if (preco > 0 && pct > 0 && pct < 100) {
    promoEl.value = (preco * (1 - pct / 100)).toFixed(2)
  }
  _updatePromoMargem()
}

window.injShowAddCusto     = injShowAddCusto
window.injConfirmAddCusto  = injConfirmAddCusto
window.injUpdatePromo = injUpdatePromo
window.injUpdatePromoFromPct = injUpdatePromoFromPct

function _injFinPreview(custo, preco) {
  if (!custo || !preco) return '<div style="text-align:center;color:#9CA3AF;font-size:13px">Preencha custo e preço para ver a análise</div>'
  const fin = calcFinanceiro(custo, preco)
  const ok  = parseFloat(fin.margem) >= getPrecCfg().meta_margem_min
  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div style="text-align:center"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase">Markup</div><div style="font-size:18px;font-weight:700;color:#7C3AED">${fin.markup}%</div></div>
      <div style="text-align:center"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase">Margem</div><div style="font-size:18px;font-weight:700;color:${ok?'#059669':'#DC2626'}">${fin.margem}%</div></div>
      <div style="text-align:center"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase">Lucro</div><div style="font-size:18px;font-weight:700;color:#374151">${_fmtBRL(fin.lucro)}</div></div>
    </div>
    ${!ok ? `<div style="margin-top:10px;text-align:center;font-size:12px;color:#DC2626;display:flex;align-items:center;justify-content:center;gap:4px"><i data-feather="alert-triangle" style="width:12px;height:12px"></i> Margem abaixo da meta mínima (${getPrecCfg().meta_margem_min}%). Preço sugerido: ${_fmtBRL(_precoSugerido(custo))}</div>` : ''}
  `
}

// Step 6 — Estoque
function _stepEstoque() {
  const d = _injFormData
  return `
    ${_fRow([
      _fGroup('Lote', `<input id="if_lote" class="inj-input" type="text" placeholder="Ex: LOT24B001" value="${d.lote||''}">`),
      _fGroup('Validade', `<input id="if_val" class="inj-input" type="date" value="${d.validade||''}">`)
    ])}
    ${_fRow([
      _fGroup('Estoque atual', `<input id="if_estq" class="inj-input" type="number" placeholder="0" value="${d.estoque||0}">`),
      _fGroup('Estoque mínimo (alerta)', `<input id="if_estq_min" class="inj-input" type="number" placeholder="0" value="${d.estoque_min||0}">`)
    ])}
    ${_fGroup('Fornecedor / Distribuidora', `<input id="if_forn" class="inj-input" type="text" placeholder="Nome do fornecedor" value="${d.fornecedor||''}">`)}
    ${_fGroup('Notas de estoque', `<textarea id="if_nota_estq" class="inj-input" rows="2" placeholder="Informações de armazenamento, temperatura, etc.">${d.nota_estoque||''}</textarea>`)}
  `
}

// ── Helpers de form ───────────────────────────────────────────
function _fGroup(label, input) {
  return `<div class="inj-form-group"><label class="inj-form-label">${label}</label>${input}</div>`
}
function _fRow(cols) {
  return `<div style="display:grid;grid-template-columns:${cols.map(()=>'1fr').join(' ')};gap:12px">${cols.join('')}</div>`
}
function _checkboxGroup(name, options, selected, fieldKey) {
  const extra = (fieldKey && Array.isArray(_injFormData[fieldKey]))
    ? _injFormData[fieldKey].filter(v => !options.includes(v))
    : []
  const all = [...options, ...extra]
  return `<div class="inj-checkbox-group">${all.map(opt => `
    <label class="inj-checkbox-label">
      <input type="checkbox" name="${name}" value="${opt}" ${selected.includes(opt)?'checked':''}>
      <span>${opt}</span>
    </label>
  `).join('')}
  ${fieldKey ? `
    <div style="display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed #E5E7EB">
      <input type="text" id="${name}_new" class="inj-input" placeholder="+ Adicionar novo item..." style="flex:1;font-size:12px">
      <button type="button" onclick="injAddItem('${name}','${name}_new','${fieldKey}')"
        style="padding:6px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">Adicionar</button>
    </div>` : ''}
  </div>`
}

function injAddItem(name, inputId, fieldKey) {
  const val = document.getElementById(inputId)?.value?.trim()
  if (!val) return
  _collectStep()
  if (!Array.isArray(_injFormData[fieldKey])) _injFormData[fieldKey] = []
  if (!_injFormData[fieldKey].includes(val)) _injFormData[fieldKey].push(val)
  _renderInjStep()
}
window.injAddItem = injAddItem

// ── Lista editável (Agregar / Deletar) ────────────────────────
function _editableList(fieldKey, suggestions) {
  const items = _injFormData[fieldKey] || []
  const listId  = 'dl_' + fieldKey
  const inputId = 'eli_' + fieldKey
  return `
    <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;background:#fff">
      <div style="max-height:240px;overflow-y:auto">
        ${items.length ? items.map((item, idx) => `
          <div style="display:flex;align-items:flex-start;padding:8px 12px;border-bottom:1px solid #F3F4F6;gap:8px">
            <span style="flex:1;font-size:12.5px;color:#374151;line-height:1.45">${item}</span>
            <button type="button" onclick="injRemoveListItem('${fieldKey}',${idx})"
              style="background:none;border:none;cursor:pointer;color:#DC2626;font-size:17px;line-height:1;padding:0 2px;flex-shrink:0;margin-top:1px" title="Remover item">×</button>
          </div>`).join('')
        : `<div style="padding:14px;text-align:center;font-size:12px;color:#9CA3AF;font-style:italic">Nenhum item — adicione abaixo</div>`}
      </div>
      <div style="padding:8px;background:#FAFAFA;display:flex;gap:8px;border-top:1px solid #F3F4F6">
        <input type="text" id="${inputId}" class="inj-input" list="${listId}"
          placeholder="Adicionar item..." style="flex:1;font-size:12px;margin:0;padding:7px 10px">
        <button type="button" onclick="injAddListItem('${fieldKey}')"
          style="padding:6px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">+ Agregar</button>
      </div>
    </div>
    <datalist id="${listId}">${(suggestions||[]).map(s=>`<option value="${s}">`).join('')}</datalist>
  `
}

function injRemoveListItem(fieldKey, idx) {
  if (!Array.isArray(_injFormData[fieldKey])) return
  _injFormData[fieldKey].splice(idx, 1)
  _renderInjStep()
}

function injAddListItem(fieldKey) {
  const val = document.getElementById('eli_' + fieldKey)?.value?.trim()
  if (!val) return
  if (!Array.isArray(_injFormData[fieldKey])) _injFormData[fieldKey] = []
  if (!_injFormData[fieldKey].includes(val)) _injFormData[fieldKey].push(val)
  _renderInjStep()
}

window.injRemoveListItem = injRemoveListItem
window.injAddListItem    = injAddListItem

// ── Coleta de dados do step ───────────────────────────────────
function _collectStep() {
  switch (_injFormStep) {
    case 1:
      _injFormData.nome        = document.getElementById('if_nome')?.value?.trim()
      _injFormData.fabricante  = document.getElementById('if_fab')?.value
      _injFormData.categoria   = document.getElementById('if_cat')?.value
      _injFormData.unidade     = document.getElementById('if_unidade')?.value
      _injFormData.apresentacao= document.getElementById('if_apres')?.value
      _injFormData.observacoes = document.getElementById('if_obs')?.value?.trim()
      break
    case 2:
      _injFormData.duracao  = document.getElementById('if_dur')?.value
      _injFormData.downtime = document.getElementById('if_down')?.value
      // contraindicacoes e efeitos_adv mantidos por injRemoveListItem/injAddListItem
      break
    case 3:
      // areas e indicacoes mantidos por injRemoveListItem/injAddListItem
      break
    case 4:
      // cuidados_pre e cuidados_pos mantidos por injRemoveListItem/injAddListItem
      break
    case 5: {
      const novoCusto = parseFloat(document.getElementById('if_custo')?.value)||null
      _injFormData.preco_venda = parseFloat(document.getElementById('if_preco')?.value)||null
      _injFormData.preco_promo = parseFloat(document.getElementById('if_preco_promo')?.value)||null
      _injFormData.promo_pct   = parseFloat(document.getElementById('if_promo_pct')?.value)||null
      // Se o custo foi alterado manualmente (sem usar "+"), sincronizar com o histórico
      if (novoCusto && novoCusto !== _injFormData.custo_unit) {
        if (!Array.isArray(_injFormData.historico_custos)) _injFormData.historico_custos = []
        // Só adiciona ao histórico se não foi adicionado já via injConfirmAddCusto
        const ultimo = _injFormData.historico_custos.slice(-1)[0]
        if (!ultimo || ultimo.custo !== novoCusto) {
          _injFormData.historico_custos.push({ custo: novoCusto, data: new Date().toISOString().slice(0,10) })
        }
      }
      _injFormData.custo_unit = novoCusto
      break
    }
    case 6:
      _injFormData.lote         = document.getElementById('if_lote')?.value?.trim()      || null
      _injFormData.validade     = document.getElementById('if_val')?.value               || null
      _injFormData.estoque      = parseFloat(document.getElementById('if_estq')?.value)  || 0
      _injFormData.estoque_min  = parseFloat(document.getElementById('if_estq_min')?.value) || 0
      _injFormData.fornecedor   = document.getElementById('if_forn')?.value?.trim()      || null
      _injFormData.nota_estoque = document.getElementById('if_nota_estq')?.value?.trim() || null
      break
  }
}

function _getChecked(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value)
}

function injFormNext() {
  _collectStep()
  if (_injFormStep === 1) {
    if (!_injFormData.categoria)    { _injShowStepError('Selecione a categoria do produto.'); return }
    if (!_injFormData.nome?.trim()) { _injShowStepError('Informe o nome do produto.'); return }

    // Validação obrigatória: produto deve estar no repositório
    if (_injFormData.categoria !== '__novo__') {
      const match = _repoFindItem(_injFormData.categoria, _injFormData.nome.trim())
      if (!match) {
        _injShowStepError(
          'Este produto não está no Repositório.<br>Adicione-o lá antes de continuar — isso garante consistência nos cálculos de custo e lucro.',
          true  // mostra botão "Abrir Repositório"
        )
        return
      }
      // Garante que os dados do repo estão aplicados
      if (match.fabricante)   _injFormData.fabricante   = match.fabricante
      if (match.unidade)      _injFormData.unidade      = match.unidade
      if (match.apresentacao) _injFormData.apresentacao = match.apresentacao
    }

    if (!_injFormData.fabricante) { _injShowStepError('Fabricante não encontrado. Verifique o Repositório.'); return }
  }
  _injFormStep++
  _renderInjForm()
}

function _injShowStepError(msg, showRepoBtn) {
  // Remove erro anterior
  document.getElementById('inj_step_error')?.remove()
  const wrap = document.getElementById('injFormStepContent')
  if (!wrap) return
  const div = document.createElement('div')
  div.id = 'inj_step_error'
  div.style.cssText = 'display:flex;align-items:flex-start;gap:10px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 14px;margin-bottom:12px'
  div.innerHTML = `
    <svg style="flex-shrink:0;margin-top:1px" width="16" height="16" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <div style="flex:1">
      <div style="font-size:12.5px;color:#991B1B;line-height:1.5">${msg}</div>
      ${showRepoBtn ? `
      <button onclick="injOpenRepoForCat()" style="margin-top:8px;padding:5px 12px;background:#EF4444;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/><path d="M8 12h8M12 8v8"/></svg>
        Abrir Repositório
      </button>` : ''}
    </div>
    <button onclick="document.getElementById('inj_step_error').remove()" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:16px;line-height:1;padding:0;flex-shrink:0">×</button>
  `
  wrap.insertBefore(div, wrap.firstChild)
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function injFormPrev() {
  _collectStep()
  _injFormStep--
  _renderInjForm()
}

function injFormGoStep(n) {
  _collectStep()
  _injFormStep = n
  _renderInjForm()
}

async function saveInjForm() {
  _collectStep()
  if (_injEditId) {
    // Edição direta — salva sem perguntar
    if (window.InjetaveisRepository && _isUuid(_injEditId)) {
      const r = await window.InjetaveisRepository.upsert(_injFormDataToSb(_injEditId, _injFormData))
      if (!r.ok) { _toastErr(r.error || 'Erro ao salvar'); return }
      _injCache = null
    } else {
      const injs = getInj()
      const idx = injs.findIndex(i => i.id === _injEditId)
      if (idx >= 0) injs[idx] = Object.assign(injs[idx], _injFormData, { updated_at: new Date().toISOString() })
      saveInj(injs)
    }
    closeInjForm()
    renderInjetaveis()
    if (window._showToast) _showToast('Injetável atualizado', _injFormData.nome + ' atualizado', 'success')
  } else {
    // Novo (ou re-edição de custom tpl) — salva como template e mostra tela de decisão
    const editSlug = _injFormData._editingCustomTplSlug
    const slug = editSlug || _tplSlug(_injFormData.nome || 'produto')
    _injFormData._customTplSlug = slug
    _injFormData._customTpl     = true
    delete _injFormData._editingCustomTplSlug
    const tpls = getCustomTpls()
    tpls[slug] = Object.assign({}, _injFormData, { saved_at: new Date().toISOString() })
    saveCustomTpls(tpls)
    _injFormStep = 7
    _renderInjForm()
  }
}

async function injAddToClinic() {
  const slug = _injFormData._customTplSlug
  const tpls = getCustomTpls()
  const tpl  = slug ? tpls[slug] : _injFormData
  if (!tpl) return

  if (window.InjetaveisRepository) {
    const r = await window.InjetaveisRepository.upsert(_injFormDataToSb(null, tpl))
    if (!r.ok) { _toastErr(r.error || 'Erro ao cadastrar'); return }
    _injCache = null
  } else {
    const injs = getInj()
    const novo = Object.assign({}, tpl, { id: _uid(), created_at: new Date().toISOString(), _customTplSlug: undefined, _customTpl: undefined })
    injs.push(novo)
    saveInj(injs)
  }
  renderInjetaveis()
  closeInjForm()
  if (window._showToast) _showToast('Adicionado à clínica', tpl.nome + ' cadastrado com sucesso', 'success')
}

// Mapeia dados do form para params do RPC upsert_injetavel
function _injFormDataToSb(id, d) {
  return {
    id:               id && _isUuid(id) ? id : null,
    nome:             d.nome             || null,
    categoria:        d.categoria        || null,
    fabricante:       d.fabricante       || null,
    apresentacao:     d.apresentacao     || null,
    unidade:          d.unidade          || null,
    custo_unit:       parseFloat(d.custo || d.custo_unit) || null,
    preco:            parseFloat(d.preco) || null,
    margem:           parseFloat(d.margem) || null,
    duracao:          d.duracao           || null,
    downtime:         d.downtime          || null,
    areas:            Array.isArray(d.areas)             ? d.areas             : [],
    indicacoes:       Array.isArray(d.indicacoes)        ? d.indicacoes        : [],
    contraindicacoes: Array.isArray(d.contraindicacoes)  ? d.contraindicacoes  : [],
    cuidados_pre:     Array.isArray(d.cuidados_pre)      ? d.cuidados_pre      : [],
    cuidados_pos:     Array.isArray(d.cuidados_pos)      ? d.cuidados_pos      : [],
    observacoes:      d.observacoes       || null,
    estoque_qtd:      parseFloat(d.estoque_qtd)   || 0,
    estoque_alerta:   parseFloat(d.estoque_alerta) || 0,
  }
}
window.injAddToClinic = injAddToClinic

function closeInjForm() {
  document.getElementById('injFormModal')?.remove()
}

// ── Aplicar template ──────────────────────────────────────────
function injApplyTemplate(key) {
  if (!key || !BRAND_TEMPLATES[key]) return
  const tplFab = _injFormData._tplFab || ''
  const t = BRAND_TEMPLATES[key]
  const proto = _getProductProtocol(t)
  _injFormData = Object.assign({}, _injFormData, t, proto, { _tplFab: tplFab })
  _renderInjStep()
}

// ── Cascata de template: fabricante → marcas ──────────────────
function injTplFabChange(fab) {
  _injFormData._tplFab = fab
  const sel = document.getElementById('tpl_marca_sel')
  if (!sel) return
  sel.innerHTML = `<option value="">— ${fab ? 'Selecionar' : 'Escolha o fabricante'} —</option>`
  if (fab) {
    sel.style.opacity = '1'
    sel.style.pointerEvents = ''
    Object.entries(BRAND_TEMPLATES).forEach(([key, t]) => {
      if (t.fabricante === fab) {
        const opt = document.createElement('option')
        opt.value = key
        opt.textContent = t.nome
        sel.appendChild(opt)
      }
    })
  } else {
    sel.style.opacity = '.5'
    sel.style.pointerEvents = 'none'
  }
}
window.injTplFabChange = injTplFabChange

// ── Atualizar preview financeiro em tempo real ────────────────
function injUpdatePrecoSugerido(custo) {
  const preco = document.getElementById('if_preco')
  if (preco && !preco.dataset.manual) {
    preco.value = _precoSugerido(custo)
  }
  injUpdateMargem()
}

function injUpdateMargem() {
  const custo = parseFloat(document.getElementById('if_custo')?.value)||0
  const preco = parseFloat(document.getElementById('if_preco')?.value)||0
  const prev  = document.getElementById('inj_fin_preview')
  if (prev) prev.innerHTML = _injFinPreview(custo, preco)
}

// ── Filtros e view ────────────────────────────────────────────
function injSetFilter(key, val) {
  _injFilter[key] = val
  renderInjetaveis()
}

function injSetView(v) {
  _injView = v
  renderInjetaveis()
}

// ══════════════════════════════════════════════════════════════
//  IMPRESSÃO
// ══════════════════════════════════════════════════════════════
function printInj(id) {
  const inj = getInj().find(i => i.id === id)
  if (!inj) return
  const fin = inj.preco_venda && inj.custo_unit ? calcFinanceiro(inj.custo_unit, inj.preco_venda) : null
  const catColor = _catColor(inj.categoria)

  function printSection(title, items, color) {
    if (!items || !items.length) return ''
    return `
      <div style="margin-bottom:20px;break-inside:avoid">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${color};border-bottom:2px solid ${color};padding-bottom:4px;margin-bottom:10px">${title}</div>
        <ul style="margin:0;padding-left:16px">
          ${items.map(v=>`<li style="font-size:12px;color:#374151;margin-bottom:4px;line-height:1.5">${v}</li>`).join('')}
        </ul>
      </div>`
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${inj.nome} — Ficha do Injetável</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1F2937; background: #fff; padding: 32px; max-width: 800px; margin: 0 auto; }
  @media print { body { padding: 0; } @page { margin: 20mm; } }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 3px solid ${catColor}; }
  .title { font-size: 26px; font-weight: 800; color: #111827; }
  .subtitle { font-size: 14px; color: #6B7280; margin-top: 4px; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; background: ${catColor}18; color: ${catColor}; border: 1px solid ${catColor}40; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .field-box { background: #F9FAFB; border-radius: 8px; padding: 10px 14px; }
  .field-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9CA3AF; margin-bottom: 3px; }
  .field-value { font-size: 13px; font-weight: 600; color: #374151; }
  .fin-card { background: #F9FAFB; border-radius: 8px; padding: 12px; text-align: center; border-top: 3px solid ${catColor}; }
  .fin-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #9CA3AF; margin-bottom: 4px; }
  .fin-value { font-size: 20px; font-weight: 800; }
  .obs-box { background: #F5F3FF; border-left: 4px solid ${catColor}; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6; color: #374151; }
  .promo-badge { background: #FEF3C7; color: #92400E; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; display: inline-block; margin-top: 8px; }
  .print-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 10px; color: #9CA3AF; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="title">${inj.nome}</div>
    <div class="subtitle">${_getFabNome(inj.fabricante)}</div>
    <div style="margin-top:8px"><span class="badge">${_getCatNome(inj.categoria)}</span></div>
  </div>
  <div style="text-align:right">
    ${inj.duracao ? `<div style="font-size:12px;color:#6B7280">Duração: <strong>${inj.duracao}</strong></div>` : ''}
    ${inj.downtime ? `<div style="font-size:12px;color:#6B7280">Downtime: <strong>${inj.downtime}</strong></div>` : ''}
    ${inj.unidade ? `<div style="font-size:12px;color:#6B7280">Unidade: <strong>${inj.unidade}</strong></div>` : ''}
  </div>
</div>

${inj.observacoes ? `<div class="obs-box"><strong>Observações:</strong> ${inj.observacoes}</div>` : ''}

<!-- Seção Financeira -->
${fin ? `
<div style="margin-bottom:24px;break-inside:avoid">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${catColor};border-bottom:2px solid ${catColor};padding-bottom:4px;margin-bottom:14px">Precificação</div>
  <div class="grid-4">
    <div class="fin-card"><div class="fin-label">Custo</div><div class="fin-value" style="color:#6B7280">${_fmtBRL(inj.custo_unit)}</div></div>
    <div class="fin-card"><div class="fin-label">Preço de Venda</div><div class="fin-value" style="color:#2563EB">${_fmtBRL(inj.preco_venda)}</div></div>
    <div class="fin-card"><div class="fin-label">Markup</div><div class="fin-value" style="color:${catColor}">${fin.markup}%</div></div>
    <div class="fin-card"><div class="fin-label">Margem</div><div class="fin-value" style="color:${parseFloat(fin.margem)>=55?'#059669':'#DC2626'}">${fin.margem}%</div></div>
  </div>
  ${inj.preco_promo ? `<div class="promo-badge" style="display:inline-flex;align-items:center;gap:5px"><i data-feather="tag" style="width:11px;height:11px"></i> Preço Promoção: ${_fmtBRL(inj.preco_promo)}${inj.promo_pct ? ' ('+inj.promo_pct+'% de desconto)' : ''}</div>` : ''}
</div>` : ''}

<!-- Áreas e Indicações -->
<div class="grid-2">
  ${printSection('Áreas de Aplicação', inj.areas, catColor)}
  ${printSection('Indicações Clínicas', inj.indicacoes, catColor)}
</div>

<!-- Protocolos -->
<div class="grid-2">
  ${printSection('Cuidados Pré-procedimento', inj.cuidados_pre, '#2563EB')}
  ${printSection('Cuidados Pós-procedimento', inj.cuidados_pos, '#059669')}
</div>

<!-- Contraindicações e Efeitos -->
<div class="grid-2">
  ${printSection('Contraindicações', inj.contraindicacoes, '#DC2626')}
  ${printSection('Efeitos Adversos', inj.efeitos_adv, '#D97706')}
</div>

<div class="print-footer">
  <span>ClinicAI — Ficha do Produto</span>
  <span>${new Date().toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'})}</span>
</div>

<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=800')
  if (!win) { _toastWarn('Permita popups para imprimir.'); return }
  win.document.write(html)
  win.document.close()
}
window.printInj = printInj

// ── Delete com confirmação dupla ──────────────────────────────
async function deleteInj(id) {
  const inj = getInj().find(i => i.id === id)
  if (!inj) return
  if (!confirm(`Excluir "${inj.nome}"?`)) return
  if (!confirm(`Confirmar exclusão definitiva de "${inj.nome}"? Esta ação não pode ser desfeita.`)) return
  if (window.InjetaveisRepository && _isUuid(id)) {
    const r = await window.InjetaveisRepository.softDelete(id)
    if (!r.ok) { _toastErr(r.error || 'Erro ao excluir'); return }
    _injCache = null
  } else {
    saveInj(getInj().filter(i => i.id !== id))
  }
  document.getElementById('injDetailModal')?.remove()
  renderInjetaveis()
  if (window._showToast) _showToast('Excluído', inj.nome + ' removido', 'warning')
}

// ══════════════════════════════════════════════════════════════
//  REPOSITÓRIO — Categorias e dados vinculados
// ══════════════════════════════════════════════════════════════
const REPO_DATA_KEY = 'clinic_inj_repo_data'

// Cada item vincula nome ↔ fabricante ↔ unidade ↔ apresentação
const REPO_SEEDS = {
  neuro: { itens: [
    { nome:'Botox',        fabricante:'Allergan (AbbVie)',              unidade:'U', apresentacao:'Frasco-ampola 100U' },
    { nome:'Dysport',      fabricante:'Galderma',                        unidade:'U', apresentacao:'Frasco-ampola 300U / 500U' },
    { nome:'Xeomin',       fabricante:'Merz Pharma',                    unidade:'U', apresentacao:'Frasco-ampola 100U' },
    { nome:'Bocouture',    fabricante:'Merz Pharma',                    unidade:'U', apresentacao:'Frasco-ampola 100U' },
    { nome:'Jeuveau',      fabricante:'Evolus',                         unidade:'U', apresentacao:'Frasco-ampola 100U' },
    { nome:'Nabota',       fabricante:'Daewoong Pharmaceutical',        unidade:'U', apresentacao:'Frasco-ampola 100U / 200U' },
    { nome:'Botulift',     fabricante:'Medytox',                        unidade:'U', apresentacao:'Frasco-ampola 125U' },
    { nome:'Prosigne',     fabricante:'Lanzhou Institute (China)',       unidade:'U', apresentacao:'Frasco-ampola 100U' },
    { nome:'Letybo',       fabricante:'Hugel',                          unidade:'U', apresentacao:'Frasco-ampola 50U / 100U' },
    { nome:'ReNTox',       fabricante:'Pharma Research Bio (Coreia)',    unidade:'U', apresentacao:'Frasco-ampola 100U' },
    { nome:'Azzalure',     fabricante:'Ipsen / Galderma',               unidade:'U', apresentacao:'Frasco-ampola 125U' },
    { nome:'Alluzience',   fabricante:'Galderma',                       unidade:'U', apresentacao:'Solução pronta 200U' },
  ]},
  ha: { itens: [
    { nome:'Juvederm Voluma',       fabricante:'Allergan (AbbVie)', unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Juvederm Volift',       fabricante:'Allergan (AbbVie)', unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Juvederm Volbella',     fabricante:'Allergan (AbbVie)', unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Juvederm Ultra XC',     fabricante:'Allergan (AbbVie)', unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Restylane Lyft',        fabricante:'Galderma',          unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Restylane Defyne',      fabricante:'Galderma',          unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Restylane Refyne',      fabricante:'Galderma',          unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Restylane Kysse',       fabricante:'Galderma',          unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Restylane Vital',       fabricante:'Galderma',          unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Belotero Balance',      fabricante:'Merz Pharma',       unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Belotero Intense',      fabricante:'Merz Pharma',       unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Belotero Volume',       fabricante:'Merz Pharma',       unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Stylage S',             fabricante:'Vivacy',            unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Stylage M',             fabricante:'Vivacy',            unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Stylage L',             fabricante:'Vivacy',            unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Stylage XL',            fabricante:'Vivacy',            unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Rennova Fill',          fabricante:'Rennova',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Rennova Lift',          fabricante:'Rennova',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Yvoire Classic',        fabricante:'LG Chem',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Yvoire Volume',         fabricante:'LG Chem',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Teosyal RHA 2',         fabricante:'Teoxane',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Teosyal RHA 3',         fabricante:'Teoxane',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Teosyal RHA 4',         fabricante:'Teoxane',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Revolax Deep',          fabricante:'Across (Coreia)',   unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Revolax Sub-Q',         fabricante:'Across (Coreia)',   unidade:'mL', apresentacao:'Seringa 1ml' },
  ]},
  biorev: { itens: [
    { nome:'Profhilo',                          fabricante:'IBSA Farmaceutici',  unidade:'mL', apresentacao:'Seringa 2ml' },
    { nome:'Profhilo Structura',                fabricante:'IBSA Farmaceutici',  unidade:'mL', apresentacao:'Seringa 2ml' },
    { nome:'Redensity 1',                       fabricante:'Teoxane',            unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'NCTF 135 HA',                       fabricante:'Filorga',            unidade:'mL', apresentacao:'Ampola 3ml / 5ml' },
    { nome:'NCTF 135 HA+',                      fabricante:'Filorga',            unidade:'mL', apresentacao:'Ampola 3ml / 5ml' },
    { nome:'Jalupro Classic',                   fabricante:'Professional Derma', unidade:'mL', apresentacao:'Ampola 3ml / 5ml' },
    { nome:'Jalupro HMW',                       fabricante:'Professional Derma', unidade:'mL', apresentacao:'Ampola 5ml' },
    { nome:'Jalupro Super Hydro',               fabricante:'Professional Derma', unidade:'mL', apresentacao:'Ampola 5ml' },
    { nome:'Restylane Skinboosters Vital',      fabricante:'Galderma',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Restylane Skinboosters Vital Light',fabricante:'Galderma',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Restylane Skinboosters',            fabricante:'Galderma',           unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Belotero Revive',                   fabricante:'Merz Pharma',        unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Teosyal Redensity 1 Skinbooster',   fabricante:'Teoxane',            unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Juvederm Volite',                   fabricante:'Allergan (AbbVie)',  unidade:'mL', apresentacao:'Seringa 1ml' },
    { nome:'Viscoderm 0.8',                     fabricante:'Revitacare',         unidade:'mL', apresentacao:'Ampola 3ml / 5ml' },
    { nome:'Viscoderm 1.6',                     fabricante:'Revitacare',         unidade:'mL', apresentacao:'Ampola 3ml / 5ml' },
    { nome:'Viscoderm 2.0',                     fabricante:'Revitacare',         unidade:'mL', apresentacao:'Ampola 3ml / 5ml' },
    { nome:'Cytocare 502',                      fabricante:'Revitacare',         unidade:'mL', apresentacao:'Ampola 5ml' },
    { nome:'Cytocare 516',                      fabricante:'Revitacare',         unidade:'mL', apresentacao:'Ampola 5ml' },
    { nome:'Cytocare 532',                      fabricante:'Revitacare',         unidade:'mL', apresentacao:'Ampola 5ml' },
  ]},
  biopoten: { itens: [
    { nome:'Sculptra',        fabricante:'Galderma',                unidade:'vial', apresentacao:'Frasco-ampola 150mg' },
    { nome:'Lanluma V',       fabricante:'Sinclair Pharma',          unidade:'vial', apresentacao:'Frasco-ampola 150mg' },
    { nome:'Lanluma X',       fabricante:'Sinclair Pharma',          unidade:'vial', apresentacao:'Frasco-ampola 210mg' },
    { nome:'Radiesse',        fabricante:'Merz Pharma',              unidade:'mL',   apresentacao:'Seringa 1.5ml' },
    { nome:'Radiesse (+)',    fabricante:'Merz Pharma',              unidade:'mL',   apresentacao:'Seringa 1.5ml' },
    { nome:'Ellansé S',       fabricante:'Sinclair Pharma',          unidade:'mL',   apresentacao:'Seringa 1ml' },
    { nome:'Ellansé M',       fabricante:'Sinclair Pharma',          unidade:'mL',   apresentacao:'Seringa 1ml' },
    { nome:'Ellansé L',       fabricante:'Sinclair Pharma',          unidade:'mL',   apresentacao:'Seringa 1ml' },
    { nome:'Ellansé E',       fabricante:'Sinclair Pharma',          unidade:'mL',   apresentacao:'Seringa 1ml' },
    { nome:'HarmonyCa',       fabricante:'Allergan (AbbVie)',         unidade:'mL',   apresentacao:'Seringa 1ml' },
    { nome:'Rennova Elleva',  fabricante:'Rennova',                  unidade:'vial', apresentacao:'Frasco-ampola 200mg' },
    { nome:'Rennova Diamond', fabricante:'Rennova',                  unidade:'mL',   apresentacao:'Seringa 2ml' },
    { nome:'Gana V',          fabricante:'BioPlus (Coreia)',          unidade:'vial', apresentacao:'Frasco-ampola 200mg' },
    { nome:'AestheFill',      fabricante:'REGEN Biotech',            unidade:'vial', apresentacao:'Frasco-ampola 200mg' },
    { nome:'Rejuran Healer',  fabricante:'Pharma Research Products', unidade:'mL',   apresentacao:'Seringa 2ml' },
  ]},
  enzima: { itens: [
    { nome:'Hyalase',                fabricante:'Apsen Farmacêutica',               unidade:'U', apresentacao:'Frasco-ampola 150U / 200U' },
    { nome:'Hyalozima',              fabricante:'Blau Farmacêutica',                unidade:'U', apresentacao:'Frasco-ampola 150U / 200U' },
    { nome:'Hialuronidase Cristália',fabricante:'Cristália',                         unidade:'U', apresentacao:'Frasco-ampola 200U' },
    { nome:'Hylenex',                fabricante:'Halozyme Therapeutics',             unidade:'U', apresentacao:'Frasco-ampola 150U / 200U' },
    { nome:'Vitrase',                fabricante:'Bausch & Lomb',                    unidade:'U', apresentacao:'Frasco-ampola 200U' },
    { nome:'Hylase Dessau',          fabricante:'Riemser Pharma',                   unidade:'U', apresentacao:'Frasco-ampola 1.500U' },
    { nome:'Liporase',               fabricante:'Daehan New Pharm (Coreia)',         unidade:'U', apresentacao:'Frasco-ampola 20.000U' },
    { nome:'Hirax',                  fabricante:'Bharat Serums and Vaccines (Índia)',unidade:'U', apresentacao:'Frasco-ampola 1.500U' },
    { nome:'Lydase',                 fabricante:'Jiangsu Wanbang (China)',           unidade:'U', apresentacao:'Frasco-ampola 200U' },
  ]},
  fio: { itens: [
    { nome:'Mint PDO',              fabricante:'HansBiomed',               unidade:'unidade', apresentacao:'Caixa com 10–20 fios' },
    { nome:'Mint Lift',             fabricante:'HansBiomed',               unidade:'unidade', apresentacao:'Caixa com 20–100 fios' },
    { nome:'Aptos Thread',          fabricante:'Aptos',                    unidade:'unidade', apresentacao:'Caixa com 2–10 fios' },
    { nome:'Silhouette Soft (PLLA)',fabricante:'Sinclair Pharma',           unidade:'unidade', apresentacao:'Caixa com 2 fios' },
    { nome:'Happy Lift',            fabricante:'Promoitalia',              unidade:'unidade', apresentacao:'Caixa com 2–10 fios' },
    { nome:'i-Thread',              fabricante:'i-Thread Medical (Coreia)',unidade:'unidade', apresentacao:'Unidade estéril' },
    { nome:'Lead Fine Lift',        fabricante:'Medifirst (Coreia)',        unidade:'unidade', apresentacao:'Caixa com 10–20 fios' },
    { nome:'V-Loc PDO',             fabricante:'Covidien (Medtronic)',      unidade:'unidade', apresentacao:'Unidade estéril' },
    { nome:'Spring Thread',         fabricante:'Spring Thread',             unidade:'unidade', apresentacao:'Caixa com 10–20 fios' },
    { nome:'Ultra V Line',          fabricante:'Ultra V (Coreia)',          unidade:'unidade', apresentacao:'Caixa com 20–100 fios' },
    { nome:'First Lift',            fabricante:'Menarini',                 unidade:'unidade', apresentacao:'Caixa com 2–10 fios' },
    { nome:'Beaute Lift V Line',    fabricante:'Beauty Medical (Coreia)',  unidade:'unidade', apresentacao:'Caixa com 20–100 fios' },
  ]},
  lipolitico: { itens: [
    { nome:'Aqualyx',          fabricante:'Marllor Biomedical', unidade:'mL', apresentacao:'Ampola 8ml / 10ml' },
    { nome:'Belkyra (Kybella)',fabricante:'Allergan (AbbVie)',   unidade:'mL', apresentacao:'Frasco 2ml' },
  ]},
  mesoterapia: { itens: [
    { nome:'Filorga NCTF',  fabricante:'Filorga',    unidade:'mL', apresentacao:'Ampola 3ml / 5ml' },
    { nome:'Cytocare',      fabricante:'Revitacare', unidade:'mL', apresentacao:'Ampola 5ml' },
    { nome:'Dermaheal HSR', fabricante:'Caregen',    unidade:'mL', apresentacao:'Ampola 5ml' },
    { nome:'Dermaheal SR',  fabricante:'Caregen',    unidade:'mL', apresentacao:'Ampola 5ml' },
  ]},
  prp: { itens: [
    { nome:'Kit PRP RegenLab',fabricante:'RegenLab',unidade:'mL',apresentacao:'Kit tubos coleta' },
    { nome:'Kit PRP EmCyte',  fabricante:'EmCyte',  unidade:'mL',apresentacao:'Kit tubos coleta' },
  ]},
  exossomo: { itens: [
    { nome:'ASCE+ Exosome',  fabricante:'ExoCoBio',unidade:'mL',apresentacao:'Frasco 5ml' },
    { nome:'Exoxe Exosomes', fabricante:'Exoxe',   unidade:'mL',apresentacao:'Frasco 5ml' },
  ]},
  polinucleotideo: { itens: [
    { nome:'Rejuran Healer',fabricante:'Pharma Research',unidade:'mL',apresentacao:'Seringa 2ml' },
    { nome:'Plinest',       fabricante:'Mastelli',        unidade:'mL',apresentacao:'Seringa 1.5ml / 2ml' },
    { nome:'Nucleofill',    fabricante:'Promoitalia',     unidade:'mL',apresentacao:'Seringa 1.5ml / 2ml' },
  ]},
  fatorcrescimento: { itens: [
    { nome:'AQ Skin Solutions',fabricante:'AQ Skin Solutions',unidade:'mL',apresentacao:'Frasco 5ml' },
    { nome:'TNS (SkinMedica)', fabricante:'Allergan (AbbVie)', unidade:'mL',apresentacao:'Frasco 1ml–3ml' },
  ]},
}

function getRepoData() {
  try { return JSON.parse(localStorage.getItem(REPO_DATA_KEY) || 'null') || {} } catch { return {} }
}
function saveRepoData(d) { store.set(REPO_DATA_KEY, d) }

function _repoApplySeeds() {
  const d = getRepoData()
  let changed = false
  Object.entries(REPO_SEEDS).forEach(([catId, seed]) => {
    // Aplica seed se não existe ou se está no formato antigo (sem campo itens)
    if (!d[catId] || !d[catId].itens) {
      d[catId] = { itens: seed.itens.map(i => ({ ...i })) }
      changed = true
    }
  })
  if (changed) saveRepoData(d)
}

function _repoCatData(catId) {
  const d = getRepoData()
  if (!d[catId] || !d[catId].itens) d[catId] = { itens: [] }
  return d[catId]
}

// Helpers derivados dos itens
function _repoCatNomes(catId)      { return [...new Set((_repoCatData(catId).itens||[]).map(i=>i.nome))] }
function _repoCatFabs(catId)       { return [...new Set((_repoCatData(catId).itens||[]).map(i=>i.fabricante))] }
function _repoCatUnidades(catId)   { return [...new Set((_repoCatData(catId).itens||[]).map(i=>i.unidade).filter(Boolean))] }
function _repoCatApres(catId)      { return [...new Set((_repoCatData(catId).itens||[]).map(i=>i.apresentacao).filter(Boolean))] }
function _repoFindItem(catId, nome){ return (_repoCatData(catId).itens||[]).find(i=>i.nome.toLowerCase()===nome.toLowerCase()) }

function _repoAllCats() {
  return [
    ...INJ_CATEGORIAS.map(c => ({ id: c.id, nome: c.nome, builtin: true })),
    ...getCustomCats().map(c => ({ id: c.id, nome: c.nome, builtin: false }))
  ]
}

let _repoActiveCat = null
let _repoEditIdx   = null   // índice do item sendo editado (null = modo adição)

function openInjRepositorio(jumpToCatId) {
  // Migração: limpa formato antigo (arrays nomes/fabricantes) para o novo (itens)
  const existing = getRepoData()
  const needsMigration = Object.values(existing).some(v => v.nomes && !v.itens)
  if (needsMigration) {
    localStorage.removeItem(REPO_DATA_KEY)
  }
  _repoApplySeeds()
  document.getElementById('injRepoModal')?.remove()
  const el = document.createElement('div')
  el.id = 'injRepoModal'
  el.style.cssText = 'position:fixed;inset:0;z-index:9300;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px'
  el.addEventListener('click', e => { if (e.target === el) el.remove() })
  document.body.appendChild(el)
  const cats = _repoAllCats()
  if (jumpToCatId && cats.find(c => c.id === jumpToCatId)) {
    _repoActiveCat = jumpToCatId
  } else if (!_repoActiveCat || !cats.find(c => c.id === _repoActiveCat)) {
    _repoActiveCat = cats[0]?.id || null
  }
  _repoRender()
}

function _repoRender() {
  const modal = document.getElementById('injRepoModal')
  if (!modal) return
  const cats = _repoAllCats()
  const activeCat = cats.find(c => c.id === _repoActiveCat)
  const catData   = _repoActiveCat ? _repoCatData(_repoActiveCat) : null
  const itens     = catData?.itens || []

  modal.innerHTML = `
    <div class="repo-wrap">
      <div class="repo-hdr">
        <div>
          <div class="repo-hdr-title">Repositório de Dados</div>
          <div class="repo-hdr-sub">Cada linha vincula Nome → Fabricante → Unidade → Apresentação</div>
        </div>
        <button onclick="document.getElementById('injRepoModal').remove()" class="repo-close">✕</button>
      </div>

      <div class="repo-body">

        <!-- Painel esquerdo: categorias -->
        <div class="repo-cats-panel">
          <button class="repo-new-cat-btn" onclick="repoPromptNewCat()">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nova Categoria
          </button>
          <div class="repo-cats-list">
            ${cats.map(cat => `
              <div class="repo-cat-item ${_repoActiveCat === cat.id ? 'active' : ''}" onclick="repoSelectCat('${cat.id}')">
                <span class="repo-cat-name">${cat.nome}</span>
                ${!cat.builtin ? `<button class="repo-cat-del" onclick="event.stopPropagation();repoDeleteCat('${cat.id}')" title="Excluir">✕</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Painel direito: tabela de produtos vinculados -->
        <div class="repo-detail-panel" id="repoDetailPanel">
          ${activeCat ? `
            <div class="repo-detail-title">${activeCat.nome}
              <span style="font-size:11px;font-weight:400;color:#9CA3AF;margin-left:8px">${itens.length} produto${itens.length!==1?'s':''}</span>
            </div>

            <!-- Tabela -->
            <div class="repo-table-wrap">
              <table class="repo-table">
                <thead><tr>
                  <th>Nome / Marca</th><th>Fabricante</th><th>Unidade</th><th>Apresentação</th><th></th>
                </tr></thead>
                <tbody>
                  ${itens.length === 0
                    ? `<tr><td colspan="6" style="text-align:center;color:#9CA3AF;padding:20px;font-size:12px">Nenhum produto cadastrado</td></tr>`
                    : itens.map((item, i) => `
                      <tr ${_repoEditIdx === i ? 'style="background:#EFF6FF"' : ''}>
                        <td><strong>${item.nome}</strong></td>
                        <td style="color:#6B7280">${item.fabricante}</td>
                        <td style="color:#6B7280">${item.unidade}</td>
                        <td style="color:#6B7280">${item.apresentacao}</td>
                        <td style="white-space:nowrap">
                          <button class="repo-row-edit" onclick="repoItemEdit('${_repoActiveCat}',${i})" title="Editar" style="background:none;border:none;cursor:pointer;padding:3px 5px;border-radius:5px;color:#6366F1;font-size:14px;margin-right:2px" title="Editar">✎</button>
                          <button class="repo-row-del" onclick="repoItemDel('${_repoActiveCat}',${i})" title="Remover">✕</button>
                        </td>
                      </tr>`).join('')}
                </tbody>
              </table>
            </div>

            <!-- Formulário de adição / edição -->
            ${(()=>{
              const isEditing = _repoEditIdx !== null
              const editItem = isEditing ? (itens[_repoEditIdx] || {}) : {}
              return `
              <div class="repo-add-item-form" style="${isEditing?'border-top:2px solid #6366F1':''}">
                <div class="repo-add-item-title" style="${isEditing?'color:#4F46E5':''}">
                  ${isEditing ? '✎ Editar produto' : 'Adicionar produto'}
                </div>
                <div class="repo-add-item-grid">
                  <input id="ri_nome"  class="repo-inp" type="text" placeholder="Nome / Marca *" value="${isEditing?editItem.nome||'':''}" onkeydown="if(event.key==='Enter')repoItemAdd('${_repoActiveCat}')">
                  <input id="ri_fab"   class="repo-inp" type="text" placeholder="Fabricante *" value="${isEditing?editItem.fabricante||'':''}" onkeydown="if(event.key==='Enter')repoItemAdd('${_repoActiveCat}')">
                  <input id="ri_uni"   class="repo-inp" type="text" placeholder="Unidade (ex: mL)" value="${isEditing?editItem.unidade||'':''}" onkeydown="if(event.key==='Enter')repoItemAdd('${_repoActiveCat}')">
                  <input id="ri_apres" class="repo-inp" type="text" placeholder="Apresentação (ex: Seringa 1ml)" value="${isEditing?editItem.apresentacao||'':''}" onkeydown="if(event.key==='Enter')repoItemAdd('${_repoActiveCat}')">
                  <button class="repo-add-btn" style="background:${isEditing?'#4F46E5':'#7C3AED'}" onclick="repoItemAdd('${_repoActiveCat}')">
                    ${isEditing
                      ? `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px"><polyline points="20 6 9 17 4 12"/></svg> Salvar`
                      : `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar`}
                  </button>
                  ${isEditing ? `<button class="repo-add-btn" style="background:#6B7280" onclick="repoItemCancelEdit()">Cancelar</button>` : ''}
                </div>
              </div>`
            })()}
          ` : `<div class="repo-detail-empty">Selecione uma categoria à esquerda</div>`}
        </div>

      </div>
    </div>`

  featherIn(modal)
}

function repoSelectCat(id) {
  _repoActiveCat = id
  _repoEditIdx   = null   // cancela edição ao trocar categoria
  _repoRender()
}

function repoPromptNewCat() {
  const nome = prompt('Nome da nova categoria:')?.trim()
  if (!nome) return
  const id = 'custom_' + Date.now()
  const cats = getCustomCats()
  cats.push({ id, nome })
  saveCustomCats(cats)
  _repoActiveCat = id
  _repoRender()
}

function repoDeleteCat(id) {
  if (!confirm('Excluir esta categoria? Os produtos vinculados não serão afetados.')) return
  saveCustomCats(getCustomCats().filter(c => c.id !== id))
  const rd = getRepoData(); delete rd[id]; saveRepoData(rd)
  if (_repoActiveCat === id) _repoActiveCat = _repoAllCats()[0]?.id || null
  _repoRender()
}

function repoItemAdd(catId) {
  const nome  = document.getElementById('ri_nome')?.value?.trim()
  const fab   = document.getElementById('ri_fab')?.value?.trim()
  const uni   = document.getElementById('ri_uni')?.value?.trim()
  const apres = document.getElementById('ri_apres')?.value?.trim()
  if (!nome || !fab) { _toastWarn('Nome e Fabricante são obrigatórios.'); return }
  const rd = getRepoData()
  if (!rd[catId]) rd[catId] = { itens: [] }
  if (!rd[catId].itens) rd[catId].itens = []

  if (_repoEditIdx !== null) {
    // Modo edição: atualiza o item existente
    rd[catId].itens[_repoEditIdx] = { nome, fabricante: fab, unidade: uni || '', apresentacao: apres || '' }
    _repoEditIdx = null
  } else {
    // Modo adição: evita duplicata exata
    if (rd[catId].itens.some(i => i.nome.toLowerCase() === nome.toLowerCase() && i.fabricante.toLowerCase() === fab.toLowerCase())) {
      _toastWarn('Este produto já existe nesta categoria.'); return
    }
    rd[catId].itens.push({ nome, fabricante: fab, unidade: uni || '', apresentacao: apres || '' })
  }
  saveRepoData(rd)
  _repoRender()
  setTimeout(() => document.getElementById('ri_nome')?.focus(), 50)
}

function repoItemEdit(catId, idx) {
  _repoEditIdx = idx
  _repoRender()
  // Scroll suave até o formulário
  setTimeout(() => document.querySelector('.repo-add-item-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
}

function repoItemCancelEdit() {
  _repoEditIdx = null
  _repoRender()
}

function repoItemDel(catId, idx) {
  if (_repoEditIdx === idx) _repoEditIdx = null
  const rd = getRepoData()
  if (rd[catId]?.itens) {
    const item = rd[catId].itens[idx]
    if (!confirm(`Remover "${item?.nome}" do repositório?`)) return
    rd[catId].itens.splice(idx, 1)
    saveRepoData(rd)
  }
  _repoRender()
}

window.openInjRepositorio  = openInjRepositorio
window.repoSelectCat       = repoSelectCat
window.repoPromptNewCat    = repoPromptNewCat
window.repoDeleteCat       = repoDeleteCat
window.repoItemAdd         = repoItemAdd
window.repoItemEdit        = repoItemEdit
window.repoItemCancelEdit  = repoItemCancelEdit
window.repoItemDel         = repoItemDel

// ══════════════════════════════════════════════════════════════
//  MODAL DE TEMPLATES RÁPIDOS
// ══════════════════════════════════════════════════════════════
let _tplModalFab = ''
let _tplModalCat = ''
let _tplModalQ   = ''

function injDeleteCustomTpl(slug) {
  const tpls = getCustomTpls()
  delete tpls[slug]
  saveCustomTpls(tpls)
  _renderInjTemplateModal()
}
window.injDeleteCustomTpl = injDeleteCustomTpl

function injOpenNewTemplateForm() {
  document.getElementById('injTemplateModal')?.remove()
  // Mostra tela de orientação: dados devem vir do repositório
  document.getElementById('injModal')?.remove()
  const el = document.createElement('div')
  el.id = 'injModal'
  el.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px'
  el.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:460px;padding:32px;box-shadow:0 25px 60px rgba(0,0,0,.18)">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:28px">
        <div style="width:58px;height:58px;background:#F3F0FF;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <svg width="26" height="26" fill="none" stroke="#7C3AED" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        </div>
        <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:8px">Antes de criar um Template</div>
        <div style="font-size:13px;color:#6B7280;line-height:1.65">
          Os dados do template são puxados do <strong style="color:#374151">Repositório</strong>.<br>
          Certifique-se de que já estão cadastrados lá:
        </div>
      </div>

      <!-- Lista de requisitos -->
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:6px 4px;margin-bottom:24px">
        ${[
          ['M3 6h18M3 12h18M3 18h18','Categoria do produto'],
          ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z','Nome / Marca'],
          ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z','Fabricante'],
          ['M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18','Unidade (mL, U, vial...)'],
          ['M22 12h-4l-3 9L9 3l-3 9H2','Apresentação (Pó liofilizado, Gel...)']
        ].map(([path, label]) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px">
            <div style="width:30px;height:30px;background:#EDE9FE;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg width="14" height="14" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="${path}"/></svg>
            </div>
            <span style="font-size:13px;color:#374151;font-weight:500">${label}</span>
          </div>`).join('')}
      </div>

      <!-- Ações -->
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="injGoToRepoFromPrestep()" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;background:#7C3AED;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:100%">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/><path d="M8 12h8M12 8v8"/></svg>
          Abrir Repositório agora
        </button>
        <button onclick="injProceedNewTemplate()" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;background:#F3F4F6;color:#374151;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:100%">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          Já está no repositório — Criar Template
        </button>
        <button onclick="document.getElementById('injModal').remove()" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;background:transparent;color:#9CA3AF;border:none;font-size:13px;cursor:pointer;width:100%">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cancelar
        </button>
      </div>
    </div>`
  document.body.appendChild(el)
}
window.injOpenNewTemplateForm = injOpenNewTemplateForm

function injGoToRepoFromPrestep() {
  document.getElementById('injModal')?.remove()
  openInjRepositorio()
}

function injProceedNewTemplate() {
  document.getElementById('injModal')?.remove()
  _injEditId   = null
  _injFormStep = 1
  _injFormData = {}
  _renderInjForm()
}

window.injGoToRepoFromPrestep = injGoToRepoFromPrestep
window.injProceedNewTemplate  = injProceedNewTemplate

function injAddCustomTplToClinic(slug) {
  const tpl = getCustomTpls()[slug]
  if (!tpl) return
  const proto = _getProductProtocol(tpl)
  const injs  = getInj()
  const novo  = Object.assign({}, tpl, proto, {
    id: _uid(),
    created_at: new Date().toISOString(),
    _customTplSlug: undefined,
    _customTpl: undefined
  })
  injs.push(novo)
  saveInj(injs)
  renderInjetaveis()
  _renderInjTemplateModal()
  if (window._showToast) _showToast('Adicionado à clínica', tpl.nome + ' cadastrado', 'success')
}
window.injAddCustomTplToClinic = injAddCustomTplToClinic

function injEditCustomTpl(slug) {
  const tpl = getCustomTpls()[slug]
  if (!tpl) return
  document.getElementById('injTemplateModal')?.remove()
  _injEditId   = null
  _injFormStep = 1
  _injFormData = Object.assign({}, tpl)
  _injFormData._editingCustomTplSlug = slug
  _renderInjForm()
}
window.injEditCustomTpl = injEditCustomTpl

function _renderInjTemplateModal() {
  const existing = getInj().map(i => i.nome.toLowerCase())
  const customTpls = getCustomTpls()

  // Helper de filtro centralizado
  function _tplMatch(t) {
    if (_tplModalFab && t.fabricante !== _tplModalFab) return false
    if (_tplModalCat && t.categoria  !== _tplModalCat) return false
    if (_tplModalQ   && !(t.nome||'').toLowerCase().includes(_tplModalQ)) return false
    return true
  }

  // ── Seção de templates personalizados ────────────────────────
  const customEntries = Object.entries(customTpls)
  const customSection = customEntries.length ? (() => {
    const filtered = customEntries.filter(([,t]) => _tplMatch(t))
    if (!filtered.length) return ''
    const cards = filtered.map(([slug, t]) => {
      const isAdded = existing.includes((t.nome||'').toLowerCase())
      const catColor = _catColor(t.categoria)
      const catIcon  = _getCatIcon(t.categoria)
      return `
        <div style="padding:14px;border:1.5px solid #DDD6FE;border-radius:12px;background:#FAFAFF;display:flex;flex-direction:column;gap:10px;position:relative">
          <div style="position:absolute;top:8px;right:8px">
            <button onclick="injDeleteCustomTpl('${slug}')" title="Excluir template"
              style="width:22px;height:22px;border:none;background:#FEE2E2;color:#DC2626;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1">×</button>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px;padding-right:28px">
            <div style="width:34px;height:34px;border-radius:8px;flex-shrink:0;background:${catColor}18;color:${catColor};display:flex;align-items:center;justify-content:center">
              <i data-feather="${catIcon}" style="width:15px;height:15px"></i>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.nome||'Sem nome'}</div>
              <div style="font-size:11px;color:#9CA3AF;margin-top:1px">${t.fabricante||'—'}</div>
            </div>
            <span style="background:#EDE9FE;color:#7C3AED;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;flex-shrink:0;white-space:nowrap">Personalizado</span>
          </div>
          <div style="display:flex;gap:5px;margin-top:auto">
            <button onclick="injAddCustomTplToClinic('${slug}')"
              ${isAdded ? 'disabled' : ''}
              style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 0;background:${isAdded?'#F3F4F6':'#7C3AED'};color:${isAdded?'#9CA3AF':'#fff'};border:none;border-radius:8px;cursor:${isAdded?'default':'pointer'};font-size:11px;font-weight:600">
              <i data-feather="${isAdded?'check':'plus'}" style="width:11px;height:11px"></i>
              ${isAdded ? 'Adicionado' : 'Adicionar à clínica'}
            </button>
            <button onclick="injEditCustomTpl('${slug}')" title="Editar template"
              style="display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 10px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600"
              onmouseenter="this.style.background='#E5E7EB'" onmouseleave="this.style.background='#F3F4F6'">
              <i data-feather="edit-2" style="width:11px;height:11px"></i>
            </button>
          </div>
        </div>`
    }).join('')
    return `
      <div style="margin-bottom:28px;padding-bottom:24px;border-bottom:2px dashed #E5E7EB">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <div style="width:28px;height:28px;border-radius:7px;background:#EDE9FE;color:#7C3AED;display:flex;align-items:center;justify-content:center">
            <i data-feather="bookmark" style="width:13px;height:13px"></i>
          </div>
          <span style="font-size:13px;font-weight:700;color:#374151">Meus Templates</span>
          <span style="background:#EDE9FE;color:#7C3AED;font-size:11px;font-weight:700;padding:1px 8px;border-radius:20px">${filtered.length}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">${cards}</div>
      </div>`
  })() : ''

  // ── Templates de fabricantes (BRAND_TEMPLATES) ───────────────
  const filtered = Object.entries(BRAND_TEMPLATES).filter(([,t]) => _tplMatch(t))

  // Agrupar por categoria
  const grupos = {}
  filtered.forEach(([key, t]) => {
    if (!grupos[t.categoria]) grupos[t.categoria] = []
    grupos[t.categoria].push({ key, t })
  })

  const sections = Object.entries(grupos).map(([cat, items]) => {
    const catColor = _catColor(cat)
    const catIcon  = _getCatIcon(cat)
    const catNome  = _getCatNome(cat)

    const cards = items.map(({ key, t }) => {
      const isAdded = existing.includes(t.nome.toLowerCase())
      const hasPre  = (t.cuidados_pre || []).length > 0
      const hasPos  = (t.cuidados_pos || []).length > 0
      const hasCon  = (t.contraindicacoes || []).length > 0
      return `
        <div style="padding:14px;border:1.5px solid #E5E7EB;border-radius:12px;background:#fff;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:34px;height:34px;border-radius:8px;flex-shrink:0;background:${catColor}18;color:${catColor};display:flex;align-items:center;justify-content:center">
              <i data-feather="${catIcon}" style="width:15px;height:15px"></i>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.nome}</div>
              <div style="font-size:11px;color:#9CA3AF;margin-top:1px">${_getFabNome(t.fabricante)}</div>
            </div>
            ${isAdded ? `<span style="background:#F0FDF4;color:#16A34A;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;flex-shrink:0">✓ Adicionado</span>` : ''}
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <span style="background:${hasPre?'#EFF6FF':'#F9FAFB'};color:${hasPre?'#2563EB':'#9CA3AF'};font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em">Pré</span>
            <span style="background:${hasPos?'#F0FDF4':'#F9FAFB'};color:${hasPos?'#16A34A':'#9CA3AF'};font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em">Pós</span>
            <span style="background:${hasCon?'#FFF7ED':'#F9FAFB'};color:${hasCon?'#EA580C':'#9CA3AF'};font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em">Contraindicações</span>
          </div>
          <div style="display:flex;gap:5px;margin-top:auto">
            <button onclick="injAddFromTemplate('${key}')"
              ${isAdded ? 'disabled' : ''}
              style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 0;background:${isAdded?'#F3F4F6':'#7C3AED'};color:${isAdded?'#9CA3AF':'#fff'};border:none;border-radius:8px;cursor:${isAdded?'default':'pointer'};font-size:11px;font-weight:600">
              <i data-feather="${isAdded?'check':'plus'}" style="width:11px;height:11px"></i>
              ${isAdded ? 'Adicionado' : 'Adicionar'}
            </button>
            <button onclick="injDuplicateTemplate('${key}')" title="Duplicar para outra marca"
              style="display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 10px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600"
              onmouseenter="this.style.background='#E5E7EB'" onmouseleave="this.style.background='#F3F4F6'">
              <i data-feather="copy" style="width:11px;height:11px"></i>
              Duplicar
            </button>
          </div>
        </div>
      `
    }).join('')

    return `
      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <div style="width:28px;height:28px;border-radius:7px;background:${catColor}18;color:${catColor};display:flex;align-items:center;justify-content:center">
            <i data-feather="${catIcon}" style="width:13px;height:13px"></i>
          </div>
          <span style="font-size:13px;font-weight:700;color:#374151">${catNome}</span>
          <span style="background:${catColor}15;color:${catColor};font-size:11px;font-weight:700;padding:1px 8px;border-radius:20px">${items.length}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">${cards}</div>
      </div>`
  }).join('')

  // Atualizar conteúdo do modal (sem re-criar)
  const body = document.getElementById('injTplModalBody')
  if (body) {
    const allContent = customSection + sections
    body.innerHTML = allContent || '<p style="text-align:center;color:#9CA3AF;padding:32px 0">Nenhum template para este fabricante.</p>'
    featherIn(body)
  }

  // Sincronizar selects (caso render seja chamado sem interação direta)
  const sfab = document.getElementById('tplf_fab')
  const scat = document.getElementById('tplf_cat')
  if (sfab && sfab.value !== _tplModalFab) sfab.value = _tplModalFab
  if (scat && scat.value !== _tplModalCat) scat.value = _tplModalCat
}

function openInjTemplateModal() {
  _tplModalFab = ''
  _tplModalCat = ''
  _tplModalQ   = ''

  // Monta opções dos selects
  const allFabs = [...new Set([
    ...Object.values(BRAND_TEMPLATES).map(t => t.fabricante),
    ...Object.values(getCustomTpls()).map(t => t.fabricante).filter(Boolean)
  ])].sort()

  const allCats = INJ_CATEGORIAS

  const allNames = [...new Set([
    ...Object.values(BRAND_TEMPLATES).map(t => t.nome),
    ...Object.values(getCustomTpls()).map(t => t.nome).filter(Boolean)
  ])].sort()

  const selStyle = 'padding:7px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;color:#374151;background:#fff;cursor:pointer;height:34px'

  const el = document.createElement('div')
  el.id = 'injTemplateModal'
  el.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px'
  el.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:960px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <!-- Header -->
      <div style="padding:20px 24px 16px;border-bottom:1px solid #F3F4F6;flex-shrink:0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div>
            <h3 style="margin:0;font-size:17px;font-weight:700;color:#111827">Templates de Produtos</h3>
            <p style="margin:4px 0 0;font-size:12px;color:#6B7280">Adicionar insere à clínica · Duplicar abre o cadastro pré-preenchido</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="injOpenNewTemplateForm()"
              style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600">
              <i data-feather="plus" style="width:13px;height:13px"></i> Criar Template
            </button>
            <button onclick="document.getElementById('injTemplateModal').remove()"
              style="width:32px;height:32px;border:none;background:#F9FAFB;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center">
              <i data-feather="x" style="width:15px;height:15px;color:#6B7280"></i>
            </button>
          </div>
        </div>
        <!-- Filtros -->
        <div style="display:grid;grid-template-columns:1fr 1.6fr 1fr;gap:10px">
          <div>
            <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Categoria</div>
            <select id="tplf_cat" onchange="injTplModalFilter()" style="${selStyle};width:100%">
              <option value="">Todas as categorias</option>
              ${allCats.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}
            </select>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Nome do produto</div>
            <div style="position:relative">
              <input id="tplf_q" type="text" list="tplf_q_list" oninput="injTplModalFilter()" placeholder="Buscar ou selecionar nome..."
                style="${selStyle};width:100%;box-sizing:border-box;padding-left:30px">
              <i data-feather="search" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;color:#9CA3AF;pointer-events:none"></i>
              <datalist id="tplf_q_list">${allNames.map(n=>`<option value="${n}">`).join('')}</datalist>
            </div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Fabricante</div>
            <select id="tplf_fab" onchange="injTplModalFilter()" style="${selStyle};width:100%">
              <option value="">Todos os fabricantes</option>
              ${allFabs.map(f=>`<option value="${f}">${f}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div id="injTplModalBody" style="overflow-y:auto;flex:1;padding:20px 24px"></div>
    </div>
  `
  document.body.appendChild(el)
  el.addEventListener('click', e => { if (e.target === el) el.remove() })
  featherIn(el)
  _renderInjTemplateModal()
}

function injTplModalFilter() {
  _tplModalFab = document.getElementById('tplf_fab')?.value || ''
  _tplModalCat = document.getElementById('tplf_cat')?.value || ''
  _tplModalQ   = (document.getElementById('tplf_q')?.value || '').trim().toLowerCase()
  _renderInjTemplateModal()
}
window.injTplModalFilter = injTplModalFilter

function injAddFromTemplate(key) {
  const t = BRAND_TEMPLATES[key]
  if (!t) return
  const proto = _getProductProtocol(t)
  const injs = getInj()
  const novo = Object.assign({}, t, proto, { id: _uid(), created_at: new Date().toISOString() })
  injs.push(novo)
  saveInj(injs)
  renderInjetaveis()
  document.getElementById('injTemplateModal')?.remove()
  if (window._showToast) _showToast('Template adicionado', t.nome + ' cadastrado', 'success')
}

function injDuplicateTemplate(key) {
  const t = BRAND_TEMPLATES[key]
  if (!t) return
  document.getElementById('injTemplateModal')?.remove()
  // Pré-carrega os dados do template no estado do formulário e abre como novo cadastro
  // O usuário altera nome/fabricante antes de salvar
  _injEditId   = null
  _injFormStep = 1
  _injFormData = Object.assign({}, t, {
    nome: '',         // força o usuário a dar um nome próprio
    id:   null,
    created_at: null
  })
  // Abre o form; como _injFormData já está preenchido, todos os campos virão populados
  _renderInjForm()
}

// ══════════════════════════════════════════════════════════════
//  PÁGINA DE CONFIGURAÇÃO DE PRECIFICAÇÃO
// ══════════════════════════════════════════════════════════════
function renderInjConfigPrec() {
  const page = document.getElementById('page-inj-config-prec')
  if (!page) return

  const cfg = getPrecCfg()

  page.innerHTML = `
    <div style="max-width:600px;margin:0 auto;padding:8px 0">
      <div style="margin-bottom:24px">
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827">Config. Precificação</h2>
        <p style="margin:0;font-size:13px;color:#6B7280">Parâmetros globais para cálculo de margem e preço sugerido</p>
      </div>

      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:24px;margin-bottom:20px">
        <h4 style="margin:0 0 16px;font-size:14px;font-weight:700;color:#374151">Parâmetros de Margem</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${_precField('Markup padrão (%)', 'pc_markup', cfg.markup_padrao, 'Ex: 150 = preço 2.5× o custo')}
          ${_precField('Meta de margem mínima (%)', 'pc_meta', cfg.meta_margem_min, 'Alertar se margem abaixo deste valor')}
          ${_precField('Overhead / custos indiretos (%)', 'pc_overhead', cfg.overhead_pct, 'Aluguel, energia, pessoal indireto')}
          ${_precField('Impostos estimados (%)', 'pc_imposto', cfg.imposto_pct, 'Simples, ISS, etc.')}
        </div>
      </div>

      <!-- Simulador -->
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:24px;margin-bottom:20px">
        <h4 style="margin:0 0 16px;font-size:14px;font-weight:700;color:#374151">Simulador de Preço</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div>
            <label class="inj-form-label">Custo unitário (R$)</label>
            <input id="pc_sim_custo" class="inj-input" type="number" step="0.01" placeholder="0,00" oninput="injSimPreco()">
          </div>
          <div>
            <label class="inj-form-label">Preço de venda (R$)</label>
            <input id="pc_sim_preco" class="inj-input" type="number" step="0.01" placeholder="0,00" oninput="injSimPreco()">
          </div>
        </div>
        <div id="pc_sim_result" style="padding:14px;background:#F9FAFB;border-radius:10px;text-align:center;color:#9CA3AF;font-size:13px">
          Preencha custo e preço para simular
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:12px">
        <button onclick="navigateTo('injetaveis')"
          style="padding:10px 20px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;color:#374151">
          Cancelar
        </button>
        <button onclick="saveInjPrecCfg()"
          style="padding:10px 20px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600">
          Salvar Configuração
        </button>
      </div>
    </div>
  `
  featherIn(page)
}

function _precField(label, id, val, hint) {
  return `
    <div class="inj-form-group">
      <label class="inj-form-label">${label}</label>
      <input id="${id}" class="inj-input" type="number" step="0.1" value="${val}">
      <div style="font-size:11px;color:#9CA3AF;margin-top:4px">${hint}</div>
    </div>
  `
}

function saveInjPrecCfg() {
  const cfg = {
    markup_padrao:    parseFloat(document.getElementById('pc_markup')?.value)||150,
    meta_margem_min:  parseFloat(document.getElementById('pc_meta')?.value)||55,
    overhead_pct:     parseFloat(document.getElementById('pc_overhead')?.value)||12,
    imposto_pct:      parseFloat(document.getElementById('pc_imposto')?.value)||13.5,
  }
  savePrecCfg(cfg)
  if (window._showToast) _showToast('Configuração salva', 'Parâmetros de precificação atualizados', 'success')
  navigateTo('injetaveis')
}

function injSimPreco() {
  const custo = parseFloat(document.getElementById('pc_sim_custo')?.value)||0
  const preco = parseFloat(document.getElementById('pc_sim_preco')?.value)||_precoSugerido(custo)
  const prev  = document.getElementById('pc_sim_result')
  if (prev) prev.innerHTML = _injFinPreview(custo, preco||undefined)
}

// ══════════════════════════════════════════════════════════════
//  CSS EMBUTIDO
// ══════════════════════════════════════════════════════════════
;(function injectCSS() {
  const css = `
    .inj-page { padding: 8px 0; }
    .inj-header { display:flex;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px }
    .inj-header-left { flex-shrink:0 }
    .inj-header-right { display:flex;align-items:center;gap:8px;flex-wrap:wrap }
    .inj-header-sep { width:1px;height:28px;background:#E5E7EB;flex-shrink:0 }
    .inj-title  { margin:0;font-size:22px;font-weight:800;color:#111827 }
    .inj-subtitle { margin:4px 0 0;font-size:13px;color:#6B7280 }
    .inj-btn-primary   { display:flex;align-items:center;gap:6px;padding:9px 18px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;transition:all .15s }
    .inj-btn-primary:hover   { background:#6D28D9;transform:translateY(-1px) }
    .inj-btn-secondary { display:flex;align-items:center;gap:6px;padding:9px 18px;background:#F5F3FF;color:#7C3AED;border:1px solid #DDD6FE;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;transition:all .15s }
    .inj-btn-secondary:hover { background:#EDE9FE }
    .inj-btn-sm { padding:7px 12px;font-size:12px }

    .inj-search-wrap { display:flex;align-items:center;gap:6px;padding:0 10px;background:#fff;border:1px solid #E5E7EB;border-radius:9px;height:34px }
    .inj-search { width:210px;padding:0;border:none;outline:none;font-size:13px;color:#374151 }
    .inj-select { padding:0 10px;height:34px;background:#fff;border:1px solid #E5E7EB;border-radius:9px;font-size:12px;color:#374151;cursor:pointer;outline:none }

    .inj-stats-row { display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px }
    .inj-stat-card { background:#fff;border-radius:12px;padding:16px;border:1px solid #F3F4F6;display:flex;align-items:center;gap:12px;box-shadow:0 1px 4px rgba(0,0,0,.04) }
    .inj-stat-icon { width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0 }
    .inj-stat-num  { font-size:22px;font-weight:800;line-height:1 }
    .inj-stat-label { font-size:11px;color:#9CA3AF;margin-top:2px }

    .inj-content-bar { display:flex;align-items:center;justify-content:space-between;margin-bottom:8px }
    .inj-result-count { font-size:12px;color:#9CA3AF;font-weight:500 }
    .inj-view-toggle { display:flex;gap:2px;background:#F3F4F6;border-radius:9px;padding:3px }
    .inj-view-btn { width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:none;border-radius:7px;cursor:pointer;color:#9CA3AF;transition:all .15s }
    .inj-view-btn.active { background:#fff;color:#7C3AED;box-shadow:0 1px 4px rgba(0,0,0,.1) }

    .inj-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px }
    .inj-card { background:#fff;border-radius:12px;border:1px solid #F3F4F6;overflow:hidden;cursor:pointer;transition:box-shadow .15s,transform .15s;box-shadow:0 1px 4px rgba(0,0,0,.04) }
    .inj-card:hover { box-shadow:0 6px 20px rgba(0,0,0,.1);transform:translateY(-2px) }
    .inj-card-header { padding:12px 14px;display:flex;align-items:center;gap:10px }
    .inj-card-icon  { width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0 }
    .inj-card-nome  { font-size:13px;font-weight:700;color:#111827;line-height:1.3 }
    .inj-card-fab   { font-size:11px;color:#9CA3AF;margin-top:2px }
    .inj-card-body  { padding:0 14px 12px }
    .inj-card-cat-badge { display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600 }
    .inj-card-actions { padding:8px 14px;border-top:1px solid #F9FAFB;display:flex;gap:6px;justify-content:flex-end }
    .inj-card-btn { width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid #E5E7EB;background:#fff;border-radius:7px;cursor:pointer;color:#6B7280;transition:all .15s }
    .inj-card-btn:hover { background:#F3F4F6;color:#374151 }
    .inj-card-btn.danger:hover { background:#FEE2E2;color:#DC2626;border-color:#FECACA }

    .inj-list-table { background:#fff;border-radius:12px;border:1px solid #F3F4F6;overflow:hidden }
    .inj-list-table table { width:100%;border-collapse:collapse }
    .inj-list-table th { padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;background:#F9FAFB;border-bottom:1px solid #F3F4F6}
    .inj-list-table td { padding:10px 10px;font-size:13px;color:#374151;border-bottom:1px solid #F9FAFB }
    .inj-list-table tr:last-child td { border-bottom:none }
    .inj-list-table tr:hover td { background:#F9FAFB }
    .inj-badge { display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600 }
    .inj-ok  { color:#059669;font-weight:700 }
    .inj-low { color:#DC2626;font-weight:700 }

    .inj-empty { text-align:center;padding:60px 20px;color:#9CA3AF }
    .inj-empty h3 { margin:16px 0 8px;font-size:16px;color:#374151 }
    .inj-empty p  { margin:0 0 20px;font-size:13px }

    .inj-form-group { margin-bottom:14px }
    .inj-form-label { display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px }
    .inj-input { width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:9px;font-size:13px;color:#374151;outline:none;box-sizing:border-box;transition:border .15s }
    .inj-input:focus { border-color:#7C3AED;box-shadow:0 0 0 3px rgba(124,58,237,.1) }
    textarea.inj-input { resize:vertical }

    .inj-checkbox-group { display:flex;flex-wrap:wrap;gap:6px;max-height:160px;overflow-y:auto;padding:6px;border:1px solid #E5E7EB;border-radius:9px }
    .inj-checkbox-label { display:flex;align-items:center;gap:6px;padding:5px 10px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:20px;cursor:pointer;font-size:12px;color:#374151;transition:all .1s }
    .inj-checkbox-label input { display:none }
    .inj-checkbox-label:has(input:checked) { background:#EDE9FE;border-color:#C4B5FD;color:#7C3AED;font-weight:600 }

    /* ── Repositório ─────────────────────────────────────── */
    .repo-wrap { background:#fff;border-radius:18px;width:100%;max-width:900px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.22) }
    .repo-hdr { padding:18px 24px 14px;border-bottom:1px solid #F3F4F6;display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0 }
    .repo-hdr-title { font-size:16px;font-weight:700;color:#111827 }
    .repo-hdr-sub { font-size:12px;color:#9CA3AF;margin-top:2px }
    .repo-close { width:28px;height:28px;border:none;background:#F9FAFB;border-radius:8px;cursor:pointer;font-size:16px;color:#6B7280;display:flex;align-items:center;justify-content:center;line-height:1 }
    .repo-body { display:flex;flex:1;overflow:hidden }

    .repo-cats-panel { width:210px;flex-shrink:0;border-right:1px solid #F3F4F6;display:flex;flex-direction:column;overflow:hidden }
    .repo-new-cat-btn { margin:12px;display:flex;align-items:center;gap:6px;padding:8px 12px;background:#7C3AED;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s }
    .repo-new-cat-btn:hover { background:#6D28D9 }
    .repo-cats-list { overflow-y:auto;flex:1;padding:4px 8px 12px }
    .repo-cat-item { display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:9px;cursor:pointer;font-size:13px;color:#374151;font-weight:500;transition:all .12s;margin-bottom:2px }
    .repo-cat-item:hover { background:#F5F3FF }
    .repo-cat-item.active { background:#EDE9FE;color:#7C3AED;font-weight:700 }
    .repo-cat-name { flex:1;line-height:1.3 }
    .repo-cat-del { background:none;border:none;color:#D1D5DB;cursor:pointer;font-size:13px;padding:0 2px;line-height:1;transition:color .1s }
    .repo-cat-del:hover { color:#EF4444 }

    .repo-detail-panel { flex:1;overflow-y:auto;padding:20px }
    .repo-detail-title { font-size:15px;font-weight:700;color:#111827;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #F3F4F6 }
    .repo-detail-empty { display:flex;align-items:center;justify-content:center;height:100%;font-size:13px;color:#9CA3AF }

    .repo-table-wrap { overflow-x:auto;margin-bottom:16px;border:1px solid #F3F4F6;border-radius:10px }
    .repo-table { width:100%;border-collapse:collapse;font-size:12px }
    .repo-table thead tr { background:#F9FAFB }
    .repo-table th { padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9CA3AF;white-space:nowrap }
    .repo-table td { padding:9px 12px;border-top:1px solid #F3F4F6;vertical-align:middle }
    .repo-table tbody tr:hover { background:#FAFAFA }
    .repo-row-del { background:none;border:none;color:#D1D5DB;cursor:pointer;font-size:13px;padding:0 4px;line-height:1;transition:color .1s }
    .repo-row-del:hover { color:#EF4444 }
    .repo-add-item-form { background:#F9FAFB;border-radius:10px;padding:14px;border:1px dashed #E5E7EB }
    .repo-add-item-title { font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px }
    .repo-add-item-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px }
    .repo-add-item-grid button { grid-column:1/-1 }
    .repo-inp { flex:1;padding:7px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none;color:#374151 }
    .repo-inp:focus { border-color:#7C3AED }
    .repo-add-btn { display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:opacity .15s }
    .repo-add-btn:hover { opacity:.85 }
  `
  const s = document.createElement('style')
  s.textContent = css
  document.head.appendChild(s)
})()

// ══════════════════════════════════════════════════════════════
//  SUB-ABA DENTRO DE CONFIGURAÇÕES > INJETÁVEIS
// ══════════════════════════════════════════════════════════════
function injSettingsTab(tab) {
  const divCad  = document.getElementById('page-injetaveis')
  const divPrec = document.getElementById('page-inj-config-prec')
  const btnCad  = document.getElementById('injtab_cadastro')
  const btnPrec = document.getElementById('injtab_prec')
  if (!divCad || !divPrec) return
  const isCad = tab === 'cadastro'
  divCad.style.display  = isCad ? '' : 'none'
  divPrec.style.display = isCad ? 'none' : ''
  if (btnCad) {
    btnCad.style.background = isCad ? 'linear-gradient(135deg,#7C3AED,#5B21B6)' : 'none'
    btnCad.style.color      = isCad ? '#fff' : '#6B7280'
  }
  if (btnPrec) {
    btnPrec.style.background = isCad ? 'none' : 'linear-gradient(135deg,#7C3AED,#5B21B6)'
    btnPrec.style.color      = isCad ? '#6B7280' : '#fff'
  }
  if (isCad)  renderInjetaveis()
  else        renderInjConfigPrec()
}

// ══════════════════════════════════════════════════════════════
//  HOOK DE NAVEGAÇÃO — redireciona sidebar para settings
// ══════════════════════════════════════════════════════════════
const _injOrigNav = window.navigateTo
window.navigateTo = function(pageId) {
  if (pageId === 'injetaveis' || pageId === 'inj-config-prec') {
    // Navegar para a página de Configurações e ativar aba Injetáveis
    _injOrigNav('settings-clinic')
    setTimeout(() => {
      if (window.settingsTab) window.settingsTab('injectables')
      if (pageId === 'inj-config-prec') setTimeout(() => injSettingsTab('prec'), 60)
    }, 30)
    return
  }
  _injOrigNav(pageId)
}

// ══════════════════════════════════════════════════════════════
//  EXPORTS GLOBAIS
// ══════════════════════════════════════════════════════════════
window.injSettingsTab     = injSettingsTab
window.renderInjetaveis   = renderInjetaveis
window.openInjForm        = openInjForm
window.closeInjForm       = closeInjForm
window.injFormNext        = injFormNext
window.injFormPrev        = injFormPrev
window.injFormGoStep      = injFormGoStep
window.saveInjForm        = saveInjForm
window.injApplyTemplate   = injApplyTemplate
window.injUpdatePrecoSugerido = injUpdatePrecoSugerido
window.injUpdateMargem    = injUpdateMargem
window.injSetFilter       = injSetFilter
window.injSetView         = injSetView
window.openInjDetail      = openInjDetail
window.openInjDetailFin   = openInjDetailFin
window.injDetailTab       = injDetailTab
window.deleteInj          = deleteInj
window.openInjTemplateModal = openInjTemplateModal
window.injAddFromTemplate  = injAddFromTemplate
window.injDuplicateTemplate = injDuplicateTemplate
window.renderInjConfigPrec = renderInjConfigPrec
window.saveInjPrecCfg     = saveInjPrecCfg
window.injSimPreco        = injSimPreco

})()
