/**
 * # @nexcaptcha/captcha/server
 *
 * Server-side utilities for @nexcaptcha/captcha.
 *
 * For Next.js, we recommend using **Rewrites** in `next.config.js` to proxy
 * requests to the SaaS:
 *
 *   // next.config.js
 *   async rewrites() {
 *     return [{ source: '/api/captcha/:path*', destination: 'https://nexcookie.com/api/v1/:path*' }]
 *   }
 */

export { createServerClient, NexCaptchaServerClient } from './server/createServerClient.js'
export type {
  CreateServerClientOptions,
  VerifyTokenOptions,
  VerifyTokenResult,
  VerifyTokenSuccess,
  VerifyTokenFailure,
  TokenVerifyRequest,
  TokenVerifySuccess,
  TokenVerifyPrincipal,
  Problem,
} from './types.js'
export { DEFAULT_ENDPOINT } from './lib/constants.js'
