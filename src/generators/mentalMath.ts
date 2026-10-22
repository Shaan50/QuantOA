/**
 * Mental math: arithmetic, decimals, conversions, powers/roots, percentages,
 * order-of-operations expressions, and a "nearest answer" multiple-choice
 * variant. Difficulty scales digit count, decimal places and ugliness.
 */
import { Fraction, frac } from '../core/fraction'
import { formatNumber } from '../core/answer'
import type { SeededRNG } from '../core/rng'
import type { Difficulty, QuestionDraft, QuestionTemplate } from '../core/types'
import { gcd, roundSig } from '../core/math'
import {
  assert,
  byDifficulty,
  decAnswer,
  exactDecAnswer,
  expectedTime,
  fracAnswer,
  intAnswer,
  mcAnswer,
  randDigits,
  tex,
  uglyDigits,
} from './helpers'
import { makeGenerator } from './registry'

const CAT = 'mental-math' as const

export const MENTAL_MATH_SUBCATEGORIES = [
  { id: 'add-sub', label: 'Addition & subtraction' },
  { id: 'multiplication', label: 'Multiplication' },
  { id: 'division', label: 'Division' },
  { id: 'decimals', label: 'Decimal arithmetic' },
  { id: 'conversions', label: 'Fractions ↔ decimals ↔ %' },
  { id: 'powers-roots', label: 'Squares, cubes & roots' },
  { id: 'percentages', label: 'Percentages' },
  { id: 'expressions', label: 'Mixed expressions' },
  { id: 'nearest', label: 'Nearest answer' },
] as const

const opTex = { '+': '+', '-': '-', '*': '\\times', '/': '\\div' } as const

// ---------------------------------------------------------------------------
// Addition & subtraction
// ---------------------------------------------------------------------------

const addSub: QuestionTemplate = {
  id: 'mm.add-sub',
  category: CAT,
  subcategory: 'add-sub',
  generate(d, rng) {
    const [digits, terms] = byDifficulty(d, [
      [2, 2],
      [3, 2],
      [4, 2],
      [4, 3],
      [5, 4],
    ] as const)
    const nums = [uglyDigits(rng, digits)]
    const ops: ('+' | '-')[] = []
    for (let i = 1; i < terms; i++) {
      const dg = d >= 3 && rng.chance(0.35) ? digits - 1 : digits
      nums.push(uglyDigits(rng, dg))
      ops.push(rng.chance(0.5) ? '+' : '-')
    }
    // Keep easy questions non-negative.
    if (d <= 2 && ops[0] === '-' && nums[1] > nums[0]) [nums[0], nums[1]] = [nums[1], nums[0]]

    let total = nums[0]
    const steps: string[] = []
    ops.forEach((op, i) => {
      const next = op === '+' ? total + nums[i + 1] : total - nums[i + 1]
      steps.push(`$${tex(total)} ${op} ${tex(nums[i + 1])} = ${tex(next)}$${compensationTip(op, nums[i + 1])}`)
      total = next
    })
    const expr = nums.map((n, i) => (i === 0 ? tex(n) : `${ops[i - 1]} ${tex(n)}`)).join(' ')
    return {
      prompt: `$$${expr}$$`,
      answer: intAnswer(total),
      explanation: [...steps, `Answer: $${tex(total)}$`],
      expectedSeconds: expectedTime(5, d),
    }
  },
}

