const ALLOWED_IPS = new Set([
  "52.212.235.52",
  "18.200.137.205",
  "54.77.44.130",
  "3.254.33.109",
]);

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "";
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    ""
  ).trim();
}

function renderDeniedPage(ip: string): string {
  const ipLabel = ip || "unknown";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Access Denied</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(96, 165, 250, 0.28), transparent 35%),
          linear-gradient(180deg, #eef5ff 0%, #dbeafe 100%);
        color: #0f172a;
      }
      main {
        width: min(92vw, 440px);
        padding: 32px 28px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.72);
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
        backdrop-filter: blur(18px);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 32px;
        line-height: 1.05;
      }
      p {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        color: #475569;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        color: #1d4ed8;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Access Denied</h1>
      <p>Your IP address (<code>${ipLabel}</code>) is not allowed to access this site.</p>
    </main>
  </body>
</html>`;
}

export default function middleware(request: Request) {
  const ip = getClientIp(request);

  if (ALLOWED_IPS.has(ip)) {
    return;
  }

  return new Response(renderDeniedPage(ip), {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
