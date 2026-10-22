/**
 * Splits prompt/explanation text into plain-text and LaTeX segments.
 *   $$...$$  display math
 *   $...$    inline math
 *   \$       a literal dollar sign (outside math)
 * Newlines in text are preserved as line breaks by the renderer.
 */
export type MathSegment = { kind: 'text'; value: string } | { kind: 'inline' | 'display'; value: string }

export function splitMath(input: string): MathSegment[] {
  const out: MathSegment[] = []
  let text = ''
  let i = 0
  const flushText = () => {
    if (text) out.push({ kind: 'text', value: text })
    text = ''
  }
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\\' && input[i + 1] === '$') {
      text += '$'
      i += 2
      continue
    }
    if (ch === '$') {
      const display = input[i + 1] === '$'
      const open = display ? 2 : 1
      const close = findClose(input, i + open, display)
      if (close === -1) {
        // Unbalanced: treat the rest literally.
        text += input.slice(i)
        break
      }
      flushText()
      out.push({ kind: display ? 'display' : 'inline', value: input.slice(i + open, close).trim() })
      i = close + open
      continue
    }
    text += ch
    i++
  }
  flushText()
  return out
}

function findClose(s: string, from: number, display: boolean): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') {
      j++ // skip escaped char (including \$ inside math)
      continue
    }
    if (s[j] === '$') {
      if (!display) return j
      if (s[j + 1] === '$') return j
    }
  }
  return -1
}

/** Strip math delimiters for plain-text contexts (titles, aria labels). */
export function plainText(input: string): string {
  return splitMath(input)
    .map((s) => s.value)
    .join('')
}
