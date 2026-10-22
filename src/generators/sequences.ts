/**
 * Sequences & patterns: find the next term. All terms are integers; each
 * template records its rule in `meta` so tests can re-derive the answer.
 */
import { frac } from '../core/fraction'
import type { SeededRNG } from '../core/rng'
import type { Difficulty, QuestionDraft, QuestionTemplate } from '../core/types'
import { factorial, isPrime, primes } from '../core/math'
import { assert, byDifficulty, expectedTime, intAnswer, tex } from './helpers'
import { makeGenerator } from './registry'

const CAT = 'sequences' as const

export const SEQUENCE_SUBCATEGORIES = [
  { id: 'arithmetic', label: 'Arithmetic' },
  { id: 'geometric', label: 'Geometric' },
  { id: 'second-differences', label: 'Second differences' },
  { id: 'interleaved', label: 'Interleaved' },
  { id: 'fibonacci', label: 'Fibonacci-like' },
  { id: 'alternating', label: 'Alternating operations' },
  { id: 'primes', label: 'Prime-based' },
  { id: 'powers', label: 'Powers & factorials' },
] as const

const PRIMES = primes(60)

function seqTex(terms: readonly number[]): string {
  return `$$${terms.map((t) => tex(t)).join(',\\;\\; ')},\\;\\; \\textbf{?}$$`
}

function draft(d: Difficulty, shown: number[], next: number, explanation: string[], meta: Record<string, unknown>, base = 9): QuestionDraft {
  assert(shown.every(Number.isSafeInteger) && Number.isSafeInteger(next), 'integer terms')
  assert(new Set(shown).size > 1, 'non-constant sequence')
  return {
    prompt: `What comes next?\n${seqTex(shown)}`,
    answer: intAnswer(next),
    explanation: [...explanation, `Next term: $${tex(next)}$`],
    expectedSeconds: expectedTime(base, d),
    meta: { ...meta, shown, next },
  }
}

function diffs(xs: readonly number[]): number[] {
  return xs.slice(1).map((x, i) => x - xs[i])
}

function nonZero(rng: SeededRNG, lo: number, hi: number): number {
  let x: number
  do x = rng.int(lo, hi)
  while (x === 0)
  return x
}

// ---------------------------------------------------------------------------

const arithmetic: QuestionTemplate = {
  id: 'seq.arithmetic',
  category: CAT,
  subcategory: 'arithmetic',
  generate(d, rng) {
    const [a, step] = byDifficulty(d, [
      () => [rng.int(1, 20), rng.int(2, 9)],
      () => [rng.int(10, 99), rng.pick([rng.int(-12, -2), rng.int(11, 25)])],
      () => [rng.int(100, 999), nonZero(rng, -99, 99)],
      () => [rng.int(-500, 999), nonZero(rng, -250, 250)],
      () => [rng.int(1000, 9999), nonZero(rng, -999, 999)],
    ])()
    const step2 = Math.abs(step) < 2 ? step * 7 : step
    const n = 5
    const terms = Array.from({ length: n + 1 }, (_, i) => a + i * step2)
    return draft(d, terms.slice(0, n), terms[n], [`Constant difference of $${tex(step2)}$`, `$${tex(terms[n - 1])} ${step2 < 0 ? '-' : '+'} ${tex(Math.abs(step2))} = ${tex(terms[n])}$`], { rule: 'arithmetic', a, step: step2 }, 6)
  },
}

