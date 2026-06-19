/**
 * <Captcha /> — the widget.
 *
 * Render flow:
 *   1. on first render, fetch the fingerprint hash (lazy, cached).
 *   2. mount behavioral signal listeners (mouse, keyboard, dwell).
 *   3. render the "I am human" checkbox.
 *   4. on user activation (click or keyboard), call useCaptcha().start().
 *   5. while solving/verifying, show a spinner and the "verifying" status.
 *   6. on terminal outcome, call onVerify() with the VerifyOutcome.
 *
 * The three honeypots are rendered as siblings of the visible row,
 * fully off-screen, with `aria-hidden` and `tabindex={-1}`.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { useCaptcha } from '../hooks/useCaptcha.js'
import { useBehavioralSignals } from '../hooks/useBehavioralSignals.js'
import { useFingerprint } from '../hooks/useFingerprint.js'
import { useHoneypot } from '../hooks/useHoneypot.js'
import { useTranslations } from '../hooks/useTranslations.js'
import { useCaptchaContext } from './CaptchaProvider.js'
import { BRAND_NAME, BRAND_URL, PRIVACY_URL } from '../lib/constants.js'
import type { CaptchaProps, VerifyOutcome } from '../types.js'
import styles from './Captcha.module.css'

const STYLE: CSSProperties = { position: 'relative' }

export function Captcha(props: CaptchaProps) {
  const ctx = useCaptchaContext()
  const { hash: fingerprintHash, ready: fingerprintReady } = useFingerprint()
  const signals = useBehavioralSignals({ active: true })
  const honeypot = useHoneypot()
  const { t } = useTranslations()

  const siteKey = props.siteKey ?? props.publishableKey ?? ctx?.siteKey ?? ''
  const endpoint = props.endpoint ?? ctx?.endpoint

  const onVerifyRef = useRef(props.onVerify)
  const onSuccessRef = useRef(props.onSuccess)
  const onExpireRef = useRef(props.onExpire)
  const onErrorRef = useRef(props.onError)
  onVerifyRef.current = props.onVerify
  onSuccessRef.current = props.onSuccess
  onExpireRef.current = props.onExpire
  onErrorRef.current = props.onError

  const captcha = useCaptcha({
    siteKey,
    fingerprintHash,
    getSignals: signals.getSignals,
    onVerify: useCallback((o: VerifyOutcome) => onVerifyRef.current?.(o), []),
    onSuccess: useCallback((t: string) => onSuccessRef.current?.(t), []),
    onExpire: useCallback(() => onExpireRef.current?.(), []),
    onError: useCallback((e: { message: string }) => onErrorRef.current?.(e), []),
    endpoint,
  })

  const id = useId()
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isBusy =
    !fingerprintReady ||
    captcha.state === 'issuing' ||
    captcha.state === 'solving' ||
    captcha.state === 'verifying'

  const checked = captcha.state === 'success' || captcha.state === 'bypass'

  const status = useMemo(() => {
    switch (captcha.state) {
      case 'issuing':
      case 'solving':
      case 'verifying':
        return { tone: 'info' as const, text: t('verifying') }
      case 'success':
        return { tone: 'success' as const, text: t('success') }
      case 'bypass':
        return { tone: 'bypass' as const, text: t('bypass') }
      case 'blocked':
        return { tone: 'warning' as const, text: t('warning') }
      case 'error':
        return { tone: 'error' as const, text: t('error') }
      default:
        return { tone: 'info' as const, text: '' }
    }
  }, [captcha.state, t])

  const onActivate = useCallback(
    (_e: MouseEvent | KeyboardEvent) => {
      if (isBusy) return
      if (checked) return
      void captcha.start()
    },
    [isBusy, checked, captcha],
  )

  const onCheckboxKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        onActivate(e)
      }
    },
    [onActivate],
  )

  const retry = useCallback(() => {
    captcha.reset()
    honeypot.reset()
    signals.reset()
  }, [captcha, honeypot, signals])

  return (
    <div
      className={`nxwCaptcha ${styles.nxwCaptcha} ${props.className ?? ''}`.trim()}
      data-theme={props.theme ?? ctx?.theme ?? 'auto'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-state={captcha.state}
      style={STYLE}
    >
      <div className={styles.nxwRow} data-busy={isBusy ? 'true' : 'false'}>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-busy={isBusy}
          aria-labelledby={`${id}-label`}
          disabled={!fingerprintReady || isBusy}
          className={styles.nxwCheckbox}
          data-checked={checked ? 'true' : 'false'}
          data-busy={isBusy ? 'true' : 'false'}
          onClick={onActivate}
          onKeyDown={onCheckboxKeyDown}
        >
          {isBusy ? (
            <span className={styles.nxwSpinner} aria-hidden="true" />
          ) : null}
        </button>
        <label
          id={`${id}-label`}
          className={styles.nxwLabel}
          onClick={(e) => {
            if (isBusy || checked) {
              e.preventDefault()
              return
            }
          }}
        >
          {checked ? t('success') : t('label')}
        </label>
        <span className={styles.nxwBrand}>
          <a
            className={styles.nxwBrandLink}
            href={BRAND_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {BRAND_NAME}
          </a>
          <span className={styles.nxwBrandSep} aria-hidden="true">
            ·
          </span>
          <a
            className={styles.nxwPrivacyLink}
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('privacy')}
          </a>
        </span>
      </div>

      <div
        className={styles.nxwStatus}
        data-tone={status.tone}
        role="status"
        aria-live="polite"
      >
        {status.text}
        {captcha.state === 'blocked' || captcha.state === 'error' ? (
          <>
            {' '}
            <button type="button" className={styles.nxwButtonRetry} onClick={retry}>
              {t('retry')}
            </button>
          </>
        ) : null}
      </div>

      {/* Honeypots: a11y-hidden, off-screen, in the tab order is wrong for
          a *honeypot*; we want bots to interact, real users to skip. */}
      <input
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className={`nxw-honeypot-field ${styles.nxwHoneypot}`}
        name="nxw_email_field"
        onChange={honeypot.handlers.onFieldInput}
      />
      <a
        href="#"
        tabIndex={-1}
        aria-hidden="true"
        className={`nxw-honeypot-link ${styles.nxwHoneypotLink}`}
        onClick={honeypot.handlers.onLinkClick}
      >
        .
      </a>
      <input
        type="checkbox"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className={`nxw-honeypot-checkbox ${styles.nxwHoneypot}`}
        name="nxw_agree"
        onChange={honeypot.handlers.onCheckboxChange}
      />
    </div>
  )
}
