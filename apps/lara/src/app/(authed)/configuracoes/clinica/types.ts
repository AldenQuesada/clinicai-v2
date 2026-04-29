/**
 * Types compartilhados · /configuracoes/clinica.
 *
 * Mantem snake_case dos campos (port direto do localStorage shape do
 * clinic-dashboard, alinhado com PT-BR e o backend RPC).
 */

import type { HorariosMap } from './lib/horarios'

export type { HorariosMap, HorarioDia, HorarioPeriodo } from './lib/horarios'

export interface Responsavel {
  nome: string
  cpf: string
  nascimento: string
  cargo: string
  tel: string
  email: string
  conselho: string
  conselho_num: string
}

export interface BancoPJ {
  banco: string
  tipo: string
  agencia: string
  conta: string
  titular: string
  pix: string
}

export interface CorMarca {
  nome: string
  valor: string
}

export interface LogoItem {
  tipo: string
  data: string // base64 data URL
}

/** Forma completa do form (rica) · espelha o legacy localStorage. */
export interface ClinicSettingsData {
  // Perfil
  nome: string
  tipo: string
  especialidade: string
  funcionarios: string
  descricao: string
  data_fundacao: string

  // Contato
  telefone: string
  whatsapp: string
  email: string
  site: string
  cardapio: string

  // Redes
  instagram: string
  facebook: string
  tiktok: string
  youtube: string
  linkedin: string
  google: string

  // Endereco
  cep: string
  rua: string
  num: string
  comp: string
  bairro: string
  cidade: string
  estado: string
  maps: string

  // Fiscal
  cnpj: string
  ie: string
  im: string
  cnae: string
  regime_tributario: string
  iss_pct: string | number
  nfe: string
  cnaes_secundarios: string[]
  bancos: BancoPJ[]

  // Atendimento
  duracao_padrao: string
  intervalo_consulta: string
  antecedencia_min: string | number
  limite_agendamento: string | number
  politica_cancelamento: string
  termos_consentimento: string

  // Notificacoes
  notif_confirmacao: boolean
  notif_lembrete24: boolean
  notif_lembrete1h: boolean
  msg_boas_vindas: string

  // Sistema
  fuso_horario: string
  moeda: string
  formato_data: string

  // Observacoes
  observacoes_internas: string

  // Repeaters
  responsaveis: Responsavel[]
  cores: CorMarca[]
  logos: LogoItem[]

  // Horarios
  horarios: HorariosMap
}

/** Shape RAW retornado pela RPC `get_clinic_settings`. */
export interface ClinicSettingsRow {
  name?: string
  phone?: string
  whatsapp?: string
  email?: string
  website?: string
  description?: string
  address?: Partial<{
    cep: string
    rua: string
    num: string
    comp: string
    bairro: string
    cidade: string
    estado: string
    maps: string
  }>
  social?: Partial<{
    instagram: string
    facebook: string
    tiktok: string
    youtube: string
    linkedin: string
    google: string
  }>
  fiscal?: Partial<{
    cnpj: string
    ie: string
    im: string
    cnae: string
    regime_tributario: string
    iss_pct: string | number
    nfe: string
    cnaes_secundarios: string[]
    bancos: BancoPJ[]
  }>
  operating_hours?: HorariosMap
  settings?: Partial<{
    tipo: string
    especialidade: string
    funcionarios: string
    data_fundacao: string
    cardapio: string
    duracao_padrao: string
    intervalo_consulta: string
    antecedencia_min: string | number
    limite_agendamento: string | number
    politica_cancelamento: string
    termos_consentimento: string
    msg_boas_vindas: string
    fuso_horario: string
    moeda: string
    formato_data: string
    observacoes_internas: string
    notif_confirmacao: boolean
    notif_lembrete24: boolean
    notif_lembrete1h: boolean
    responsaveis: Responsavel[]
    cores: CorMarca[]
    logos: LogoItem[]
  }>
  updated_at?: string
}

/** Default vazio · usado quando RPC falha ou retorna vazio. */
export function emptyClinicSettings(): ClinicSettingsData {
  return {
    nome: '',
    tipo: '',
    especialidade: '',
    funcionarios: '',
    descricao: '',
    data_fundacao: '',
    telefone: '',
    whatsapp: '',
    email: '',
    site: '',
    cardapio: '',
    instagram: '',
    facebook: '',
    tiktok: '',
    youtube: '',
    linkedin: '',
    google: '',
    cep: '',
    rua: '',
    num: '',
    comp: '',
    bairro: '',
    cidade: '',
    estado: '',
    maps: '',
    cnpj: '',
    ie: '',
    im: '',
    cnae: '',
    regime_tributario: '',
    iss_pct: '',
    nfe: '',
    cnaes_secundarios: [],
    bancos: [],
    duracao_padrao: '',
    intervalo_consulta: '',
    antecedencia_min: '',
    limite_agendamento: '',
    politica_cancelamento: '',
    termos_consentimento: '',
    notif_confirmacao: false,
    notif_lembrete24: false,
    notif_lembrete1h: false,
    msg_boas_vindas: '',
    fuso_horario: 'America/Sao_Paulo',
    moeda: 'BRL',
    formato_data: 'dd/MM/yyyy',
    observacoes_internas: '',
    responsaveis: [],
    cores: [],
    logos: [],
    horarios: {},
  }
}
