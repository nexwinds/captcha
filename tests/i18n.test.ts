import { describe, it, expect } from 'vitest'
import { resolveLocale, translate, detectBrowserLocale, SUPPORTED_LOCALES } from '../src/lib/i18n.js'

describe('i18n', () => {
  it('supports all 8 locales', () => {
    expect(SUPPORTED_LOCALES.length).toBe(8)
    expect(SUPPORTED_LOCALES).toContain('en')
    expect(SUPPORTED_LOCALES).toContain('pt')
  })

  it('resolveLocale matches exact', () => {
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('pt')).toBe('pt')
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
