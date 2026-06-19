import { DEFAULT_PROXY_MOUNT } from '../lib/constants.js'

/**
 * `createCaptchaProxy` — drop-in Next.js Route Handler factory.
 *
 * One file in the consumer's app wires CORS-free browser → SaaS:
 *
 *   // app/api/captcha/[...path]/route.ts
 *   import { createCaptchaProxy } from '@nexwinds/captcha/server'
 *   export const { GET, POST, OPTIONS } = createCaptchaProxy()
 *
 * That single file is the entire integration. The browser hits `/api/captcha/*`
 * (same origin, no CORS), and the proxy forwards to the SaaS endpoint with the
 * caller's `Authorization` header preserved.
 *
 * Runtime: Web Fetch API (Request/Response/fetch globals). Works in:
 *   - Next.js App Router (Node and Edge runtimes)
 *   - Cloudflare Workers
 *   - Deno / Bun
 *   - Any standard Web server
 */

/** The SaaS source of truth. */
const NEXWINDS_SAAS_URL = 'https://nexcookie.com/api/v1'

export interface CaptchaProxyOptions {
  /**
   * Mount path prefix that this handler is served under. The proxy strips it
   * before forwarding. Defaults to `/api/captcha`.
   */
  mountPath?: string
  /**
   * Origin allow-list for CORS. Defaults to `'*'`.
   *
   * - `'*'`: reflect any origin (use for public widgets).
   * - `string[]`: only the listed origins get `Access-Control-Allow-Origin`.
   *   Use this in production to lock down who can use your proxy.
   */
  allowedOrigins?: string[] | '*'
  /** Upstream fetch timeout in ms. Defaults to 10000. */
  timeoutMs?: number
  /** SaaS endpoint override. Defaults to 'https://nexcookie.com/api/v1'. */
  endpoint?: string
  /** Enable verbose logging to stdout for debugging. */
  debug?: boolean
  /**
   * Optional hook to mutate the upstream request before it leaves your server.
   * Use this to add internal auth, swap headers, etc.
   */
  beforeFetch?: (ctx: {
    url: string
    init: RequestInit
    request: Request
  }) => RequestInit | Promise<RequestInit>
}

export interface CaptchaProxyHandlers {
  (request: Request): Promise<Response>
  GET: (request: Request) => Promise<Response>
  POST: (request: Request) => Promise<Response>
  OPTIONS: (request: Request) => Promise<Response>
}

function resolveOriginPolicy(
  requestOrigin: string,
  allowed: string[] | '*',
): string | null {
  if (allowed === '*') {
    // Since we use credentials: 'include', we MUST echo the origin
    // rather than returning '*'.
    return requestOrigin || null
  }
  if (allowed.includes(requestOrigin)) return requestOrigin
  return null
}

/**
 * Extract the request's origin. Prefers the standard `Origin` header set
 * by browsers; falls back to `X-Nxw-Origin` (a custom header used when
 * `Origin` is stripped — some test envs and serverless runtimes strip
 * forbidden header names from `Request` constructors), then `Referer`.
 */
function readRequestOrigin(request: Request): string {
  const origin = request.headers.get('origin')
  if (origin) return origin
  const nxw = request.headers.get('x-nxw-origin')
  if (nxw) return nxw
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin
    } catch {
      return ''
    }
  }
  return ''
}

function corsHeaders(origin: string, allowed: string[] | '*'): HeadersInit {
  const allowOrigin = resolveOriginPolicy(origin, allowed)
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-nxw-site-key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Allow': 'GET, POST, OPTIONS',
  }
  if (allowOrigin !== null) {
    headers['Access-Control-Allow-Origin'] = allowOrigin
  }
  return headers
}

function joinUrl(base: string, tail: string, query: string): string {
  const b = base.replace(/\/+$/, '')
  const t = tail.replace(/^\/+/, '')
  return `${b}/${t}${query}`
}

function stripMount(pathname: string, mount: string): string {
  const m = mount.replace(/\/+$/, '')
  // Ensure we are working with a clean path
  const p = pathname.replace(/\/+$/, '')
  
  if (p === m) return ''
  if (p.startsWith(`${m}/`)) return p.slice(m.length + 1)
  
  // Fallback for Next.js 16 / Turbopack where the mount might be partial
  // or the pathname might not start with the mount if rewrites are involved.
  // We look for the common NexWinds paths as a last resort.
  if (p.includes('/challenge/issue')) return 'challenge/issue'
  if (p.includes('/challenge/verify')) return 'challenge/verify'
  if (p.includes('/calibration')) return 'calibration'
  
  return p.replace(/^\/+/, '')
}

