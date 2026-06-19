/**
 * CaptchaProvider: optional React context for sharing publishable key,
 * endpoint, locale, and theme across multiple captcha instances.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { CaptchaContextValue, Locale } from '../types.js'
import { DEFAULT_ENDPOINT } from '../lib/constants.js'

const CaptchaContext = createContext<CaptchaContextValue | null>(null)

export interface CaptchaProviderProps {
  publishableKey: string
  endpoint?: string
  locale?: Locale
  theme?: 'auto' | 'light' | 'dark'
  children: ReactNode
}

export function CaptchaProvider(props: CaptchaProviderProps) {
  const value = useMemo<CaptchaContextValue>(
    () => ({
      publishableKey: props.publishableKey,
      endpoint: props.endpoint ?? DEFAULT_ENDPOINT,
      locale: (props.locale ?? 'en') as Locale,
      theme: props.theme ?? 'auto',
    }),
    [props.publishableKey, props.endpoint, props.locale, props.theme],
  )
  return <CaptchaContext.Provider value={value}>{props.children}</CaptchaContext.Provider>
}

export function useCaptchaContext(): CaptchaContextValue | null {
  return useContext(CaptchaContext)
}
