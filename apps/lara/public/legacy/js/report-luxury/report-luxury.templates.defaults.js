/**
 * ClinicAI - Report Luxury Templates Defaults
 *
 * Catalogo de TODOS os textos editaveis do report.
 * Cada chave segue dot-notation organizada por bloco.
 *
 * Estrutura:
 *   { key, label, defaultValue, multiline, group }
 *
 * O editor admin renderiza um campo por entry.
 * O renderer consulta TemplatesService.get(key) que faz fallback aqui.
 *
 * IMPORTANTE: nao remover chaves existentes — sempre adicionar novas
 * com migration suave (renderer continua funcionando para chaves antigas).
 */
;(function () {
  'use strict'
  if (window.ReportLuxuryTemplatesDefaults) return

  // Grupos = abas no editor admin
  var GROUPS = [
    { id: 'identity',    label: 'Identidade' },
    { id: 'credentials', label: 'Credenciais' },
    { id: 'diagnosis',   label: 'Diagnóstico' },
    { id: 'protocol',    label: 'Protocolo' },
    { id: 'timeline',    label: 'Linha do Tempo 5D' },
    { id: 'cashback',    label: 'Cashback Fotona' },
    { id: 'includes',    label: 'Inclusos' },
    { id: 'faqs',        label: 'FAQs' },
    { id: 'commercial',  label: 'Investimento + CTA' },
    { id: 'letter',      label: 'Carta default' },
  ]

  // Cada entry: { key, label, default, multiline?, group }
  var ENTRIES = [
    // ── Identidade ──────────────────────────────────────────
    { key: 'slogan.headline_main', group: 'identity', label: 'Slogan principal (capa) — use <em>palavra</em> para destacar', multiline: true,
      default: 'Seu rosto deveria mostrar <em>quem você é</em><br>— não quanto o tempo passou.' },
    { key: 'slogan.flat',          group: 'identity', label: 'Slogan plano (pull quote + CTA, 1 linha)', multiline: true,
      default: 'Seu rosto deveria mostrar <em>quem você é</em> — não quanto o tempo passou.' },
    { key: 'tagline',              group: 'identity', label: 'Tagline (capa, abaixo do nome)', multiline: false,
      default: 'Harmonia que revela. Precisão que dura.' },
    { key: 'pullquote.attribution', group: 'identity', label: 'Atribuição do pull quote', multiline: false,
      default: 'Filosofia · Clínica Mirian de Paula' },

    // ── Credenciais ─────────────────────────────────────────
    { key: 'credentials.item1.num',   group: 'credentials', label: 'Credencial 1 — número', default: '1.200+' },
    { key: 'credentials.item1.label', group: 'credentials', label: 'Credencial 1 — descrição', default: 'Protocolos realizados' },
    { key: 'credentials.item2.num',   group: 'credentials', label: 'Credencial 2 — número', default: 'Fotona' },
    { key: 'credentials.item2.label', group: 'credentials', label: 'Credencial 2 — descrição', default: 'Dynamis NX exclusiva' },
    { key: 'credentials.item3.num',   group: 'credentials', label: 'Credencial 3 — número', default: 'Desde 2018' },
    { key: 'credentials.item3.label', group: 'credentials', label: 'Credencial 3 — descrição', default: 'Atendimento personalizado' },

    // ── Diagnóstico ─────────────────────────────────────────
    { key: 'diagnosis.kicker', group: 'diagnosis', label: 'Kicker (acima do título)', default: 'Diagnóstico' },
    { key: 'diagnosis.title',  group: 'diagnosis', label: 'Título da seção (use <em>)', default: 'Os <em>mapas</em> do seu rosto' },
    { key: 'diagnosis.lead',   group: 'diagnosis', label: 'Descrição', multiline: true,
      default: 'Análise 3D facial completa: ângulos cefalométricos, proporções, simetria e linha estética.' },

    // ── Protocolo ───────────────────────────────────────────
    { key: 'protocol.kicker',     group: 'protocol', label: 'Kicker', default: 'Protocolo proposto' },
    { key: 'protocol.title_pre',  group: 'protocol', label: 'Título prefixo (antes do número de zonas)', default: '' },
    { key: 'protocol.title_post', group: 'protocol', label: 'Título sufixo (depois do número, com <em>)', default: 'zonas, <em>uma sessão</em>' },
    { key: 'protocol.lead',       group: 'protocol', label: 'Descrição', multiline: true,
      default: 'Cada intervenção foi desenhada para potencializar as outras.' },

    // ── Linha do Tempo Lifting 5D ───────────────────────────
    { key: 'timeline.kicker', group: 'timeline', label: 'Kicker', default: 'Método Lifting 5D' },
    { key: 'timeline.title',  group: 'timeline', label: 'Título (use <em>)', default: 'A jornada da sua <em>harmonia</em>' },
    { key: 'timeline.lead',   group: 'timeline', label: 'Descrição', multiline: true,
      default: 'O protocolo integrado se desenvolve em fases — cada uma respeita o tempo biológico do colágeno e potencializa a anterior. Não é evento isolado, é <em>processo contínuo</em>.' },

    { key: 'timeline.stage1.when',  group: 'timeline', label: 'Estágio 1 — marco', default: 'MÊS 0' },
    { key: 'timeline.stage1.title', group: 'timeline', label: 'Estágio 1 — título', default: 'Avaliação completa' },
    { key: 'timeline.stage1.text',  group: 'timeline', label: 'Estágio 1 — descrição', multiline: true,
      default: 'Scanner Anovator A5, leitura facial 3D e planejamento personalizado com a Dra. Mirian.' },

    { key: 'timeline.stage2.when',  group: 'timeline', label: 'Estágio 2 — marco', default: 'MÊS 1' },
    { key: 'timeline.stage2.title', group: 'timeline', label: 'Estágio 2 — título', default: 'Sessão integrada' },
    { key: 'timeline.stage2.text',  group: 'timeline', label: 'Estágio 2 — descrição', multiline: true,
      default: 'Aplicação dos injetáveis em todas as zonas planejadas + primeira sessão de Fotona 4D.' },

    { key: 'timeline.stage3.when',  group: 'timeline', label: 'Estágio 3 — marco', default: 'MÊS 2' },
    { key: 'timeline.stage3.title', group: 'timeline', label: 'Estágio 3 — título', default: 'Segunda sessão Fotona' },
    { key: 'timeline.stage3.text',  group: 'timeline', label: 'Estágio 3 — descrição', multiline: true,
      default: 'Estímulo profundo de colágeno e elastina nas 4 camadas da pele.' },

    { key: 'timeline.stage4.when',  group: 'timeline', label: 'Estágio 4 — marco', default: 'MÊS 3' },
    { key: 'timeline.stage4.title', group: 'timeline', label: 'Estágio 4 — título', default: 'Terceira Fotona + retoque' },
    { key: 'timeline.stage4.text',  group: 'timeline', label: 'Estágio 4 — descrição', multiline: true,
      default: 'Conclusão do ciclo Fotona e ajuste fino dos injetáveis se necessário.' },

    { key: 'timeline.stage5.when',  group: 'timeline', label: 'Estágio 5 — marco', default: 'MÊS 6' },
    { key: 'timeline.stage5.title', group: 'timeline', label: 'Estágio 5 — título', default: 'Avaliação evolutiva' },
    { key: 'timeline.stage5.text',  group: 'timeline', label: 'Estágio 5 — descrição', multiline: true,
      default: 'Comparação com baseline, registro fotográfico, decisão sobre continuidade.' },

    { key: 'timeline.stage6.when',  group: 'timeline', label: 'Estágio 6 — marco', default: 'MÊS 12' },
    { key: 'timeline.stage6.title', group: 'timeline', label: 'Estágio 6 — título', default: 'Manutenção anual' },
    { key: 'timeline.stage6.text',  group: 'timeline', label: 'Estágio 6 — descrição', multiline: true,
      default: 'Programa contínuo com 40% de benefício exclusivo em Fotona e condições especiais para retoques.' },

    // ── Cashback ────────────────────────────────────────────
    { key: 'cashback.badge',    group: 'cashback', label: 'Badge superior', default: 'Diferencial Mirian de Paula' },
    { key: 'cashback.headline', group: 'cashback', label: 'Título (use <em>)', multiline: true,
      default: 'Seu investimento volta integralmente como <em>cashback</em> para Fotona 4D' },
    { key: 'cashback.body',     group: 'cashback', label: 'Corpo', multiline: true,
      default: '<strong>O que isso significa:</strong> tudo que você investe nos injetáveis acima retorna como crédito para sessões da tecnologia <em>Fotona Dynamis NX</em> — o melhor laser do mundo para harmonização não-cirúrgica.\n\nEm outras clínicas a Fotona é cobrada à parte. Aqui, ela faz parte do mesmo caminho — porque <em>cuidar do seu rosto não é evento isolado, é processo contínuo</em>.' },
    { key: 'cashback.pillar1.label', group: 'cashback', label: 'Pilar 1 — kicker', default: 'Lifting natural' },
    { key: 'cashback.pillar1.text',  group: 'cashback', label: 'Pilar 1 — texto',  default: 'Firmeza progressiva sem cirurgia' },
    { key: 'cashback.pillar2.label', group: 'cashback', label: 'Pilar 2 — kicker', default: 'Colágeno e elastina' },
    { key: 'cashback.pillar2.text',  group: 'cashback', label: 'Pilar 2 — texto',  default: 'Produção intensa nas 4 camadas' },
    { key: 'cashback.pillar3.label', group: 'cashback', label: 'Pilar 3 — kicker', default: 'Acompanhamento' },
    { key: 'cashback.pillar3.text',  group: 'cashback', label: 'Pilar 3 — texto',  default: 'Programa contínuo, não procedimento solto' },

    // ── Inclusos ────────────────────────────────────────────
    { key: 'includes.kicker', group: 'includes', label: 'Kicker', default: 'O que está incluso' },
    { key: 'includes.title',  group: 'includes', label: 'Título (use <em>)', default: 'Cada item pensado para o resultado <em>integral</em>' },
    { key: 'includes.item1.name', group: 'includes', label: 'Item 1 — nome', default: 'Avaliação inicial Anovator A5' },
    { key: 'includes.item1.desc', group: 'includes', label: 'Item 1 — descrição', default: 'Scanner 3D facial mais avançado, com 50+ relatórios' },
    { key: 'includes.item2.name', group: 'includes', label: 'Item 2 — nome', default: 'Sessão única integrada' },
    { key: 'includes.item2.desc', group: 'includes', label: 'Item 2 — descrição', default: 'Todas as zonas em um único atendimento personalizado' },
    { key: 'includes.item3.name', group: 'includes', label: 'Item 3 — nome', default: 'Retoque em 30 dias' },
    { key: 'includes.item3.desc', group: 'includes', label: 'Item 3 — descrição', default: 'Ajuste fino de assimetrias, sem custo adicional' },
    { key: 'includes.item4.name', group: 'includes', label: 'Item 4 — nome', default: 'Acompanhamento por 6 meses' },
    { key: 'includes.item4.desc', group: 'includes', label: 'Item 4 — descrição', default: 'Visitas de revisão e mensagens diretas com a equipe' },
    { key: 'includes.item5.name', group: 'includes', label: 'Item 5 — nome (cashback)', default: 'Cashback integral em Fotona 4D' },
    { key: 'includes.item5.desc', group: 'includes', label: 'Item 5 — descrição (cashback)', default: 'Crédito total do investimento para sessões da tecnologia' },
    { key: 'includes.item6.name', group: 'includes', label: 'Item 6 — nome', default: 'Prontuário digital completo' },
    { key: 'includes.item6.desc', group: 'includes', label: 'Item 6 — descrição', default: 'Histórico fotográfico e métricas evolutivas' },

    // ── FAQs ────────────────────────────────────────────────
    { key: 'faq.kicker', group: 'faqs', label: 'Kicker', default: 'Antes de seguir' },
    { key: 'faq.title',  group: 'faqs', label: 'Título (use <em>)', default: 'Três perguntas que <em>costumam vir antes</em>' },
    { key: 'faq.q1', group: 'faqs', label: 'Pergunta 1', default: 'E se o resultado não for o que eu esperava?' },
    { key: 'faq.a1', group: 'faqs', label: 'Resposta 1', multiline: true,
      default: 'Conversamos com calma sobre suas expectativas antes da sessão e fazemos um <em>retoque de ajuste em 30 dias</em> sem custo. O acompanhamento por seis meses garante que cada detalhe seja revisado em conjunto.' },
    { key: 'faq.q2', group: 'faqs', label: 'Pergunta 2', default: 'Quanto tempo dura o resultado?' },
    { key: 'faq.a2', group: 'faqs', label: 'Resposta 2', multiline: true,
      default: 'Os efeitos do ácido hialurônico têm duração média de 12 a 18 meses, e a toxina de 4 a 6 meses. Mas o que dá <em>longevidade real ao seu rosto</em> é a regularidade da Fotona — por isso o cashback existe: para que o cuidado seja contínuo.' },
    { key: 'faq.q3', group: 'faqs', label: 'Pergunta 3', default: 'Por que sessão única, e não dividida em várias visitas?' },
    { key: 'faq.a3', group: 'faqs', label: 'Resposta 3', multiline: true,
      default: 'Porque o resultado natural depende de <em>equilíbrio simultâneo</em>. Quando uma zona é tratada isoladamente, ela puxa a percepção sem que as outras acompanhem. A sessão integrada respeita a anatomia como ela é: um sistema, não partes.' },

    // ── Investimento + CTA ──────────────────────────────────
    { key: 'investment.kicker',     group: 'commercial', label: 'Kicker do investimento', default: 'Investimento' },
    { key: 'investment.label',      group: 'commercial', label: 'Label acima do valor', default: 'Protocolo completo' },
    { key: 'cta.button_text',       group: 'commercial', label: 'Texto do botão CTA', default: 'Agendar conversa' },
    { key: 'cta.reassurance',       group: 'commercial', label: 'Texto de reasseguramento abaixo do botão', multiline: true,
      default: 'Sem compromisso. Conversamos com calma sobre o protocolo.' },
    { key: 'anchor.title',          group: 'commercial', label: 'Título da ancoragem (use <em>)', default: 'Por que <em>integrado</em> custa menos que separado' },
    { key: 'anchor.note',           group: 'commercial', label: 'Nota da ancoragem', multiline: true,
      default: 'Os mesmos materiais, a mesma anatomia. A diferença está no <em>planejamento integrado</em> — uma sessão única, sem retrabalho, sem doses redundantes.' },

    // ── Carta padrão ────────────────────────────────────────
    { key: 'letter.kicker', group: 'letter', label: 'Kicker', default: 'Carta de abertura' },
    { key: 'letter.title',  group: 'letter', label: 'Título', default: 'Sobre a leitura que fizemos do seu rosto' },
    { key: 'letter.body',   group: 'letter', label: 'Corpo padrão (editável também por sessão)', multiline: true,
      default: 'O que veremos a seguir não é uma lista de procedimentos. É a tradução do que <em>seu rosto está pedindo</em> — observado com calma, medido com precisão e desenhado para preservar quem você é.\n\nCada zona indicada tem motivo. Cada dose tem proporção. Nada aqui é pensado para te transformar em outra pessoa: tudo aqui é pensado para <em>te devolver coerência entre dentro e fora</em>.' },
    { key: 'letter.role',   group: 'letter', label: 'Papel/cargo abaixo da assinatura', default: 'Especialista em Harmonização Facial' },

    // ── Footer ──────────────────────────────────────────────
    { key: 'footer.confidentiality', group: 'commercial', label: 'Texto de confidencialidade do rodapé', default: 'DOCUMENTO CLÍNICO CONFIDENCIAL' },
  ]

  // Mapa rapido por chave
  var BY_KEY = {}
  ENTRIES.forEach(function (e) { BY_KEY[e.key] = e })

  window.ReportLuxuryTemplatesDefaults = {
    GROUPS: GROUPS,
    ENTRIES: ENTRIES,
    BY_KEY: BY_KEY,
    getDefault: function (key) {
      var e = BY_KEY[key]
      return e ? e.default : null
    },
  }
})()
