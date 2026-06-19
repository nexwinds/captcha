/**
 * CaptchaProvider: optional React context for sharing publishable key,
 * locale, and theme across multiple captcha instances.
 */

import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react'
import type { CaptchaContextValue, Locale } from '../types.js'
import { DEFAULT_ENDPOINT, DEFAULT_PROXY_MOUNT } from '../lib/constants.js'

const CaptchaContext = createContext<CaptchaContextValue | null>(null)

export interface CaptchaProviderProps {
  /** @deprecated use siteKey */
  publishableKey?: string
  /** siteKey from the captcha dashboard. */
  siteKey?: string
  locale?: Locale
  theme?: 'auto' | 'light' | 'dark'
  endpoint?: string
  /** 
   * Enable auto-discovery of the proxy endpoint. 
   * If true, tries to hit `/api/captcha` before falling back to SaaS.
   */
  autoDiscover?: boolean
  children: ReactNode
}

export function CaptchaProvider(props: CaptchaProviderProps) {
  const [discoveredEndpoint, setDiscoveredEndpoint] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(!props.autoDiscover)

  const siteKey = props.siteKey ?? props.publishableKey ?? ''

  useEffect(() => {
    if (!props.autoDiscover) return

    let cancelled = false
    const checkProxy = async () => {
      try {
        const res = await fetch(`${DEFAULT_PROXY_MOUNT}/calibration`, { method: 'HEAD' })
        if (!cancelled) {
          if (res.ok) {
            setDiscoveredEndpoint(DEFAULT_PROXY_MOUNT)
          }
          setIsReady(true)
        }
      } catch {
        if (!cancelled) {
          setIsReady(true)
        }
      }
    }

    void checkProxy()
    return () => {
      cancelled = true
    }
  }, [props.autoDiscover])

  const value = useMemo<CaptchaContextValue>(
    () => ({
      publishableKey: siteKey,
      siteKey,
      locale: (props.locale ?? 'en') as Locale,
      theme: props.theme ?? 'auto',
      endpoint: props.endpoint ?? discoveredEndpoint ?? DEFAULT_ENDPOINT,
      isReady,
    }),
    [siteKey, props.locale, props.theme, props.endpoint, discoveredEndpoint, isReady],
  )
  return <CaptchaContext.Provider value={value}>{props.children}</CaptchaContext.Provider>
}

export function useCaptchaContext(): CaptchaContextValue | null {
  return useContext(CaptchaContext)
}
