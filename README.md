# Ahmad Mart

Hyperlocal grocery & food delivery platform for Ambur — customers order from local stores, delivery partners bring it to their door. Live at [www.ahmadmart.in](https://www.ahmadmart.in), with an Android app that wraps the same site.

## What's inside

One codebase, four roles

- **Customers** — browse stores and categories, search, cart, checkout (COD / Ahmad Credit), live order tracking, ratings.
- **Vendors** — manage their menu/products, subcategories, view orders and payment settlements.
- **Delivery partners** — see available orders, accept, pick up, deliver with OTP confirmation, cash management.
- **Admin** — full control panel: orders, products & pricing, vendors, delivery partners, customers, credit, banners, service areas, delivery fees, time slots, reviews, notifications, audit log.

## Stack

- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui, React Query, React Router
- **Backend:** Supabase (Postgres + RLS, Auth, Storage, Edge Functions)
- **Auth:** phone OTP (SMS via Nimbus, custom edge functions) and Google sign-in
- **Maps:** Google Maps + Places for address selection and serviceability checks
- **Hosting:** Vercel — every push to `main` auto-deploys production
- **Android:** Capacitor shell (`android/`) that loads the live site, with native Google sign-in, geolocation and back-button handling

## Local development

```bash
npm install
npm run dev
```

Create a `.env` with:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GOOGLE_MAPS_API_KEY=...
```

The same variables must exist in the Vercel project settings for production builds.

## Database

Migrations live in `supabase/migrations/` and edge functions in `supabase/functions/` (send-otp, verify-otp, send-push). Apply with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy
```

Secrets needed by the edge functions (SMS credentials, VAPID keys) are set in the Supabase dashboard, not in this repo.

## Android build

```bash
npm run build
npx cap sync android
cd android && ./gradlew bundleRelease   # AAB for Play Store
cd android && ./gradlew assembleRelease # APK for direct install
```

Release signing reads `android/keystore/keystore.properties` — the keystore is deliberately **not** committed. Keep it and its password safely backed up; Play Store updates are impossible without it.

Because the app loads the live site, day-to-day fixes ship by pushing to `main` — no Play Store re-release needed. Rebuild the app only for native changes (permissions, plugins, splash).

## Deploying

Push to `main`. Vercel builds and promotes automatically; a failed build never replaces the live deployment.
