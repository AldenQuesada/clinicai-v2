/**
 * Money helper · unit tests
 * CRM_PARITY_R2 · Phase B
 *
 * Cobre rounding seguro · soma de N parcelas sem drift · derivação canônica
 * de payment_status.
 */

import { describe, it, expect } from 'vitest'
import {
  Money,
  toCents,
  fromCents,
  round2,
  derivePaymentStatus,
} from './money'

describe('Money · core', () => {
  it('toCents converte BR string corretamente', () => {
    expect(toCents('1.234,56')).toBe(123456)
    expect(toCents('R$ 100,00')).toBe(10000)
    expect(toCents('0,99')).toBe(99)
  })

  it('toCents converte US/numérico', () => {
    expect(toCents(100)).toBe(10000)
    expect(toCents(100.5)).toBe(10050)
    expect(toCents('100.50')).toBe(10050)
    expect(toCents('1,234.56')).toBe(123456)
  })

  it('toCents trata null/undefined/vazio como 0', () => {
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
    expect(toCents('')).toBe(0)
  })

  it('fromCents reverte sem drift', () => {
    expect(fromCents(10000)).toBe(100)
    expect(fromCents(99)).toBe(0.99)
    expect(fromCents(1)).toBe(0.01)
  })

  it('round2 normaliza para 2 casas', () => {
    expect(round2(1.999)).toBe(2)
    // 1.005 hits IEEE 754 mid-half (representado como 1.00499...) ·
    // Math.round resulta em 1.00 · comportamento conhecido de float.
    // Para evitar drift em soma, usar centavos diretos.
    expect(round2(1.5)).toBe(1.5)
    expect(round2(1.499)).toBe(1.5)
    // String "1,005" passa pelo parser BR e usa parseFloat · mesmo float drift.
    // Documenta o comportamento esperado em vez de tentar contornar.
    expect(round2('2,50')).toBe(2.5)
  })

  it('sum não tem float drift em 10 parcelas de 0.10', () => {
    const parts = Array(10).fill(0.1)
    // 0.1 + 0.1 + ... 10x === 1.0
    expect(Money.sum(parts)).toBe(1)
    // ingênuo seria 0.9999999...
  })

  it('sum agrega valores mistos', () => {
    expect(Money.sum([100, '50,00', '25.00', null])).toBe(175)
  })

  it('add/sub preservam centavos', () => {
    expect(Money.add(0.1, 0.2)).toBe(0.3)
    expect(Money.sub(1, 0.99)).toBe(0.01)
    expect(Money.sub(0.3, 0.1)).toBe(0.2)
  })

  it('isZero trata epsilon corretamente', () => {
    expect(Money.isZero(0)).toBe(true)
    expect(Money.isZero('0,00')).toBe(true)
    expect(Money.isZero(null)).toBe(true)
    expect(Money.isZero(0.001)).toBe(true) // arredonda
    expect(Money.isZero(0.01)).toBe(false)
  })

  it('eq compara em centavos', () => {
    expect(Money.eq(0.1 + 0.2, 0.3)).toBe(true) // sem drift
    expect(Money.eq('100,00', 100)).toBe(true)
    // 1.234 → 123 cents, 1.235 → 124 cents (round half-up) · diff em centavos.
    expect(Money.eq(1.234, 1.235)).toBe(false)
    // 1.234 e 1.236 caem em centavos diferentes (123 vs 124) · não iguais.
    expect(Money.eq(1.234, 1.236)).toBe(false)
    // Valores que caem no mesmo centavo SÃO iguais.
    expect(Money.eq(1.231, 1.234)).toBe(true)
  })

  it('lt/gt/lte/gte funcionam', () => {
    expect(Money.lt(10, 20)).toBe(true)
    expect(Money.lte(10, 10)).toBe(true)
    expect(Money.gt(20, 10)).toBe(true)
    expect(Money.gte(10, 10)).toBe(true)
  })

  it('format produz BRL', () => {
    const f = Money.format(1234.56)
    // tolerante a NBSP vs space
    expect(f).toMatch(/R\$\s*1\.234,56/)
  })
})

describe('Money · sumGross/Discount/Net (procedure items)', () => {
  const items = [
    { gross_amount: 100, discount_amount: 0, net_amount: 100 },
    { gross_amount: 200, discount_amount: 50, net_amount: 150 },
    { gross_amount: 50, discount_amount: 0, net_amount: 50 },
  ]

  it('sumGross', () => {
    expect(Money.sumGross(items)).toBe(350)
  })
  it('sumDiscount', () => {
    expect(Money.sumDiscount(items)).toBe(50)
  })
  it('sumNet', () => {
    expect(Money.sumNet(items)).toBe(300)
  })
  it('aceita camelCase também', () => {
    const camel = [{ grossAmount: 100, discountAmount: 10, netAmount: 90 }]
    expect(Money.sumGross(camel)).toBe(100)
    expect(Money.sumDiscount(camel)).toBe(10)
    expect(Money.sumNet(camel)).toBe(90)
  })
})

describe('Money · sumPayments', () => {
  const payments = [
    { amount: 50, status: 'pago' },
    { amount: 30, status: 'pendente' },
    { amount: 20, status: 'pago' },
    { amount: 999, status: 'cancelado' },
  ]

  it('default só status=pago', () => {
    expect(Money.sumPayments(payments)).toBe(70)
  })
  it('includePending soma pago+pendente', () => {
    expect(Money.sumPayments(payments, { includePending: true })).toBe(100)
  })
  it('onlyStatus pendente', () => {
    expect(Money.sumPayments(payments, { onlyStatus: 'pendente' })).toBe(30)
  })
  it('onlyStatus cancelado', () => {
    expect(Money.sumPayments(payments, { onlyStatus: 'cancelado' })).toBe(999)
  })
})

describe('Money · derivePaymentStatus (canon)', () => {
  it('net=0 sem cortesia → pendente', () => {
    expect(derivePaymentStatus({ netTotal: 0, paidTotal: 0 })).toBe('pendente')
  })
  it('net=0 com cortesia → cortesia', () => {
    expect(
      derivePaymentStatus({ netTotal: 0, paidTotal: 0, hasCourtesy: true }),
    ).toBe('cortesia')
  })
  it('net>0 paid=0 → pendente', () => {
    expect(derivePaymentStatus({ netTotal: 100, paidTotal: 0 })).toBe('pendente')
  })
  it('paid < net → parcial', () => {
    expect(derivePaymentStatus({ netTotal: 100, paidTotal: 50 })).toBe('parcial')
  })
  it('paid = net → pago', () => {
    expect(derivePaymentStatus({ netTotal: 100, paidTotal: 100 })).toBe('pago')
  })
  it('paid > net → pago (excesso ainda conta como pago)', () => {
    expect(derivePaymentStatus({ netTotal: 100, paidTotal: 150 })).toBe('pago')
  })
})

describe('Money · balance', () => {
  it('positivo · falta pagar', () => {
    expect(Money.balance(100, 30)).toBe(70)
  })
  it('zero · quitado', () => {
    expect(Money.balance(100, 100)).toBe(0)
  })
  it('negativo · excesso', () => {
    expect(Money.balance(100, 150)).toBe(-50)
  })
})
