/**
 * useCaptcha: the main orchestrator. Drives the full lifecycle:
 *
 *   idle → issue → solving → verify → success | bypass | blocked | error
 *
 * Holds the calibration cache, runs the PoW solver, calls the SaaS,
 * and reports back through `onVerify` from the props.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCalibration,
  issueChallenge,
  verifyChallenge,
  CaptchaHttpError,
  CaptchaNetworkError,
  CaptchaTimeoutError,
} from '../lib/http.js'
import { solve } from '../lib/pow.js'
import {
  DEFAULT_ENDPOINT,
  FALLBACK_CALIBRATION,
  HTTP_TIMEOUT_MS,
  MAX_POW_BITS,
} from '../lib/constants.js'
import type { Calibration, ChallengeIssueResponse, VerifyOutcome } from '../types.js'

export type CaptchaState =
  | 'idle'
  | 'issuing'
  | 'solving'
  | 'fallback'
  | 'verifying'
  | 'success'
  | 'bypass'
  | 'blocked'
  | 'error'

export interface UseCaptchaOptions {
  siteKey: string
  fingerprintHash: string
  /** Returns a fresh signals snapshot, called at verify time. */
  getSignals: () => import('../types.js').SignalsV1
  onVerify?: (outcome: VerifyOutcome) => void
  onSuccess?: (token: string) => void
  onExpire?: () => void
  onError?: (err: { message: string }) => void
  /** Abort the in-flight solve/verify (component unmount). */
  signal?: AbortSignal
}

export interface MathChallenge {
  question: string
  options: number[]
  answer: number
}

export interface UseCaptchaResult {
  state: CaptchaState
  start: () => Promise<void>
  reset: () => void
  calibration: Calibration | null
  /** Most recent HTTP error, if any. Cleared on `reset()`. */
  lastError: string | null
  /** Current math challenge, if in fallback state. */
  mathChallenge: MathChallenge | null
  /** Submit math answer. */
  submitMath: (answer: number) => void
}

let calibrationCache: { value: Calibration; fetchedAt: number } | null = null
const CALIBRATION_TTL_MS = 24 * 60 * 60 * 1000

async function fetchCalibration(): Promise<Calibration> {
  const now = Date.now()
  if (calibrationCache && now - calibrationCache.fetchedAt < CALIBRATION_TTL_MS) {
    return calibrationCache.value
  }
  const cal = await getCalibration(DEFAULT_ENDPOINT, { timeoutMs: HTTP_TIMEOUT_MS })
  calibrationCache = { value: cal, fetchedAt: now }
  return cal
}

const FALLBACK_TIMEOUT_MS = 15_000

function generateMath(): MathChallenge {
  const a = Math.floor(Math.random() * 10) + 1
  const b = Math.floor(Math.random() * 10) + 1
  const answer = a + b
  const options = [answer]
  while (options.length < 4) {
    const wrong = Math.floor(Math.random() * 20) + 1
    if (!options.includes(wrong)) options.push(wrong)
  }
  return {
    question: `${a} + ${b}`,
    answer,
    options: options.sort(() => Math.random() - 0.5),
  }
}

