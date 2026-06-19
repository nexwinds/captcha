/**
 * Public server API for @nexwinds/captcha.
 *
 * Import in the consumer's Next.js server / route handler:
 *
 *   import { createServerClient } from '@nexwinds/captcha/server'
 *
 *   const nxw = createServerClient({ secretKey: process.env.NEXWINDS_SECRET_KEY! })
 *   const result = await nxw.verifyToken(token, { ip })
 *
 * For CORS-free browser integration, also export `createCaptchaProxy`:
 *
 *   // app/api/captcha/[...path]/route.ts
 *   import { createCaptchaProxy } from '@nexwinds/captcha/server'
 *   export const { GET, POST, OPTIONS } = createCaptchaProxy()
 */

export {
  createServerClient,
  NexWindsServerClient,
} from './server/createServerClient.js'
export {
  createCaptchaProxy,
  DEFAULT_PROXY_MOUNT,
} from './server/createCaptchaProxy.js'
export type {
  CaptchaProxyOptions,
  CaptchaProxyHandlers,
} from './server/createCaptchaProxy.js'
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
