/**
 * Tests · parseImplicitVoucherRequest (partner-voucher-implicit-v1)
 *
 * Roda com: pnpm --filter @clinicai/mira run test ou vitest run --filter ...
 * Pattern segue b2b-emit-voucher.test.ts (mesmo repo).
 */

import { describe, it, expect } from 'vitest'
import {
  parseImplicitVoucherRequest,
  hasImplicitVoucherIntent,
  __testables,
} from './voucher-implicit-intent'

describe('parseImplicitVoucherRequest · positive cases', () => {
  it('detects "Maria 44999887766" (name + phone)', () => {
    const r = parseImplicitVoucherRequest('Maria 44999887766')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544999887766')
    expect(r.candidateName).toBe('Maria')
    expect(r.confidence).toBe('high')
  })

  it('detects "Cliente: Juliana. Telefone 44 99988-7766"', () => {
    const r = parseImplicitVoucherRequest('Cliente: Juliana. Telefone 44 99988-7766')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544999887766')
    expect(r.candidateName).toBe('Juliana')
  })

  it('detects "Segue contato da Ana 44988776655"', () => {
    const r = parseImplicitVoucherRequest('Segue contato da Ana 44988776655')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544988776655')
    // Cleaning aggressive strips "Segue contato" and command words
    expect(r.candidateName?.toLowerCase()).toContain('ana')
  })

  it('detects "Oi Mira, manda voucher pra Camila 44 99876-1234"', () => {
    const r = parseImplicitVoucherRequest('Oi Mira, manda voucher pra Camila 44 99876-1234')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544998761234')
    expect(r.candidateName?.toLowerCase()).toContain('camila')
  })

  it('detects "Camila de Souza 44 99876-1234"', () => {
    const r = parseImplicitVoucherRequest('Camila de Souza 44 99876-1234')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544998761234')
    expect(r.candidateName?.toLowerCase()).toContain('camila')
  })

  it('detects formato antigo "voucher 44998761234 Camila"', () => {
    const r = parseImplicitVoucherRequest('voucher 44998761234 Camila')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544998761234')
  })

  it('detects "Joana +55 44 99876-1234"', () => {
    const r = parseImplicitVoucherRequest('Joana +55 44 99876-1234')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544998761234')
    expect(r.candidateName?.toLowerCase()).toContain('joana')
  })

  it('detects "A paciente é a Fernanda, número 44 99911-2233"', () => {
    const r = parseImplicitVoucherRequest('A paciente é a Fernanda, número 44 99911-2233')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544999112233')
    expect(r.candidateName?.toLowerCase()).toContain('fernanda')
  })

  it('detects "Pode fazer para a Bruna? 44999112233"', () => {
    const r = parseImplicitVoucherRequest('Pode fazer para a Bruna? 44999112233')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544999112233')
    expect(r.candidateName?.toLowerCase()).toContain('bruna')
  })

  it('phone-only "44999112233" (no name) returns medium confidence', () => {
    const r = parseImplicitVoucherRequest('44999112233')
    expect(r.hasPhone).toBe(true)
    expect(r.phoneE164).toBe('5544999112233')
    expect(r.confidence).toBe('medium')
  })
})

describe('parseImplicitVoucherRequest · negative cases', () => {
  it('null/undefined/empty → no phone', () => {
    expect(parseImplicitVoucherRequest(null).hasPhone).toBe(false)
    expect(parseImplicitVoucherRequest(undefined).hasPhone).toBe(false)
    expect(parseImplicitVoucherRequest('').hasPhone).toBe(false)
  })

  it('plain greeting → no phone', () => {
    expect(parseImplicitVoucherRequest('oi tudo bem').hasPhone).toBe(false)
    expect(parseImplicitVoucherRequest('bom dia').hasPhone).toBe(false)
  })

  it('CPF disguised as phone (leading 0) → rejected', () => {
    const r = parseImplicitVoucherRequest('meu cpf é 03311122244')
    expect(r.hasPhone).toBe(false)
  })

  it('CPF with valid length but wrong 5th char → rejected', () => {
    // "11122233344" canonical "5511122233344" · 5th char '1' · rejected
    const r = parseImplicitVoucherRequest('Maria 11122233344')
    expect(r.hasPhone).toBe(false)
  })

  it('senderPhone is the same number → rejected', () => {
    const r = parseImplicitVoucherRequest('me liga no 44999887766', {
      senderPhone: '5544999887766',
    })
    expect(r.hasPhone).toBe(false)
    expect(r.reason).toBe('phone_blocked_by_policy')
  })

  it('senderPhone variants (with/without 9th digit BR) → rejected', () => {
    // sender 5544998766554 (canonical 13 chars) · text mentions same with separator
    const r = parseImplicitVoucherRequest('me chamou aqui 44 99876-6554', {
      senderPhone: '5544998766554',
    })
    expect(r.hasPhone).toBe(false)
    expect(r.reason).toBe('phone_blocked_by_policy')
  })

  it('phone in blockPhones (official channel) → rejected', () => {
    const r = parseImplicitVoucherRequest('emite voucher pra 44 99162-2986', {
      blockPhones: ['5544991622986'], // Mih · com nono
    })
    expect(r.hasPhone).toBe(false)
    expect(r.reason).toBe('phone_blocked_by_policy')
  })

  it('text without any phone-like sequence → no phone', () => {
    const r = parseImplicitVoucherRequest('quero falar com você sobre a parceria')
    expect(r.hasPhone).toBe(false)
  })

  it('group/CEP-like sequence → rejected (canonicalPhoneBR fails)', () => {
    const r = parseImplicitVoucherRequest('cep 87060-123')
    expect(r.hasPhone).toBe(false)
  })
})

describe('hasImplicitVoucherIntent · boolean wrapper', () => {
  it('returns true for valid phone', () => {
    expect(hasImplicitVoucherIntent('Maria 44999887766')).toBe(true)
  })

  it('returns false for no phone', () => {
    expect(hasImplicitVoucherIntent('oi tudo bem')).toBe(false)
  })

  it('respects senderPhone', () => {
    expect(
      hasImplicitVoucherIntent('me liga 44999887766', { senderPhone: '5544999887766' }),
    ).toBe(false)
  })
})

describe('__testables · sanity', () => {
  it('phoneVariantsForBlock covers BR variants', () => {
    const variants = __testables.phoneVariantsForBlock('5544991622986')
    expect(variants.has('5544991622986')).toBe(true)   // full
    expect(variants.has('544991622986')).toBe(true)    // last 12
    expect(variants.has('44991622986')).toBe(true)     // last 11
    expect(variants.has('4991622986')).toBe(true)      // last 10
    expect(variants.has('991622986')).toBe(true)       // last 9
    expect(variants.has('91622986')).toBe(true)        // last 8
  })

  it('isLikelyValidLocalPhone accepts BR mobile/landline', () => {
    expect(__testables.isLikelyValidLocalPhone('5544999887766')).toBe(true) // 13 chars · 5th='9'
    expect(__testables.isLikelyValidLocalPhone('554499988776')).toBe(true) // 12 chars · 5th='9'
    expect(__testables.isLikelyValidLocalPhone('554433445566')).toBe(true) // 12 chars · 5th='3' (fixo)
  })

  it('isLikelyValidLocalPhone rejects CPF disguised', () => {
    expect(__testables.isLikelyValidLocalPhone('5511122233344')).toBe(false) // 5th='1'
    expect(__testables.isLikelyValidLocalPhone('5500011122233')).toBe(false) // 5th='0'
  })
})