export function useCaptcha(opts: UseCaptchaOptions): UseCaptchaResult {
  const [state, setState] = useState<CaptchaState>('idle')
  const [calibration, setCalibration] = useState<Calibration | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [mathChallenge, setMathChallenge] = useState<MathChallenge | null>(null)
  const inflightRef = useRef<AbortController | null>(null)
  const challengeRef = useRef<ChallengeIssueResponse | null>(null)
  const onVerifyRef = useRef(opts.onVerify)
  const onSuccessRef = useRef(opts.onSuccess)
  const onExpireRef = useRef(opts.onExpire)
  const onErrorRef = useRef(opts.onError)
  onVerifyRef.current = opts.onVerify
  onSuccessRef.current = opts.onSuccess
  onExpireRef.current = opts.onExpire
  onErrorRef.current = opts.onError

  useEffect(() => {
    if (calibration) return
    let cancelled = false
    fetchCalibration()
      .then((c) => {
        if (cancelled) return
        setCalibration(c)
      })
      .catch((e) => {
        if (cancelled) return
        // Calibration failure is non-fatal — use the fallback table.
        setCalibration(FALLBACK_CALIBRATION)
        onErrorRef.current?.({ message: e instanceof Error ? e.message : 'calibration failed' })
      })
    return () => {
      cancelled = true
    }
  }, [calibration])

  const start = useCallback(async () => {
    if (
      state !== 'idle' &&
      state !== 'blocked' &&
      state !== 'error' &&
      state !== 'success' &&
      state !== 'bypass'
    ) {
      return
    }
    inflightRef.current?.abort()
    const ac = new AbortController()
    inflightRef.current = ac
    setLastError(null)
    setState('issuing')

    let challenge: ChallengeIssueResponse | null = null
    try {
      challenge = await issueChallenge(
        DEFAULT_ENDPOINT,
        { fingerprintHash: opts.fingerprintHash },
        { siteKey: opts.siteKey, signal: ac.signal, timeoutMs: HTTP_TIMEOUT_MS },
      )
      if (!challenge) throw new Error('issueChallenge returned null')
      const ch = challenge
      challengeRef.current = ch
      setState('solving')

      // Fallback timer
      const timeout = setTimeout(() => {
        if (inflightRef.current === ac) {
          ac.abort()
          setMathChallenge(generateMath())
          setState('fallback')
        }
      }, FALLBACK_TIMEOUT_MS)

      const bits = Math.min(ch.bits, MAX_POW_BITS)
      let solved: { hash: string } | null = null
      try {
        solved = await solve({
          challengeId: ch.challengeId,
          nonce: ch.nonce,
          bits,
          signal: ac.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      if (!solved) return // aborted/fallback triggered

      setState('verifying')
      // FINAL VERIFICATION: ensure hash is 8 chars before sending
      const finalHash = String(solved.hash)
      if (finalHash.length !== 8) {
        throw new Error(
          `useCaptcha: solver returned hash of length ${finalHash.length}, expected 8`,
        )
      }

      const outcome = await verifyChallenge(
        DEFAULT_ENDPOINT,
        {
          challengeId: ch.challengeId,
          nonce: ch.nonce,
          hash: finalHash,
          bits: ch.bits, // Send original bits, not the capped ones
          signals: opts.getSignals(),
          fingerprintHash: opts.fingerprintHash,
        },
        { siteKey: opts.siteKey, signal: ac.signal, timeoutMs: HTTP_TIMEOUT_MS },
      )

      const ui: VerifyOutcome = mapOutcome(outcome)
      if (ui.status === 'success' || ui.status === 'bypass') {
        setState(ui.status)
        onSuccessRef.current?.(ui.token)
      } else {
        setState('blocked')
      }
      onVerifyRef.current?.(ui)
    } catch (e) {
      if (ac.signal.aborted) return
      const msg = e instanceof Error ? e.message : String(e)
      setLastError(msg)
      setState('error')
      if (e instanceof CaptchaHttpError) {
        const ui: VerifyOutcome = {
          status: 'blocked',
          reason: httpStatusToReason(e.status),
          problem: e.problem,
        }
        onVerifyRef.current?.(ui)
      } else if (e instanceof CaptchaTimeoutError) {
        onErrorRef.current?.({ message: msg })
        onVerifyRef.current?.({ status: 'error', reason: 'timeout', message: msg })
      } else if (e instanceof CaptchaNetworkError) {
        onErrorRef.current?.({ message: msg })
        onVerifyRef.current?.({ status: 'error', reason: 'network', message: msg })
      } else {
        onErrorRef.current?.({ message: msg })
        onVerifyRef.current?.({ status: 'error', reason: 'unknown', message: msg })
      }
    }
  }, [state, opts.siteKey, opts.fingerprintHash, opts.getSignals, calibration])

  const reset = useCallback(() => {
    inflightRef.current?.abort()
    setState('idle')
    setLastError(null)
    setMathChallenge(null)
    challengeRef.current = null
  }, [])

  const submitMath = useCallback(
    async (answer: number) => {
      if (state !== 'fallback' || !mathChallenge || !challengeRef.current) return

      if (answer !== mathChallenge.answer) {
        setMathChallenge(generateMath())
        return
      }

      // Correct answer! Simulate a bypass or verify.
      // For Local Generation, we verify via signals.
      setState('verifying')
      const ch = challengeRef.current
      try {
        const outcome = await verifyChallenge(
          DEFAULT_ENDPOINT,
          {
            challengeId: ch.challengeId,
            nonce: ch.nonce,
            hash: '00000000', // Placeholder for math bypass
            bits: 0, // Math bypass effectively bits=0
            signals: opts.getSignals(),
            fingerprintHash: opts.fingerprintHash,
          },
          {
            siteKey: opts.siteKey,
            timeoutMs: HTTP_TIMEOUT_MS,
          },
        )

        const ui: VerifyOutcome = mapOutcome(outcome)
        if (ui.status === 'success' || ui.status === 'bypass') {
          setState(ui.status)
          onSuccessRef.current?.(ui.token)
        } else {
          setState('blocked')
        }
        onVerifyRef.current?.(ui)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setLastError(msg)
        setState('error')
        onErrorRef.current?.({ message: msg })
      }
    },
    [state, mathChallenge, opts],
  )

  useEffect(() => {
    return () => {
      inflightRef.current?.abort()
    }
  }, [])

  return useMemo(
    () => ({ state, start, reset, calibration, lastError, mathChallenge, submitMath }),
    [state, start, reset, calibration, lastError, mathChallenge, submitMath],
  )
}

function mapOutcome(outcome: import('../types.js').ChallengeVerifyOutcome): VerifyOutcome {
  if (outcome.status === 'bypass') {
    return {
      status: 'bypass',
      token: outcome.token,
      expiresAt: Date.parse(outcome.expiresAt),
      via: 'bypass',
    }
  }
  if (outcome.failOpen) {
    return {
      status: 'success',
      token: outcome.token ?? '',
      expiresAt: outcome.expiresAt ? Date.parse(outcome.expiresAt) : Date.now() + 5 * 60 * 1000,
      via: 'failOpen',
    }
  }
  return {
    status: 'success',
    token: outcome.token,
    expiresAt: Date.parse(outcome.expiresAt),
    via: 'verify',
  }
}

function httpStatusToReason(s: number): 'rate_limited' | 'policy' | 'expired' | 'invalid' {
  if (s === 429) return 'rate_limited'
  if (s === 410) return 'expired'
  if (s === 403) return 'policy'
  return 'invalid'
}
