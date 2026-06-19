import { describe, it, expect, vi } from 'vitest'
import { createServerClient } from '../src/server/createServerClient.js'
import type { Problem } from '../src/types.js'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function problemResponse(status: number, type: string, title: string, detail?: string): Response {
  return jsonResponse(
    { type, title, status, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

const ENDPOINT = 'https://test.invalid/api/v1'

describe('server.createServerClient', () => {
  it('returns ok:true on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        siteId: 1,
        principal: { ip: '1.2.3.4', fingerprintHash: 'fp' },
        bypass: false,
      }),
    )
    const client = createServerClient({
      secretKey: 'sk_live_x',
      endpoint: ENDPOINT,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const r = await client.verifyToken('tk')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.siteId).toBe(1)
      expect(r.bypass).toBe(false)
    }
  })

  it('maps 410 token-expired to reason:expired', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      problemResponse(410, 'https://nexcookie.com/probs/token-expired', 'Token Expired', 'expired'),
    )
    const client = createServerClient({
      secretKey: 'sk_live_x',
      endpoint: ENDPOINT,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const r = await client.verifyToken('tk')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('expired')
    }
  })

  it('maps 410 token-revoked to reason:revoked', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      problemResponse(410, 'https://nexcookie.com/probs/token-revoked', 'Token Revoked', 'revoked'),
    )
    const client = createServerClient({
      secretKey: 'sk_live_x',
      endpoint: ENDPOINT,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const r = await client.verifyToken('tk')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('revoked')
    }
  })

  it('maps 400 invalid-token to reason:invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      problemResponse(400, 'https://nexcookie.com/probs/invalid-token', 'Invalid Token', 'bad'),
    )
    const client = createServerClient({
      secretKey: 'sk_live_x',
      endpoint: ENDPOINT,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const r = await client.verifyToken('tk')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('invalid')
    }
  })

  it('maps 401 to reason:unauthorized', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      problemResponse(401, 'https://nexcookie.com/probs/unauthorized', 'Unauthorized', 'no key'),
    )
    const client = createServerClient({
      secretKey: 'sk_live_x',
      endpoint: ENDPOINT,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const r = await client.verifyToken('tk')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('unauthorized')
    }
  })

  it('returns ok:false on network error', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const client = createServerClient({
      secretKey: 'sk_live_x',
      endpoint: ENDPOINT,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const r = await client.verifyToken('tk')
    expect(r.ok).toBe(false)
  })

  it('rejects empty token without calling fetch', async () => {
    const fetchMock = vi.fn()
    const client = createServerClient({
      secretKey: 'sk_live_x',
      endpoint: ENDPOINT,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const r = await client.verifyToken('')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('invalid')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('problem is attached to the failure result', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      problemResponse(410, 'https://nexcookie.com/probs/token-expired', 'Token Expired', 'foo'),
    )
    const client = createServerClient({
      secretKey: 'sk_live_x',
      endpoint: ENDPOINT,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const r = await client.verifyToken('tk')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const p = r.problem as Problem | undefined
      expect(p?.detail).toBe('foo')
    }
  })
})
