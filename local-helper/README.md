# Promo Buddy local helper

This helper runs on `http://127.0.0.1:43125` and opens a real browser window for the Offer Promotion login flow.

## Start

```bash
cd /Users/nelson.rebelo/Desktop/Playground/promo-buddy-deploy/local-helper
npm install
npm run start
```

## Use with the local app

Start the web app locally:

```bash
cd /Users/nelson.rebelo/Desktop/Playground/promo-buddy-deploy
npm run dev -- --host localhost --port 8080
```

Then open:

- `http://localhost:8080/offer-login`
- or the helper page directly: `http://127.0.0.1:43125/connect`

## Flow

1. Promo Buddy asks the helper to start a browser session.
2. The helper opens Standvirtual login in a real browser window.
3. After the user is authenticated, the helper captures the Standvirtual cookie header.
4. Promo Buddy imports that cookie header into the Supabase `offer_sessions` store.