const geometric: QuestionTemplate = {
  id: 'seq.geometric',
  category: CAT,
  subcategory: 'geometric',
  generate(d, rng) {
    const n = 5
    // Ratio as p/q; the start is a multiple of q^(n) so every term is an integer.
    const [p, q] = byDifficulty<() => readonly [number, number]>(d, [
      () => rng.pick([[2, 1], [3, 1]] as const),
      () => rng.pick([[4, 1], [5, 1], [-2, 1], [3, 1]] as const),
      () => rng.pick([[1, 2], [-3, 1], [6, 1], [1, 3]] as const),
      () => rng.pick([[3, 2], [-1, 2], [2, 3], [5, 2]] as const),
      () => rng.pick([[-3, 2], [4, 3], [5, 4], [-2, 3], [3, 4]] as const),
    ])()
    const m = rng.int(1, d >= 4 ? 3 : 5) * (d >= 3 && rng.chance(0.4) ? -1 : 1)
    const start = m * q ** n
    const r = frac(p, q)
    const terms: number[] = [start]
    for (let i = 1; i <= n; i++) terms.push(r.mul(terms[i - 1]).toNumber())
    terms.forEach((t) => assert(Number.isInteger(t), 'geometric terms integral'))
    return draft(
      d,
      terms.slice(0, n),
      terms[n],
      [`Each term is the previous one times $${r.toLatex()}$`, `$${tex(terms[n - 1])} \\times ${r.toLatex()} = ${tex(terms[n])}$`],
      { rule: 'geometric', start, p, q },
      7,
    )
  },
}

const secondDifferences: QuestionTemplate = {
  id: 'seq.second-differences',
  category: CAT,
  subcategory: 'second-differences',
  generate(d, rng) {
    const n = d >= 5 ? 6 : 5
    let f: (i: number) => number
    let rule: string
    let meta: Record<string, unknown>
    switch (d) {
      case 1: {
        const c = rng.int(-5, 10)
        const off = rng.int(1, 4)
        f = (i) => (i + off) ** 2 + c
        rule = `squares shifted by $${c}$: differences grow by 2`
        meta = { kind: 'quadratic', a: 1 }
        break
      }
      case 2:
      case 3: {
        const a2 = d === 2 ? rng.int(1, 3) : rng.int(2, 7) // second difference
        const d1 = rng.int(d === 2 ? 1 : -10, 12) // first difference
        const s = rng.int(d === 2 ? 1 : -20, 30)
        f = (i) => s + d1 * i + (a2 * i * (i - 1)) / 2
        rule = `the differences go up by $${a2}$ each time`
        meta = { kind: 'quadratic', a2 }
        break
      }
      case 4: {
        const base = rng.pick([2, 3])
        const s = rng.int(1, 20)
        const k = rng.int(1, 3)
        f = (i) => s + (k * (base ** i - 1)) / (base - 1)
        rule = `the differences multiply by $${base}$ each time`
        meta = { kind: 'geometric-differences', base }
        break
      }
      default: {
        const a3 = rng.int(1, 2)
        const b = rng.int(-3, 3)
        const c = rng.int(-5, 5)
        const e = rng.int(-10, 10)
        f = (i) => a3 * i ** 3 + b * i ** 2 + c * i + e
        rule = `third differences are constant ($${6 * a3}$): a cubic`
        meta = { kind: 'cubic' }
      }
    }
    const terms = Array.from({ length: n + 1 }, (_, i) => f(i + 1))
    const d1s = diffs(terms.slice(0, n))
    const d2s = diffs(d1s)
    assert(new Set(d2s).size >= 1 && d2s.some((x) => x !== 0), 'genuinely non-linear')
    return draft(
      d,
      terms.slice(0, n),
      terms[n],
      [
        `First differences: $${d1s.map((x) => tex(x)).join(', ')}$`,
        `Second differences: $${d2s.map((x) => tex(x)).join(', ')}$ — ${rule}`,
        `Next difference: $${tex(terms[n] - terms[n - 1])}$`,
      ],
      meta,
      11,
    )
  },
}

