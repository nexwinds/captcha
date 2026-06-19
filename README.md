# @nexwinds/captcha

A self-hosted, privacy-first, neutral-UX captcha widget for React and Next.js.

The widget talks to the **NexWinds captcha SaaS** (currently hosted inside
[Nexcookie](https://nexcookie.com)) via a **local proxy** in your application. 
This ensures zero third-party cookies, no CORS issues, and a cleaner network profile.

> **No reCAPTCHA. No hCaptcha. No Turnstile. No cookies set by this library.**

---

## What you get

- A drop-in `<Captcha />` component with a "I am human" checkbox.
- CORS-free integration: browser only talks to your own domain.
- 5-field behavioral signals (dwell, click-hold, mouse, keyboard, honeypot).
- Web Crypto SHA-256 proof-of-work (chunked, never blocks the main thread).
- Honeypots: hidden field, hidden link, hidden checkbox — all `aria-hidden` and `tabindex={-1}`.
- WCAG 2.2 AA: `role="status"`, `aria-live="polite"`, full keyboard support.

---

## Install

```bash
npm install @nexwinds/captcha
```

---

## Setup

### 1. The Proxy (Required)

To avoid CORS issues and keep user data on your origin, you MUST mount a proxy.

#### Option A: Next.js Rewrites (Zero-Code / Recommended)

This is the most reliable and efficient way for Next.js. It's handled at the infrastructure level, meaning no code to maintain and zero 405/CORS errors.

```ts
// next.config.ts or next.config.js
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/captcha/:path*',
        destination: 'https://nexcookie.com/api/v1/:path*',
      },
    ]
  },
}
```

#### Option B: Route Handlers (Custom Logic)

Use this if you need to transform the request (e.g., adding internal headers) or if you are not using Next.js (e.g., Cloudflare Workers).

```ts
// app/api/captcha/[...path]/route.ts
import { handleCaptchaProxyRequest } from '@nexwinds/captcha/server'

export const GET = (req: Request) => handleCaptchaProxyRequest(req)
export const POST = (req: Request) => handleCaptchaProxyRequest(req)
export const OPTIONS = (req: Request) => handleCaptchaProxyRequest(req)
```

### Troubleshooting 405 Errors

If you receive `405 Method Not Allowed` on `POST` requests and **no server logs** appear (even with `debug: true`):

1. **Explicit Exports**: Ensure you are using `export const POST = proxy` (or `export async function POST...`) in your `route.ts`.
2. **Middleware**: Check if you have a `middleware.ts` that might be intercepting `POST` requests or consuming the request body before it reaches the route.
3. **Turbopack Cache**: If using Next.js 15+, try restarting your dev server with `npm run dev -- --clean` or deleting the `.next` folder to clear the Turbopack cache.
4. **Trailing Slashes**: Ensure your widget's `endpoint` configuration matches the proxy mount exactly (avoid mixing `/api/captcha` with `/api/captcha/`).

### 2. The Provider

Wrap your app with the provider. It defaults to the `/api/captcha` endpoint.

```tsx
import { CaptchaProvider } from '@nexwinds/captcha'

export default function Layout({ children }) {
  return (
    <CaptchaProvider siteKey={process.env.NEXT_PUBLIC_NEXWINDS_SITE_KEY!}>
      {children}
    </CaptchaProvider>
  )
}
```

### 3. Usage

```tsx
'use client'

import { useState } from 'react'
import { Captcha } from '@nexwinds/captcha'

export default function Form() {
  const [token, setToken] = useState<string | null>(null)

  return (
    <form action="/api/submit" method="POST">
      <Captcha onSuccess={(token) => setToken(token)} />
      <input type="hidden" name="captcha_token" value={token ?? ''} />
      <button type="submit" disabled={!token}>Send</button>
    </form>
  )
}
```

### 4. Server-side Verification

```ts
// app/api/submit/route.ts
import { createServerClient } from '@nexwinds/captcha/server'
import { headers } from 'next/headers'

const nxw = createServerClient({
  secretKey: process.env.NEXWINDS_SECRET_KEY!,
})

export async function POST(req: Request) {
  const { token } = await req.json()
  const ip = (await headers()).get('x-forwarded-for') ?? undefined

  const result = await nxw.verifyToken(token, { ip })
  if (!result.ok) return Response.json({ error: result.reason }, { status: 403 })

  return Response.json({ ok: true })
}
```

#### Locking the proxy to your origins (production)

The default `allowedOrigins: '*'` is convenient for development. It
echoes the incoming `Origin` header (to support `credentials: 'include'`)
instead of returning a wildcard `*`. In production, restrict to the
origins you actually serve:

```ts
import { createCaptchaProxy } from '@nexwinds/captcha/server'

const proxy = createCaptchaProxy({
  allowedOrigins: ['https://your-app.com', 'https://www.your-app.com'],
})
export const POST = proxy
export const GET = proxy
export const OPTIONS = proxy
```

Origins outside the list get `403`-equivalent preflight responses (no
`Access-Control-Allow-Origin` set, so the browser blocks the call).
The proxy always includes `Access-Control-Allow-Credentials: true`.

#### Troubleshooting the proxy

| Symptom | Likely cause |
|---------|-------------|
| `405 Method Not Allowed` on `POST /api/captcha/challenge/issue` | Route matches but `POST` isn't exported. Restart `next dev` after creating the file, or check you have all three exports: `GET`, `POST`, `OPTIONS`. |
| `404 Not Found` on `/api/captcha/*` | The catch-all isn't at `app/api/captcha/[...path]/route.ts`. With App Router, you need the literal folder `[...path]` (with the three dots and square brackets), not just `route.ts` at `app/api/captcha/`. |
| `CORS error: ... No 'Access-Control-Allow-Origin' header` from the proxy itself | You're hitting the proxy from a different origin than your app. Either set `allowedOrigins` to include it, or set `allowedOrigins: '*'` in dev. |
| Proxy returns 502 with `Bad Gateway` | The upstream (`nexcookie.com` by default) is unreachable or returned a network error. Check the response body for details. |

Quick diagnostic — verify each method is exported and reaches the SaaS:

```bash
curl -i https://your-app.com/api/captcha/calibration
# expect: 200, JSON calibration table

curl -i -X OPTIONS https://your-app.com/api/captcha/challenge/issue \
  -H "Origin: https://your-app.com" \
  -H "Access-Control-Request-Method: POST"
# expect: 204, Access-Control-Allow-Origin: *, Access-Control-Allow-Methods: ..., POST

curl -i -X POST https://your-app.com/api/captcha/challenge/issue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_xxx" \
  -d '{"fingerprintHash":"fp"}'
# expect: 200, JSON {challengeId, nonce, bits}
```

If any of those return 405/404 instead of the expected status, the
proxy route isn't set up correctly.

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

## Deployment: CORS, CSP, and environment variables

### CORS

The widget calls the SaaS directly from the browser. If your app and the
SaaS live on different origins, the SaaS must respond with CORS headers
on every `/api/v1/*` endpoint:

```http
Access-Control-Allow-Origin: https://your-app.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
Vary: Origin
```

`Authorization` and `Content-Type: application/json` require an explicit
origin — `*` is rejected by browsers. Echo `Origin` from an allow-list;
do not reflect arbitrary values. `OPTIONS` preflight must return
`204 No Content` with the same headers.

If the SaaS isn't CORS-enabled yet, point the widget at a same-origin
proxy in your app (or any path that
forwards to the SaaS). The SDK has no other way around CORS — it's a
browser-enforced boundary.

### CSP

Minimum directives for a hosted deployment:

```http
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://nexcookie.com https://api.nexwinds.com;
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  frame-ancestors 'none';
  base-uri 'self';
```

- `connect-src` must include the SaaS origin (or your proxy origin). If
  you ship the one-line proxy above, `'self'` is sufficient — the
  widget never makes a cross-origin request.
- `style-src 'unsafe-inline'` is required because the widget sets inline
  `style` attributes for the spinner transform.
- `script-src 'self'` — the widget ships no inline scripts; it loads as
  an ES module from your bundle.
- `frame-ancestors 'none'` — the widget must never be iframed by
  third parties; serve it top-level only.

### Environment variables

| Variable                              | Scope        | Required | Notes                                         |
|---------------------------------------|--------------|----------|-----------------------------------------------|
| `NEXT_PUBLIC_NEXWINDS_PUBLISHABLE_KEY` | client       | yes      | `pk_live_<hex>` from the dashboard.           |
| `NEXWINDS_SECRET_KEY`                  | server only  | yes      | `sk_live_<hex>`. Used by `createServerClient`. |

The `NEXT_PUBLIC_` prefix is a Next.js convention that inlines a variable
into client bundles; the secret key must **not** have that prefix so it
gets tree-shaken from the browser bundle. The widget itself never sees
the secret key, and the server client never sees the publishable key
beyond what it forwards in the `Authorization` header.

---

## Customization

```tsx
<Captcha
  publishableKey="pk_live_…"
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

### Brand & privacy link

The widget renders a small footer with two outbound links:

- `NEXWINDS` → https://nexwinds.com
- Privacy (i18n'd) → https://nexwinds.com/legal/privacy-policy

Both open in a new tab with `rel="noopener noreferrer"`. The brand text
and URLs are constants exported from `@nexwinds/captcha` as `BRAND_NAME`,
`BRAND_URL`, and `PRIVACY_URL`; they are not currently overridable per
widget. The privacy link text is localized via the `privacy` key in
`src/locales/*.json`.

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
