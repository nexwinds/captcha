/**
 * useTranslations: minimal hook over the i18n table.
 */

import { useCallback } from 'react'
import {
  translate,
  resolveLocale,
  detectBrowserLocale,
  type TranslationKey,
} from '../lib/i18n.js'
import type { Locale } from '../types.js'
import { useCaptchaContext } from '../components/CaptchaProvider.js'

export function useTranslations(): {
  locale: Locale
  t: (key: TranslationKey) => string
} {
  const ctx = useCaptchaContext()
  const locale = ctx?.locale ?? detectBrowserLocale()
  const t = useCallback(
    (key: TranslationKey) => translate(resolveLocale(locale), key),
    [locale],
  )
  return { locale: resolveLocale(locale), t }
}
