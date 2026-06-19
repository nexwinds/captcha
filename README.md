# @nexwinds/captcha

A self-hosted, privacy-first, neutral-UX captcha widget for React and Next.js.

The widget talks to the **NexWinds captcha SaaS** (currently hosted inside
[Nexcookie](https://nexcookie.com)) and exposes a single-click "I am human"
flow with no third-party services, no analytics, no cookies, and no
fingerprinting beyond a stable, user-resettable hash.

> **No reCAPTCHA. No hCaptcha. No Turnstile. No cookies set by this library.**

---

## What you get

- A drop-in `<Captcha />` component with a "I am human" checkbox.
- 5-field behavioral signals (dwell, click-hold, mouse, keyboard, honeypot) sent to the SaaS.
- Web Crypto SHA-256 proof-of-work (chunked, never blocks the main thread).
- Honeypots: hidden field, hidden link, hidden checkbox — all `aria-hidden` and `tabindex={-1}`.
- Hourly-stable fingerprint hash stored in `localStorage` (resettable by the user).
- Locale fallback chain: `requested → en`. 8 locales shipped: `en, pt, es, fr, de, ja, zh, ar`.
- `prefers-reduced-motion` respected; the spinner is replaced by a static dot.
- WCAG 2.2 AA: `role="status"`, `aria-live="polite"`, full keyboard support, visible focus ring.
- Server helper `@nexwinds/captcha/server` for the consumer's Next.js route handlers.

---

## Install

```bash
pnpm add @nexwinds/captcha
# or
npm install @nexwinds/captcha
```

React 18+ and Next.js 13+ (App Router) are supported as peer dependencies.

---

## Usage

```tsx
'use client'

import { Captcha } from '@nexwinds/captcha'
import type { VerifyOutcome } from '@nexwinds/captcha'

export default function Form() {
  return (
    <form action="/api/submit" method="POST">
      {/* ... your fields ... */}
      <Captcha
        publishableKey={process.env.NEXT_PUBLIC_NEXWINDS_PUBLISHABLE_KEY!}
        onVerify={(outcome: VerifyOutcome) => {
          if (outcome.status === 'success' || outcome.status === 'bypass') {
            // hand `outcome.token` to the form submission
          } else if (outcome.status === 'blocked') {
            // show a polite retry
          } else {
            // network or unknown error
          }
        }}
      />
      <button type="submit">Send</button>
    </form>
  )
}
```

### Provider (optional)

```tsx
import { CaptchaProvider, Captcha } from '@nexwinds/captcha'

export default function Page() {
  return (
    <CaptchaProvider
      publishableKey={process.env.NEXT_PUBLIC_NEXWINDS_PUBLISHABLE_KEY!}
      locale="pt"
      theme="auto"
    >
      <Captcha onVerify={(o) => console.log(o)} />
    </CaptchaProvider>
  )
}
```

### Server-side token verification

In your Next.js route handler, after the user submits the form:

```ts
// app/api/submit/route.ts
import { createServerClient } from '@nexwinds/captcha/server'
import { headers } from 'next/headers'

const nxw = createServerClient({
  secretKey: process.env.NEXWINDS_SECRET_KEY!,
  endpoint: process.env.NEXWINDS_ENDPOINT, // optional override
})

export async function POST(req: Request) {
  const { token, ...rest } = await req.json()
  const ip = (await headers()).get('x-forwarded-for') ?? undefined

  const result = await nxw.verifyToken(token, { ip })
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 403 })
  }

  // proceed with the rest of the request...
  return Response.json({ ok: true })
}
```

The server helper is a thin HTTPS client — **no local HMAC verification**.
The SaaS is the only entity that can verify a token; the secret key is
never sent to the widget.

---

## What the SaaS does (hosted in Nexcookie)

Five endpoints, all under `/api/v1`:

| Method | Path                              | Auth         |
|--------|-----------------------------------|--------------|
| GET    | `/calibration`                    | none         |
| POST   | `/challenge/issue`                | `pk_live_…`  |
| POST   | `/challenge/verify`               | `pk_live_…`  |
| POST   | `/token/verify`                   | `sk_live_…`  |
| GET    | `/.well-known/nexwinds.json`      | none         |

Full spec: [`contracts/openapi.yaml`](./contracts/openapi.yaml).

Behavioral signals (v1, exactly 5 fields):

```ts
{
  v: 1,
  dwellMs: 1234,
  timeToClickMs: 87,
  mouseMovements: 12,
  keyboardInteractions: 0,
  isBot: false
}
```

Rate limit: 10 hits per 20 min per `${ip}:${fingerprintHash}` bucket. **No
`X-RateLimit-*` and no `Retry-After` headers** — the widget backs off
locally on 429.

Failure mode: `failOpen` is behavior-locked to `true` server-side. On
internal error, the SaaS returns `200 {status:"success", failOpen:true}`
and the widget treats it as a soft-OK.

---

## Customization

```tsx
<Captcha
  publishableKey="pk_live_…"
  endpoint="https://captcha.acme.com/api/v1"   // self-host friendly override
  locale="ja"                                 // 'en' | 'pt' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'ar'
  theme="dark"                                // 'auto' | 'light' | 'dark'
  size="compact"                              // 'compact' | 'normal'
  className="my-form__captcha"
  onVerify={(o) => { /* ... */ }}
  onError={(e) => { /* ... */ }}
/>
```

CSS variables are exposed for theming. Override on a parent:

```css
.my-form {
  --nxw-fg: #111;
  --nxw-bg: #fff;
  --nxw-accent: #6d28d9;
  --nxw-warning: #b45309;
  --nxw-success: #047857;
  --nxw-radius: 8px;
}
```

---

## Development

```bash
pnpm install
pnpm test           # vitest
pnpm typecheck      # tsc --noEmit
pnpm build          # tsup
pnpm storybook      # dev server on :6006
pnpm build-storybook
```

The build emits:

- `dist/index.js` + `dist/index.d.ts` — public client API.
- `dist/server.js` + `dist/server.d.ts` — public server API.
- `dist/components/Captcha.css` — the resolved CSS module.
- `contracts/openapi.yaml` — the frozen wire contract (re-published).

---

## Security model

- **No third-party code runs in the widget.** Only the bundle we ship.
- **No cookies are set.** Only `localStorage` is touched, and only for
  the stable, user-resettable fingerprint hash.
- **No telemetry.** Nothing is sent anywhere except the 4 documented
  HTTPS calls to the SaaS.
- **PoW is mandatory** for non-bypass requests; the SaaS rejects
  challenges that do not match `sha256(concat(payload, hexDecode(hash)))`.
- **HMAC tokens** are server-minted and server-verified; the consumer's
  server never sees the SaaS signing key, and the widget never sees the
  consumer's secret key.
- **Bulk revocation**: a domain can revoke all outstanding tokens by
  writing `nxw:cap:revocation:<domainId> = <ts>`. The SaaS rejects any
  token whose `iat < revokedAt` (strict less-than).

See [`OPENAPI_ALIGNMENT_RESOLVED.md`](./OPENAPI_ALIGNMENT_RESOLVED.md) for
the cross-document history that produced this contract.

---

## License

[Apache-2.0](./LICENSE) — © 2026 NexWinds.
