/**
 * useBehavioralSignals: collects the v1 signal set in a passive way
 * (mouse and keyboard event listeners on the document, timers for
 * dwell and click-hold).
 *
 * Returns a stable `getSignals()` that produces a frozen snapshot
 * to send to the server, plus a live `running` flag the component
 * uses to render the "verifying" state.
 */

import { useEffect, useRef, useCallback } from 'react'
import { toV1, type RiskBand, classify, type RawSignals } from '../lib/signals.js'

export interface UseBehavioralSignalsOptions {
  /** True while the captcha is mounted and active. */
  active: boolean
  /** Optional callback fired when risk band changes. */
  onRiskBandChange?: (band: RiskBand) => void
}

export interface UseBehavioralSignalsResult {
  /** Snapshot the current signals. Frozen object safe to JSON-serialize. */
  getSignals: () => ReturnType<typeof toV1>
  /** Current deterministic risk band based on the latest snapshot. */
  getRiskBand: () => RiskBand
  /** Imperative reset (used when "Try again" is clicked). */
  reset: () => void
  /** True if the honeypot fired; helper for the visual warning. */
  isBot: () => boolean
}

const MOUSE_SAMPLE_INTERVAL_MS = 50

export function useBehavioralSignals(
  opts: UseBehavioralSignalsOptions,
): UseBehavioralSignalsResult {
  const { active, onRiskBandChange } = opts
  const mountedAtRef = useRef<number>(0)
  const clickStartRef = useRef<number | null>(null)
  const lastMouseSampleAtRef = useRef<number>(0)
  const mouseMovementsRef = useRef(0)
  const keyboardInteractionsRef = useRef(0)
  const isBotRef = useRef(false)
  const dwellTimerRef = useRef<number | null>(null)

  const recompute = useCallback(() => {
    const raw: RawSignals = {
      dwellMs: mountedAtRef.current ? performance.now() - mountedAtRef.current : 0,
      timeToClickMs: clickStartRef.current && mountedAtRef.current
        ? clickStartRef.current - mountedAtRef.current
        : 0,
      mouseMovements: mouseMovementsRef.current,
      keyboardInteractions: keyboardInteractionsRef.current,
      isBot: isBotRef.current,
    }
    const band = classify(raw)
    onRiskBandChange?.(band)
  }, [onRiskBandChange])

  useEffect(() => {
    if (!active) return
    mountedAtRef.current = performance.now()

    const onMouseMove = (e: MouseEvent) => {
      const now = performance.now()
      if (now - lastMouseSampleAtRef.current < MOUSE_SAMPLE_INTERVAL_MS) return
      lastMouseSampleAtRef.current = now
      // Only count samples with non-zero delta (already filtered by interval).
      if (e.movementX !== 0 || e.movementY !== 0) {
        mouseMovementsRef.current += 1
      }
    }
    const onKeyDown = () => {
      keyboardInteractionsRef.current += 1
    }
    const onMouseDown = () => {
      clickStartRef.current = performance.now()
    }
    const onMouseUp = () => {
      if (clickStartRef.current !== null) {
        // click-hold time elapses naturally; we just record it.
        recompute()
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // pause accumulation while tab is backgrounded.
        mountedAtRef.current = performance.now()
      }
    }

    document.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('keydown', onKeyDown, { passive: true })
    document.addEventListener('mousedown', onMouseDown, { passive: true })
    document.addEventListener('mouseup', onMouseUp, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('visibilitychange', onVisibility)
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current)
        dwellTimerRef.current = null
      }
    }
  }, [active, recompute])

  const getSignals = useCallback(() => {
    const raw: RawSignals = {
      dwellMs: mountedAtRef.current ? performance.now() - mountedAtRef.current : 0,
      timeToClickMs: clickStartRef.current && mountedAtRef.current
        ? clickStartRef.current - mountedAtRef.current
        : 0,
      mouseMovements: mouseMovementsRef.current,
      keyboardInteractions: keyboardInteractionsRef.current,
      isBot: isBotRef.current,
    }
    return toV1(raw)
  }, [])

  const getRiskBand = useCallback(() => {
    return classify({
      dwellMs: mountedAtRef.current ? performance.now() - mountedAtRef.current : 0,
      timeToClickMs: clickStartRef.current && mountedAtRef.current
        ? clickStartRef.current - mountedAtRef.current
        : 0,
      mouseMovements: mouseMovementsRef.current,
      keyboardInteractions: keyboardInteractionsRef.current,
      isBot: isBotRef.current,
    })
  }, [])

  const reset = useCallback(() => {
    mountedAtRef.current = performance.now()
    clickStartRef.current = null
    lastMouseSampleAtRef.current = 0
    mouseMovementsRef.current = 0
    keyboardInteractionsRef.current = 0
    isBotRef.current = false
  }, [])

  const isBot = useCallback(() => isBotRef.current, [])

  // Expose an internal helper for the honeypot to flag the bot.
  // (Attached to window for simplicity; could be a context in a future rev.)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { __nxwFlagBot?: (v: boolean) => void }
    w.__nxwFlagBot = (v: boolean) => {
      isBotRef.current = v
    }
    return () => {
      delete w.__nxwFlagBot
    }
  }, [])

  return { getSignals, getRiskBand, reset, isBot }
}
