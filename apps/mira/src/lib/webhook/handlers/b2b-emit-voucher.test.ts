/**
 * Testes do parser determinístico de extractRecipient (audit 2026-05-06).
 *
 * Cobre o bug do caso real Dani Mendes:
 *   "vouher para Rachel Ferri 449978-0779"
 * Antes: PHONE_RX exigia 10-14 dígitos consecutivos · hífen quebrava match ·
 * recipient null · "Quase lá, me manda nome+WhatsApp" loop infinito.
 *
 * Agora: regex tolera pontuação · canonicalPhoneBR normaliza pra E.164 BR ·
 * isLikelyValidLocalPhone bloqueia CPF disfarçado.
 */
import { describe, it, expect } from 'vitest'
import { __testables } from './b2b-emit-voucher'

const { extractRecipient } = __testables

describe('extractRecipient · phone formats BR', () => {
  it.each<[string, string, string, string]>([
    // [label, input, expected name, expected canonical phone]
    [
      'sem pontuacao 11 chars',
      'voucher para Rachel Ferri 44999780779',
      'Rachel Ferri',
      '5544999780779',
    ],
    [
      'sem pontuacao 10 chars',
      'voucher para Rachel Ferri 4499780779',
      'Rachel Ferri',
      '5544999780779',
    ],
    [
      'typo vouher + hifen',
      'vouher para Rachel Ferri 449978-0779',
      'Rachel Ferri',
      '5544999780779',
    ],
    [
      'typo vaucher + espaco + hifen',
      'vaucher para Rachel 44 9978-0779',
      'Rachel',
      '5544999780779',
    ],
    [
      'parenteses + hifen 11 chars',
      'voucher p/ Rachel Ferri (44) 99978-0779',
      'Rachel Ferri',
      '5544999780779',
    ],
    [
      'manda voucher pra · 11 chars sem pont',
      'manda voucher pra Rachel Ferri 44999780779',
      'Rachel Ferri',
      '5544999780779',
    ],
    [
      'phone no fim · voucher como sufixo',
      'Rachel Ferri 4499780779 voucher',
      'Rachel Ferri',
      '5544999780779',
    ],
    [
      'whatsapp + espaco + hifen',
      'quero enviar um voucher para Rachel Ferri WhatsApp 44 9978-0779',
      'Rachel Ferri',
      '5544999780779',
    ],
    [
      'plus 55 + espacos · 11 chars',
      'voucher para Rachel Ferri +55 44 99978-0779',
      'Rachel Ferri',
      '5544999780779',
    ],
  ])('"%s": %s', (_label, input, expectedName, expectedPhone) => {
    const r = extractRecipient(input)
    expect(r).not.toBeNull()
    expect(r?.name).toBe(expectedName)
    expect(r?.phone).toBe(expectedPhone)
  })
})

describe('extractRecipient · edge cases', () => {
  it('retorna null quando nao tem telefone', () => {
    expect(extractRecipient('voucher para Rachel Ferri')).toBeNull()
    expect(extractRecipient('preciso de um voucher')).toBeNull()
    expect(extractRecipient('')).toBeNull()
  })

  it('retorna name="amiga" quando tem telefone mas nome vazio', () => {
    const r = extractRecipient('voucher 44999780779')
    expect(r?.phone).toBe('5544999780779')
    expect(r?.name).toBe('amiga')
  })

  it('CPF-like (11 chars começando com 0/1) NAO vira phone valido', () => {
    // CPF 11122233344 · norm '5511122233344' · 5º char '1' · rejeitado
    expect(extractRecipient('voucher pra Maria 11122233344')).toBeNull()
    // CPF 09876543210
    expect(extractRecipient('voucher pra Maria 09876543210')).toBeNull()
  })

  it('preserva acentos e maiusculas no nome', () => {
    const r = extractRecipient('voucher pra Mária Antônia 44999780779')
    expect(r?.name).toBe('Mária Antônia')
  })

  it('remove typos e palavras-comando do nome', () => {
    // vouher (typo · sem c) deve ser strippado
    const r = extractRecipient('vouher pra Rachel Ferri 44999780779')
    expect(r?.name).toBe('Rachel Ferri')
  })

  it('multiplos phones · usa o primeiro valido', () => {
    const r = extractRecipient(
      'voucher pra Rachel 44999780779 (alternativo 11999990000)',
    )
    expect(r?.phone).toBe('5544999780779')
  })

  it('ignora candidato CPF e usa o phone valido seguinte', () => {
    // 11122233344 = CPF · 4499978-0779 = phone valido
    const r = extractRecipient(
      'voucher pra Rachel CPF 11122233344 fone 4499978-0779',
    )
    expect(r?.phone).toBe('5544999780779')
  })
})
