-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-46 · clinicai-v2 · Contrato Parceria B2B (default)        ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: ferramenta de Assinatura no detail de parceria ║
-- ║ estava listando docs clinicos (TCLEs · 28 templates) em vez de contrato ║
-- ║ de parceria. Faltava template default + filtro UI.                      ║
-- ║                                                                          ║
-- ║ Esta mig:                                                                ║
-- ║   1. Cria template contrato-parceria-b2b · doc_type='parceria'          ║
-- ║   2. Variables: parceira_nome · parceira_responsavel · parceira_email   ║
-- ║      · parceira_phone · voucher_combo · voucher_validity_days           ║
-- ║      · voucher_monthly_cap · contrato_data · contrato_duracao_meses     ║
-- ║      · clinica_nome · clinica_cnpj · clinica_endereco · clinica_email   ║
-- ║      · clinica_phone                                                    ║
-- ║                                                                          ║
-- ║ Conteudo: contrato simples mas profissional · clinica + parceira ·      ║
-- ║ termos de voucher · LGPD · vigencia · jurisdicao Maringa-PR.            ║
-- ║                                                                          ║
-- ║ Frontend correspondente filtra doc_type='parceria' na tab Documentos    ║
-- ║ do partnership detail (esconde TCLEs clinicos).                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

INSERT INTO public.legal_doc_templates
  (clinic_id, slug, name, doc_type, content, variables, is_active, version)
