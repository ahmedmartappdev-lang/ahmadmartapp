# Third-party APIs & SDKs — Ahmad Mart

This document lists every external service, API, and SDK that the Ahmad
Mart customer + vendor + admin app depends on at runtime. It exists for
the security / data-handling handover package.

_Last reviewed: 2026-06-23._

---

## 1. Backend platform

### Supabase
- **Purpose**: managed Postgres database, authentication, edge functions, file storage, realtime.
- **Region**: AWS Mumbai (`ap-south-1`).
- **Project ref**: `otksdfphbgneusgjvjzg`.
- **Domains served**: `https://otksdfphbgneusgjvjzg.supabase.co`.
- **Privacy policy**: https://supabase.com/privacy
- **DPA**: https://supabase.com/legal/dpa

### Vercel (hosting + CDN)
- **Purpose**: hosts the React frontend at `https://www.ahmadmart.in`.
- **Privacy policy**: https://vercel.com/legal/privacy-policy

---

## 2. Payment

### Razorpay
- **Purpose**: card / UPI / net-banking payment gateway. Razorpay's
  Standard Checkout SDK is loaded client-side; our server never touches
  card details — it only receives `razorpay_order_id`,
  `razorpay_payment_id` and the HMAC signature.
- **Where used**: `supabase/functions/create-razorpay-order/`,
  `verify-razorpay-payment/`, `razorpay-webhook/`, `pay-existing-order/`,
  `pay-credit-dues/`, and `src/lib/razorpay.ts` (client-side checkout).
- **Privacy policy**: https://razorpay.com/privacy/
- **PCI-DSS**: Razorpay is PCI-DSS Level 1 certified.

---

## 3. OTP / SMS

### Nimbus SMS
- **Purpose**: sends the 6-digit OTP customers use to log in.
- **Where used**: `supabase/functions/send-otp/`, `supabase/functions/verify-otp/`.
- **What we send**: the customer's 10-digit Indian mobile number + the
  OTP message body.
- **What we store**: hashed OTP code in `otp_codes` table; auto-purged.

---

## 4. Frontend libraries (`package.json` runtime dependencies)

| Package | Purpose | License |
|---|---|---|
| `react`, `react-dom`, `react-router-dom` | UI framework + client-side routing | MIT |
| `@supabase/supabase-js` | Supabase client SDK | MIT |
| `@tanstack/react-query` | Server-state cache | MIT |
| `@radix-ui/*` (20+ packages) | Headless primitives for shadcn/ui | MIT |
| `lucide-react` | Icon set | ISC |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Tailwind utilities | MIT |
| `framer-motion` | Animations | MIT |
| `react-hook-form`, `@hookform/resolvers`, `zod` | Form state + schema validation | MIT |
| `date-fns` | Date formatting / arithmetic | MIT |
| `cmdk` | Command-palette primitives | MIT |
| `input-otp` | OTP input field | MIT |
| `embla-carousel-react` | Banner carousel | MIT |
| `sonner` | Toast notifications | MIT |
| `jspdf`, `jspdf-autotable` | Client-side PDF generation (statements, invoices) | MIT |
| `html2canvas` | DOM → image (used by jsPDF) | MIT |
| `xlsx` | Excel parsing for admin Bulk Upload | Apache-2.0 |
| `dompurify` | XSS sanitisation for any user-rendered HTML | Apache-2.0 / MPL |
| `zustand` | Cart store | MIT |
| `next-themes` | Theme switching | MIT |

All licences are MIT, Apache-2.0, ISC or MPL — permissive, redistributable
without modification.

---

## 5. Build / dev tooling (not shipped to users)

`vite`, `@vitejs/plugin-react-swc`, `typescript`, `tailwindcss`, `eslint`,
`@types/*`, `autoprefixer`, `postcss`. None of these are part of the
runtime bundle — they only run on developers' machines and the build
server.

---

## 6. What we do NOT use

- No Google Analytics, no Facebook Pixel, no Hotjar, no Sentry, no
  Mixpanel, no Amplitude, no other behavioural tracking.
- No advertising SDKs.
- No location-services SDK on the customer side (delivery location is
  collected only via a manual address entry / map pin).
- No biometric SDK.
- No third-party login providers other than Google (via Supabase Auth's
  OAuth wrapper).

---

## 7. Data flow summary (one-line per dependency)

| Service | Data sent | Stored on their side? |
|---|---|---|
| Supabase | Everything customer + vendor + admin enters | Yes — we own this DB |
| Vercel | None directly — static assets only | No |
| Razorpay | Payment amount, customer name/email/phone (for receipts), order ID | Yes — for payment + chargeback handling |
| Nimbus SMS | Customer's phone + OTP body | Yes — per their retention policy |
| Google (OAuth, optional) | OAuth profile (email + name + photo) | Yes — per Google's privacy policy |
