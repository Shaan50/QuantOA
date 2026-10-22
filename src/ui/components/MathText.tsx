import katex from 'katex'
import { Fragment, memo, useMemo } from 'react'
import { splitMath } from '../../core/mathText'

/**
 * Renders text with $inline$ and $$display$$ LaTeX via KaTeX. Newlines in the
 * plain text become line breaks. Rendering errors fall back to the raw source.
 */
export const MathText = memo(function MathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMath(text), [text])
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.kind === 'text') {
          const lines = p.value.split('\n')
          return (
            <Fragment key={i}>
              {lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {l}
                </Fragment>
              ))}
            </Fragment>
          )
        }
        let html: string
        try {
          html = katex.renderToString(p.value, { displayMode: p.kind === 'display', throwOnError: false, strict: 'ignore' })
        } catch {
          html = p.value
        }
        return p.kind === 'display' ? <span key={i} className="block" dangerouslySetInnerHTML={{ __html: html }} /> : <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </span>
  )
})
