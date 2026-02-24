import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Credentials": "true",
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function getSessionIdFromCookie(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/vas_session=([^;]+)/);
  return match ? match[1] : null;
}

function sessionCookie(sessionId: string, maxAge = 43200) {
  return `vas_session=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie() {
  return `vas_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
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

      // Call upstream OAuth
      const params = new URLSearchParams({
        grant_type: "password",
        username,
        password,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const oauthRes = await fetch(`${baseUrl}/oauth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!oauthRes.ok) {
        const errorText = await oauthRes.text();
        return json(
          { ok: false, error: `Authentication failed: ${oauthRes.status}` },
          401
        );
      }

      const oauthData = await oauthRes.json();
      const accessToken = oauthData.access_token;

      if (!accessToken) {
        return json({ ok: false, error: "No access token received" }, 502);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours

      // Clean up expired sessions first
      await supabaseAdmin.rpc("cleanup_expired_sessions");

      // Insert session
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

      return json(
        { ok: true, token_expires_at: session.token_expires_at },
        200,
        { "Set-Cookie": sessionCookie(session.session_id) }
      );
    }

    // ─── GET /status ───
    if (path === "/status" && req.method === "GET") {
      const sessionId = getSessionIdFromCookie(req);
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
        return json({ loggedIn: false }, 200, { "Set-Cookie": clearCookie() });
      }

      return json({ loggedIn: true, token_expires_at: data.token_expires_at });
    }

    // ─── POST /logout ───
    if (path === "/logout" && req.method === "POST") {
      const sessionId = getSessionIdFromCookie(req);
      if (sessionId) {
        await supabaseAdmin.from("sessions").delete().eq("session_id", sessionId);
      }
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
    }

    // ─── POST /vas/send ───
    if (path === "/vas/send" && req.method === "POST") {
      const sessionId = getSessionIdFromCookie(req);
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
        return json(
          { success: false, errorMessage: "Session expired" },
          401,
          { "Set-Cookie": clearCookie() }
        );
      }

      const { advert, promotion } = await req.json();
      if (!advert || !promotion) {
        return json(
          { success: false, advert, promotion, status: 400, errorMessage: "Missing advert or promotion" },
          400
        );
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
          errorMessage: err.message || "Network error",
        });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: "Internal server error" }, 500);
  }
});
