import { describe, expect, it } from 'vitest'
import { Fraction, frac } from '../fraction'
import { choose, diceSumCounts, harmonic, isPrime, primes, roundSig } from '../math'

describe('Fraction', () => {
  it('reduces and normalizes sign', () => {
    const f = frac(6, -8)
    expect(f.num).toBe(-3n)
    expect(f.den).toBe(4n)
    expect(frac(0, 5).toString()).toBe('0')
  })

  it('does arithmetic exactly', () => {
    expect(frac(1, 3).add(frac(1, 6)).toString()).toBe('1/2')
    expect(frac(3, 4).sub(1).toString()).toBe('-1/4')
    expect(frac(2, 3).mul(frac(9, 4)).toString()).toBe('3/2')
    expect(frac(2, 3).div(frac(4, 9)).toString()).toBe('3/2')
    expect(frac(2, 3).pow(3).toString()).toBe('8/27')
    expect(frac(2, 3).pow(-2).toString()).toBe('9/4')
  })

  it('parses decimals exactly', () => {
    expect(Fraction.parseDecimal('0.375')!.toString()).toBe('3/8')
    expect(Fraction.parseDecimal('-.5')!.toString()).toBe('-1/2')
    expect(Fraction.parseDecimal('2.5e2')!.toString()).toBe('250')
    expect(Fraction.parseDecimal('1e-3')!.toString()).toBe('1/1000')
    expect(Fraction.parseDecimal('abc')).toBeNull()
    expect(Fraction.parseDecimal('.')).toBeNull()
  })

  it('from(number) is exact for finite decimals', () => {
    expect(Fraction.from(0.1).toString()).toBe('1/10')
    expect(Fraction.from(1.25).toString()).toBe('5/4')
  })

  it('compares', () => {
    expect(frac(1, 3).lt(frac(1, 2))).toBe(true)
    expect(frac(2, 4).eq(frac(1, 2))).toBe(true)
    expect(frac(-1, 2).cmp(0)).toBe(-1)
  })

  it('formats decimals', () => {
    expect(frac(3, 8).toDecimalString()).toBe('0.375')
    expect(frac(1, 3).toDecimalString(4)).toBe('0.3333')
    expect(frac(2, 3).toDecimalString(3)).toBe('0.667')
    expect(frac(-1, 40).toDecimalString()).toBe('-0.025')
    expect(frac(5).toDecimalString()).toBe('5')
    expect(frac(3, 8).toLatex()).toBe('\\frac{3}{8}')
    expect(frac(-3, 8).toLatex()).toBe('-\\frac{3}{8}')
  })

  it('throws on zero denominators', () => {
    expect(() => frac(1, 0)).toThrow()
    expect(() => frac(1, 2).div(0)).toThrow()
  })

  it('handles huge values without overflow', () => {
    const f = frac(1, 6).pow(30)
    expect(f.den).toBe(6n ** 30n)
    expect(f.toNumber()).toBeCloseTo(1 / 6 ** 30, 40)
  })
})

describe('math helpers', () => {
  it('choose', () => {
    expect(choose(52, 5)).toBe(2598960n)
    expect(choose(10, 0)).toBe(1n)
    expect(choose(5, 7)).toBe(0n)
  })
  it('primes', () => {
    expect(primes(10)).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29])
    expect(isPrime(97)).toBe(true)
    expect(isPrime(91)).toBe(false)
  })
  it('harmonic', () => {
    expect(harmonic(4).toString()).toBe('25/12')
  })
  it('dice sum counts', () => {
    const c = diceSumCounts(2)
    expect(c[7]).toBe(6n)
    expect(c.reduce((s, x) => s + x, 0n)).toBe(36n)
    const c3 = diceSumCounts(3)
    expect(c3[10]).toBe(27n)
  })
  it('roundSig', () => {
    expect(roundSig(123456, 2)).toBe(120000)
    expect(roundSig(0.0012345, 3)).toBe(0.00123)
  })
})
