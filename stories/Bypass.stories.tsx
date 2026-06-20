import type { Meta, StoryObj } from '@storybook/react'
import { Captcha } from '../src/index.js'
import type { VerifyOutcome } from '../src/index.js'

const meta = {
  title: 'Captcha/Bypass',
  component: Captcha,
  tags: ['autodocs'],
  args: {
    siteKey: 'pk_test_entitled',
    onVerify: ((o: VerifyOutcome) => {
      // eslint-disable-next-line no-console
      console.log('[story] verify (bypass demo)', o)
    }) as (o: VerifyOutcome) => void,
  },
} satisfies Meta<typeof Captcha>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Demo: an entitled user who would receive a `bypass` outcome.
 * The story itself doesn't actually call the SaaS, so the visual
 * is identical to the default — the difference is in the network
 * response shape, which the consumer's `onVerify` handler can log.
 */
export const Default: Story = {}
