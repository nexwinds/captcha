import { describe, it, expect } from 'vitest'
import { solve, verifyLocallyAsync } from '../src/lib/pow.js'

describe('pow', () => {
  it('solves 0-bit challenges trivially (always first try)', async () => {
    const r = await solve({
      challengeId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      nonce: 'a'.repeat(64),
      bits: 0,
      chunkSize: 1,
    })
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(r.counter).toBe(0)
  })

  it('solves 8-bit challenges quickly (first byte is zero)', async () => {
    const r = await solve({
      challengeId: 'ch-test-1',
      nonce: 'b'.repeat(64),
      bits: 8,
      chunkSize: 64,
    })
    expect(r.hash.slice(0, 2)).toBe('00')
  }, 10_000)

  it('verifyLocallyAsync returns true for a valid solution', async () => {
    const solved = await solve({
      challengeId: 'ch-verify-1',
      nonce: 'c'.repeat(64),
      bits: 8,
      chunkSize: 64,
    })
    const ok = await verifyLocallyAsync('ch-verify-1', 'c'.repeat(64), 8, solved.hash)
    expect(ok).toBe(true)
  })

  it('verifyLocallyAsync returns false for a wrong hash', async () => {
    const ok = await verifyLocallyAsync('ch-bad', 'd'.repeat(64), 8, 'a'.repeat(64))
    expect(ok).toBe(false)
  })

  it('verifyLocallyAsync rejects malformed hex', async () => {
    const ok = await verifyLocallyAsync('ch-malformed', 'e'.repeat(64), 8, 'zz'.repeat(32))
    expect(ok).toBe(false)
  })

  it('throws on out-of-range bits', async () => {
    await expect(
      solve({ challengeId: 'x', nonce: 'f'.repeat(64), bits: -1 }),
    ).rejects.toBeInstanceOf(RangeError)
    await expect(
      solve({ challengeId: 'x', nonce: 'f'.repeat(64), bits: 257 }),
    ).rejects.toBeInstanceOf(RangeError)
  })

  it('aborts cleanly on signal', async () => {
    const ac = new AbortController()
    const p = solve({
      challengeId: 'ch-abort',
      nonce: '0'.repeat(64),
      bits: 16,
      chunkSize: 8,
      signal: ac.signal,
    })
    ac.abort()
    await expect(p).rejects.toThrow()
  })
})
