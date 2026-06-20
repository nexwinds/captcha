import type { Meta, StoryObj } from '@storybook/react'
import { Captcha } from '../src/index.js'
import type { VerifyOutcome } from '../src/index.js'

const meta = {
  title: 'Captcha/Default',
  component: Captcha,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    siteKey: 'pk_test_storybook',
    onVerify: ((o: VerifyOutcome) => {
      // eslint-disable-next-line no-console
      console.log('[story] verify', o)
    }) as (o: VerifyOutcome) => void,
  },
} satisfies Meta<typeof Captcha>

export default meta
type Story = StoryObj<typeof meta>

export const Light: Story = {
  args: { theme: 'light' },
}

export const Dark: Story = {
  args: { theme: 'dark' },
  parameters: { backgrounds: { default: 'dark' } },
}

export const Auto: Story = {
  args: { theme: 'auto' },
}

export const Portuguese: Story = {
  args: { theme: 'light', locale: 'pt' },
}

export const Japanese: Story = {
  args: { theme: 'light', locale: 'ja' },
}

export const Arabic: Story = {
  args: { theme: 'light', locale: 'ar' },
}
