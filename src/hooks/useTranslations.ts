/**
 * useTranslations: minimal hook over the i18n table.
 */

import { useCallback } from 'react'
import { translate, resolveLocale, detectBrowserLocale, type TranslationKey } from '../lib/i18n.js'
import type { Locale } from '../types.js'
import { useCaptchaContext } from '../components/CaptchaProvider.js'

export function useTranslations(overrideLocale?: Locale): {
  locale: Locale
  t: (key: TranslationKey, params?: Record<string, string>) => string
} {
  const ctx = useCaptchaContext()
  const locale = overrideLocale ?? ctx?.locale ?? detectBrowserLocale()
  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string>) =>
      translate(resolveLocale(locale), key, params),
    [locale],
  )
  return { locale: resolveLocale(locale), t }
}
