import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vas-session, x-offer-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function getOfferSessionId(req: Request): string | null {
  return req.headers.get("x-offer-session") || null;
}

function getSetCookieValues(headers: Headers): string[] {
  const maybeHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof maybeHeaders.getSetCookie === "function") {
    return maybeHeaders.getSetCookie();
  }

  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

type CookieJar = Map<string, string>;
type OfferFactor = {
  id: string;
  factorType: string;
  provider?: string | null;
  vendorName?: string | null;
  label?: string | null;
  verifyHref?: string | null;
};

function upsertCookies(jar: CookieJar, setCookieHeaders: string[]) {
  for (const header of setCookieHeaders) {
    const [cookiePair] = header.split(";");
    const eqIndex = cookiePair.indexOf("=");
    if (eqIndex === -1) continue;
    const name = cookiePair.slice(0, eqIndex).trim();
    const value = cookiePair.slice(eqIndex + 1).trim();
    if (!name) continue;
    jar.set(name, value);
  }
}

function buildCookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithJar(
  input: string,
  jar: CookieJar,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const cookieHeader = buildCookieHeader(jar);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    redirect: "manual",
  });

  upsertCookies(jar, getSetCookieValues(response.headers));
  return response;
}

async function followRedirects(
  input: string,
  jar: CookieJar,
  init: RequestInit = {},
  limit = 10,
): Promise<Response> {
  let url = input;
  let response = await fetchWithJar(url, jar, init);
  let hops = 0;

  while (response.status >= 300 && response.status < 400 && hops < limit) {
    const location = response.headers.get("location");
    if (!location) break;
    url = new URL(location, url).toString();
    response = await fetchWithJar(url, jar, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 PromoBuddy/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    hops += 1;
  }

  return response;
}

async function completeOfferSessionFromSessionToken(
  authorizeUrl: string,
  sessionToken: string,
  jar: CookieJar,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const userAgent = "Mozilla/5.0 PromoBuddy/1.0";
  const authorizeWithSession = new URL(authorizeUrl);
  authorizeWithSession.searchParams.set("sessionToken", sessionToken);

  const finalResponse = await followRedirects(authorizeWithSession.toString(), jar, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: "https://olxgroup.okta-emea.com/",
    },
  });

  const cookieHeader = buildCookieHeader(jar);
  const finalUrl = finalResponse.url;
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin.rpc("cleanup_expired_offer_sessions");

  const { data: offerSession, error: offerInsertError } = await supabaseAdmin
    .from("offer_sessions")
    .insert({
      cookie_header: cookieHeader,
      expires_at: expiresAt,
    })
    .select("offer_session_id, expires_at")
    .single();

  if (offerInsertError || !offerSession) {
    return json({ ok: false, error: "Failed to create offer session" }, 500);
  }

  return json({
    ok: true,
    offer_session_id: offerSession.offer_session_id,
    expires_at: offerSession.expires_at,
    cookie: cookieHeader,
    final_url: finalUrl,
  });
}

