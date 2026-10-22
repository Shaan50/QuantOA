/** Tiny synthesized sound effects (no assets) via the Web Audio API. */
let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

function ac(): AudioContext | null {
  if (!enabled) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slideTo?: number) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export const sfx = {
  correct() {
    tone(880, 0.09, 'sine', 0.08)
    tone(1320, 0.12, 'sine', 0.06, 0.06)
  },
  wrong() {
    tone(220, 0.22, 'triangle', 0.09, 0, 140)
  },
  skip() {
    tone(520, 0.06, 'sine', 0.04)
  },
  tick() {
    tone(1000, 0.03, 'square', 0.025)
  },
  warn() {
    tone(660, 0.12, 'sine', 0.06)
    tone(660, 0.12, 'sine', 0.06, 0.18)
  },
  finish() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'sine', 0.06, i * 0.09))
  },
  trade() {
    tone(1200, 0.05, 'square', 0.03)
  },
}