const interleaved: QuestionTemplate = {
  id: 'seq.interleaved',
  category: CAT,
  subcategory: 'interleaved',
  generate(d, rng) {
    const makeSeq = (kind: 'arith' | 'geo', len: number): { terms: number[]; desc: string } => {
      if (kind === 'arith') {
        const a = rng.int(1, d >= 3 ? 60 : 20)
        const s = nonZero(rng, d >= 3 ? -9 : 1, d >= 3 ? 13 : 7)
        return { terms: Array.from({ length: len }, (_, i) => a + i * s), desc: `adds $${s}$` }
      }
      const a = rng.int(1, 4)
      const r = rng.pick([2, 3])
      return { terms: Array.from({ length: len }, (_, i) => a * r ** i), desc: `multiplies by $${r}$` }
    }
    const shownLen = byDifficulty(d, [7, 7, 8, 8, 9])
    const ways = d === 5 ? 3 : 2
    const kinds = byDifficulty<('arith' | 'geo')[]>(d, [
      ['arith', 'arith'],
      ['arith', 'arith'],
      ['arith', 'geo'],
      [rng.pick(['arith', 'geo'] as const), 'geo'],
      ['arith', 'geo', 'arith'],
    ])
    const each = Math.ceil((shownLen + 1) / ways) + 1
    let subs: { terms: number[]; desc: string }[]
    do subs = kinds.map((k) => makeSeq(k, each))
    while (subs.some((s, i) => subs.some((t, j) => j > i && s.terms[0] === t.terms[0] && s.terms[1] === t.terms[1])))
    const all: number[] = []
    for (let i = 0; i <= shownLen; i++) all.push(subs[i % ways].terms[Math.floor(i / ways)])
    const owner = shownLen % ways
    return draft(
      d,
      all.slice(0, shownLen),
      all[shownLen],
      [
        `${ways === 2 ? 'Two' : 'Three'} sequences are interleaved (every ${ways === 2 ? 'other' : 'third'} term).`,
        ...subs.map((s, i) => `Sequence ${i + 1} (${ordinalPositions(i, ways)}) ${s.desc}: $${s.terms.slice(0, 4).map((x) => tex(x)).join(', ')}, \\dots$`),
        `The next term belongs to sequence ${owner + 1}.`,
      ],
      { rule: 'interleaved', ways },
      10,
    )
  },
}

function ordinalPositions(i: number, ways: number): string {
  const pos = [i + 1, i + 1 + ways, i + 1 + 2 * ways]
  return `positions ${pos.join(', ')}, …`
}

const fibonacci: QuestionTemplate = {
  id: 'seq.fibonacci',
  category: CAT,
  subcategory: 'fibonacci',
  generate(d, rng) {
    // Retry rare degenerate starts (e.g. 1, 1 with "+c = -1" is constant).
    for (;;) {
      const q = fibonacciOnce(d, rng)
      if (q) return q
    }
  },
}

function fibonacciOnce(d: Difficulty, rng: SeededRNG): QuestionDraft | null {
    const n = byDifficulty(d, [6, 6, 6, 7, 6])
    let terms: number[]
    let desc: string
    switch (d) {
      case 1:
      case 2: {
        const a = rng.int(1, d === 1 ? 5 : 15)
        const b = rng.int(a === 1 ? 2 : 1, d === 1 ? 8 : 25)
        terms = [a, b]
        while (terms.length <= n) terms.push(terms.at(-1)! + terms.at(-2)!)
        desc = 'Each term is the sum of the previous two'
        break
      }
      case 3: {
        const a = rng.int(1, 10)
        const b = rng.int(1, 10)
        const c = rng.pick([1, 2, 3, -1, -2])
        terms = [a, b]
        while (terms.length <= n) terms.push(terms.at(-1)! + terms.at(-2)! + c)
        desc = `Each term is the sum of the previous two, ${c > 0 ? 'plus' : 'minus'} $${Math.abs(c)}$`
        break
      }
      case 4: {
        terms = [rng.int(0, 3), rng.int(1, 4), rng.int(1, 6)]
        while (terms.length <= n) terms.push(terms.at(-1)! + terms.at(-2)! + terms.at(-3)!)
        desc = 'Each term is the sum of the previous three (tribonacci)'
        break
      }
      default: {
        if (rng.chance(0.5)) {
          const k = rng.pick([2, 3])
          terms = [rng.int(1, 4), rng.int(1, 5)]
          while (terms.length <= n) terms.push(terms.at(-1)! + k * terms.at(-2)!)
          desc = `Each term is the previous term plus $${k}\\times$ the one before it`
        } else {
          terms = [rng.int(1, 3), rng.int(2, 3)]
          while (terms.length <= n) terms.push(terms.at(-1)! * terms.at(-2)!)
          desc = 'Each term is the product of the previous two'
        }
      }
    }
    // The recurrence must not also look arithmetic (or constant).
    if (new Set(diffs(terms.slice(0, n))).size <= 1) return null
    return draft(d, terms.slice(0, n), terms[n], [desc], { rule: 'fibonacci' }, 8)
}

