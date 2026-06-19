import { DEFAULT_PROXY_MOUNT } from '../lib/constants.js'

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
    return requestOrigin || null
  }
  if (allowed.includes(requestOrigin)) return requestOrigin
  return null
}

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
    'Access-Control-Allow-Headers': 'authorization, content-type, x-nxw-site-key, x-nxw-origin',
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
  const p = pathname.replace(/\/+$/, '')
  
  if (p === m) return ''
  if (p.startsWith(`${m}/`)) return p.slice(m.length + 1)
  
  if (p.includes('/challenge/issue')) return 'challenge/issue'
  if (p.includes('/challenge/verify')) return 'challenge/verify'
  if (p.includes('/calibration')) return 'calibration'
  
  return p.replace(/^\/+/, '')
}

/**
 * The core proxy logic, extracted for maximum compatibility.
 * Use this directly in your Route Handlers if the factory fails.
 */
export async function handleCaptchaProxyRequest(
  request: Request,
  options: CaptchaProxyOptions = {}
): Promise<Response> {
  const method = request.method.toUpperCase()
  const debug = options.debug ?? (process.env.NODE_ENV === 'development')
  
  if (debug) {
    console.log(`[nexwinds/proxy] HTTP ${method} invoked for ${request.url}`)
  }

  const endpoint = options.endpoint ?? NEXWINDS_SAAS_URL
  const mount = options.mountPath ?? DEFAULT_PROXY_MOUNT
  const allowed = options.allowedOrigins ?? '*'
  const timeoutMs = options.timeoutMs ?? 10_000
  const origin = readRequestOrigin(request)

  if (method === 'OPTIONS') {
    if (debug) console.log(`[nexwinds/proxy] handling OPTIONS preflight`)
    return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) })
  }

  if (method !== 'GET' && method !== 'POST') {
    console.warn(`[nexwinds/proxy] method ${method} not allowed for ${request.url}`)
    return new Response('Method Not Allowed', { 
      status: 405, 
      headers: { 'Allow': 'GET, POST, OPTIONS' } 
    })
  }

  let bodyText: string | undefined = undefined;
  if (method === 'POST') {
    try {
      if (debug) console.log(`[nexwinds/proxy] reading POST body...`)
      bodyText = await request.clone().text()
      if (debug) console.log(`[nexwinds/proxy] POST body read success (${bodyText.length} bytes)`)
    } catch (e) {
      console.error(`[nexwinds/proxy] CRITICAL: Failed to read POST request body for ${request.url}:`, e)
    }
  }

  const incomingUrl = new URL(request.url)
  const tail = stripMount(incomingUrl.pathname, mount)
  const target = joinUrl(endpoint, tail, incomingUrl.search)

  if (debug) {
    console.log(`[nexwinds/proxy] forwarding ${method} -> ${target}`)
  }

  const headers = new Headers()
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

  try {
    const upstream = await fetch(target, init)
    clearTimeout(timer)

    if (debug && !upstream.ok) {
      console.warn(`[nexwinds/proxy] upstream returned ${upstream.status} for ${target}`)
    }

    const out = new Response(upstream.body, { status: upstream.status })
    const ct = upstream.headers.get('content-type')
    if (ct) out.headers.set('content-type', ct)
    
    out.headers.set('x-nxw-upstream-status', String(upstream.status))

    for (const [k, v] of Object.entries(corsHeaders(origin, allowed))) {
      out.headers.set(k, v)
    }
    return out
  } catch (e) {
    clearTimeout(timer)
    const isAbort = e instanceof Error && e.name === 'AbortError'
    const status = isAbort ? 504 : 502
    const title = isAbort ? 'Gateway Timeout' : 'Bad Gateway'
    
    if (debug) {
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

  const proxy = ((req: Request) => handleCaptchaProxyRequest(req, options)) as CaptchaProxyHandlers
  proxy.GET = proxy
  proxy.POST = proxy
  proxy.OPTIONS = proxy

  return proxy
}
