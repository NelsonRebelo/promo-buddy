import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vas-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSessionId(req: Request): string | null {
  return req.headers.get("x-vas-session") || null;
}

function parseFormToken(html: string): string | null {
  const inputMatch =
    html.match(/name=["']formToken["'][^>]*value=["']([^"']+)["']/i) ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']formToken["']/i);
  if (inputMatch?.[1]) return inputMatch[1];

  const linkMatch = html.match(/[?&]formToken=([a-zA-Z0-9]+)/i);
  if (linkMatch?.[1]) return linkMatch[1];

  return null;
}

function getSetCookieValues(headers: Headers): string[] {
  const denoHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof denoHeaders.getSetCookie === "function") {
    return denoHeaders.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return [raw];
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/vas-api/, "");

  try {
    if (path === "/offer/token-info" && req.method === "GET") {
      const loginUrl = "https://www.standvirtual.com/adminpanel/login/";
      const response = await fetch(loginUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 PromoBuddy/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        const detail = await response.text();
        return json(
          {
            ok: false,
            error: `Failed to load offer login page: ${response.status}`,
            detail: detail.substring(0, 500),
          },
          502,
        );
      }

      const html = await response.text();
      const formToken = parseFormToken(html);

      const cookies = getSetCookieValues(response.headers)
        .map((cookie) => cookie.split(";")[0])
        .filter(Boolean);

      return json({
        ok: true,
        formToken,
        cookie: cookies.join("; ") || null,
      });
    }

    // ─── POST /login ───
    if (path === "/login" && req.method === "POST") {
      const { username, password } = await req.json();

      if (!username || !password) {
        return json({ ok: false, error: "Missing required fields" }, 400);
      }

      const clientSecret = Deno.env.get("CLIENT_SECRET");
      const clientId = Deno.env.get("VAS_CLIENT_ID");
      const baseUrl = Deno.env.get("VAS_BASE_URL");
      if (!clientSecret || !clientId || !baseUrl) {
        return json({ ok: false, error: "Server misconfigured" }, 500);
      }

      const params = new URLSearchParams({
        grant_type: "password",
        username,
        password,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const oauthUrl = `${baseUrl}/oauth/token/`;
      console.log("OAuth URL:", oauthUrl);
      console.log("Client ID:", clientId);
      console.log("Grant type: password, username:", username);

      const oauthRes = await fetch(oauthUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!oauthRes.ok) {
        const errText = await oauthRes.text();
        console.log("OAuth error response:", oauthRes.status, errText);
        return json({ ok: false, error: `Authentication failed: ${oauthRes.status}`, detail: errText.substring(0, 500) }, 401);
      }

      const oauthData = await oauthRes.json();
      const accessToken = oauthData.access_token;

      if (!accessToken) {
        return json({ ok: false, error: "No access token received" }, 502);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

      await supabaseAdmin.rpc("cleanup_expired_sessions");

      const { data: session, error: insertError } = await supabaseAdmin
        .from("sessions")
        .insert({
          access_token: accessToken,
          base_url: baseUrl,
          token_acquired_at: now.toISOString(),
          token_expires_at: expiresAt.toISOString(),
        })
        .select("session_id, token_expires_at")
        .single();

      if (insertError || !session) {
        return json({ ok: false, error: "Failed to create session" }, 500);
      }

      return json({ ok: true, session_id: session.session_id, token_expires_at: session.token_expires_at });
    }

    // ─── GET /status ───
    if (path === "/status" && req.method === "GET") {
      const sessionId = getSessionId(req);
      if (!sessionId) {
        return json({ loggedIn: false });
      }

      const { data } = await supabaseAdmin
        .from("sessions")
        .select("token_expires_at")
        .eq("session_id", sessionId)
        .single();

      if (!data) {
        return json({ loggedIn: false });
      }

      const expired = new Date(data.token_expires_at) < new Date();
      if (expired) {
        await supabaseAdmin.from("sessions").delete().eq("session_id", sessionId);
        return json({ loggedIn: false });
      }

      return json({ loggedIn: true, token_expires_at: data.token_expires_at });
    }

    // ─── POST /logout ───
    if (path === "/logout" && req.method === "POST") {
      const sessionId = getSessionId(req);
      if (sessionId) {
        await supabaseAdmin.from("sessions").delete().eq("session_id", sessionId);
      }
      return json({ ok: true });
    }

    // ─── POST /vas/send ───
    if (path === "/vas/send" && req.method === "POST") {
      const sessionId = getSessionId(req);
      if (!sessionId) {
        return json({ success: false, errorMessage: "Not authenticated" }, 401);
      }

      const { data: session } = await supabaseAdmin
        .from("sessions")
        .select("access_token, base_url, token_expires_at")
        .eq("session_id", sessionId)
        .single();

      if (!session) {
        return json({ success: false, errorMessage: "Session not found" }, 401);
      }

      if (new Date(session.token_expires_at) < new Date()) {
        await supabaseAdmin.from("sessions").delete().eq("session_id", sessionId);
        return json({ success: false, errorMessage: "Session expired" }, 401);
      }

      const { advert, promotion } = await req.json();
      if (!advert || !promotion) {
        return json({ success: false, advert, promotion, status: 400, errorMessage: "Missing advert or promotion" }, 400);
      }

      try {
        const upstreamRes = await fetch(
          `${session.base_url}/account/adverts/${encodeURIComponent(advert)}/promotions/`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              payment_type: "account",
              promotion_ids: [promotion],
            }),
          }
        );

        const status = upstreamRes.status;

        if (status === 200 || status === 201 || status === 202) {
          return json({ success: true, advert, promotion, status });
        }

        let errorMessage = `HTTP ${status}`;
        try {
          const errBody = await upstreamRes.text();
          if (errBody) errorMessage = errBody.substring(0, 500);
        } catch {}

        return json({ success: false, advert, promotion, status, errorMessage });
      } catch (err) {
        return json({
          success: false,
          advert,
          promotion,
          status: "network error",
          errorMessage: err instanceof Error ? err.message : "Network error",
        });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: "Internal server error", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