const alternating: QuestionTemplate = {
  id: 'seq.alternating',
  category: CAT,
  subcategory: 'alternating',
  generate(d, rng) {
    type Op = { kind: '+' | '-' | '*'; k: number }
    const apply = (x: number, o: Op) => (o.kind === '+' ? x + o.k : o.kind === '-' ? x - o.k : x * o.k)
    const opTex = (o: Op) => (o.kind === '*' ? `\\times ${o.k}` : `${o.kind} ${o.k}`)
    let ops: Op[]
    let growing = false
    switch (d) {
      case 1: {
        const a = rng.int(4, 9)
        const b = rng.int(1, a - 1)
        ops = [{ kind: '+', k: a }, { kind: '-', k: b }]
        break
      }
      case 2:
        ops = [{ kind: '+', k: rng.int(1, 6) }, { kind: '*', k: 2 }]
        break
      case 3:
        ops = [{ kind: '*', k: rng.pick([2, 3]) }, { kind: '-', k: rng.int(1, 9) }]
        break
      case 4:
        ops = [{ kind: '*', k: 2 }, { kind: '+', k: rng.int(1, 7) }, { kind: '-', k: rng.int(2, 9) }]
        break
      default:
        ops = [{ kind: '+', k: 1 }, { kind: '*', k: 2 }]
        growing = true
    }
    const n = byDifficulty(d, [6, 6, 6, 7, 7])
    // Start above every subtracted constant so the sequence grows and never hits 0.
    const maxSub = Math.max(0, ...ops.filter((o) => o.kind === '-').map((o) => o.k))
    let start = rng.int(maxSub + 1, maxSub + (d >= 3 ? 12 : 9))
    const terms = [start]
    const applied: string[] = []
    for (let i = 0; i < n; i++) {
      let o = ops[i % ops.length]
      if (growing && o.kind === '+') o = { kind: '+', k: Math.floor(i / 2) + 1 }
      start = apply(start, o)
      terms.push(start)
      applied.push(opTex(o))
    }
    assert(terms.every((t) => t > 0), 'alternating terms stay positive')
    return draft(
      d,
      terms.slice(0, n),
      terms[n],
      [
        growing
          ? 'Alternate "add k" (with k = 1, 2, 3, …) and "double"'
          : `The operations cycle: ${ops.map((o) => `$${opTex(o)}$`).join(', then ')}`,
        `Applied: ${applied.map((x) => `$${x}$`).join(', ')}`,
      ],
      { rule: 'alternating', ops },
      9,
    )
  },
}