function parseOfferFactors(authnJson: Record<string, unknown>): OfferFactor[] {
  const embedded = authnJson._embedded;
  if (!embedded || typeof embedded !== "object") return [];
  const factors =
    (embedded as { factors?: unknown }).factors ??
    (embedded as { factorTypes?: unknown }).factorTypes;
  if (!Array.isArray(factors)) return [];

  return factors
    .map((factor) => {
      if (!factor || typeof factor !== "object") return null;
      const value = factor as Record<string, unknown>;
      const links = typeof value._links === "object" && value._links
        ? (value._links as Record<string, unknown>)
        : null;
      const verifyLink = links && typeof links.verify === "object" && links.verify
        ? (links.verify as Record<string, unknown>)
        : links && typeof links.next === "object" && links.next
          ? (links.next as Record<string, unknown>)
          : null;
      const verifyHref = verifyLink && typeof verifyLink.href === "string" ? verifyLink.href : null;
      const hrefFactorId = verifyHref?.match(/\/factors\/([^/]+)\//)?.[1] ?? null;
      const id = typeof value.id === "string" ? value.id : hrefFactorId;
      const factorType = typeof value.factorType === "string" ? value.factorType : null;
      if (!id || !factorType) return null;
      return {
        id,
        factorType,
        provider: typeof value.provider === "string" ? value.provider : null,
        vendorName: typeof value.vendorName === "string" ? value.vendorName : null,
        label: typeof value.profile === "object" && value.profile && typeof (value.profile as Record<string, unknown>).credentialId === "string"
          ? ((value.profile as Record<string, unknown>).credentialId as string)
          : null,
        verifyHref,
      };
    })
    .filter((factor): factor is OfferFactor => Boolean(factor));
}

function choosePreferredOfferFactor(factors: OfferFactor[]): OfferFactor | null {
  if (factors.length === 0) return null;

  const score = (factor: OfferFactor) => {
    const type = factor.factorType.toLowerCase();
    const provider = (factor.provider || "").toLowerCase();
    const vendor = (factor.vendorName || "").toLowerCase();
    if (type === "signed_nonce") return 100;
    if (type === "push" && provider === "okta") return 90;
    if (type === "push") return 80;
    if (vendor.includes("fastpass")) return 70;
    return 0;
  };

  return [...factors].sort((a, b) => score(b) - score(a))[0] ?? null;
}

async function pollForOfferSessionToken(
  verifyUrl: string,
  stateToken: string,
  jar: CookieJar,
): Promise<{ sessionToken: string | null; detail?: string }> {
  const userAgent = "Mozilla/5.0 PromoBuddy/1.0";

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(2000);

    const pollRes = await fetchWithJar(verifyUrl, jar, {
      method: "POST",
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://olxgroup.okta-emea.com",
        Referer: "https://olxgroup.okta-emea.com/",
      },
      body: JSON.stringify({ stateToken }),
    });

    const pollText = await pollRes.text();
    let pollJson: Record<string, unknown> = {};
    try {
      pollJson = pollText ? JSON.parse(pollText) : {};
    } catch {
      pollJson = {};
    }

    const sessionToken =
      typeof pollJson.sessionToken === "string" ? pollJson.sessionToken : null;
    if (sessionToken) {
      return { sessionToken };
    }

    const status = typeof pollJson.status === "string" ? pollJson.status : "";
    const factorResult =
      typeof pollJson.factorResult === "string" ? pollJson.factorResult : "";

    if (
      status === "SUCCESS" ||
      factorResult === "SUCCESS"
    ) {
      return { sessionToken };
    }

    if (
      status === "MFA_CHALLENGE" ||
      status === "MFA_REQUIRED" ||
      factorResult === "WAITING" ||
      factorResult === "PENDING"
    ) {
      continue;
    }

    return {
      sessionToken: null,
      detail: pollText.substring(0, 500),
    };
  }

  return { sessionToken: null, detail: "Timed out waiting for MFA approval." };
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
    if (path === "/offer/login" && req.method === "POST") {
      const { username, password } = await req.json();

      if (!username || !password) {
        return json({ ok: false, error: "Missing required fields" }, 400);
      }

      const jar: CookieJar = new Map();
      const userAgent = "Mozilla/5.0 PromoBuddy/1.0";

      const oktaEntry = await fetchWithJar(
        "https://www.standvirtual.com/adminpanel/login/loginwithokta/",
        jar,
        {
          method: "GET",
          headers: {
            "User-Agent": userAgent,
            Accept: "text/html,application/xhtml+xml",
            Referer: "https://www.standvirtual.com/adminpanel/login/",
          },
        },
      );

      const authorizeUrl = oktaEntry.headers.get("location");
      if (!authorizeUrl) {
        const detail = await oktaEntry.text();
        return json(
          {
            ok: false,
            error: "Failed to initialize Offer Promotion login flow",
            detail: detail.substring(0, 500),
          },
          502,
        );
      }

      const authnRes = await fetchWithJar("https://olxgroup.okta-emea.com/api/v1/authn", jar, {
        method: "POST",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://olxgroup.okta-emea.com",
          Referer: authorizeUrl,
        },
        body: JSON.stringify({
          username,
          password,
          options: {
            warnBeforePasswordExpired: true,
            multiOptionalFactorEnroll: false,
          },
        }),
      });

      const authnText = await authnRes.text();
      let authnJson: Record<string, unknown> = {};
      try {
        authnJson = authnText ? JSON.parse(authnText) : {};
      } catch {
        authnJson = {};
      }

      if (!authnRes.ok) {
        return json(
          {
            ok: false,
            error: `Offer authentication failed: ${authnRes.status}`,
            detail:
              (typeof authnJson.errorSummary === "string" && authnJson.errorSummary) ||
              authnText.substring(0, 500),
          },
          401,
        );
      }

      const sessionToken = typeof authnJson.sessionToken === "string" ? authnJson.sessionToken : null;

      if (typeof authnJson.status === "string" && authnJson.status === "MFA_REQUIRED") {
        const factors = parseOfferFactors(authnJson);
        const preferredFactor = choosePreferredOfferFactor(factors);
        return json({
          ok: true,
          requires_mfa: true,
          state_token: typeof authnJson.stateToken === "string" ? authnJson.stateToken : null,
          authorize_url: authorizeUrl,
          factors,
          preferred_factor_id: preferredFactor?.id ?? null,
        });
      }

      if (!sessionToken) {
        return json(
          {
            ok: false,
            error: "Offer login did not return a session token",
            detail: authnText.substring(0, 500),
          },
          502,
        );
      }

      return await completeOfferSessionFromSessionToken(authorizeUrl, sessionToken, jar, supabaseAdmin);
    }

    if (path === "/offer/verify-mfa" && req.method === "POST") {
      const { state_token, factor_id, authorize_url } = await req.json();
      if (!state_token || !factor_id || !authorize_url) {
        return json({ ok: false, error: "Missing MFA verification fields" }, 400);
      }

      const jar: CookieJar = new Map();
      const userAgent = "Mozilla/5.0 PromoBuddy/1.0";

      const verifyUrl = `https://olxgroup.okta-emea.com/api/v1/authn/factors/${encodeURIComponent(factor_id)}/verify`;
      const verifyRes = await fetchWithJar(
        verifyUrl,
        jar,
        {
          method: "POST",
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json",
            "Content-Type": "application/json",
            Origin: "https://olxgroup.okta-emea.com",
            Referer: authorize_url,
          },
          body: JSON.stringify({
            stateToken: state_token,
          }),
        },
      );

      const verifyText = await verifyRes.text();
      let verifyJson: Record<string, unknown> = {};
      try {
        verifyJson = verifyText ? JSON.parse(verifyText) : {};
      } catch {
        verifyJson = {};
      }

      if (!verifyRes.ok) {
        return json(
          {
            ok: false,
            error: `Offer MFA verification failed: ${verifyRes.status}`,
            detail:
              (typeof verifyJson.errorSummary === "string" && verifyJson.errorSummary) ||
              verifyText.substring(0, 500),
          },
          401,
        );
      }

      const sessionToken =
        typeof verifyJson.sessionToken === "string" ? verifyJson.sessionToken : null;

      if (!sessionToken) {
        const polled = await pollForOfferSessionToken(verifyUrl, state_token, jar);
        if (polled.sessionToken) {
          return await completeOfferSessionFromSessionToken(
            authorize_url,
            polled.sessionToken,
            jar,
            supabaseAdmin,
          );
        }

        return json(
          {
            ok: false,
            error: "MFA approval did not complete successfully",
            detail: polled.detail || verifyText.substring(0, 500),
          },
          502,
        );
      }

      return await completeOfferSessionFromSessionToken(authorize_url, sessionToken, jar, supabaseAdmin);
    }

    if (path === "/offer/status" && req.method === "GET") {
      const offerSessionId = getOfferSessionId(req);
      if (!offerSessionId) {
        return json({ loggedIn: false });
      }

      const { data: offerSession } = await supabaseAdmin
        .from("offer_sessions")
        .select("cookie_header, expires_at")
        .eq("offer_session_id", offerSessionId)
        .single();

      if (!offerSession) {
        return json({ loggedIn: false });
      }

      if (new Date(offerSession.expires_at) < new Date()) {
        await supabaseAdmin.from("offer_sessions").delete().eq("offer_session_id", offerSessionId);
        return json({ loggedIn: false });
      }

      return json({
        loggedIn: true,
        cookie: offerSession.cookie_header,
        expires_at: offerSession.expires_at,
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
