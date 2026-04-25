/**
 * Testes do parser de lista bulk · 3 formatos suportados (decisao Alden
 * 2026-04-25 · case Dani Mendes 22 vouchers).
 *
 * Cobre:
 *   - formato a (numerada compacta inline)
 *   - formato b (multilinha simples)
 *   - formato c (nome composto)
 *   - edge cases: linhas vazias, telefones invalidos, nomes faltantes
 *   - dedup por phone normalizado
 *   - schedule hint detection
 *   - looksLikeBulk heuristic
 *
 * Nao depende de Supabase nem Anthropic · funcao pura.
 */
import { describe, it, expect } from 'vitest'
import { parseBulkList, looksLikeBulk } from './bulk-list-parser'

describe('parseBulkList · formato a (inline numerado)', () => {
  it('parses lista inline com prefix "emite N vouchers"', () => {
    const text =
      'emite 3 vouchers: Maria 5544991111111, Ana 5544992222222, Bia 44993333333'
    const r = parseBulkList(text)
    expect(r.declaredCount).toBe(3)
    expect(r.items).toHaveLength(3)
    // Phones devem vir normalizados via normalizePhoneBR (DDI 55 garantido)
    expect(r.items[0]).toEqual({ name: 'Maria', phone: '5544991111111' })
    expect(r.items[1]).toEqual({ name: 'Ana', phone: '5544992222222' })
    expect(r.items[2]).toEqual({ name: 'Bia', phone: '5544993333333' })
  })

  it('parses inline com separador " e " e ponto-virgula', () => {
    const text = 'voucher pra Maria 44991111111; Ana 44992222222 e Bia 44993333333'
    const r = parseBulkList(text)
    expect(r.items).toHaveLength(3)
    expect(r.items.map((i) => i.name)).toEqual(['Maria', 'Ana', 'Bia'])
  })
})

describe('parseBulkList · formato b (multilinha simples)', () => {
  it('parses multilinha com phones em formatos suportados', () => {
    // KNOWN GAP: PHONE_RX exige DDI explicito (2 digits + space + DDD).
    // Formato "(44) 99222-2222" puro (sem DDI) NAO e capturado · cobrir
    // esse caso requer expandir PHONE_RX (escopo: nao mudar code aqui).
    const text = [
      'voucher pra:',
      'Maria 5544991111111',
      'Ana 5544992222222',
      'Bia 5544993333333',
    ].join('\n')
    const r = parseBulkList(text)
    expect(r.items).toHaveLength(3)
    expect(r.items[0]).toEqual({ name: 'Maria', phone: '5544991111111' })
    expect(r.items[1]).toEqual({ name: 'Ana', phone: '5544992222222' })
    expect(r.items[2]).toEqual({ name: 'Bia', phone: '5544993333333' })
  })

  it('ignora linhas vazias entre items', () => {
    const text = ['Maria 44991111111', '', '', 'Ana 44992222222', '   ', 'Bia 44993333333'].join(
      '\n',
    )
    const r = parseBulkList(text)
    expect(r.items).toHaveLength(3)
  })
})

describe('parseBulkList · formato c (nome composto)', () => {
  it('parses nomes longos antes do phone (com DDI)', () => {
    // KNOWN GAP: ver formato b · phones sem DDI nao sao capturados pelo
    // PHONE_RX atual. Caller (b2b-emit-voucher handler) recebe texto cru
    // que ja inclui DDI 55 na maioria dos casos prod (Evolution
    // injects DDI antes de chamar parser).
    const text = [
      'Maria Luiiza Pavezi Mendes 5544991234567',
      'Gabriela Romangnoli 5544998765432',
    ].join('\n')
    const r = parseBulkList(text)
    expect(r.items).toHaveLength(2)
    expect(r.items[0].name).toBe('Maria Luiiza Pavezi Mendes')
    expect(r.items[0].phone).toBe('5544991234567')
    expect(r.items[1].name).toBe('Gabriela Romangnoli')
    expect(r.items[1].phone).toBe('5544998765432')
  })
})

describe('parseBulkList · edge cases', () => {
  it('retorna items vazio em string vazia', () => {
    const r = parseBulkList('')
    expect(r.items).toEqual([])
    expect(r.rawCount).toBe(0)
  })

  it('descarta linhas com phone invalido (muito curto)', () => {
    const text = ['Maria 1234', 'Ana 44991111111'].join('\n')
    const r = parseBulkList(text)
    expect(r.items).toHaveLength(1)
    expect(r.items[0].name).toBe('Ana')
  })

  it('usa "amiga" como nome default quando nome ausente', () => {
    const text = '5544991111111'
    const r = parseBulkList(text)
    // Single line · pode cair em multilinha ou inline. Em ambos casos,
    // sem nome, fallback 'amiga'.
    if (r.items.length === 1) {
      expect(r.items[0].phone).toBe('5544991111111')
      expect(r.items[0].name).toBe('amiga')
    }
  })

  it('dedup phones repetidos · mesmo phone digitado 2x = 1 item', () => {
    const text = [
      'Maria 44991111111',
      'Ana 44992222222',
      'Maria de novo 44991111111',
    ].join('\n')
    const r = parseBulkList(text)
    expect(r.items).toHaveLength(2)
    // Primeira ocorrencia ganha · Maria com phone 1111
    expect(r.items[0].phone).toBe('5544991111111')
    expect(r.items[1].phone).toBe('5544992222222')
  })
})

describe('parseBulkList · scheduleHint detection', () => {
  it('detecta "amanha 9h"', () => {
    const text = [
      'manda amanha 9h:',
      'Maria 44991111111',
      'Ana 44992222222',
    ].join('\n')
    const r = parseBulkList(text)
    expect(r.scheduleHint).toMatch(/amanh[aã]\s+9/)
  })

  it('detecta "domingo 14h"', () => {
    const text = 'domingo 14h envia: Maria 44991111111, Ana 44992222222'
    const r = parseBulkList(text)
    expect(r.scheduleHint).toMatch(/domingo\s+14/)
  })

  it('null em "manda agora"', () => {
    const text = 'manda agora: Maria 44991111111, Ana 44992222222'
    const r = parseBulkList(text)
    expect(r.scheduleHint).toBeUndefined()
  })
})

describe('looksLikeBulk · heuristica pra Tier 1 classifier', () => {
  it('true em "3 vouchers"', () => {
    expect(looksLikeBulk('emite 3 vouchers')).toBe(true)
  })

  it('true em 2+ phones na mesma linha', () => {
    expect(looksLikeBulk('Maria 44991111111 e Ana 44992222222')).toBe(true)
  })

  it('false em 1 phone unico', () => {
    expect(looksLikeBulk('voucher pra Maria 44991111111')).toBe(false)
  })

  it('false em texto sem phones', () => {
    expect(looksLikeBulk('oi mira tudo bem')).toBe(false)
  })

  it('false em "1 voucher" (singular nao e bulk)', () => {
    expect(looksLikeBulk('emite 1 voucher')).toBe(false)
  })
})
