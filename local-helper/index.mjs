import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 43125;
const STANDVIRTUAL_LOGIN_URL = "https://www.standvirtual.com/adminpanel/login/loginwithokta/";
const STANDVIRTUAL_STATS_URL = "https://www.standvirtual.com/adminpanel/stats/";
const ALLOWED_ORIGINS = new Set([
  "https://promo-buddy.vercel.app",
  "http://localhost:8080",
  "http://localhost:8081",
  `http://${HOST}:${PORT}`,
]);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed: ${origin}`));
  },
}));
app.use((req, _res, next) => {
  console.log(`[helper] ${req.method} ${req.path}`);
  next();
});

const sessions = new Map();

function buildCookieHeader(cookies) {
  return cookies
    .filter((cookie) => cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function isAuthenticatedAdminUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname.includes("standvirtual.com") &&
      url.pathname.startsWith("/adminpanel") &&
      !url.pathname.startsWith("/adminpanel/login");
  } catch {
    return false;
  }
}

function createHtmlPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Promo Buddy helper</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: linear-gradient(160deg, #eef6ff 0%, #dbeeff 45%, #cfe6ff 100%);
      display: grid;
      place-items: center;
      color: #10233f;
    }
    .card {
      width: min(560px, calc(100vw - 32px));
      background: rgba(255,255,255,0.82);
      backdrop-filter: blur(18px);
      border: 1px solid rgba(255,255,255,0.9);
      border-radius: 28px;
      box-shadow: 0 20px 60px rgba(26, 82, 152, 0.15);
      padding: 28px;
    }
    h1 { margin: 0 0 8px; font-size: 32px; }
    p { margin: 0; line-height: 1.6; color: #44556d; }
    .stack { display: grid; gap: 16px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    button {
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      font: inherit;
      cursor: pointer;
      background: #2979f2;
      color: white;
      box-shadow: 0 10px 30px rgba(41,121,242,0.24);
    }
    button.secondary {
      background: white;
      color: #10233f;
      border: 1px solid rgba(16,35,63,0.12);
      box-shadow: none;
    }
    pre {
      margin: 0;
      background: rgba(245,249,255,0.95);
      border: 1px solid rgba(16,35,63,0.08);
      border-radius: 18px;
      padding: 14px;
      white-space: pre-wrap;
      word-break: break-word;
      color: #334155;
      min-height: 84px;
    }
  </style>
</head>
<body>
  <div class="card stack">
    <div class="stack" style="gap: 8px;">
      <h1>Promo Buddy helper</h1>
      <p>This local helper opens a real browser so you can complete the normal Standvirtual login flow, then it returns the authenticated session back to Promo Buddy.</p>
    </div>
    <div class="actions">
      <button id="connect">Connect Standvirtual</button>
      <button id="health" class="secondary">Check health</button>
    </div>
    <pre id="output">Ready.</pre>
  </div>
  <script>
    const output = document.getElementById('output');
    const render = (value) => {
      output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    };

    document.getElementById('health').addEventListener('click', async () => {
      try {
        const res = await fetch('/health');
        render(await res.json());
      } catch (error) {
        render(String(error));
      }
    });

    document.getElementById('connect').addEventListener('click', async () => {
      try {
        const res = await fetch('/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: window.location.origin }),
        });
        const data = await res.json();
        render(data);
        if (!data.ok || !data.session_id) return;
        const tick = async () => {
          const statusRes = await fetch('/session/' + data.session_id + '/status');
          const status = await statusRes.json();
          render(status);
          if (status.ok && (status.status === 'starting' || status.status === 'waiting_for_login')) {
            window.setTimeout(tick, 1800);
          }
        };
        window.setTimeout(tick, 1200);
      } catch (error) {
        render(String(error));
      }
    });
  </script>
</body>
</html>`;
}

async function closeSessionResources(session) {
  if (!session) return;
  try {
    await session.context?.close();
  } catch {
    // Ignore close errors.
  }
  if (session.userDataDir) {
    try {
      await fs.rm(session.userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors.
    }
  }
}

async function launchPersistentBrowser(userDataDir) {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: false,
      viewport: null,
    });
  } catch {
    return await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: null,
    });
  }
}

async function waitForAuthenticatedSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    const { context, page } = session;
    sessions.set(sessionId, {
      ...session,
      status: "waiting_for_login",
      message: "Browser window open. Complete the Standvirtual login flow there.",
    });

    await page.waitForFunction(() => {
      return location.hostname.includes('standvirtual.com') &&
        location.pathname.startsWith('/adminpanel') &&
        !location.pathname.startsWith('/adminpanel/login');
    }, null, { timeout: 10 * 60 * 1000 });

    if (!page.url().includes('/adminpanel/stats/')) {
      await page.goto(STANDVIRTUAL_STATS_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    }

    if (!isAuthenticatedAdminUrl(page.url())) {
      throw new Error('Standvirtual admin session did not land on an authenticated admin URL.');
    }

    const cookies = await context.cookies([STANDVIRTUAL_STATS_URL, 'https://www.standvirtual.com']);
    const standvirtualCookies = cookies.filter((cookie) => cookie.domain.includes('standvirtual.com'));
    const cookieHeader = buildCookieHeader(standvirtualCookies);
    if (!cookieHeader) {
      throw new Error('No Standvirtual cookies were available after login.');
    }

    sessions.set(sessionId, {
      ...sessions.get(sessionId),
      status: 'authenticated',
      message: 'Authenticated session captured successfully.',
      validated_url: page.url(),
      cookie_header: cookieHeader,
    });
  } catch (error) {
    sessions.set(sessionId, {
      ...sessions.get(sessionId),
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'promo-buddy-helper' });
});

function sendHelperPage(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(createHtmlPage());
}

app.get('/', (_req, res) => {
  sendHelperPage(res);
});

app.get('/connect', (_req, res) => {
  sendHelperPage(res);
});

app.post('/connect', async (req, res) => {
  const origin = typeof req.body?.origin === 'string' ? req.body.origin : null;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({ ok: false, error: `Origin not allowed: ${origin}` });
    return;
  }

  const sessionId = randomUUID();
  const userDataDir = path.join(os.tmpdir(), `promo-buddy-helper-${sessionId}`);
  await fs.mkdir(userDataDir, { recursive: true });

  let context;
  try {
    context = await launchPersistentBrowser(userDataDir);
  } catch (error) {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const page = context.pages()[0] ?? await context.newPage();
  const session = {
    id: sessionId,
    status: 'starting',
    message: 'Opening the Standvirtual login window.',
    validated_url: null,
    cookie_header: null,
    error: null,
    context,
    page,
    userDataDir,
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);

  res.json({ ok: true, session_id: sessionId, status: 'starting' });

  try {
    await page.goto(STANDVIRTUAL_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    void waitForAuthenticatedSession(sessionId);
  } catch (error) {
    sessions.set(sessionId, {
      ...session,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/session/:id/status', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ ok: false, error: 'Session not found' });
    return;
  }

  res.json({
    ok: true,
    session_id: session.id,
    status: session.status,
    message: session.message,
    validated_url: session.validated_url,
    cookie_header: session.status === 'authenticated' ? session.cookie_header : null,
    error: session.error,
  });
});

app.post('/session/:id/close', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ ok: false, error: 'Session not found' });
    return;
  }

  sessions.delete(req.params.id);
  await closeSessionResources(session);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error('[helper] request failed', err);
  res.status(500).json({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Promo Buddy helper listening on http://${HOST}:${PORT}`);
});
