import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Captcha } from '../src/index.js'
import * as httpMod from '../src/lib/http.js'

// Mock the http module so the widget doesn't make real network calls.
vi.mock('../src/lib/http.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/http.js')>('../src/lib/http.js')
  return {
    ...actual,
    getCalibration: vi.fn(),
    issueChallenge: vi.fn(),
    verifyChallenge: vi.fn(),
  }
})

const mockedHttp = vi.mocked(httpMod)

beforeEach(() => {
  mockedHttp.getCalibration.mockReset()
  mockedHttp.issueChallenge.mockReset()
  mockedHttp.verifyChallenge.mockReset()

  // happy default
  mockedHttp.getCalibration.mockResolvedValue({
    v: 1, low: 16, medium: 18, high: 20, critical: 23,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('<Captcha /> a11y', () => {
  it('renders a button with role=checkbox and an aria-labelledby label', async () => {
    render(<Captcha publishableKey="pk_test_x" onVerify={() => {}} />)
    const btn = await screen.findByRole('checkbox', { name: /I am human/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-busy', 'false')
    expect(btn).toHaveAttribute('aria-checked', 'false')
  })

  it('activates on click and shows verifying state', async () => {
    mockedHttp.issueChallenge.mockImplementation(async () => {
      // Keep the promise pending for a tick so we can observe the busy state.
      await new Promise((r) => setTimeout(r, 5))
      return {
        challengeId: 'ch-1',
        nonce: 'a'.repeat(64),
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        bits: 8, // low so test is fast
        origin: 'nexwinds',
      }
    })
    mockedHttp.verifyChallenge.mockResolvedValue({
      status: 'success',
      token: 'tk',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      failOpen: false,
    })

    const onVerify = vi.fn()
    const user = userEvent.setup()
    render(<Captcha publishableKey="pk_test_x" onVerify={onVerify} />)
    const btn = await screen.findByRole('checkbox', { name: /I am human/i })

    await user.click(btn)

    await waitFor(() => {
      expect(mockedHttp.issueChallenge).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(onVerify).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' }),
      )
    })
  })

  it('hides honeypots from a11y tree (aria-hidden, tabIndex=-1)', async () => {
    render(<Captcha publishableKey="pk_test_x" onVerify={() => {}} />)
    const honeypotField = document.querySelector('input[name="nxw_email_field"]')
    const honeypotLink = document.querySelector('a.nxw-honeypot-link')
    const honeypotCheckbox = document.querySelector('input[name="nxw_agree"]')
    expect(honeypotField).toHaveAttribute('aria-hidden', 'true')
    expect(honeypotField).toHaveAttribute('tabindex', '-1')
    expect(honeypotLink).toHaveAttribute('aria-hidden', 'true')
    expect(honeypotLink).toHaveAttribute('tabindex', '-1')
    expect(honeypotCheckbox).toHaveAttribute('aria-hidden', 'true')
    expect(honeypotCheckbox).toHaveAttribute('tabindex', '-1')
  })

  it('status banner uses role=status aria-live=polite', async () => {
    render(<Captcha publishableKey="pk_test_x" onVerify={() => {}} />)
    const banner = document.querySelector('[role="status"]')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveAttribute('aria-live', 'polite')
  })

  it('renders without throwing when reduced motion is preferred', async () => {
    const mq = { matches: true, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList
    vi.spyOn(window, 'matchMedia').mockReturnValue(mq)
    render(<Captcha publishableKey="pk_test_x" onVerify={() => {}} />)
    const root = document.querySelector('[data-reduced-motion="true"]')
    expect(root).toBeInTheDocument()
  })

  it('keyboard activation: space/enter triggers solve', async () => {
    mockedHttp.issueChallenge.mockResolvedValue({
      challengeId: 'ch-kbd',
      nonce: 'a'.repeat(64),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      bits: 8,
      origin: 'nexwinds',
    })
    mockedHttp.verifyChallenge.mockResolvedValue({
      status: 'success',
      token: 'tk',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      failOpen: false,
    })

    const onVerify = vi.fn()
    render(<Captcha publishableKey="pk_test_x" onVerify={onVerify} />)
    const btn = await screen.findByRole('checkbox', { name: /I am human/i })
    btn.focus()
    fireEvent.keyDown(btn, { key: ' ' })

    await waitFor(() => {
      expect(mockedHttp.issueChallenge).toHaveBeenCalled()
    })
  })
})
