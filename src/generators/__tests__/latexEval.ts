/**
 * A tiny, independent evaluator for the arithmetic LaTeX our mental-math
 * prompts use. Tests compare its result with each generator's stored answer.
 */
export function evalLatex(src: string): number {
  let s = src
    .replace(/\$\$/g, '')
    .replace(/\{,\}/g, '')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\text\{ of \}/g, '/100*')
    .replace(/\\%/g, '')
    .replace(/\\sqrt\[3\]\{([^}]*)\}/g, 'Math.cbrt($1)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'Math.sqrt($1)')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '(($1)/($2))')
    .replace(/\^\{([^}]*)\}/g, '**($1)')
    .replace(/\^(\d)/g, '**$1')
    .replace(/(\d)\s*\(/g, '$1*(')
  s = s.replace(/[^0-9+\-*/().\sMathsqrtcb]/g, '')
  // Unary minus before ** needs parentheses in JS: (-3)**2 is fine, -3**2 is a SyntaxError.
  return Function(`"use strict"; return (${s});`)() as number
}
