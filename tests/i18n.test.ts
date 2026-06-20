import { describe, it, expect } from 'vitest'
import {
  resolveLocale,
  translate,
  detectBrowserLocale,
  SUPPORTED_LOCALES,
} from '../src/lib/i18n.js'
import en from '../src/locales/en.json' with { type: 'json' }
import pt from '../src/locales/pt.json' with { type: 'json' }
import es from '../src/locales/es.json' with { type: 'json' }
import fr from '../src/locales/fr.json' with { type: 'json' }
import de from '../src/locales/de.json' with { type: 'json' }
import ja from '../src/locales/ja.json' with { type: 'json' }
import zh from '../src/locales/zh.json' with { type: 'json' }
import ar from '../src/locales/ar.json' with { type: 'json' }
import nl from '../src/locales/nl.json' with { type: 'json' }

const LOCALES = { en, pt, es, fr, de, ja, zh, ar, nl }

describe('i18n', () => {
  it('ensures all locale files are synchronized with en.json', () => {
    const enKeys = Object.keys(en).sort()
    for (const [code, table] of Object.entries(LOCALES)) {
      const keys = Object.keys(table).sort()
      expect(keys, `Locale "${code}" is missing keys or has extra keys`).toEqual(enKeys)
    }
  })

  it('supports all 9 locales', () => {
    expect(SUPPORTED_LOCALES.length).toBe(9)
    expect(SUPPORTED_LOCALES).toContain('en')
    expect(SUPPORTED_LOCALES).toContain('pt')
    expect(SUPPORTED_LOCALES).toContain('nl')
  })

  it('resolveLocale matches exact', () => {
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('pt')).toBe('pt')
    expect(resolveLocale('nl')).toBe('nl')
  })

  it('resolveLocale matches prefix', () => {
    expect(resolveLocale('pt-BR')).toBe('pt')
    expect(resolveLocale('en-US')).toBe('en')
    expect(resolveLocale('zh-Hant')).toBe('zh')
  })

  it('resolveLocale falls back to en', () => {
    expect(resolveLocale('xx')).toBe('en')
    expect(resolveLocale(null)).toBe('en')
    expect(resolveLocale(undefined)).toBe('en')
    expect(resolveLocale('')).toBe('en')
  })

  it('translate returns localized string', () => {
    expect(translate('en', 'label')).toBe('I am human')
    expect(translate('pt', 'label')).toBe('Eu sou humano')
    expect(translate('ja', 'label')).toBe('私は人間です')
    expect(translate('ar', 'label')).toBe('أنا إنسان')
  })

  it('translate falls back to en for unknown locale', () => {
    // @ts-expect-error - intentional
    expect(translate('xx', 'label')).toBe('I am human')
  })

  it('detectBrowserLocale uses navigator.language in browser env', () => {
    // happy-dom default is en-US
    const prev = (globalThis as { navigator?: { language?: string } }).navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'pt-BR' },
      configurable: true,
    })
    expect(detectBrowserLocale()).toBe('pt')
    Object.defineProperty(globalThis, 'navigator', {
      value: prev,
      configurable: true,
    })
  })
})
