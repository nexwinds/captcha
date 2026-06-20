/**
 * Client-side fingerprint hash.
 *
 * Per the locked contract (CLARIFY_NEXCOOKIE §F): v1 ships an
 * opaque fingerprint hash that the widget computes. The server does
 * NOT rotate or re-validate it. It is stored client-side in
 * localStorage; if missing, a new one is generated.
 *
 * The hash is computed once at first paint and is stable across
 * reloads of the same browser on the same device. It is NOT a
 * tracking identifier — anyone can clear localStorage and start
 * over.
 */

const STORAGE_KEY = 'nxc:cap:fp'
const SALT_KEY = 'nxc:cap:fp:salt'

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

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  return bytesToHex(digest)
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode, quota, or storage disabled — fall through. */
  }
}

function collectFeatures(): Record<string, string> {
  const f: Record<string, string> = {}
  try {
    f.lang = navigator.language || ''
    f.langs = (navigator.languages || []).join(',')
    f.platform = navigator.platform || ''
    f.hw = String(navigator.hardwareConcurrency || 0)
    f.mem = String((navigator as { deviceMemory?: number }).deviceMemory ?? 0)
    f.tz = String(new Date().getTimezoneOffset())
    f.sw = String(window.screen?.width || 0)
    f.sh = String(window.screen?.height || 0)
    f.cd = String(window.screen?.colorDepth || 0)
    f.cookie = navigator.cookieEnabled ? '1' : '0'
  } catch {
    /* SSR or locked-down environment — empty features. */
  }
  return f
}

export async function getFingerprintHash(): Promise<string> {
  if (typeof window === 'undefined' || !('localStorage' in globalThis)) {
    return ''
  }
  const existing = safeGet(STORAGE_KEY)
  if (existing) return existing

  let salt = safeGet(SALT_KEY)
  if (!salt) {
    salt = randomSalt()
    safeSet(SALT_KEY, salt)
  }

  const features = collectFeatures()
  const keys = Object.keys(features).sort()
  const canonical = keys.map((k) => `${k}=${features[k] ?? ''}`).join('|')
  const hash = await sha256(`${salt}::${canonical}`)
  safeSet(STORAGE_KEY, hash)
  return hash
}

/** Test helper: clear the cached fingerprint. */
export function _resetFingerprintForTests(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(SALT_KEY)
  } catch {
    /* noop */
  }
}
