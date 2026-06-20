# @nexcaptcha/captcha

A privacy-first, neutral-UX captcha widget for React and Next.js.

The widget talks directly to the **NEXCAPTCHA SaaS** (hosted inside
[Nexcookie](https://nexcookie.com)).

> **No reCAPTCHA. No hCaptcha. No Turnstile. No cookies set by this library.**

---

## What you get

- A drop-in `<Captcha />` component with a "I am human" checkbox.
- Behavioral signals (dwell, click-hold, mouse, keyboard, honeypot).
- Web Crypto SHA-256 proof-of-work (chunked, never blocks the main thread).
- WCAG 2.2 AA: `role="status"`, `aria-live="polite"`, full keyboard support.

---

## Install

```bash
npm install @nexcaptcha/captcha
```

---

## Setup

### 1. Configure "Allowed Origins"

Since the widget talks directly to the SaaS, you MUST add your domain to the "Allowed Origins" list in your **NEXCAPTCHA dashboard** (inside [nexcookie.com](https://nexcookie.com)).

Failure to do so will result in **CORS errors**.

### 2. The Provider

Wrap your app with the provider and provide your `siteKey`.

```tsx
import { CaptchaProvider } from '@nexcaptcha/captcha'

export default function Layout({ children }) {
  return (
    <CaptchaProvider siteKey={process.env.NEXT_PUBLIC_NEXCAPTCHA_SITE_KEY!}>
      {children}
    </CaptchaProvider>
  )
}
```

### 3. Usage

```tsx
'use client'

import { useState } from 'react'
import { Captcha } from '@nexcaptcha/captcha'

export default function Form() {
  const [token, setToken] = useState<string | null>(null)

  return (
    <form action="/api/submit" method="POST">
      <Captcha siteKey={process.env.NEXT_PUBLIC_NEXCAPTCHA_SITE_KEY!} onSuccess={(token) => setToken(token)} />
      <input type="hidden" name="captcha_token" value={token ?? ''} />
      <button type="submit" disabled={!token}>Send</button>
    </form>
  )
}
```

### 4. Server-side Verification

```ts
// app/api/submit/route.ts
import { createServerClient } from '@nexcaptcha/captcha/server'
import { headers } from 'next/headers'

const nxc = createServerClient({
  secretKey: process.env.NEXCAPTCHA_SECRET_KEY!,
})

export async function POST(req: Request) {
  const { token } = await req.json()
  const ip = (await headers()).get('x-forwarded-for') ?? undefined

  const result = await nxc.verifyToken(token, { ip })
  if (!result.ok) return Response.json({ error: result.reason }, { status: 403 })

  return Response.json({ ok: true })
}
```

---

## Environment variables

| Variable                           | Scope        | Required | Notes                                         |
|------------------------------------|--------------|----------|-----------------------------------------------|
| `NEXT_PUBLIC_NEXCAPTCHA_SITE_KEY`  | client       | yes      | `pk_live_<hex>` from the dashboard.           |
| `NEXCAPTCHA_SECRET_KEY`            | server only  | yes      | `sk_live_<hex>`. Used by `createServerClient`. |

The `NEXT_PUBLIC_` prefix is a Next.js convention that inlines a variable into client bundles. The secret key must **not** have that prefix so it remains secure on the server.

---

## Configuration

### Props

| Prop        | Type                                      | Description                                                                 |
|-------------|-------------------------------------------|-----------------------------------------------------------------------------|
| `siteKey`   | `string`                                  | **Required**. Your public site key from the dashboard.                      |
| `locale`    | `'en' \| 'pt' \| 'es' \| 'fr' \| 'de' \| 'ja' \| 'zh' \| 'ar'` | UI language. If omitted, detects automatically via `navigator.language`. |
| `theme`     | `'auto' \| 'light' \| 'dark'`             | Visual theme. `'auto'` follows the user's system dark mode preference.      |
| `onSuccess` | `(token: string) => void`                 | Called when the captcha is successfully solved.                             |
| `onError`   | `(err: { message: string }) => void`      | Called on network or unexpected errors.                                     |

### Locale (Auto Detection)

By default, the widget automatically detects the user's language using `navigator.language`. If the detected language is not supported, it falls back to English (`en`). You can force a specific language by passing the `locale` prop.

### Theme (Auto Mode)

The `theme` prop defaults to `'auto'`, which automatically switches between light and dark modes based on the user's system settings (`prefers-color-scheme`). You can also force `'light'` or `'dark'` mode.

---

## Development

```bash
pnpm install
pnpm test           # vitest
pnpm typecheck      # tsc --noEmit
pnpm build          # tsup
pnpm storybook      # dev server on :6006
```
