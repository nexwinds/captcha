/**
 * Constants matching the locked wire contract.
 *
 * DEFAULT_ENDPOINT is the production SaaS URL (CLARIFY §A5.2).
 */

export const DEFAULT_ENDPOINT = 'https://nexcookie.com/api/v1'
export const DEFAULT_FALLBACK_LOCALE = 'en' as const

/** Path the consumer mounts the proxy under. The factory strips this prefix. */
export const DEFAULT_PROXY_MOUNT = '/api/captcha'

/** Reasonable time budget for a single HTTP call to the SaaS. */
export const HTTP_TIMEOUT_MS = 10_000

/** Calibrate-on-boot table. Real values come from GET /calibration. */
export const FALLBACK_CALIBRATION = {
  v: 1,
  low: 16,
  medium: 18,
  high: 20,
  critical: 23,
} as const

/** Hard upper bound on PoW bits — refuses to start solves that would never finish. */
export const MAX_POW_BITS = 28

/** Default token TTL applied locally when the server omits `expiresAt` (fail-open path). */
export const FAIL_OPEN_LOCAL_TTL_MS = 5 * 60 * 1000

/** Brand identity shown on the widget. The brand text + the URL it links to. */
export const BRAND_NAME = 'NEXWINDS'
export const BRAND_URL = 'https://nexwinds.com'
export const PRIVACY_URL = 'https://nexwinds.com/legal/privacy-policy'
