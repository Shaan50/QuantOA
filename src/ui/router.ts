/** A tiny hash router: #/path?query */
import { useSyncExternalStore } from 'react'

export interface Route {
  path: string
  query: URLSearchParams
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, q = ''] = raw.split('?')
  return { path: path || '/', query: new URLSearchParams(q) }
}

let current = parse()
const listeners = new Set<() => void>()
window.addEventListener('hashchange', () => {
  current = parse()
  listeners.forEach((l) => l())
  window.scrollTo(0, 0)
})

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

export function navigate(to: string): void {
  const target = `#${to}`
  if (window.location.hash === target) return
  window.location.hash = to
}

export function href(to: string): string {
  return `#${to}`
}
