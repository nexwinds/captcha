/**
 * CaptchaProvider: optional React context for sharing publishable key,
 * locale, and theme across multiple captcha instances.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { CaptchaContextValue, Locale } from '../types.js'
import { DEFAULT_ENDPOINT } from '../lib/constants.js'

const CaptchaContext = createContext<CaptchaContextValue | null>(null)

export interface CaptchaProviderProps {
  /** @deprecated use siteKey */
  publishableKey?: string
  /** siteKey from the captcha dashboard. */
  siteKey?: string
  locale?: Locale
  theme?: 'auto' | 'light' | 'dark'
  children: ReactNode
}

export function CaptchaProvider(props: CaptchaProviderProps) {
  const siteKey = props.siteKey ?? props.publishableKey ?? ''

  const value = useMemo<CaptchaContextValue>(
    () => ({
      publishableKey: siteKey,
      siteKey,
      locale: (props.locale ?? 'en') as Locale,
      theme: props.theme ?? 'auto',
    }),
    [siteKey, props.locale, props.theme],
  )
  return <CaptchaContext.Provider value={value}>{props.children}</CaptchaContext.Provider>
}

export function useCaptchaContext(): CaptchaContextValue | null {
  return useContext(CaptchaContext)
}
