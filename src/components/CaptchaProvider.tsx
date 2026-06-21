'use client'

/**
 * CaptchaProvider: optional React context for sharing siteKey,
 * locale, and theme across multiple captcha instances.
 */

import { type ReactNode, createContext, useContext, useMemo, useEffect } from 'react'
import type { Locale, CaptchaContextValue } from '../types.js'
import { DEFAULT_ENDPOINT } from '../lib/constants.js'
import { getFingerprintHash } from '../lib/fingerprint.js'

export const CaptchaContext = createContext<CaptchaContextValue | null>(null)

export interface CaptchaProviderProps {
  /** siteKey from the captcha dashboard. */
  siteKey: string
  locale?: Locale
  theme?: 'auto' | 'light' | 'dark'
  failOpen?: boolean
  children: ReactNode
}

export function CaptchaProvider(props: CaptchaProviderProps) {
  useEffect(() => {
    // Pre-warm the fingerprint cache so it's ready by the time
    // the user clicks the checkbox.
    getFingerprintHash().catch(() => {})
  }, [])

  const value = useMemo<CaptchaContextValue>(
    () => ({
      siteKey: props.siteKey,
      locale: (props.locale ?? 'en') as Locale,
      theme: props.theme ?? 'auto',
      failOpen: props.failOpen,
    }),
    [props.siteKey, props.locale, props.theme, props.failOpen],
  )
  return <CaptchaContext.Provider value={value}>{props.children}</CaptchaContext.Provider>
}

export function useCaptchaContext(): CaptchaContextValue | null {
  return useContext(CaptchaContext)
}