function compensationTip(op: '+' | '-', n: number): string {
  const base = n >= 1000 ? 100 : 10
  const up = Math.ceil(n / base) * base
  const diff = up - n
  if (diff > 0 && diff <= (base === 10 ? 3 : 30)) {
    const inv = op === '+' ? '-' : '+'
    return ` — tip: ${op} ${formatNumber(up)} then ${inv} ${diff}`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Multiplication
// ---------------------------------------------------------------------------

function placeParts(n: number): number[] {
  const parts: number[] = []
  let place = 1
  let x = n
  while (x > 0) {
    const digit = x % 10
    if (digit) parts.unshift(digit * place)
    x = Math.floor(x / 10)
    place *= 10
  }
  return parts
}

export function multiplicationSteps(a: number, b: number): string[] {
  const steps: string[] = []
  const up = Math.ceil(b / 10) * 10
  if (b >= 10 && up - b > 0 && up - b <= 3) {
    steps.push(`Round up: $${tex(a)} \\times ${tex(b)} = ${tex(a)} \\times ${tex(up)} - ${tex(a)} \\times ${up - b}$`)
    steps.push(`$= ${tex(a * up)} - ${tex(a * (up - b))} = ${tex(a * b)}$`)
    return steps
  }
  const parts = placeParts(b)
  if (parts.length > 1) {
    steps.push(`Split $${tex(b)} = ${parts.map((p) => tex(p)).join(' + ')}$`)
    steps.push(parts.map((p) => `$${tex(a)} \\times ${tex(p)} = ${tex(a * p)}$`).join(', '))
    steps.push(`Sum: $${parts.map((p) => tex(a * p)).join(' + ')} = ${tex(a * b)}$`)
  } else {
    steps.push(`$${tex(a)} \\times ${tex(b)} = ${tex(a * b)}$`)
  }
  return steps
}

const multiplication: QuestionTemplate = {
  id: 'mm.multiplication',
  category: CAT,
  subcategory: 'multiplication',
  generate(d, rng) {
    const [da, db] = byDifficulty(d, [
      [2, 1],
      [2, 2],
      [3, 2],
      [3, 3],
      [4, 3],
    ] as const)
    const a = uglyDigits(rng, da)
    const b = db === 1 ? rng.int(3, 9) : uglyDigits(rng, db)
    return {
      prompt: `$$${tex(a)} \\times ${tex(b)}$$`,
      answer: intAnswer(a * b),
      explanation: [...multiplicationSteps(a, b), `Answer: $${tex(a * b)}$`],
      expectedSeconds: expectedTime(6, d),
    }
  },
}

// ---------------------------------------------------------------------------
// Division
// ---------------------------------------------------------------------------

const division: QuestionTemplate = {
  id: 'mm.division',
  category: CAT,
  subcategory: 'division',
  generate(d, rng) {
    if (d <= 3) {
      let divisor: number
      let quotient: number
      if (d === 1) {
        divisor = rng.int(3, 9)
        quotient = rng.int(12, 99)
      } else if (d === 2) {
        if (rng.chance(0.5)) {
          divisor = rng.int(3, 12)
          quotient = uglyDigits(rng, 3)
        } else {
          divisor = rng.int(11, 19)
          quotient = rng.int(11, 99)
        }
      } else {
        divisor = rng.int(13, 99)
        quotient = rng.int(21, 999)
      }
      const dividend = divisor * quotient
      return {
        prompt: `$$${tex(dividend)} \\div ${tex(divisor)}$$`,
        answer: intAnswer(quotient),
        explanation: longDivisionSteps(dividend, divisor),
        expectedSeconds: expectedTime(6, d),
      }
    }
    if (d === 4) {
      // Terminating decimal quotient.
      const divisor = rng.pick([4, 8, 16, 20, 25, 40, 50, 80, 125])
      let dividend: number
      do dividend = rng.int(11, 999)
      while (dividend % divisor === 0)
      const q = frac(dividend, divisor)
      return {
        prompt: `$$${tex(dividend)} \\div ${tex(divisor)}$$`,
        answer: exactDecAnswer(q),
        explanation: [
          `$${tex(dividend)} = ${tex(Math.floor(dividend / divisor) * divisor)} + ${dividend % divisor}$, so the quotient is $${Math.floor(dividend / divisor)}$ remainder $${dividend % divisor}$`,
          `$\\frac{${dividend % divisor}}{${divisor}} = ${frac(dividend % divisor, divisor).toDecimalString()}$`,
          `Answer: $${q.toDecimalString()}$`,
        ],
        expectedSeconds: expectedTime(8, d),
        inputHint: 'Decimal answer',
      }
    }
    // d5: decimal dividend with a one-decimal quotient.
    const divisor = rng.int(13, 79)
    let qTenths: number
    do qTenths = rng.int(101, 9999)
    while (qTenths % 10 === 0)
    const q = frac(qTenths, 10)
    const dividend = q.mul(divisor)
    return {
      prompt: `$$${tex(dividend.toNumber(), 4)} \\div ${tex(divisor)}$$`,
      answer: exactDecAnswer(q),
      explanation: [
        `Scale by 10: $${tex(dividend.mul(10).toNumber())} \\div ${divisor}$, then divide the result by 10`,
        ...longDivisionSteps(dividend.mul(10).toNumber(), divisor).slice(0, -1),
        `Answer: $${q.toDecimalString()}$`,
      ],
      expectedSeconds: expectedTime(9, d),
      inputHint: 'Decimal answer',
    }
  },
}

function longDivisionSteps(dividend: number, divisor: number): string[] {
  const q = dividend / divisor
  const steps: string[] = []
  // Peel off a big round chunk first.
  const mag = 10 ** Math.floor(Math.log10(q))
  const lead = Math.floor(q / mag) * mag
  if (lead !== q && mag >= 10) {
    steps.push(`$${tex(divisor)} \\times ${tex(lead)} = ${tex(divisor * lead)}$, leaving $${tex(dividend - divisor * lead)}$`)
    steps.push(`$${tex(dividend - divisor * lead)} \\div ${tex(divisor)} = ${tex(q - lead)}$`)
    steps.push(`Total: $${tex(lead)} + ${tex(q - lead)} = ${tex(q)}$`)
  } else {
    steps.push(`$${tex(divisor)} \\times ${tex(q)} = ${tex(dividend)}$`)
  }
  steps.push(`Answer: $${tex(q)}$`)
  return steps
}

// ---------------------------------------------------------------------------
// Decimal arithmetic
// ---------------------------------------------------------------------------

/** Random decimal with given integer digits (0 = "0.xx") and decimal places; never ends in 0. */
function randDecimal(rng: SeededRNG, intDigits: number, decimals: number): Fraction {
  const intPart = intDigits === 0 ? 0 : randDigits(rng, intDigits)
  let fracPart: number
  do fracPart = rng.int(1, 10 ** decimals - 1)
  while (fracPart % 10 === 0)
  return frac(intPart * 10 ** decimals + fracPart, 10 ** decimals)
}

const decimals: QuestionTemplate = {
  id: 'mm.decimals',
  category: CAT,
  subcategory: 'decimals',
  generate(d, rng) {
    type Op = '+' | '-' | '*' | '/'
    let a: Fraction
    let b: Fraction
    let op: Op
    switch (d) {
      case 1:
        a = randDecimal(rng, rng.int(1, 2), 1)
        b = randDecimal(rng, 1, 1)
        op = rng.pick(['+', '-'] as const)
        break
      case 2:
        if (rng.chance(0.5)) {
          a = randDecimal(rng, 1, 1)
          b = frac(rng.int(3, 9))
        } else {
          a = randDecimal(rng, 0, 1)
          b = randDecimal(rng, 0, 1)
        }
        op = rng.pick(['*', '+'] as const)
        break
      case 3:
        if (rng.chance(0.5)) {
          a = randDecimal(rng, 2, 2)
          b = randDecimal(rng, 1, 2)
          op = '-'
        } else {
          a = randDecimal(rng, 1, 1)
          b = randDecimal(rng, 1, 1)
          op = '*'
        }
        break
      case 4:
        if (rng.chance(0.5)) {
          a = randDecimal(rng, 0, 3)
          b = frac(uglyDigits(rng, 2))
        } else {
          a = randDecimal(rng, 1, 2)
          b = randDecimal(rng, 1, 1)
        }
        op = '*'
        break
      default:
        if (rng.chance(0.5)) {
          a = randDecimal(rng, 1, 2)
          b = randDecimal(rng, 1, 2)
          op = '*'
        } else {
          // Exact division: a = b * q with q a 1-decimal number.
          b = randDecimal(rng, 0, 2)
          const q = randDecimal(rng, rng.int(1, 2), 1)
          a = b.mul(q)
          op = '/'
        }
    }
    if (op === '-' && a.lt(b)) [a, b] = [b, a]
    const result = op === '+' ? a.add(b) : op === '-' ? a.sub(b) : op === '*' ? a.mul(b) : a.div(b)
    assert(result.isTerminating(), 'decimal result terminates')
    const ad = a.toDecimalString(8)
    const bd = b.toDecimalString(8)
    const explanation: string[] = []
    if (op === '*') {
      const da = (ad.split('.')[1] ?? '').length
      const db = (bd.split('.')[1] ?? '').length
      const ai = Number(ad.replace('.', ''))
      const bi = Number(bd.replace('.', ''))
      explanation.push(`Ignore the decimal points: $${tex(ai)} \\times ${tex(bi)} = ${tex(ai * bi)}$`)
      explanation.push(`Shift back ${da + db} decimal place${da + db === 1 ? '' : 's'}: $${result.toDecimalString(8)}$`)
    } else if (op === '/') {
      const db = (bd.split('.')[1] ?? '').length
      explanation.push(`Multiply both by $10^{${db}}$: $${tex(a.mul(10 ** db).toNumber())} \\div ${tex(b.mul(10 ** db).toNumber())}$`)
      explanation.push(`$= ${result.toDecimalString(8)}$`)
    } else {
      explanation.push(`Line up the decimal points: $${ad} ${op} ${bd} = ${result.toDecimalString(8)}$`)
    }
    return {
      prompt: `$$${tex(a.toNumber(), 8)} ${opTex[op]} ${tex(b.toNumber(), 8)}$$`,
      answer: exactDecAnswer(result),
      explanation,
      expectedSeconds: expectedTime(7, d),
    }
  },
}

// ---------------------------------------------------------------------------
// Fractions <-> decimals <-> percents
// ---------------------------------------------------------------------------

const CONVERSION_DENS: readonly (readonly number[])[] = [
  [2, 4, 5, 10],
  [8, 20, 25, 50],
  [16, 40, 3, 6, 12],
  [7, 9, 11, 32, 15],
  [7, 13, 24, 64, 80, 17],
]

const conversions: QuestionTemplate = {
  id: 'mm.conversions',
  category: CAT,
  subcategory: 'conversions',
  generate(d, rng) {
    const den = rng.pick(CONVERSION_DENS[d - 1])
    let n: number
    do n = rng.int(1, d >= 4 ? 2 * den - 1 : den - 1)
    while (gcd(n, den) !== 1)
    const f = frac(n, den)
    const terminating = f.isTerminating()
    const dirs = terminating ? (['f2d', 'f2p', 'd2f', 'p2f'] as const) : (['f2d', 'f2p'] as const)
    const dir = rng.pick(dirs)
    const pctValue = f.mul(100)
    const decStr = f.toDecimalString(4)
    const expl = [
      `$${f.toLatex()} = ${n} \\div ${den} ${terminating ? '=' : '\\approx'} ${decStr}$`,
      `As a percent: $${terminating ? '' : '\\approx '}${pctValue.toDecimalString(2)}\\%$`,
    ]
    const base = { explanation: expl, expectedSeconds: expectedTime(5, d) }
    switch (dir) {
      case 'f2d':
        return {
          ...base,
          prompt: `Write $${f.toLatex()}$ as a decimal${terminating ? '' : ' (3 significant figures)'}.`,
          answer: fracAnswer(f, 'decimal'),
          inputHint: 'Decimal',
        }
      case 'f2p':
        return {
          ...base,
          prompt: `Write $${f.toLatex()}$ as a percentage${terminating ? '' : ' (3 significant figures)'}.`,
          answer: fracAnswer(pctValue, 'decimal'),
          percentUnits: true,
          unit: { suffix: '%' },
          inputHint: 'Percent',
        }
      case 'd2f':
        return {
          ...base,
          prompt: `Write $${f.toDecimalString(8)}$ as a fraction in lowest terms.`,
          answer: fracAnswer(f, 'fraction'),
          explanation: [
            `$${f.toDecimalString(8)} = \\frac{${f.mul(10 ** decimalPlaces(f)).toString()}}{${10 ** decimalPlaces(f)}}$`,
            `Reduce: $${f.toLatex()}$`,
          ],
          inputHint: 'Fraction, e.g. 3/8',
        }
      case 'p2f':
        return {
          ...base,
          prompt: `Write $${pctValue.toDecimalString(6)}\\%$ as a fraction in lowest terms.`,
          answer: fracAnswer(f, 'fraction'),
          explanation: [`$${pctValue.toDecimalString(6)}\\% = \\frac{${pctValue.toDecimalString(6)}}{100}$`, `Reduce: $${f.toLatex()}$`],
          inputHint: 'Fraction, e.g. 3/8',
        }
    }
  },
}

function decimalPlaces(f: Fraction): number {
  const s = f.toDecimalString(12)
  return (s.split('.')[1] ?? '').length
}

// ---------------------------------------------------------------------------
// Squares, cubes and roots
// ---------------------------------------------------------------------------

function squareSteps(n: number): string[] {
  const base = n >= 100 ? 100 * Math.round(n / 100) : 10 * Math.round(n / 10)
  const delta = n - base
  if (delta === 0) return [`$${tex(n)}^2 = ${tex(n * n)}$`]
  const sign = delta > 0 ? '+' : '-'
  return [
    `Write $${tex(n)} = ${tex(base)} ${sign} ${Math.abs(delta)}$ and use $(a ${sign} b)^2 = a^2 ${sign} 2ab + b^2$`,
    `$= ${tex(base * base)} ${sign} ${tex(2 * base * Math.abs(delta))} + ${tex(delta * delta)} = ${tex(n * n)}$`,
  ]
}

const powersRoots: QuestionTemplate = {
  id: 'mm.powers-roots',
  category: CAT,
  subcategory: 'powers-roots',
  generate(d, rng) {
    type Kind = 'square' | 'sqrt' | 'cube' | 'cbrt' | 'pow2' | 'sqrt-approx' | 'half-square'
    const kinds: Kind[] = byDifficulty<Kind[]>(d, [
      ['square', 'sqrt'],
      ['square', 'sqrt', 'cube'],
      ['square', 'cube', 'cbrt', 'pow2', 'sqrt'],
      ['square', 'cbrt', 'half-square', 'sqrt'],
      ['sqrt-approx', 'square', 'cbrt'],
    ])
    const kind = rng.pick(kinds)
    const time = expectedTime(5, d)
    switch (kind) {
      case 'square': {
        const n = byDifficulty(d, [
          () => rng.int(11, 25),
          () => rng.int(26, 59),
          () => uglyDigits(rng, 2),
          () => rng.pick([rng.int(101, 129), rng.int(191, 209), rng.int(245, 255), rng.int(295, 305)]),
          () => uglyDigits(rng, 3),
        ])()
        return { prompt: `$$${tex(n)}^2$$`, answer: intAnswer(n * n), explanation: squareSteps(n), expectedSeconds: time }
      }
      case 'sqrt': {
        const n = byDifficulty(d, [rng.int(11, 25), rng.int(21, 50), rng.int(31, 99), uglyDigits(rng, 3) % 200 + 100, 0])
        return {
          prompt: `$$\\sqrt{${tex(n * n)}}$$`,
          answer: intAnswer(n),
          explanation: [
            `The last digit of $${tex(n * n)}$ is $${(n * n) % 10}$, so the root ends in ${rootEndings((n * n) % 10)}`,
            `$${tex(n)}^2 = ${tex(n * n)}$`,
          ],
          expectedSeconds: time,
        }
      }
      case 'cube': {
        const n = rng.int(d <= 2 ? 2 : 11, d <= 2 ? 10 : 15)
        return {
          prompt: `$$${n}^3$$`,
          answer: intAnswer(n ** 3),
          explanation: [`$${n}^2 = ${tex(n * n)}$`, `$${tex(n * n)} \\times ${n} = ${tex(n ** 3)}$`],
          expectedSeconds: time,
        }
      }
      case 'cbrt': {
        const n = rng.int(d <= 3 ? 4 : 11, d <= 3 ? 15 : 30)
        return {
          prompt: `$$\\sqrt[3]{${tex(n ** 3)}}$$`,
          answer: intAnswer(n),
          explanation: [
            `Each last digit maps to a unique cube-root last digit; $${tex(n ** 3)}$ ends in $${n ** 3 % 10}$ → root ends in $${n % 10}$`,
            `$${n}^3 = ${tex(n ** 3)}$`,
          ],
          expectedSeconds: time,
        }
      }
      case 'pow2': {
        const k = rng.int(8, 20)
        return {
          prompt: `$$2^{${k}}$$`,
          answer: intAnswer(2 ** k),
          explanation: [`$2^{10} = 1{,}024$`, `$2^{${k}} = ${tex(2 ** k)}$`],
          expectedSeconds: time,
        }
      }
      case 'half-square': {
        const n = rng.int(3, 30) + 0.5
        const sq = frac(Math.round(n * 2), 2).pow(2)
        const lo = Math.floor(n)
        return {
          prompt: `$$${n}^2$$`,
          answer: exactDecAnswer(sq),
          explanation: [`Trick: $(n + 0.5)^2 = n(n+1) + 0.25$`, `$${lo} \\times ${lo + 1} + 0.25 = ${sq.toDecimalString()}$`],
          expectedSeconds: time,
        }
      }
      case 'sqrt-approx': {
        let N: number
        do N = rng.int(20, 9999)
        while (Number.isInteger(Math.sqrt(N)))
        const k = Math.round(Math.sqrt(N))
        const exact = Math.sqrt(N)
        return {
          prompt: `$$\\sqrt{${tex(N)}}$$ to 1 decimal place.`,
          answer: decAnswer(Math.round(exact * 10) / 10, { abs: 0.05 + 1e-9 }, 1),
          explanation: [
            `Nearest perfect square: $${k}^2 = ${tex(k * k)}$`,
            `Newton step: $\\sqrt{N} \\approx k + \\frac{N - k^2}{2k} = ${k} + \\frac{${N - k * k}}{${2 * k}} \\approx ${(k + (N - k * k) / (2 * k)).toFixed(2)}$`,
            `More precisely $\\sqrt{${tex(N)}} = ${exact.toFixed(3)}$ → $${(Math.round(exact * 10) / 10).toFixed(1)}$`,
          ],
          expectedSeconds: time,
          inputHint: '1 decimal place',
        }
      }
    }
  },
}

function rootEndings(lastDigit: number): string {
  const map: Record<number, string> = { 0: '0', 1: '1 or 9', 4: '2 or 8', 5: '5', 6: '4 or 6', 9: '3 or 7' }
  return map[lastDigit] ?? '?'
}

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

const percentages: QuestionTemplate = {
  id: 'mm.percentages',
  category: CAT,
  subcategory: 'percentages',
  generate(d, rng): QuestionDraft {
    const time = expectedTime(7, d)
    type Kind = 'of-easy' | 'of' | 'change' | 'reverse' | 'successive' | 'what-percent' | 'of-ugly' | 'compound' | 'change-ugly'
    const kind = byDifficulty<() => Kind>(d, [
      () => 'of-easy',
      () => rng.pick(['of', 'of'] as const),
      () => rng.pick(['change', 'of'] as const),
      () => rng.pick(['reverse', 'successive', 'what-percent'] as const),
      () => rng.pick(['of-ugly', 'compound', 'change-ugly'] as const),
    ])()

    switch (kind) {
      case 'of-easy':
      case 'of': {
        const p = kind === 'of-easy' ? rng.pick([10, 20, 25, 50, 75]) : rng.pick([5, 12, 15, 30, 35, 40, 45, 60, 65, 8])
        const n = kind === 'of-easy' ? rng.int(2, 60) * 20 : rng.int(12, 980)
        const r = frac(p * n, 100)
        return {
          prompt: `What is $${p}\\%$ of $${tex(n)}$?`,
          answer: exactDecAnswer(r),
          explanation: percentOfSteps(p, n, r),
          expectedSeconds: time,
        }
      }
      case 'of-ugly': {
        const p = frac(rng.int(11, 399), 10) // 1.1% .. 39.9%
        const n = uglyDigits(rng, 3)
        const r = p.mul(n).div(100)
        return {
          prompt: `What is $${p.toDecimalString()}\\%$ of $${tex(n)}$?`,
          answer: decAnswer(r.toNumber(), { abs: 0.05 }, 2),
          explanation: [
            `$${p.toDecimalString()}\\% \\times ${tex(n)} = \\frac{${p.toDecimalString()} \\times ${tex(n)}}{100}$`,
            `$= ${r.toDecimalString(4)}$ (within 0.05 is accepted)`,
          ],
          expectedSeconds: time,
          inputHint: '2 decimal places',
        }
      }
      case 'change': {
        const p = rng.pick([5, 10, 12.5, 15, 20, 25, 30, 40, 60, 75, -5, -10, -12.5, -15, -20, -25, -30, -40, -60])
        const pf = Fraction.from(p)
        // A must be a multiple of the factor's denominator so B is an integer.
        const factor = pf.div(100).add(1)
        const den = Number(factor.den)
        const A = den * rng.int(Math.max(1, Math.ceil(20 / den)), Math.floor(800 / den))
        const B = frac(A).mul(factor)
        assert(B.isInteger(), 'percent change endpoint integer')
        return {
          prompt: `A price moves from $${tex(A)}$ to $${tex(B.toNumber())}$. What is the percentage change?`,
          answer: exactDecAnswer(pf),
          percentUnits: true,
          unit: { suffix: '%' },
          explanation: [
            `Change $= ${tex(B.toNumber())} - ${tex(A)} = ${tex(B.toNumber() - A)}$`,
            `$\\frac{${tex(B.toNumber() - A)}}{${tex(A)}} = ${pf.toDecimalString()}\\%$`,
          ],
          expectedSeconds: time,
          inputHint: 'Percent (negative for a decrease)',
        }
      }
      case 'change-ugly': {
        const A = uglyDigits(rng, 3)
        let B: number
        do B = A + rng.int(-Math.floor(A * 0.4), Math.floor(A * 0.6))
        while (B === A)
        const change = ((B - A) / A) * 100
        return {
          prompt: `A stock goes from $${tex(A)}$ to $${tex(B)}$. Percentage change, to 1 decimal place?`,
          answer: decAnswer(Math.round(change * 10) / 10, { abs: 0.1 }, 1),
          percentUnits: true,
          unit: { suffix: '%' },
          explanation: [`$\\frac{${tex(B)} - ${tex(A)}}{${tex(A)}} = \\frac{${tex(B - A)}}{${tex(A)}} \\approx ${change.toFixed(2)}\\%$`],
          expectedSeconds: time,
          inputHint: 'Percent, 1 d.p.',
        }
      }
      case 'reverse': {
        const p = rng.pick([10, 20, 25, 30, 40, 50, 60, 12.5, 15, -10, -20, -25, -40])
        const pf = Fraction.from(p)
        const factor = pf.div(100).add(1)
        // Choose original so final is an integer.
        const original = rng.int(4, 99) * Number(factor.den) * (rng.chance(0.5) ? 1 : 2)
        const final = factor.mul(original)
        assert(final.isInteger(), 'reverse percent integer')
        return {
          prompt: `After a ${p > 0 ? `$${p}\\%$ increase` : `$${-p}\\%$ decrease`}, a price is $${tex(final.toNumber())}$. What was the original price?`,
          answer: intAnswer(original),
          explanation: [
            `Original $\\times ${factor.toDecimalString()} = ${tex(final.toNumber())}$`,
            `Original $= ${tex(final.toNumber())} \\div ${factor.toDecimalString()} = ${tex(original)}$`,
          ],
          expectedSeconds: time,
        }
      }
      case 'successive': {
        const a = rng.pick([10, 20, 25, 30, 40, 50])
        const b = rng.pick([10, 20, 25, 30, 40, 50])
        const net = frac(100 + a, 100).mul(frac(100 - b, 100)).sub(1).mul(100)
        return {
          prompt: `A price rises $${a}\\%$, then falls $${b}\\%$. What is the net percentage change?`,
          answer: exactDecAnswer(net),
          percentUnits: true,
          unit: { suffix: '%' },
          explanation: [
            `Multiply the factors: $${frac(100 + a, 100).toDecimalString()} \\times ${frac(100 - b, 100).toDecimalString()} = ${net.div(100).add(1).toDecimalString()}$`,
            `Net change: $${net.toDecimalString()}\\%$ (not $${a - b}\\%$!)`,
          ],
          expectedSeconds: time,
          inputHint: 'Percent (negative for a decrease)',
        }
      }
      case 'what-percent': {
        const whole = rng.pick([40, 80, 120, 160, 200, 240, 250, 320, 400, 480, 500, 640, 800])
        let part: number
        do part = rng.int(1, whole - 1)
        while (!frac(part * 100, whole).mul(10).isInteger())
        const r = frac(part * 100, whole)
        return {
          prompt: `$${tex(part)}$ is what percent of $${tex(whole)}$?`,
          answer: exactDecAnswer(r),
          percentUnits: true,
          unit: { suffix: '%' },
          explanation: [`$\\frac{${tex(part)}}{${tex(whole)}} \\times 100 = ${r.toDecimalString()}\\%$`],
          expectedSeconds: time,
          inputHint: 'Percent',
        }
      }
      case 'compound': {
        const r = rng.pick([3, 4, 5, 6, 8, 10, 12])
        const years = rng.int(2, 4)
        const total = (1 + r / 100) ** years - 1
        return {
          prompt: `An investment grows $${r}\\%$ per year, compounded annually, for ${years} years. Total percentage gain, to 1 decimal place?`,
          answer: decAnswer(Math.round(total * 1000) / 10, { abs: 0.1 }, 1),
          percentUnits: true,
          unit: { suffix: '%' },
          explanation: [
            `$(1 + ${r / 100})^{${years}} = ${((1 + r / 100) ** years).toFixed(5)}$`,
            `Gain $\\approx ${(total * 100).toFixed(2)}\\%$ (simple interest would give $${r * years}\\%$)`,
          ],
          expectedSeconds: time,
          inputHint: 'Percent, 1 d.p.',
        }
      }
    }
  },
}

function percentOfSteps(p: number, n: number, r: Fraction): string[] {
  const tenth = frac(n, 10)
  if (p % 10 === 0) return [`$10\\%$ of $${tex(n)}$ is $${tenth.toDecimalString()}$`, `$\\times ${p / 10} = ${r.toDecimalString()}$`]
  if (p % 5 === 0) {
    return [
      `$10\\%$ of $${tex(n)}$ is $${tenth.toDecimalString()}$, $5\\%$ is $${tenth.div(2).toDecimalString()}$`,
      `$${p}\\% = ${Math.floor(p / 10)} \\times 10\\% + 5\\% = ${r.toDecimalString()}$`,
    ]
  }
  return [`$${p}\\% \\times ${tex(n)} = \\frac{${p} \\times ${tex(n)}}{100} = ${r.toDecimalString()}$`]
}

// ---------------------------------------------------------------------------
// Mixed-operation expressions (order of operations)
// ---------------------------------------------------------------------------

type Expr = { tex: string; value: number; steps: string[] }

function lit(n: number): Expr {
  return { tex: n < 0 ? `(${tex(n)})` : tex(n), value: n, steps: [] }
}

function bin(op: '+' | '-' | '*' | '/', a: Expr, b: Expr, paren = false): Expr {
  const value = op === '+' ? a.value + b.value : op === '-' ? a.value - b.value : op === '*' ? a.value * b.value : a.value / b.value
  const body = `${a.tex} ${opTex[op]} ${b.tex}`
  const step = `$${body} = ${tex(value)}$`
  return { tex: paren ? `(${body})` : body, value, steps: [...a.steps, ...b.steps, step] }
}

/** A product a*b with factor sizes per difficulty. */
function product(rng: SeededRNG, d: Difficulty): Expr {
  const a = d <= 2 ? rng.int(2, 12) : rng.int(6, 25)
  const b = d <= 2 ? rng.int(2, 12) : rng.int(3, 19)
  return bin('*', lit(a), lit(b))
}

/** An exact quotient a/b. */
function quotient(rng: SeededRNG, d: Difficulty): Expr {
  const b = d <= 2 ? rng.int(2, 9) : rng.int(3, 15)
  const q = d <= 2 ? rng.int(2, 12) : rng.int(4, 30)
  return bin('/', lit(b * q), lit(b))
}

const expressions: QuestionTemplate = {
  id: 'mm.expressions',
  category: CAT,
  subcategory: 'expressions',
  generate(d, rng) {
    const n = (lo: number, hi: number) => lit(rng.int(lo, hi))
    let e: Expr
    const shape = rng.int(0, 2)
    switch (d) {
      case 1:
        e = shape === 0 ? bin('+', product(rng, d), n(2, 40)) : shape === 1 ? bin('+', n(2, 40), product(rng, d)) : bin('-', product(rng, d), n(1, 20))
        break
      case 2:
        e = shape === 0 ? bin('+', product(rng, d), product(rng, d)) : shape === 1 ? bin('-', bin('+', n(10, 99), product(rng, d)), n(1, 30)) : bin('+', quotient(rng, d), product(rng, d))
        break
      case 3: {
        if (shape === 0) e = bin('-', bin('*', bin('+', n(2, 20), n(2, 20), true), n(3, 12)), n(5, 60))
        else if (shape === 1) e = bin('+', bin('-', product(rng, d), quotient(rng, d)), n(5, 50))
        else e = bin('*', bin('-', n(15, 40), n(2, 14), true), bin('+', n(2, 12), n(2, 12), true))
        break
      }
      case 4: {
        if (shape === 0) e = bin('-', bin('+', product(rng, d), product(rng, d)), quotient(rng, d))
        else if (shape === 1) {
          // (a + b) x (c - d) / k with k chosen to divide the product exactly.
          let inner: Expr
          let divisors: number[]
          do {
            inner = bin('*', bin('+', n(3, 25), n(3, 25), true), bin('-', n(12, 30), n(1, 11), true))
            const v = inner.value
            divisors = [3, 4, 6, 7, 8, 9, 12].filter((k) => v % k === 0)
          } while (divisors.length === 0)
          e = bin('/', inner, lit(rng.pick(divisors)))
        } else e = bin('-', bin('*', product(rng, d), n(2, 5)), product(rng, d))
        break
      }
      default: {
        const sq = rng.int(11, 25)
        const sqExpr: Expr = { tex: `${sq}^2`, value: sq * sq, steps: [`$${sq}^2 = ${tex(sq * sq)}$`] }
        if (shape === 0) e = bin('+', bin('-', sqExpr, product(rng, d)), quotient(rng, d))
        else if (shape === 1) e = bin('-', bin('*', lit(-rng.int(3, 15)), n(4, 19)), bin('*', lit(-rng.int(3, 15)), n(4, 19)))
        else {
          const a = rng.int(12, 40)
          const b = rng.int(2, 11)
          const pexp: Expr = { tex: `(${a} - ${b})^2`, value: (a - b) ** 2, steps: [`$(${a} - ${b})^2 = ${a - b}^2 = ${tex((a - b) ** 2)}$`] }
          e = bin('-', pexp, product(rng, d))
        }
      }
    }
    assert(Number.isInteger(e.value), 'expression is an integer')
    return {
      prompt: `$$${e.tex}$$`,
      answer: intAnswer(e.value),
      explanation: ['Multiplication and division before addition and subtraction; brackets first.', ...e.steps],
      expectedSeconds: expectedTime(8, d),
    }
  },
}

// ---------------------------------------------------------------------------
// Nearest answer (multiple choice)
// ---------------------------------------------------------------------------

function niceDecimal(rng: SeededRNG, lo: number, hi: number, decimals: number): number {
  const m = 10 ** decimals
  let x: number
  do x = rng.int(Math.ceil(lo * m), Math.floor(hi * m)) / m
  while (Math.round(x * m) % 10 === 0)
  return x
}

/**
 * Build options around a true value: one within `gap/4` (the answer) and
 * distractors at multiples of `gap`, rounded to 3 significant figures.
 */
export function nearestChoices(rng: SeededRNG, value: number, gap: number): { choices: string[]; correct: string } {
  const sig = 3
  const correctVal = roundSig(value * (1 + rng.float(-gap / 5, gap / 5)), sig)
  const ks = rng.sample([-3, -2, -1, 1, 2, 3], 4)
  const distractors = ks.map((k) => roundSig(value * (1 + k * gap), sig))
  const fmt = (x: number) => formatNumber(x, 6)
  return { correct: fmt(correctVal), choices: distractors.map(fmt) }
}

const nearest: QuestionTemplate = {
  id: 'mm.nearest',
  category: CAT,
  subcategory: 'nearest',
  weight: 1.4,
  generate(d, rng) {
    const gap = byDifficulty(d, [0.15, 0.12, 0.09, 0.07, 0.05])
    let exprTex: string
    let value: number
    const explanation: string[] = []
    const kind = rng.int(0, 2)
    switch (d) {
      case 1: {
        const a = uglyDigits(rng, 2)
        const b = niceDecimal(rng, 1.1, 9.9, 1)
        exprTex = `${a} \\times ${b}`
        value = a * b
        explanation.push(`$${a} \\times ${b} \\approx ${a} \\times ${Math.round(b)} = ${a * Math.round(b)}$, then adjust`)
        break
      }
      case 2: {
        const a = uglyDigits(rng, 3)
        const b = niceDecimal(rng, 2.1, 19.9, 1)
        exprTex = `${tex(a)} \\div ${b}`
        value = a / b
        explanation.push(`$${tex(a)} \\div ${b} \\approx ${tex(a)} \\div ${Math.round(b)} \\approx ${(a / Math.round(b)).toFixed(1)}$, then adjust`)
        break
      }
      case 3: {
        const a = niceDecimal(rng, 11, 99, 1)
        const b = niceDecimal(rng, 1.1, 9.9, 2)
        const c = niceDecimal(rng, 1.1, 9.9, 1)
        exprTex = `\\frac{${a} \\times ${b}}{${c}}`
        value = (a * b) / c
        explanation.push(`Round each: $\\frac{${Math.round(a)} \\times ${Math.round(b)}}{${Math.round(c)}} \\approx ${((Math.round(a) * Math.round(b)) / Math.round(c)).toFixed(1)}$, then refine`)
        break
      }
      case 4: {
        if (kind === 0) {
          const N = rng.int(150, 9999)
          exprTex = `\\sqrt{${tex(N)}}`
          value = Math.sqrt(N)
          const k = Math.round(Math.sqrt(N))
          explanation.push(`$${k}^2 = ${tex(k * k)}$, so $\\sqrt{${tex(N)}} \\approx ${k} + \\frac{${N - k * k}}{${2 * k}}$`)
        } else {
          const p = niceDecimal(rng, 3.1, 39.9, 1)
          const n = uglyDigits(rng, 4)
          exprTex = `${p}\\% \\text{ of } ${tex(n)}`
          value = (p * n) / 100
          explanation.push(`$${p}\\% \\times ${tex(n)} \\approx ${(value).toFixed(1)}$`)
        }
        break
      }
      default: {
        const a = niceDecimal(rng, 1.1, 99, 2)
        const b = niceDecimal(rng, 1.1, 99, 1)
        const c = niceDecimal(rng, 1.1, 9.9, 2)
        const e = niceDecimal(rng, 1.1, 9.9, 1)
        exprTex = `\\frac{${a} \\times ${b}}{${c} \\times ${e}}`
        value = (a * b) / (c * e)
        explanation.push(`Numerator $\\approx ${(a * b).toFixed(0)}$, denominator $\\approx ${(c * e).toFixed(1)}$`)
      }
    }
    const { choices, correct } = nearestChoices(rng, value, gap)
    explanation.push(`Exact value $\\approx ${formatNumber(value, 3)}$; the nearest option is $${correct}$`)
    return {
      prompt: `Which is closest to $${exprTex}$?`,
      answer: mcAnswer(rng, correct, choices, { sortNumeric: true }),
      explanation,
      expectedSeconds: expectedTime(8, d),
      meta: { value },
    }
  },
}

export const mentalMathTemplates: QuestionTemplate[] = [
  addSub,
  multiplication,
  division,
  decimals,
  conversions,
  powersRoots,
  percentages,
  expressions,
  nearest,
]

export const mentalMathGenerator = makeGenerator(CAT, 'Mental Math', MENTAL_MATH_SUBCATEGORIES, mentalMathTemplates)
