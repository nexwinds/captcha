/**
 * Server-side helper for consumer applications.
 *
 * This module is a thin HTTPS client that calls the SaaS to verify
 * the one-time token. It does NOT perform any HMAC verification
 * locally — the secret key never leaves the consumer's server, and
 * the SaaS is the only entity that can verify the token.
 *
 * Usage (Next.js App Router):
 *
 *   import { createServerClient } from '@nexcaptcha/server'
 *
 *   const nxc = createServerClient({
 *     secretKey: process.env.NEXCAPTCHA_SECRET_KEY!,
 *   })
 *
 *   export async function POST(req: Request) {
 *     const { token } = await req.json()
 *     const result = await nxc.verifyToken(token, {
 *       ip: req.headers.get('x-forwarded-for') ?? undefined,
 *     })
 *     if (!result.ok) return new Response('forbidden', { status: 403 })
 *     // proceed
 *   }
 */

import {
  verifyToken as httpVerifyToken,
  CaptchaHttpError,
  CaptchaNetworkError,
  CaptchaTimeoutError,
  type FetchOptions,
} from '../lib/http.js'
import { HTTP_TIMEOUT_MS } from '../lib/constants.js'
import type {
  CreateServerClientOptions,
  VerifyTokenOptions,
  VerifyTokenResult,
} from '../types.js'

/** The SaaS source of truth. */
const NEXCAPTCHA_SAAS_URL = 'https://nexcookie.com/api/v1'

export class NexCaptchaServerClient {
  private readonly secretKey: string
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: CreateServerClientOptions) {
    this.secretKey = opts.secretKey
    this.endpoint = opts.endpoint ?? NEXCAPTCHA_SAAS_URL
    this.fetchImpl = opts.fetch ?? globalThis.fetch
  }

  /**
   * Verify a one-time token issued by the captcha widget.
   *
   * The SaaS is the source of truth. On any non-2xx response, this
   * returns `{ ok: false, reason }` with a structured reason.
   */
  async verifyToken(token: string, options: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
    if (!token || typeof token !== 'string') {
      return { ok: false, reason: 'invalid' }
    }
    const fetchOpts: FetchOptions = {
      bearer: this.secretKey,
      fetch: this.fetchImpl,
      timeoutMs: HTTP_TIMEOUT_MS,
    }
    try {
      const result = await httpVerifyToken(this.endpoint, { token }, fetchOpts)
      return {
        ok: true,
        siteId: result.siteId,
        principal: result.principal,
        bypass: result.bypass,
      }
    } catch (e) {
      if (e instanceof CaptchaHttpError) {
        const t = e.problem.type
        if (e.status === 410 && t.endsWith('/token-expired')) {
          return { ok: false, reason: 'expired', problem: e.problem }
        }
        if (e.status === 410 && t.endsWith('/token-revoked')) {
          return { ok: false, reason: 'revoked', problem: e.problem }
        }
        if (e.status === 400 && t.endsWith('/invalid-token')) {
          return { ok: false, reason: 'invalid', problem: e.problem }
        }
        if (e.status === 401) {
          return { ok: false, reason: 'unauthorized', problem: e.problem }
        }
        return { ok: false, reason: 'unknown', problem: e.problem }
      }
      if (e instanceof CaptchaTimeoutError || e instanceof CaptchaNetworkError) {
        return { ok: false, reason: 'unknown' }
      }
      throw e
    }
  }
}

export function createServerClient(opts: CreateServerClientOptions): NexCaptchaServerClient {
  return new NexCaptchaServerClient(opts)
}

export type { CreateServerClientOptions, VerifyTokenOptions, VerifyTokenResult }
