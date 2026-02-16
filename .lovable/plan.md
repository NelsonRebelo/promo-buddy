
# Bulk VAS Promotion Runner

## Overview
A web app that authenticates against an external OAuth API and runs bulk VAS promotion requests from a CSV file. The backend (Supabase Edge Functions) handles all secrets and tokens — nothing sensitive reaches the browser.

---

## Backend (Supabase Edge Functions + Database)

### Database: `sessions` table
- Stores session ID, access_token, base_url, token_acquired_at, token_expires_at
- Sessions identified by a random UUID sent to the browser as an httpOnly cookie
- Rows auto-expire; old sessions cleaned up

### Edge Function: `vas-api`
Handles all backend routes via path-based routing:

1. **POST /login** — Receives base_url, client_id, username, password. Adds CLIENT_SECRET from server env, calls upstream OAuth, stores token in DB, sets httpOnly session cookie. Returns `{ ok: true, token_expires_at }`.

2. **POST /vas/send** — Validates session cookie, checks token expiry, calls upstream promotion API with stored token. Returns success/failure per request.

3. **POST /logout** — Clears session from DB and cookie.

4. **GET /status** — Checks if session cookie is valid and token not expired. Returns `{ loggedIn, token_expires_at }`.

### Security
- CLIENT_SECRET stored as a Supabase secret (never in code)
- access_token stored only in DB, never returned to frontend
- httpOnly cookie prevents JavaScript access to session ID

---

## Frontend Pages

### Login Page (`/login`)
- Form fields: Base URL, Client ID, Username, Password (masked)
- On load: checks `/status` — if already logged in, redirects to `/runner`
- On submit: calls `/login` endpoint, navigates to `/runner` on success
- Shows clear error messages on failure

### Runner Page (`/runner`) — Protected Route
- Redirects to `/login` if not authenticated

**CSV Upload Section:**
- File input accepting `.csv` files
- Validates required headers: `advert`, `promotion`
- Validates no empty values in rows
- Shows preview table (first 20 rows) and total row count
- "Run VAS Requests" button appears only after valid upload

**Execution Section:**
- Processes rows with concurrency limit of 5 parallel requests
- Progress bar showing completed/total
- Live rolling log of recently processed rows (success/failure)
- Cancel button to stop remaining requests
- If 401 received: stops execution, shows "Session expired" message, redirects to login

**Results Summary:**
- Total processed, successful count, failed count
- Failures table with columns: advert, promotion, status, errorMessage
- Option to upload a new CSV and run again (resets previous results)

---

## Design
- Clean, minimal UI using existing shadcn/ui components
- Clear state transitions between upload → running → results
- Responsive layout
