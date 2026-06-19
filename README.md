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

### One-line browser→SaaS proxy (recommended for Next.js / Workers)

The widget calls the SaaS over HTTPS. If your app's origin differs from
the SaaS origin, the browser enforces CORS. Ship this single route
handler so the browser talks only to your own origin:

```ts
// app/api/captcha/[...path]/route.ts
import { createCaptchaProxy } from '@nexwinds/captcha/server'

// Explicit re-export — Next.js / SWC reliably emit three named exports
// this way. `export const { GET, POST, OPTIONS } = …` also works, but
// some bundler configs collapse it into a single binding and you get
// 405 Method Not Allowed on POST.
const proxy = createCaptchaProxy()
export const GET = proxy.GET
export const POST = proxy.POST
export const OPTIONS = proxy.OPTIONS
```

That's the entire integration. The widget talks to `/api/captcha/*`
(same-origin, no CORS, no CSP tweak for `nexcookie.com`); the proxy
forwards to the SaaS server-to-server.

If you got a 405 on `POST /api/captcha/challenge/issue`, the route is
matching but the POST handler isn't being exported. Restart the dev
server after creating the file, or compare your file against the
template above.

```tsx
<Captcha publishableKey={...} onVerify={...} />
```

Or, if you'd rather not set `publishableKey` per-widget, set it once at the
provider level:

```tsx
<CaptchaProvider publishableKey={...}>
  <Captcha onVerify={...} />
</CaptchaProvider>
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
export const GET = proxy.GET
export const POST = proxy.POST
export const OPTIONS = proxy.OPTIONS
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
