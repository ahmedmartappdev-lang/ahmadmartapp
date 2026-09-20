# SSL / HTTPS confirmation — Ahmad Mart

This document confirms that every endpoint and asset served by Ahmad
Mart's customer, vendor and admin apps is HTTPS-only.

_Last reviewed: 2026-06-23._

---

## Endpoints

### `https://www.ahmadmart.in`
The customer-facing web app. Static React bundle, served by Vercel /
Vercel's CDN.

- **TLS provider**: Let's Encrypt, auto-rotated by Vercel ~30 days before
  expiry.
- **TLS version**: 1.2 and 1.3.
- **HTTP → HTTPS**: any plain-HTTP request is auto-redirected to HTTPS
  via the platform default (HSTS enabled).
- **HSTS**: `max-age=63072000; includeSubDomains; preload` (Vercel default).

### `https://otksdfphbgneusgjvjzg.supabase.co`
The Supabase project hosting the database, auth, edge functions, and
file storage.

- **TLS provider**: managed by Supabase (Amazon Trust Services / AWS).
- **TLS version**: 1.2 and 1.3.
- **HTTP**: not accepted — port 80 is closed; only 443/HTTPS responds.
- **PostgREST + REST + Edge Functions**: all served via the same HTTPS
  origin.
- **Realtime (WebSocket)**: served over WSS (`wss://`), the WebSocket
  equivalent of HTTPS.

### Razorpay (`https://api.razorpay.com`)
Outbound API calls from our edge functions and inbound webhook receipts.

- **TLS**: Razorpay-managed. All endpoints are HTTPS-only and require
  TLS 1.2+.
- **Webhook signature**: every incoming webhook is verified with HMAC-SHA256
  using a shared secret (`RAZORPAY_WEBHOOK_SECRET`); requests without a
  valid signature are dropped before any side effect runs.

### Nimbus SMS (OTP delivery)
- **TLS**: HTTPS-only API endpoint. Outbound only — no inbound webhook.

---

## In-app traffic

| Origin | Protocol | Notes |
|---|---|---|
| Customer → frontend | HTTPS | Vercel CDN |
| Frontend → Supabase REST / Auth | HTTPS | `supabase-js` client; no plain-HTTP fallback |
| Frontend → Razorpay Checkout | HTTPS | Razorpay-hosted iframe |
| Edge function → Razorpay API | HTTPS | server-to-server |
| Edge function → Nimbus SMS | HTTPS | server-to-server |

---

## Verification

Run from any terminal:

```sh
curl -sI https://www.ahmadmart.in           | grep -i 'strict-transport-security\|HTTP/'
curl -sI https://otksdfphbgneusgjvjzg.supabase.co | grep -i 'strict-transport-security\|HTTP/'
```

The first line should report `HTTP/2 200` and the
`strict-transport-security` header should be present on both.

---

## What's intentionally not present

- No HTTP-only fallback anywhere.
- No mixed-content (every image / script / font is served via HTTPS).
- No self-signed certs in the chain — all certs trace back to a
  publicly trusted root (Let's Encrypt for the frontend, Amazon Trust
  Services for Supabase).
