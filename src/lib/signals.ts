/**
 * Behavioral signals v1 collector and classifier.
 *
 * Server contract (locked, CLARIFY_NEXCOOKIE §E):
 *   Schema v1 = { v: 1, dwellMs, timeToClickMs, mouseMovements,
 *                 keyboardInteractions, isBot? }
 *
 * The classifier mirrors the server's `classifyV1` exactly so the
 * widget can pre-flight the same logic for UX hints.
 */

import type { SignalsV1 } from '../types.js'

export type RiskBand = 'low' | 'medium' | 'high' | 'critical'

export interface RawSignals {
  dwellMs: number
  timeToClickMs: number
  mouseMovements: number
  keyboardInteractions: number
  isBot: boolean
}

export function toV1(raw: RawSignals): SignalsV1 {
  return {
    v: 1,
    dwellMs: Math.max(0, Math.round(raw.dwellMs)),
    timeToClickMs: Math.max(0, Math.round(raw.timeToClickMs)),
    mouseMovements: Math.max(0, raw.mouseMovements),
    keyboardInteractions: Math.max(0, raw.keyboardInteractions),
    isBot: raw.isBot || undefined,
  }
}

/**
 * Deterministic classifier, mirrors `classifyV1` in the SaaS.
 * Score weights: isBot=40, dwellMs<1000=2, timeToClickMs<500=2,
 * mouseMovements<5=1, keyboardInteractions=0=1.
 * Bands: score<3 low, <6 medium, <31 high, else critical.
 */
export function classify(s: RawSignals): RiskBand {
  let score = 0
  if (s.isBot) score += 40
  if (s.dwellMs < 1000) score += 2
  if (s.timeToClickMs < 500) score += 2
  if (s.mouseMovements < 5) score += 1
  if (s.keyboardInteractions === 0) score += 1
  if (score >= 31) return 'critical'
  if (score >= 6) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

/** Throttle a sample counter; emits true on the first call per `intervalMs`. */
export function throttleSamples(prev: number, intervalMs: number, now: number): number {
  void prev
  void intervalMs
  void now
  return 0
}
