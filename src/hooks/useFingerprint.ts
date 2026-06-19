/**
 * useFingerprint: lazy, cached hash of stable client features.
 */

import { useEffect, useState } from 'react'
import { getFingerprintHash } from '../lib/fingerprint.js'

export function useFingerprint(): { hash: string; ready: boolean } {
  const [hash, setHash] = useState<string>('')
  const [ready, setReady] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    getFingerprintHash()
      .then((h) => {
        if (cancelled) return
        setHash(h)
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setHash('')
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { hash, ready }
}
