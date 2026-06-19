import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCaptchaProxy } from '../src/server/createCaptchaProxy.js'

const ENDPOINT = 'https://nexcookie.com/api/v1'
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  // @ts-expect-error - test stub
  globalThis.fetch = fetchMock
})

afterEach(() => {
  fetchMock.mockReset()
})

function req(path: string, init: RequestInit = {}, opts: { origin?: string } = {}): Request {
  const url = `https://app.example.com${path}`
  const r = new Request(url, init)
  // Some test envs (e.g. happy-dom) strip the `Origin` header from
  // constructed Requests because it's on the Fetch forbidden-header list.
  // The proxy also reads `X-Nxw-Origin` for this reason — set it here so
  // the tests exercise the same code path as a real browser would.
  if (opts.origin && !r.headers.get('origin')) {
    r.headers.set('x-nxw-origin', opts.origin)
  }
  return r
}

describe('createCaptchaProxy', () => {
  it('exports GET, POST, OPTIONS handlers', () => {
    const h = createCaptchaProxy({ mountPath: '/api/captcha' })
    expect(typeof h.GET).toBe('function')
    expect(typeof h.POST).toBe('function')
    expect(typeof h.OPTIONS).toBe('function')
  })

  it('OPTIONS returns 204 with CORS headers (wildcard echos origin)', async () => {
    const h = createCaptchaProxy({ mountPath: '/api/captcha' })
    const res = await h.OPTIONS(
      req('/api/captcha/calibration', {}, { origin: 'https://app.example.com' }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('OPTIONS returns * when no origin header and allowedOrigins is *', async () => {
    const h = createCaptchaProxy({ mountPath: '/api/captcha' })
    const res = await h.OPTIONS(req('/api/captcha/calibration'))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('OPTIONS echoes origin when allow-list matches', async () => {
    const h = createCaptchaProxy({
      mountPath: '/api/captcha',
      allowedOrigins: ['https://app.example.com', 'https://other.com'],
    })
    const res = await h.OPTIONS(
      req('/api/captcha/calibration', {}, { origin: 'https://app.example.com' }),
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
  })

  it('OPTIONS omits Allow-Origin when origin is not in allow-list', async () => {
    const h = createCaptchaProxy({
      mountPath: '/api/captcha',
      allowedOrigins: ['https://app.example.com'],
    })
    const res = await h.OPTIONS(
      req('/api/captcha/calibration', {}, { origin: 'https://evil.example.com' }),
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('GET forwards path + query to upstream with auth header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ v: 1, low: 16, medium: 18, high: 20, critical: 23 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const h = createCaptchaProxy({ mountPath: '/api/captcha' })
    const res = await h.GET(
      req('/api/captcha/calibration?x=1', {
        headers: { authorization: 'Bearer pk_x' },
      }, { origin: 'https://app.example.com' }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe(`${ENDPOINT}/calibration?x=1`)
    expect(call[1]!.method).toBe('GET')
    expect((call[1]!.headers as Headers).get('authorization')).toBe('Bearer pk_x')
  })

  it('POST forwards body, content-type, and auth header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const h = createCaptchaProxy({ mountPath: '/api/captcha' })
    const res = await h.POST(
      req('/api/captcha/challenge/issue', {
        method: 'POST',
        headers: {
          authorization: 'Bearer pk_x',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ fingerprintHash: 'fp' }),
      }, { origin: 'https://app.example.com' }),
    )
    expect(res.status).toBe(200)
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe(`${ENDPOINT}/challenge/issue`)
    expect(call[1]!.method).toBe('POST')
    expect(call[1]!.body).toBe(JSON.stringify({ fingerprintHash: 'fp' }))
    expect((call[1]!.headers as Headers).get('content-type')).toBe('application/json')
  })

  it('forwards upstream problem+json content-type for SDK to parse', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ type: 'https://nexcookie.com/probs/rate-limited', title: 'Too Many', status: 429 }),
        { status: 429, headers: { 'content-type': 'application/problem+json' } },
      ),
    )
    const h = createCaptchaProxy({ mountPath: '/api/captcha' })
    const res = await h.GET(
      req('/api/captcha/calibration', {}, { origin: 'https://app.example.com' }),
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
  })

  it('returns 502 with problem+json when upstream fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const h = createCaptchaProxy({ mountPath: '/api/captcha' })
    const res = await h.GET(
      req('/api/captcha/calibration', {}, { origin: 'https://app.example.com' }),
    )
    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
  })

  it('strips custom mount path before forwarding', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const h = createCaptchaProxy({ mountPath: '/api/captcha-proxy' })
    const res = await h.GET(
      req('/api/captcha-proxy/challenge/issue', {}, { origin: 'https://app.example.com' }),
    )
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe(`${ENDPOINT}/challenge/issue`)
  })

  it('runs beforeFetch hook to mutate the upstream request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const beforeFetch = vi.fn(({ init }: { init: RequestInit }) => {
      const headers = new Headers(init.headers)
      headers.set('x-internal', '1')
      return { ...init, headers }
    })
    const h = createCaptchaProxy({
      mountPath: '/api/captcha',
      beforeFetch,
    })
    await h.GET(
      req('/api/captcha/calibration', {}, { origin: 'https://app.example.com' }),
    )
    expect(beforeFetch).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]!
    expect((call[1]!.headers as Headers).get('x-internal')).toBe('1')
  })
})
