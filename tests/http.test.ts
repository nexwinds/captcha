import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  getCalibration,
  issueChallenge,
  verifyChallenge,
  verifyToken,
  CaptchaHttpError,
  CaptchaNetworkError,
  CaptchaTimeoutError,
} from '../src/lib/http.js'

const ENDPOINT = 'https://test.invalid/api/v1'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function problemResponse(status: number, type: string, title: string, detail?: string): Response {
  return jsonResponse(
    { type, title, status, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  // @ts-expect-error - test stub
  globalThis.fetch = fetchMock
})

afterEach(() => {
  fetchMock.mockReset()
})

describe('http.getCalibration', () => {
  it('returns the calibration object', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ v: 1, low: 16, medium: 18, high: 20, critical: 23 }),
    )
    const c = await getCalibration(ENDPOINT)
    expect(c.low).toBe(16)
    expect(c.critical).toBe(23)
  })

  it('throws CaptchaHttpError on 500 with problem+json', async () => {
    fetchMock.mockResolvedValueOnce(
      problemResponse(500, 'https://nexcookie.com/probs/internal', 'Internal', 'boom'),
    )
    await expect(getCalibration(ENDPOINT)).rejects.toBeInstanceOf(CaptchaHttpError)
  })
})

describe('http.issueChallenge', () => {
  it('sends Bearer + body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        challengeId: 'ch-1',
        nonce: 'a'.repeat(64),
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        bits: 18,
        origin: 'nexwinds',
      }),
    )
    const r = await issueChallenge(
      ENDPOINT,
      { fingerprintHash: 'fp_x' },
      { publishableKey: 'pk_live_x' },
    )
    expect(r.challengeId).toBe('ch-1')
    expect(r.bits).toBe(18)
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe(`${ENDPOINT}/challenge/issue`)
    expect(call[1]!.method).toBe('POST')
    expect(call[1]!.headers.Authorization).toBe('Bearer pk_live_x')
  })
})

describe('http.verifyChallenge', () => {
  it('parses success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'success',
        token: 'tk',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        failOpen: false,
      }),
    )
    const out = await verifyChallenge(
      ENDPOINT,
      {
        challengeId: 'c',
        nonce: 'a'.repeat(64),
        hash: '00000001',
        bits: 18,
        signals: {
          v: 1,
          dwellMs: 1000,
          timeToClickMs: 80,
          mouseMovements: 10,
          keyboardInteractions: 0,
        },
        fingerprintHash: 'fp',
      },
      { publishableKey: 'pk' },
    )
    expect(out.status).toBe('success')
  })

  it('parses bypass', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'bypass',
        token: 'tk2',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        failOpen: false,
      }),
    )
    const out = await verifyChallenge(
      ENDPOINT,
      {
        challengeId: 'c',
        nonce: 'a'.repeat(64),
        hash: '00000001',
        bits: 18,
        signals: { v: 1, dwellMs: 0, timeToClickMs: 0, mouseMovements: 0, keyboardInteractions: 0 },
        fingerprintHash: 'fp',
      },
      { publishableKey: 'pk' },
    )
    expect(out.status).toBe('bypass')
  })

  it('parses failOpen (truly minimal envelope)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'success', failOpen: true }),
    )
    const out = await verifyChallenge(
      ENDPOINT,
      {
        challengeId: 'c',
        nonce: 'a'.repeat(64),
        hash: '00000001',
        bits: 18,
        signals: { v: 1, dwellMs: 0, timeToClickMs: 0, mouseMovements: 0, keyboardInteractions: 0 },
        fingerprintHash: 'fp',
      },
      { publishableKey: 'pk' },
    )
    expect(out.status).toBe('success')
    if (out.status === 'success') {
      expect(out.failOpen).toBe(true)
    }
  })

  it('throws on 429 with problem type', async () => {
    fetchMock.mockResolvedValueOnce(
      problemResponse(429, 'https://nexcookie.com/probs/rate-limited', 'Too Many Requests', '10 per 20m'),
    )
    await expect(
      verifyChallenge(
        ENDPOINT,
        {
          challengeId: 'c',
          nonce: 'a'.repeat(64),
          hash: '00000001',
          bits: 18,
          signals: { v: 1, dwellMs: 0, timeToClickMs: 0, mouseMovements: 0, keyboardInteractions: 0 },
          fingerprintHash: 'fp',
        },
        { publishableKey: 'pk' },
      ),
    ).rejects.toMatchObject({
      name: 'CaptchaHttpError',
      status: 429,
      problem: { type: 'https://nexcookie.com/probs/rate-limited' },
    })
  })
})

describe('http.verifyToken (secret key)', () => {
  it('sends secret as bearer', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        siteId: 7,
        principal: { ip: '1.2.3.4', fingerprintHash: 'fp' },
        bypass: false,
      }),
    )
    const r = await verifyToken(ENDPOINT, { token: 'tk' }, { bearer: 'sk_live_x' })
    expect(r.siteId).toBe(7)
    const call = fetchMock.mock.calls[0]!
    expect(call[1]!.headers.Authorization).toBe('Bearer sk_live_x')
  })
})

describe('error handling', () => {
  it('wraps fetch rejection in CaptchaNetworkError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(getCalibration(ENDPOINT)).rejects.toBeInstanceOf(CaptchaNetworkError)
  })

  it('returns CaptchaTimeoutError when fetch hangs', async () => {
    fetchMock.mockImplementationOnce(
      () => new Promise(() => {/* never resolves */}),
    )
    await expect(
      getCalibration(ENDPOINT, { timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(CaptchaTimeoutError)
  }, 1000)
})
