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

import { DEFAULT_ENDPOINT } from '../lib/constants.js'

/** Path the consumer mounts the proxy under. The factory strips this prefix. */
export const DEFAULT_PROXY_MOUNT = '/api/captcha'

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
  GET: (request: Request) => Promise<Response>
  POST: (request: Request) => Promise<Response>
  OPTIONS: (request: Request) => Promise<Response>
}

function resolveOriginPolicy(
  requestOrigin: string,
  allowed: string[] | '*',
): string | null {
  if (allowed === '*') return requestOrigin || '*'
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
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
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
  if (pathname === m || pathname === `${m}/`) return ''
  if (pathname.startsWith(`${m}/`)) return pathname.slice(m.length + 1)
  return pathname.replace(/^\/+/, '')
}

/**
 * Build a set of Route Handlers. Returns the standard Web Fetch triples
 * (`GET`, `POST`, `OPTIONS`) that Next.js, Workers, etc. consume directly.
 */
export function createCaptchaProxy(
  options: CaptchaProxyOptions = {},
): CaptchaProxyHandlers {
  const endpoint = DEFAULT_ENDPOINT
  const mount = options.mountPath ?? DEFAULT_PROXY_MOUNT
  const allowed = options.allowedOrigins ?? '*'
  const timeoutMs = options.timeoutMs ?? 10_000

  async function handle(
    request: Request,
    method: 'GET' | 'POST',
  ): Promise<Response> {
    const origin = readRequestOrigin(request)
    const incomingUrl = new URL(request.url)
    const tail = stripMount(incomingUrl.pathname, mount)
    const target = joinUrl(endpoint, tail, incomingUrl.search)

    const headers = new Headers()
    const auth = request.headers.get('authorization')
    if (auth) headers.set('authorization', auth)
    if (method === 'POST') {
      headers.set('content-type', 'application/json')
    }

    let init: RequestInit = {
      method,
      headers,
    }
    if (method === 'POST') {
      init.body = await request.text()
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
      return new Response(
        JSON.stringify({
          type: 'about:blank',
          title: 'Bad Gateway',
          status: 502,
          detail: e instanceof Error ? e.message : 'upstream fetch failed',
        }),
        {
          status: 502,
          headers: {
            'content-type': 'application/problem+json',
            ...corsHeaders(origin, allowed),
          },
        },
      )
    }
    clearTimeout(timer)

    // Pass through the upstream body verbatim; only headers we own get rewritten.
    const out = new Response(upstream.body, { status: upstream.status })
    const ct = upstream.headers.get('content-type')
    if (ct) out.headers.set('content-type', ct)
    for (const [k, v] of Object.entries(corsHeaders(origin, allowed))) {
      out.headers.set(k, v)
    }
    return out
  }

  return {
    OPTIONS: async (request) => {
      const origin = readRequestOrigin(request)
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) })
    },
    GET: (request) => handle(request, 'GET'),
    POST: (request) => handle(request, 'POST'),
  }
}
