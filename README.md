# Promo Buddy

Web frontend for Promo Buddy.

## Environment

Required frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_URL`

The app calls the Supabase Edge Function at `/functions/v1/vas-api`, so production also depends on:

- Supabase project being live
- `vas-api` function deployed
- required Supabase server secrets configured for that function
- database migration applied

Required Supabase function secrets:

- `ORDER_MANAGEMENT_API_KEY`

Optional Supabase function secrets:

- `ORDER_MANAGEMENT_API_URL`

The user UUID is entered manually in the runner screens for now.

Promo Buddy login access is controlled by `public.promo_buddy_allowed_users`.
Add one row per allowed user with:

- `email`
- `enabled = true`

## Local run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Hosting

Recommended:

- Vercel
- Netlify

This repo includes SPA rewrite config for both:

- [vercel.json](/tmp/promo-buddy-web-check/vercel.json)
- [netlify.toml](/tmp/promo-buddy-web-check/netlify.toml)

GitHub Pages is not the best fit because this app uses client-side routing and runtime environment variables.

## IP allowlist

Production access is restricted at the hosting edge to this IP:

- `52.212.235.52/32`
- `18.200.137.205/32`
- `54.77.44.130/32`
- `3.254.33.109/32`

Blocked visitors receive an `Access Denied` page before the React app loads.