const primeBased: QuestionTemplate = {
  id: 'seq.primes',
  category: CAT,
  subcategory: 'primes',
  generate(d, rng) {
    const n = 6
    const s = rng.int(0, d <= 2 ? 6 : 10)
    const P = (i: number) => PRIMES[s + i]
    type Kind = { f: (i: number) => number; desc: string; fromTwo?: boolean }
    const kinds: Kind[][] = [
      [{ f: (i) => P(i), desc: 'consecutive primes' }],
      [
        { f: (i) => P(i) + 1, desc: 'primes plus 1' },
        { f: (i) => 2 * P(i), desc: 'twice the primes' },
        { f: (i) => P(i) - 1, desc: 'primes minus 1' },
      ],
      [
        { f: (i) => P(i) ** 2, desc: 'squares of the primes' },
        { f: (i) => PRIMES[s + 2 * i], desc: 'every other prime' },
        { f: (i) => P(i) ** 2 - 1, desc: 'prime squared minus 1' },
      ],
      [
        { f: (i) => P(i) * P(i + 1), desc: 'products of consecutive primes' },
        { f: (i) => PRIMES.slice(0, i + 1).reduce((a, b) => a + b, 0), desc: 'running sums of the primes (2, 2+3, 2+3+5, …)', fromTwo: true },
        { f: (i) => P(i) + P(i + 1), desc: 'sums of consecutive primes' },
      ],
      [
        { f: (i) => (i + 1) * P(i), desc: 'the $n$-th term is $n$ times a prime' },
        { f: (i) => P(i) ** 2 + P(i), desc: '$p^2 + p$ for consecutive primes $p$' },
        { f: (i) => PRIMES[P(i) - 1], desc: 'prime-indexed primes ($p_{p_n}$)' },
      ],
    ]
    const kind = rng.pick(kinds[d - 1])
    const terms = Array.from({ length: n + 1 }, (_, i) => kind.f(i))
    const used = kind.fromTwo ? PRIMES.slice(0, n + 1) : PRIMES.slice(s, s + n + 2)
    return draft(
      d,
      terms.slice(0, n),
      terms[n],
      [`Pattern: ${kind.desc}`, `Primes involved: $${used.join(', ')}, \\dots$`],
      { rule: 'primes', desc: kind.desc, allPrime: terms.every(isPrime) },
      10,
    )
  },
}

const powers: QuestionTemplate = {
  id: 'seq.powers',
  category: CAT,
  subcategory: 'powers',
  generate(d, rng) {
    const n = 6
    const s = rng.int(1, d <= 2 ? 6 : 9)
    type Kind = { f: (i: number) => number; desc: string }
    const kinds: Kind[][] = [
      [
        { f: (i) => (s + i) ** 2, desc: 'perfect squares' },
        { f: (i) => ((s + i) * (s + i + 1)) / 2, desc: 'triangular numbers $\\frac{n(n+1)}{2}$' },
      ],
      [
        { f: (i) => (s + i) ** 3, desc: 'perfect cubes' },
        { f: (i) => 2 ** (s + i) - 1, desc: '$2^n - 1$' },
        { f: (i) => (s + i) ** 2 + 1, desc: '$n^2 + 1$' },
      ],
      [
        { f: (i) => (s + i) ** 3 - (s + i), desc: '$n^3 - n$' },
        { f: (i) => Number(factorial(i + 1)), desc: 'factorials' },
        { f: (i) => (s + i) * (s + i + 2), desc: '$n(n+2)$' },
      ],
      [
        { f: (i) => (s + i) ** 2 * (i % 2 === 0 ? 1 : -1), desc: 'squares with alternating sign' },
        { f: (i) => 3 ** (i + 1) - 2 ** (i + 1), desc: '$3^n - 2^n$' },
        { f: (i) => Number(factorial(i + 1)) + i + 1, desc: '$n! + n$' },
      ],
      [
        { f: (i) => (i + 1) ** (i + 1), desc: '$n^n$' },
        { f: (i) => (s + i) ** 3 + (s + i) ** 2, desc: '$n^3 + n^2$' },
        { f: (i) => Number(factorial(i + 1)) * (i + 1), desc: '$n \\cdot n!$' },
      ],
    ]
    const kind = rng.pick(kinds[d - 1])
    const terms = Array.from({ length: n + 1 }, (_, i) => kind.f(i))
    return draft(d, terms.slice(0, n), terms[n], [`Pattern: ${kind.desc}`], { rule: 'powers', desc: kind.desc }, 8)
  },
}

export const sequenceTemplates: QuestionTemplate[] = [
  arithmetic,
  geometric,
  secondDifferences,
  interleaved,
  fibonacci,
  alternating,
  primeBased,
  powers,
]

export const sequencesGenerator = makeGenerator(CAT, 'Sequences', SEQUENCE_SUBCATEGORIES, sequenceTemplates)
