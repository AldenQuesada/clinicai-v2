import { describe, it, expect } from 'vitest'
import { hasVoucherIntent } from './voucher-intent'

describe('hasVoucherIntent · positives', () => {
  it.each([
    ['voucher direto', 'preciso de um voucher pra Maria'],
    ['voucher plural', 'manda 3 vouchers pra mim'],
    ['vaucher (typo)', 'queria um vaucher pra cliente'],
    ['voucer (typo sem h)', 'voucer pra Joana hoje'],
    ['vauchers plural typo', 'tem como gerar uns vauchers?'],
    ['cortesia', 'tem cortesia disponível?'],
    ['cupom', 'usa o cupom da minha indicação'],
    ['cupons', 'preciso de cupons pra evento'],
    ['convite', 'manda o convite pra Carla'],
    ['convidada', 'minha convidada quer agendar'],
    ['beneficiária', 'a beneficiária Maria não chegou'],
    ['presente', 'a clínica fez um presente pra ela'],
    ['presentear', 'quero presentear minha amiga'],
    ['presenteou', 'a Mirian já presenteou ela'],
    ['indicar uma', 'vou indicar uma amiga pra avaliação'],
    ['enviar voucher', 'pode enviar voucher pra ela'],
    ['mandar voucher', 'mandar voucher hoje'],
    ['emitir voucher', 'emite voucher pra Joana'],
    ['gera voucher', 'gera um voucher rapidinho'],
    ['enviar para paciente', 'envia para paciente que indiquei'],
    ['mandar pra cliente', 'manda pra cliente que tá esperando'],
    ['enviar pra amiga', 'envia pra amiga aqui'],
    ['agendar pelo voucher', 'queria agendar pelo voucher que ganhei'],
    ['agendamento com voucher', 'agendamento com voucher amanhã'],
    ['quero voucher', 'quero outro voucher pra próxima'],
    ['queria cortesia', 'queria uma cortesia pra cliente especial'],
    ['preciso de cupom', 'preciso de cupom de desconto'],
    ['voucher uppercase', 'VOUCHER PRA MARIA'],
    ['voucher com pontuação', 'voucher? hoje?'],
    ['voucher misto acento', 'queria um voúcher (sic)'],
  ])('"%s": %s → true', (_label, text) => {
    expect(hasVoucherIntent(text)).toBe(true)
  })
})

describe('hasVoucherIntent · negatives', () => {
  it.each([
    ['oi simples', 'oi'],
    ['bom dia', 'bom dia'],
    ['boa noite', 'boa noite, tudo bem?'],
    ['tudo bem', 'tudo bem com você?'],
    ['preciso falar', 'preciso falar com você'],
    ['me liga', 'me liga depois'],
    ['assunto pessoal', 'tenho um assunto pessoal'],
    ['vc na clínica?', 'você está na clínica hoje?'],
    ['emoji só', '🙂'],
    ['vazio', ''],
    ['null', null],
    ['undefined', undefined],
    ['números aleatórios', '12345 67890'],
    ['agradecimento sem voucher', 'obrigada pela atenção'],
    ['parceria genérica', 'gostei muito da parceria, tá indo bem'],
    ['follow-up sem voucher', 'como tá o movimento aí?'],
    ['pergunta procedimento', 'quanto custa o full face?'],
    ['saudação informal', 'eaee'],
    ['frase curta', 'ok'],
    ['indicação genérica sem complemento', 'indicação'],
  ])('"%s": %s → false', (_label, text) => {
    expect(hasVoucherIntent(text)).toBe(false)
  })
})

describe('hasVoucherIntent · edge cases', () => {
  it('handles null/undefined/empty as false', () => {
    expect(hasVoucherIntent(null)).toBe(false)
    expect(hasVoucherIntent(undefined)).toBe(false)
    expect(hasVoucherIntent('')).toBe(false)
    expect(hasVoucherIntent('   ')).toBe(false)
  })

  it('strips accents before matching', () => {
    expect(hasVoucherIntent('beneficiária')).toBe(true)
    expect(hasVoucherIntent('beneficiaria')).toBe(true)
    expect(hasVoucherIntent('cortesía')).toBe(true)
  })

  it('matches in middle of sentence', () => {
    expect(
      hasVoucherIntent(
        'oi, tudo bem? queria saber se ainda tem voucher disponível pra Maria',
      ),
    ).toBe(true)
  })

  it('does not match isolated unrelated words', () => {
    expect(hasVoucherIntent('preciso')).toBe(false)
    expect(hasVoucherIntent('queria')).toBe(false)
    expect(hasVoucherIntent('enviar')).toBe(false)
  })
})
