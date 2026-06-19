/**
 * Public server API for @nexwinds/captcha.
 *
 * Import in the consumer's Next.js server / route handler:
 *
 *   import { createServerClient } from '@nexwinds/captcha/server'
 *
 *   const nxw = createServerClient({ secretKey: process.env.NEXWINDS_SECRET_KEY! })
 *   const result = await nxw.verifyToken(token, { ip })
 */

export {
  createServerClient,
  NexWindsServerClient,
} from './server/createServerClient.js'
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
