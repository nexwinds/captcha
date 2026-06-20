/**
 * i18n: minimal locale resolver + translation map.
 *
 * Per the locked contract (CLARIFY_NEXCOOKIE §H): the SaaS does NOT
 * negotiate locale. The widget ships its own JSON locale files and
 * falls back to English.
 */

import type { Locale } from '../types.js'
import en from '../locales/en.json' with { type: 'json' }
import pt from '../locales/pt.json' with { type: 'json' }
import es from '../locales/es.json' with { type: 'json' }
import fr from '../locales/fr.json' with { type: 'json' }
import de from '../locales/de.json' with { type: 'json' }
import ja from '../locales/ja.json' with { type: 'json' }
import zh from '../locales/zh.json' with { type: 'json' }
import ar from '../locales/ar.json' with { type: 'json' }
import nl from '../locales/nl.json' with { type: 'json' }

export type TranslationKey =
  | 'label'
  | 'verifying'
  | 'success'
  | 'bypass'
  | 'warning'
  | 'error'
  | 'retry'
  | 'expired'
  | 'rate_limited'
  | 'fail_open'
  | 'privacy'
  | 'math_question'
  | 'math_pick'

export type Translations = Record<TranslationKey, string>

const TABLES: Record<Locale, Translations> = {
  en: en as Translations,
  pt: pt as Translations,
  es: es as Translations,
  fr: fr as Translations,
  de: de as Translations,
  ja: ja as Translations,
  zh: zh as Translations,
  ar: ar as Translations,
  nl: nl as Translations,
}

export const SUPPORTED_LOCALES: readonly Locale[] = [
  'en',
  'pt',
  'es',
  'fr',
  'de',
  'ja',
  'zh',
  'ar',
  'nl',
] as const

export function resolveLocale(input?: string | null): Locale {
  if (!input) return 'en'
  const lower = input.toLowerCase()
  for (const loc of SUPPORTED_LOCALES) {
    if (lower === loc || lower.startsWith(`${loc}-`)) return loc
  }
  return 'en'
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string>,
): string {
  let text = TABLES[locale]?.[key] ?? TABLES.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{{${k}}}`, v)
    }
  }
  return text
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  return resolveLocale(navigator.language)
}
