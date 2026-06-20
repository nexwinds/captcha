# NEXCAPTCHA (`@nexwinds/captcha`)

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
npm install @nexwinds/captcha
```

---

## Setup

### 1. Configure "Allowed Origins"

Since the widget talks directly to the SaaS, you MUST add your domain to the "Allowed Origins" list in your **NEXCAPTCHA dashboard** (inside [nexcookie.com](https://nexcookie.com)).

Failure to do so will result in **CORS errors**.

### 2. Usage

```tsx
'use client'

import { useState } from 'react'
import { Captcha } from '@nexwinds/captcha'

export default function Form() {
  const [token, setToken] = useState<string | null>(null)

  return (
    <form action="/api/submit" method="POST">
      <Captcha
        siteKey={process.env.NEXT_PUBLIC_NEXCAPTCHA_SITE_KEY!}
        onSuccess={(token) => setToken(token)}
      />
      <input type="hidden" name="captcha_token" value={token ?? ''} />
      <button type="submit" disabled={!token}>
        Send
      </button>
    </form>
  )
}
```

---

## Optional: Global Configuration

If you have multiple forms and want to share a `siteKey`, `locale`, or `theme` globally, you can use the `CaptchaProvider`.

```tsx
// app/layout.tsx
import { CaptchaProvider } from '@nexwinds/captcha'

export default function Layout({ children }) {
  return (
    <CaptchaProvider siteKey={process.env.NEXT_PUBLIC_NEXCAPTCHA_SITE_KEY!}>
      {children}
    </CaptchaProvider>
  )
}
```

When using the provider, you can omit those props on individual `<Captcha />` components.

---

### 3. Server-side Verification

```ts
// app/api/submit/route.ts
import { createServerClient } from '@nexwinds/captcha/server'
import { headers } from 'next/headers'

const nxc = createServerClient({
  secretKey: process.env.NEXCAPTCHA_SECRET_KEY!,
})

export async function POST(req: Request) {
  const { token } = await req.json()

  // Extract user IP (Next.js 15+ example)
  const ip = (await headers()).get('x-forwarded-for') ?? undefined

  const result = await nxc.verifyToken(token, { ip })
  if (!result.ok) return Response.json({ error: result.reason }, { status: 403 })

  return Response.json({ ok: true })
}
```

---

## Environment variables

| Variable                          | Scope       | Required | Notes                                          |
| --------------------------------- | ----------- | -------- | ---------------------------------------------- |
| `NEXT_PUBLIC_NEXCAPTCHA_SITE_KEY` | client      | yes      | `pk_live_<hex>` from the dashboard.            |
| `NEXCAPTCHA_SECRET_KEY`           | server only | yes      | `sk_live_<hex>`. Used by `createServerClient`. |

---

## CSP Requirements

If your application uses a **Content Security Policy (CSP)**, you must allow the following origins:

```http
Content-Security-Policy:
  connect-src 'self' https://nexcookie.com;
  style-src 'self' 'unsafe-inline';
```

- `connect-src`: The widget talks to `https://nexcookie.com/api/v1` to issue and verify challenges.
- `style-src 'unsafe-inline'`: Required for the inline spinner transform and dynamic theme colors.
- **Note**: The widget does _not_ use iframes or external scripts.

---

## Configuration

### Props

| Prop        | Type                                                                   | Description                                                            |
| ----------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `siteKey`   | `string`                                                               | **Required**. Your public site key from the dashboard.                 |
| `locale`    | `'en' \| 'pt' \| 'es' \| 'fr' \| 'de' \| 'ja' \| 'zh' \| 'ar' \| 'nl'` | UI language. If omitted, detects automatically. Fallback is `'en'`.    |
| `theme`     | `'auto' \| 'light' \| 'dark'`                                          | Visual theme. `'auto'` follows the user's system dark mode preference. |
| `onSuccess` | `(token: string) => void`                                              | Called when the captcha is successfully solved.                        |
| `onError`   | `(err: { message: string }) => void`                                   | Called on network or unexpected errors.                                |

### Locale & Types

The `Locale` type is exported from the main package for use in your TypeScript projects:

```ts
import type { Locale } from '@nexwinds/captcha'

const myLocale: Locale = 'pt'
```

Supported locales: `'en' | 'pt' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'ar' | 'nl'`.

By default, the widget automatically detects the user's language using `navigator.language`. If an unsupported locale is provided (e.g., via props), it gracefully falls back to English (`en`).

---

## Development

```bash
pnpm install
pnpm test           # vitest
pnpm typecheck      # tsc --noEmit
pnpm build          # tsup
pnpm storybook      # dev server on :6006
```