SELECT
  c.id,
  'contrato-parceria-b2b',
  'Contrato de Parceria B2B',
  'parceria',
  E'CONTRATO DE PARCERIA COMERCIAL\n\n' ||
  E'**Contratante:** {clinica_nome}, inscrita no CNPJ sob o nº {clinica_cnpj}, com sede em {clinica_endereco}, neste ato representada por sua sócia administradora Dra. Mirian de Paula.\n\n' ||
  E'**Parceira:** {parceira_nome}, neste ato representada por {parceira_responsavel}, e-mail {parceira_email}, telefone {parceira_phone}.\n\n' ||
  E'As partes acima qualificadas, doravante denominadas em conjunto **PARTES**, têm entre si justo e contratado o presente instrumento de Parceria Comercial, que se regerá pelas cláusulas e condições seguintes:\n\n' ||
  E'## CLÁUSULA 1ª · OBJETO\n\n' ||
  E'O presente contrato tem por objeto estabelecer parceria comercial entre as PARTES, mediante a indicação mútua de pessoas físicas (convidadas) para usufruir dos serviços de estética e bem-estar prestados pela Contratante, sob a forma de **Voucher Cortesia**.\n\n' ||
  E'## CLÁUSULA 2ª · DO VOUCHER\n\n' ||
  E'**§1º** A Contratante disponibilizará à Parceira vouchers no formato **{voucher_combo}**, com validade de {voucher_validity_days} dias contados da emissão.\n\n' ||
  E'**§2º** O limite mensal de emissão é de até {voucher_monthly_cap} vouchers, sendo a referida quantidade reajustável mediante acordo escrito entre as PARTES.\n\n' ||
  E'**§3º** Cada voucher representa uma cortesia única e intransferível, sendo destinado a pessoa física distinta da Parceira ou de seus prepostos.\n\n' ||
  E'## CLÁUSULA 3ª · DA INDICAÇÃO\n\n' ||
  E'**§1º** A Parceira compromete-se a indicar pessoas alinhadas ao perfil ético e estético da Contratante, vedada a indicação para fins meramente comerciais ou em conflito com a missão da clínica.\n\n' ||
  E'**§2º** A Parceira reconhece que toda indicação será livremente avaliada pela Contratante, que poderá recusar emissão de voucher mediante justificativa formal.\n\n' ||
  E'## CLÁUSULA 4ª · CONTRAPARTIDAS\n\n' ||
  E'A relação entre as PARTES é de natureza colaborativa, não havendo obrigação de pagamento financeiro entre si. Eventuais contrapartidas (presença em eventos, posts em redes sociais, descontos especiais à Parceira) serão tratadas em adendo específico.\n\n' ||
  E'## CLÁUSULA 5ª · LGPD\n\n' ||
  E'**§1º** As PARTES reconhecem-se mutuamente como Controladoras de dados pessoais (LGPD · Lei 13.709/2018), comprometendo-se a tratá-los com finalidade legítima, transparência e segurança.\n\n' ||
  E'**§2º** Os dados das convidadas indicadas serão tratados pela Contratante para emissão e acompanhamento dos vouchers, bem como para eventual prestação de serviços, mediante consentimento específico.\n\n' ||
  E'## CLÁUSULA 6ª · VIGÊNCIA\n\n' ||
  E'**§1º** O presente contrato terá vigência de {contrato_duracao_meses} meses, contados a partir de {contrato_data}, prorrogando-se automaticamente por igual período salvo manifestação contrária de qualquer das PARTES com antecedência mínima de 30 (trinta) dias.\n\n' ||
  E'**§2º** Qualquer das PARTES poderá rescindir o presente instrumento, a qualquer tempo, mediante notificação prévia de 30 (trinta) dias, sem ônus.\n\n' ||
  E'## CLÁUSULA 7ª · DISPOSIÇÕES GERAIS\n\n' ||
  E'**§1º** Toda alteração ao presente contrato deverá ser formalizada por escrito, mediante adendo assinado pelas PARTES.\n\n' ||
  E'**§2º** O presente contrato não estabelece vínculo trabalhista, societário ou de representação entre as PARTES.\n\n' ||
  E'## CLÁUSULA 8ª · FORO\n\n' ||
  E'As PARTES elegem o foro da Comarca de Maringá, Estado do Paraná, para dirimir quaisquer controvérsias oriundas do presente contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.\n\n' ||
  E'E por estarem assim justas e contratadas, as PARTES firmam o presente instrumento na forma digital, com igual teor para todos os fins de direito.\n\n' ||
  E'Maringá-PR, {contrato_data}.\n\n' ||
  E'---\n\n' ||
  E'**{clinica_nome}**\n' ||
  E'CNPJ: {clinica_cnpj}\n' ||
  E'Dra. Mirian de Paula\n\n' ||
  E'---\n\n' ||
  E'**{parceira_nome}**\n' ||
  E'Representante: {parceira_responsavel}\n' ||
  E'(assinatura digital coletada por canvas)',
  '{
    "parceira_nome": "Nome da parceria/empresa",
    "parceira_responsavel": "Nome completo da contato responsável",
    "parceira_email": "E-mail da parceira",
    "parceira_phone": "WhatsApp/telefone da parceira",
    "voucher_combo": "Combo cortesia (ex: veu_noiva+anovator)",
    "voucher_validity_days": "Validade em dias",
    "voucher_monthly_cap": "Limite mensal de emissão",
    "contrato_data": "Data do contrato (ex: 26 de abril de 2026)",
    "contrato_duracao_meses": "Duração em meses (ex: 12)",
    "clinica_nome": "Razão social da clínica",
    "clinica_cnpj": "CNPJ formatado",
    "clinica_endereco": "Endereço completo",
    "clinica_email": "E-mail clínica",
    "clinica_phone": "Telefone clínica"
  }'::jsonb,
  true,
  1
  FROM public.clinics c
ON CONFLICT (clinic_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  doc_type = EXCLUDED.doc_type,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  is_active = true,
  updated_at = now();

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.legal_doc_templates
   WHERE slug='contrato-parceria-b2b' AND is_active=true;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL: contrato-parceria-b2b nao foi seedado';
  END IF;
  RAISE NOTICE '✅ Mig 800-46 OK · % template(s) contrato-parceria-b2b ativo(s)', v_count;
END $$;

COMMIT;
