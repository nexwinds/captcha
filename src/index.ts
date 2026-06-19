/**
 * Public client API for @nexwinds/captcha.
 *
 * Import in any React 18+ / Next.js 13+ app:
 *
 *   import { Captcha, CaptchaProvider, useCaptcha, useTranslations } from '@nexwinds/captcha'
 *
 * No third-party services, no telemetry, no cookies.
 */

export { Captcha } from './components/Captcha.js'
export { CaptchaProvider, useCaptchaContext } from './components/CaptchaProvider.js'

export { useCaptcha } from './hooks/useCaptcha.js'
export type {
  UseCaptchaOptions,
  UseCaptchaResult,
  CaptchaState,
} from './hooks/useCaptcha.js'

export { useBehavioralSignals } from './hooks/useBehavioralSignals.js'
export type {
  UseBehavioralSignalsOptions,
  UseBehavioralSignalsResult,
} from './hooks/useBehavioralSignals.js'

export { useFingerprint } from './hooks/useFingerprint.js'
export { useHoneypot } from './hooks/useHoneypot.js'
export type { UseHoneypotResult } from './hooks/useHoneypot.js'
export { useTranslations } from './hooks/useTranslations.js'

export { translate, resolveLocale, detectBrowserLocale, SUPPORTED_LOCALES } from './lib/i18n.js'
export type { TranslationKey, Translations } from './lib/i18n.js'

export {
  CaptchaHttpError,
  CaptchaNetworkError,
  CaptchaTimeoutError,
  getCalibration,
  getWellKnown,
  issueChallenge,
  verifyChallenge,
} from './lib/http.js'
export type { FetchOptions } from './lib/http.js'

export {
  DEFAULT_ENDPOINT,
  FALLBACK_CALIBRATION,
  HTTP_TIMEOUT_MS,
  MAX_POW_BITS,
  FAIL_OPEN_LOCAL_TTL_MS,
  BRAND_NAME,
  BRAND_URL,
  PRIVACY_URL,
} from './lib/constants.js'

export { solve, verifyLocallyAsync } from './lib/pow.js'
export { getFingerprintHash, _resetFingerprintForTests } from './lib/fingerprint.js'
export { toV1, classify, type RawSignals, type RiskBand } from './lib/signals.js'
export {
  emptyHoneypotState,
  reduceHoneypot,
  honeypotHandlers,
  type HoneypotState,
} from './lib/honeypot.js'

export type {
  Calibration,
  ChallengeIssueRequest,
  ChallengeIssueResponse,
  ChallengeVerifyRequest,
  ChallengeVerifySuccess,
  ChallengeVerifyBypass,
  ChallengeVerifyFailOpen,
  ChallengeVerifyOutcome,
  TokenVerifyRequest,
  TokenVerifySuccess,
  TokenVerifyPrincipal,
  WellKnown,
  Problem,
  SignalsV1,
  CaptchaProps,
  CaptchaContextValue,
  VerifyOutcome,
  VerifyOutcomeSuccess,
  VerifyOutcomeBypass,
  VerifyOutcomeBlocked,
  VerifyOutcomeError,
  VerifyOutcomeStatus,
  Locale,
} from './types.js'
