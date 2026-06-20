/**
 * Type-safe HTTPS client for the NEXCAPTCHA captcha SaaS.
 *
 * This is the only file that touches `fetch`. Every other module that needs
 * to talk to the SaaS goes through `captchaFetch`.
 */

import type {
  Calibration,
  ChallengeIssueRequest,
  ChallengeIssueResponse,
  ChallengeVerifyOutcome,
  ChallengeVerifyRequest,
  Problem,
  TokenVerifyRequest,
  TokenVerifySuccess,
  WellKnown,
} from '../types.js'

export class CaptchaHttpError extends Error {
  public readonly problem: Problem
  public readonly status: number
  constructor(status: number, problem: Problem) {
    super(`[nexcaptcha] HTTP ${status} ${problem.title || ''}: ${problem.detail || ''}`.trim())
    this.name = 'CaptchaHttpError'
    this.status = status
    this.problem = problem
  }
}

export class CaptchaNetworkError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(`[nexcaptcha] network error: ${message}`)
    this.name = 'CaptchaNetworkError'
  }
}

export class CaptchaTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`[nexcaptcha] request exceeded ${timeoutMs}ms`)
    this.name = 'CaptchaTimeoutError'
  }
}

export interface FetchOptions {
  siteKey?: string
  /** Bearer token override (e.g. for server-to-server secret calls). */
  bearer?: string
  signal?: AbortSignal
  timeoutMs?: number
  /** Override the global fetch (e.g. msw in tests). */
  fetch?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 10_000

function buildHeaders(opts: FetchOptions): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json, application/problem+json',
  }
  if (opts.bearer) {
    h.Authorization = `Bearer ${opts.bearer}`
  } else if (opts.siteKey) {
    h.Authorization = `Bearer ${opts.siteKey}`
  }
  return h
}

function isProblem(value: unknown): value is Problem {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.type === 'string' && typeof v.title === 'string' && typeof v.status === 'number'
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('Content-Type') || ''
  if (
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json')
  ) {
    try {
      return await res.json()
    } catch {
      return null
    }
  }
  return null
}

function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CaptchaTimeoutError(ms))
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new CaptchaNetworkError('aborted', signal?.reason))
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    promise.then(
      (v) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

async function request<T>(
  endpoint: string,
  method: 'GET' | 'POST',
  path: string,
  body: unknown | undefined,
  opts: FetchOptions,
): Promise<T> {
  const url = joinUrl(endpoint, path)
  const headers: Record<string, string> = {
    ...buildHeaders(opts),
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  }
  let res: Response
  try {
    res = await withTimeout(fetchImpl(url, init), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal)
  } catch (e) {
    if (e instanceof CaptchaTimeoutError) throw e
    if (e instanceof CaptchaNetworkError) throw e
    throw new CaptchaNetworkError((e as Error).message ?? 'fetch failed', e)
  }
  const parsed = await parseResponseBody(res)
  if (!res.ok) {
    if (isProblem(parsed)) {
      throw new CaptchaHttpError(res.status, parsed)
    }
    throw new CaptchaHttpError(res.status, {
      type: 'about:blank',
      title: res.statusText || 'Request failed',
      status: res.status,
    })
  }
  return parsed as T
}

function joinUrl(base: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const b = base.replace(/\/+$/, '')
  const p = path.replace(/^\/+/, '')
  return `${b}/${p}`
}

// ---------------------------------------------------------------------------
// Typed wrappers
// ---------------------------------------------------------------------------

export async function getCalibration(
  endpoint: string,
  opts: FetchOptions = {},
): Promise<Calibration> {
  return request<Calibration>(endpoint, 'GET', '/calibration', undefined, opts)
}

export async function getWellKnown(endpoint: string, opts: FetchOptions = {}): Promise<WellKnown> {
  return request<WellKnown>(endpoint, 'GET', '/.well-known/nexcaptcha.json', undefined, opts)
}

export async function issueChallenge(
  endpoint: string,
  body: ChallengeIssueRequest,
  opts: FetchOptions,
): Promise<ChallengeIssueResponse> {
  return request<ChallengeIssueResponse>(endpoint, 'POST', '/challenge/issue', body, opts)
}

export async function verifyChallenge(
  endpoint: string,
  body: ChallengeVerifyRequest,
  opts: FetchOptions,
): Promise<ChallengeVerifyOutcome> {
  return request<ChallengeVerifyOutcome>(endpoint, 'POST', '/challenge/verify', body, opts)
}

export async function verifyToken(
  endpoint: string,
  body: TokenVerifyRequest,
  opts: FetchOptions,
): Promise<TokenVerifySuccess> {
  return request<TokenVerifySuccess>(endpoint, 'POST', '/token/verify', body, opts)
}