/**
 * Build a set of Route Handlers. Returns a single universal function
 * that handles all methods (GET, POST, OPTIONS) and can be exported
 * directly in Next.js or wrapped.
 */
export function createCaptchaProxy(
  options: CaptchaProxyOptions = {},
): CaptchaProxyHandlers {
  if (options.debug) {
    console.log(`[nexwinds/proxy] factory initialized (mount: ${options.mountPath ?? DEFAULT_PROXY_MOUNT})`)
  }
  const endpoint = options.endpoint ?? NEXWINDS_SAAS_URL
  const mount = options.mountPath ?? DEFAULT_PROXY_MOUNT
  const allowed = options.allowedOrigins ?? '*'
  const timeoutMs = options.timeoutMs ?? 10_000

  async function handle(
    request: Request,
  ): Promise<Response> {
    const method = request.method.toUpperCase()
    if (options.debug) {
      console.log(`[nexwinds/proxy] HTTP ${method} invoked for ${request.url}`)
    }

    const origin = readRequestOrigin(request)

    if (method === 'OPTIONS') {
      if (options.debug) console.log(`[nexwinds/proxy] handling OPTIONS preflight`)
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) })
    }

    if (method !== 'GET' && method !== 'POST') {
      if (options.debug) console.warn(`[nexwinds/proxy] method ${method} not allowed`)
      return new Response('Method Not Allowed', { 
        status: 405, 
        headers: { 'Allow': 'GET, POST, OPTIONS' } 
      })
    }

    // Safety check for body reading on POST
    let bodyText: string | undefined = undefined;
    if (method === 'POST') {
      try {
        if (options.debug) console.log(`[nexwinds/proxy] reading POST body...`)
        // Clone the request to be safe with some runtimes that might 
        // have already touched the body.
        bodyText = await request.clone().text()
        if (options.debug) console.log(`[nexwinds/proxy] POST body read success (${bodyText.length} bytes)`)
      } catch (e) {
        console.error(`[nexwinds/proxy] CRITICAL: Failed to read POST request body: ${e}`)
      }
    }
    const incomingUrl = new URL(request.url)
    const tail = stripMount(incomingUrl.pathname, mount)
    const target = joinUrl(endpoint, tail, incomingUrl.search)

    if (options.debug) {
      console.log(`[nexwinds/proxy] forwarding ${method} -> ${target}`)
    }

    const headers = new Headers()
    // Forward essential headers
    const auth = request.headers.get('authorization')
    if (auth) headers.set('authorization', auth)
    
    const userAgent = request.headers.get('user-agent')
    if (userAgent) headers.set('user-agent', userAgent)

    const accept = request.headers.get('accept')
    if (accept) headers.set('accept', accept)

    if (method === 'POST') {
      headers.set('content-type', 'application/json')
    }

    let init: RequestInit = {
      method,
      headers,
      body: bodyText,
    }

    if (options.beforeFetch) {
      init = await options.beforeFetch({ url: target, init, request })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    init.signal = controller.signal

    let upstream: Response
    try {
      upstream = await fetch(target, init)
    } catch (e) {
      clearTimeout(timer)
      const isAbort = e instanceof Error && e.name === 'AbortError'
      const status = isAbort ? 504 : 502
      const title = isAbort ? 'Gateway Timeout' : 'Bad Gateway'
      
      if (options.debug) {
        console.error(`[nexwinds/proxy] upstream fetch failed: ${target}`, e)
      }

      return new Response(
        JSON.stringify({
          type: 'about:blank',
          title,
          status,
          detail: e instanceof Error ? e.message : 'upstream fetch failed',
        }),
        {
          status,
          headers: {
            'content-type': 'application/problem+json',
            'x-nxw-proxy-error': 'upstream_failure',
            ...corsHeaders(origin, allowed),
          },
        },
      )
    }
    clearTimeout(timer)

    if (options.debug && !upstream.ok) {
      console.warn(`[nexwinds/proxy] upstream returned ${upstream.status} for ${target}`)
    }

    // Pass through the upstream body verbatim; only headers we own get rewritten.
    const out = new Response(upstream.body, { status: upstream.status })
    const ct = upstream.headers.get('content-type')
    if (ct) out.headers.set('content-type', ct)
    
    // Add a marker to distinguish SaaS errors from Proxy errors
    out.headers.set('x-nxw-upstream-status', String(upstream.status))

    for (const [k, v] of Object.entries(corsHeaders(origin, allowed))) {
      out.headers.set(k, v)
    }
    return out
  }

  // Attach named handlers for backward compatibility and explicit exports
  const proxy = handle as CaptchaProxyHandlers
  proxy.GET = (req) => handle(req)
  proxy.POST = (req) => handle(req)
  proxy.OPTIONS = (req) => handle(req)

  return proxy
}
