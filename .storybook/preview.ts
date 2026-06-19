import type { Preview } from '@storybook/react'
import '../src/components/Captcha.module.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#111827' },
        { name: 'paper', value: '#f3f4f6' },
      ],
    },
    layout: 'centered',
    controls: { expanded: true },
  },
}

export default preview
