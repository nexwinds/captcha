/**
 * useHoneypot: returns stable handlers for the three honeypots.
 * Wired into the captcha DOM as onInput / onClick / onChange.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  emptyHoneypotState,
  reduceHoneypot,
  type HoneypotState,
} from '../lib/honeypot.js'

export interface UseHoneypotResult {
  state: HoneypotState
  handlers: {
    onFieldInput: () => void
    onLinkClick: (e: { preventDefault: () => void }) => void
    onCheckboxChange: () => void
  }
  reset: () => void
}

export function useHoneypot(): UseHoneypotResult {
  const [state, setState] = useState<HoneypotState>(emptyHoneypotState())
  const stateRef = useRef<HoneypotState>(state)
  stateRef.current = state

  const onFieldInput = useCallback(() => {
    setState((s) => reduceHoneypot(s, { fieldFilled: true }))
  }, [])
  const onLinkClick = useCallback((e: { preventDefault: () => void }) => {
    e.preventDefault()
    setState((s) => reduceHoneypot(s, { linkClicked: true }))
  }, [])
  const onCheckboxChange = useCallback(() => {
    setState((s) => reduceHoneypot(s, { checkboxChecked: true }))
  }, [])
  const reset = useCallback(() => {
    setState(emptyHoneypotState())
  }, [])

  // Push `isBot` into the global window flag the signal collector watches.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { __nxwFlagBot?: (v: boolean) => void }
    w.__nxwFlagBot?.(state.isBot)
  }, [state.isBot])

  return {
    state,
    handlers: { onFieldInput, onLinkClick, onCheckboxChange },
    reset,
  }
}
