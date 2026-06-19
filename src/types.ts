/**
 * Public types for @nexwinds/captcha.
 *
 * These mirror the locked wire contract in `contracts/openapi.yaml`
 * (revision 2, 2026-06-19). Do not change without updating the spec.
 */

// ---------------------------------------------------------------------------
// Calibration (GET /api/v1/calibration)
// ---------------------------------------------------------------------------

export interface Calibration {
  v: 1
  low: number
  medium: number
  high: number
  critical: number
}

// ---------------------------------------------------------------------------
// Challenge issue (POST /api/v1/challenge/issue)
// ---------------------------------------------------------------------------

export interface ChallengeIssueRequest {
  fingerprintHash: string
}

export interface ChallengeIssueResponse {
  challengeId: string
  /** 64-character hex (32 bytes). */
  nonce: string
  issuedAt: string
  expiresAt: string
  bits: number
  origin: 'nexwinds'
}

// ---------------------------------------------------------------------------
// Behavioral signals v1
// ---------------------------------------------------------------------------

export interface SignalsV1 {
  v: 1
  dwellMs: number
  timeToClickMs: number
  mouseMovements: number
  keyboardInteractions: number
  isBot?: boolean
}

// ---------------------------------------------------------------------------
// Challenge verify (POST /api/v1/challenge/verify)
// ---------------------------------------------------------------------------

export interface ChallengeVerifyRequest {
  challengeId: string
  /** 64-character hex (32 bytes). */
  nonce: string
  /** 64-character hex (32 bytes) the widget found by brute force. */
  hash: string
  bits: number
  signals: SignalsV1
  fingerprintHash: string
}

export interface ChallengeVerifySuccess {
  status: 'success'
  token: string
  expiresAt: string
  failOpen: false
}

export interface ChallengeVerifyBypass {
  status: 'bypass'
  token: string
  expiresAt: string
  failOpen: false
}

export interface ChallengeVerifyFailOpen {
  status: 'success'
  failOpen: true
  expiresAt?: string | null
  token?: string
}

export type ChallengeVerifyOutcome =
  | ChallengeVerifySuccess
  | ChallengeVerifyBypass
  | ChallengeVerifyFailOpen

// ---------------------------------------------------------------------------
// Token verify (POST /api/v1/token/verify)
// ---------------------------------------------------------------------------

export interface TokenVerifyRequest {
  token: string
}

export interface TokenVerifyPrincipal {
  ip: string
  fingerprintHash: string
}

export interface TokenVerifySuccess {
  ok: true
  siteId: number
  principal: TokenVerifyPrincipal
  bypass: boolean
}

// ---------------------------------------------------------------------------
// Well-known (GET /api/v1/.well-known/nexwinds.json)
// ---------------------------------------------------------------------------

export interface WellKnown {
  service: 'nexwinds-captcha'
  version: string
  endpoint: string
  /** "sha256:" + 64 hex chars. */
  fingerprint: string
}

// ---------------------------------------------------------------------------
// Problem document (RFC 7807)
// ---------------------------------------------------------------------------

export interface Problem {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
}

// ---------------------------------------------------------------------------
// Public widget API
// ---------------------------------------------------------------------------

export type VerifyOutcomeStatus = 'success' | 'bypass' | 'blocked' | 'error'

export interface VerifyOutcomeSuccess {
  status: 'success'
  token: string
  expiresAt: number
  via: 'verify' | 'bypass' | 'failOpen'
}

export interface VerifyOutcomeBypass {
  status: 'bypass'
  token: string
  expiresAt: number
  via: 'verify' | 'bypass' | 'failOpen'
}

export interface VerifyOutcomeBlocked {
  status: 'blocked'
  reason: 'rate_limited' | 'policy' | 'expired' | 'invalid'
  /** Optional RFC 7807 problem document for debugging. */
  problem?: Problem
}

export interface VerifyOutcomeError {
  status: 'error'
  reason: 'network' | 'timeout' | 'unknown'
  message?: string
}

export type VerifyOutcome =
  | VerifyOutcomeSuccess
  | VerifyOutcomeBypass
  | VerifyOutcomeBlocked
  | VerifyOutcomeError

export type Locale = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'ar'

export interface CaptchaContextValue {
  /** @deprecated use siteKey */
  publishableKey?: string
  siteKey: string
  locale: Locale
  theme: 'auto' | 'light' | 'dark'
}

export interface CaptchaProps {
  /** @deprecated use siteKey */
  publishableKey?: string
  /** siteKey from the captcha dashboard. */
  siteKey?: string
  /** Locale for UI strings. Defaults to navigator.language or 'en'. */
  locale?: Locale
  /** "auto" follows the user's prefers-color-scheme. */
  theme?: 'auto' | 'light' | 'dark'
  /** Fired when the captcha is successfully solved. */
  onSuccess?: (token: string) => void
  /** Fired when the challenge expires. */
  onExpire?: () => void
  /** Fired on every terminal outcome (legacy). */
  onVerify?: (outcome: VerifyOutcome) => void
  /** Fired on non-terminal errors (network, fetch failure, etc.). */
  onError?: (err: { message: string }) => void
  className?: string
  /** Visual style override. */
  size?: 'compact' | 'normal'
}

// ---------------------------------------------------------------------------
// Server helper types
// ---------------------------------------------------------------------------

export interface CreateServerClientOptions {
  /** sk_live_<random_hex> from the captcha dashboard. */
  secretKey: string
  /** Custom fetch (for tests or self-hosted runtimes). */
  fetch?: typeof fetch
  /** SaaS endpoint override. */
  endpoint?: string
}

export interface VerifyTokenOptions {
  /** Override the IP. Defaults to auto-detected (X-Forwarded-For, etc.). */
  ip?: string
  /** Bypass signature check (only for local dev / tests). */
  unsafeAllowInsecure?: boolean
}

export interface VerifyTokenSuccess {
  ok: true
  siteId: number
  principal: TokenVerifyPrincipal
  bypass: boolean
}

export interface VerifyTokenFailure {
  ok: false
  reason: 'expired' | 'revoked' | 'invalid' | 'unauthorized' | 'unknown'
  problem?: Problem
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure
