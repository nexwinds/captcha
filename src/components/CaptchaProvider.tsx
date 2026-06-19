/**
 * CaptchaProvider: optional React context for sharing publishable key,
 * locale, and theme across multiple captcha instances.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { CaptchaContextValue, Locale } from '../types.js'

const CaptchaContext = createContext<CaptchaContextValue | null>(null)

export interface CaptchaProviderProps {
  publishableKey: string
  locale?: Locale
  theme?: 'auto' | 'light' | 'dark'
  children: ReactNode
}

export function CaptchaProvider(props: CaptchaProviderProps) {
  const value = useMemo<CaptchaContextValue>(
    () => ({
      publishableKey: props.publishableKey,
      locale: (props.locale ?? 'en') as Locale,
      theme: props.theme ?? 'auto',
    }),
    [props.publishableKey, props.locale, props.theme],
  )
  return <CaptchaContext.Provider value={value}>{props.children}</CaptchaContext.Provider>
}

export function useCaptchaContext(): CaptchaContextValue | null {
  return useContext(CaptchaContext)
}
