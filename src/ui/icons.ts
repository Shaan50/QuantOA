import type { CategoryId } from '../core/types'
import type { IconName } from './components/Icon'

export const MODE_ICON: Record<string, IconName> = {
  oa: 'timer',
  sprint: 'zap',
  survival: 'heart',
  drill: 'target',
  zen: 'leaf',
  daily: 'calendar',
  review: 'repeat',
  market: 'candles',
}

export const CATEGORY_ICON: Record<CategoryId, IconName> = {
  'mental-math': 'hash',
  sequences: 'layers',
  probability: 'dice',
  arbitrage: 'scale',
  brainteasers: 'puzzle',
  fermi: 'globe',
}

export const MODE_ROUTE: Record<string, string> = {
  oa: '/mode/oa',
  sprint: '/mode/sprint',
  survival: '/mode/survival',
  drill: '/mode/drill',
  zen: '/mode/zen',
  daily: '/daily',
  review: '/review',
  market: '/market',
}
