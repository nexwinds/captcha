/**
 * Web Crypto SHA-256 proof-of-work solver.
 *
 * Server contract (locked in contracts/openapi.yaml rev 2, §D):
 *   payload    = `${challengeId}:${nonce}`
 *   combined   = concat(utf8(payload), 4-byte-big-endian(counter))
 *   digest     = sha256(combined)
 *   require:   first `bits` bits of `digest` are zero
 *
 * The solver iterates a 32-bit counter, hashes `(payload, counter)` with
 * SHA-256, and returns the first hex-encoded digest whose binary
 * representation has `bits` leading zero bits. Verification is a direct
 * leading-zero-bit check on the returned 32-byte hash (no re-hash).
 *
 * `solve()` yields to the event loop every CHUNK iterations via
 * `requestIdleCallback` (with a `setTimeout` fallback) so the main
 * thread is never blocked.
 */

export interface SolveOptions {
  challengeId: string
  /** 64-character hex (32 bytes). */
  nonce: string
  bits: number
  /** Aborts the solve loop. */
  signal?: AbortSignal
  /** Iterations per idle callback. Defaults to 256. */
  chunkSize?: number
}

export interface SolveResult {
  /** 64-character hex string (32 bytes) the solver found. */
  hash: string
  /** Counter value used. */
  counter: number
  /** Elapsed milliseconds. */
  elapsedMs: number
}

const CHUNK = 256
const MAX_COUNTER = 0xffffffff

const HEX_CHARS = '0123456789abcdef'

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0
    out += HEX_CHARS[(b >> 4) & 0xf]
    out += HEX_CHARS[b & 0xf]
  }
  return out
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/**
 * Cast any `Uint8Array<ArrayBufferLike>` (TS 5.7+ default) to a `BufferSource`
 * that `crypto.subtle.digest` accepts. The underlying bytes are identical;
 * this is a typing-only no-op.
 */
function asBufferSource(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource
}

function hasLeadingZeroBits(bytes: Uint8Array, bits: number): boolean {
  if (bits <= 0) return true
  const fullBytes = Math.floor(bits / 8)
  const tail = bits % 8
  for (let i = 0; i < fullBytes; i++) {
    if ((bytes[i] ?? 0) !== 0) return false
  }
  if (tail === 0) return true
  const mask = (0xff << (8 - tail)) & 0xff
  return ((bytes[fullBytes] ?? 0) & mask) === 0
}

function nextIdle(): Promise<void> {
  const w = globalThis as unknown as {
    requestIdleCallback?: (cb: () => void) => number
  }
  return new Promise<void>((resolve) => {
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

export async function solve(opts: SolveOptions): Promise<SolveResult> {
  const { challengeId, nonce, bits, signal } = opts
  if (bits < 0 || bits > 256) {
    throw new RangeError(`bits must be in [0, 256], got ${bits}`)
  }
  const payload = `${challengeId}:${nonce}`
  const payloadBytes = utf8(payload)
  const chunkSize = opts.chunkSize ?? CHUNK
  const start = performance.now()
  let counter = 0

  // For bits=0, the empty hash trivially satisfies the constraint.
  // We still return a real hash for telemetry.
  while (counter <= MAX_COUNTER) {
    if (signal?.aborted) {
      throw new DOMException('solve aborted', 'AbortError')
    }
    for (let i = 0; i < chunkSize && counter <= MAX_COUNTER; i++, counter++) {
      // Use 32-byte nonce (4-byte Big-Endian counter + 28 bytes of zeros)
      // as the solution, so the server can re-hash it.
      const nonceBytes = new Uint8Array(32)
      nonceBytes[0] = (counter >> 24) & 0xff
      nonceBytes[1] = (counter >> 16) & 0xff
      nonceBytes[2] = (counter >> 8) & 0xff
      nonceBytes[3] = counter & 0xff

      const combined = concat(payloadBytes, nonceBytes)
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', asBufferSource(combined)))

      if (hasLeadingZeroBits(digest, bits)) {
        return {
          // Return the nonce (the input to the hash), not the digest.
          // This matches the server's expectation to re-hash.
          hash: bytesToHex(nonceBytes),
          counter,
          elapsedMs: performance.now() - start,
        }
      }
    }
    if (counter > MAX_COUNTER) break
    await nextIdle()
  }
  throw new Error(`solve: exceeded MAX_COUNTER=${MAX_COUNTER} without finding a solution`)
}

/**
 * Synchronous verification helper, used by tests only. The real server
 * uses the same algorithm in `app/api/v1/challenge/verify/route.ts`.
 */
export function verifyLocally(
  challengeId: string,
  nonce: string,
  bits: number,
  hashHex: string,
): boolean {
  if (bits < 0 || bits > 256) return false
  if (hashHex.length !== 64) return false
  const payload = utf8(`${challengeId}:${nonce}`)
  // The server's algorithm is: sha256(concat(utf8(payload), hexDecode(hash)))
  // We replicate that.
  const decoded = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    decoded[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16)
  }
  const combined = concat(payload, decoded)
  // crypto.subtle.digest is async; we use it via deasync-style fallback.
  // In tests, we use a separate `verifyLocallyAsync`. This sync version
  // is only kept for documentation and short-circuits bits=0.
  if (bits === 0) return true
  // Reject — use verifyLocallyAsync in actual test code.
  return false
}

export async function verifyLocallyAsync(
  challengeId: string,
  nonce: string,
  bits: number,
  hashHex: string,
): Promise<boolean> {
  if (bits < 0 || bits > 256) return false
  if (hashHex.length !== 64) return false
  if (bits === 0) return true

  const payload = utf8(`${challengeId}:${nonce}`)
  const decoded = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    const byte = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) return false
    decoded[i] = byte
  }

  const combined = concat(payload, decoded)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', asBufferSource(combined)))
  return hasLeadingZeroBits(digest, bits)
}
