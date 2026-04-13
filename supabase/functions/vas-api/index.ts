import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vas-session, x-offer-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OFFER_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

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
  if (!single) return [];

  return single.split(/,(?=\s*[^;,\s]+=)/g).map((cookie) => cookie.trim()).filter(Boolean);
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

function cookieHeaderToJar(cookieHeader: string): CookieJar {
  const jar: CookieJar = new Map();
  for (const cookie of cookieHeader.split(";")) {
    const trimmed = cookie.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const name = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!name) continue;
    jar.set(name, value);
  }
  return jar;
}

function getCookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter(Boolean);
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const prefix = `${name}=`;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : null;
}

function extractOfferFormToken(html: string): string | null {
  const patterns = [
    /formToken(?:%5D)?(?:=|%5D=)([a-f0-9]{16,})/i,
    /formToken["']?\s*[:=]\s*["']([a-f0-9]{16,})["']/i,
    /formToken%5D=([a-f0-9]{16,})/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function buildOfferPaymentReferer(advert: string, userId: string | null, formToken: string | null): string {
  const referer = new URL(`https://www.standvirtual.com/adminpanel/pagamento/${encodeURIComponent(advert)}/`);
  referer.searchParams.set("ref[0][params][type]", "active");
  if (userId) referer.searchParams.set("ref[0][params][userID]", userId);
  referer.searchParams.set("ref[0][params][page]", "1");
  referer.searchParams.set("ref[0][params][sortByField]", "created_at");
  referer.searchParams.set("ref[0][params][sortByDirection]", "desc");
  referer.searchParams.set("ref[0][params][numResults]", "50");
  if (formToken) referer.searchParams.set("ref[0][params][formToken]", formToken);
  referer.searchParams.set("ref[0][ajax]", "1");
  referer.searchParams.set("ref[0][action]", "moderation");
  referer.searchParams.set("ref[0][method]", "userads");
  return referer.toString();
}

const OFFER_STANDVIRTUAL_COOKIE_ALLOWLIST = new Set([
  "_cc_id",
  "_fbp",
  "_ga",
  "_ga_12HMJDM6HW",
  "_ga_L97YMGPQ5R",
  "_ga_TNE2ND3YPW",
  "_ga_TZSL9M69RL",
  "_gcl_au",
  "_gfp_64b",
  "_gads",
  "_gpi",
  "_hjSessionUser_5591",
  "_pk_id.341094.59fa",
  "_sharedid",
  "_sharedid_cst",
  "_tt_enable_cookie",
  "_ttp",
  "__gfp_64b",
  "__diug",
  "__eoi",
  "__Host-next-auth.csrf-token",
  "__Secure-next-auth.callback-url",
  "__Secure-next-auth.session-token",
  "__rtbh.lid",
  "__rtbh.uid",
  "ab.storage.deviceId.e445935b-777a-429f-9f37-ac9297914d6e",
  "ab.storage.sessionId.e445935b-777a-429f-9f37-ac9297914d6e",
  "ab.storage.userId.e445935b-777a-429f-9f37-ac9297914d6e",
  "ab._gd",
  "ads_display_type",
  "client_id",
  "cto_bidid",
  "cto_bundle",
  "datadome",
  "PHPSESSID",
  "ldf",
  "lqonap",
  "onap",
  "laquesis",
  "laquesisff",
  "lqstatus",
  "dfp_user_id",
  "id_token",
  "intercom-device-id-f86h7xdx",
  "intercom-id-f86h7xdx",
  "invite",
  "laquesis_result",
  "laquesis_result_tmp",
  "laquesissu",
  "mobile_default",
  "ock",
  "OptanonAlertBoxClosed",
  "OptanonConsent",
  "OTAdditionalConsentString",
  "posting_notice",
  "refresh_token",
  "salesforce",
  "SERVERID",
  "test",
  "ttcsid",
  "ttcsid_D3B5E4JC77UCTDLGQA20",
  "user_id",
  "uuid",
  "eupubconsent-v2",
]);

function buildOfferStandvirtualCookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries())
    .filter(([name, value]) =>
      OFFER_STANDVIRTUAL_COOKIE_ALLOWLIST.has(name) &&
      value !== "" &&
      value !== '""'
    )
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
        "User-Agent": OFFER_BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    hops += 1;
  }

  return response;
}

async function primeOfferStandvirtualCookies(jar: CookieJar) {
  const userAgent = OFFER_BROWSER_USER_AGENT;

  await followRedirects("https://www.standvirtual.com/adminpanel/", jar, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  await fetchWithJar("https://www.standvirtual.com/ajax/jsdata/params/", jar, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      Accept: "application/javascript, text/javascript, */*; q=0.01",
      "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://www.standvirtual.com/adminpanel/login/",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
}

function isAuthenticatedAdminHtml(html: string): boolean {
  const markers = [
    'id="user-bar"',
    "menu-section-Tools",
    "/adminpanel/login/logout/",
    "/adminpanel/stats/?formToken=",
    "data-test=\"menu-section-Administration\"",
  ];

  return markers.some((marker) => html.includes(marker));
}

async function enrichOfferAdminSession(
  jar: CookieJar,
  initialStatsResponse: Response,
): Promise<{
  statsHtml: string;
  paramsText: string;
  finalCookieHeader: string;
  validated: boolean;
  validatedUrl: string;
  usercardsStatus: number;
  usercardsUrl: string;
}> {
  const userAgent = OFFER_BROWSER_USER_AGENT;
  let statsHtml = "";
  let validatedUrl = initialStatsResponse.url;
  let usercardsStatus = 0;
  let usercardsUrl = "";

  if (initialStatsResponse.url.includes("/adminpanel/stats/")) {
    statsHtml = await initialStatsResponse.text();
  } else {
    const statsRes = await followRedirects(
      "https://www.standvirtual.com/adminpanel/stats/",
      jar,
      {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          Referer: initialStatsResponse.url || "https://www.standvirtual.com/adminpanel/login/",
        },
      },
    );
    validatedUrl = statsRes.url;
    statsHtml = await statsRes.text();
  }

  await followRedirects(
    "https://www.standvirtual.com/adminpanel/",
    jar,
    {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.standvirtual.com/adminpanel/stats/",
      },
    },
  );

  const paramsRes = await fetchWithJar(
    "https://www.standvirtual.com/ajax/jsdata/params/",
    jar,
    {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "application/javascript, text/javascript, */*; q=0.01",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.standvirtual.com/adminpanel/stats/",
        "X-Requested-With": "XMLHttpRequest",
      },
    },
  );
  const paramsText = await paramsRes.text();

  const usercardsUserId = getCookieValue(buildCookieHeader(jar), "user_id") || "6";
  const usercardsRes = await followRedirects(
    `https://www.standvirtual.com/adminpanel/usercards/?search%5Buser_id%5D=${encodeURIComponent(usercardsUserId)}`,
    jar,
    {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.standvirtual.com/adminpanel/stats/",
      },
    },
  );
  usercardsStatus = usercardsRes.status;
  usercardsUrl = usercardsRes.url;
  await usercardsRes.text().catch(() => "");

  const validationRes = await followRedirects(
    "https://www.standvirtual.com/adminpanel/stats/",
    jar,
    {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.standvirtual.com/adminpanel/",
      },
    },
  );
  validatedUrl = validationRes.url;
  const validationHtml = await validationRes.text();
  const validated =
    validationRes.status === 200 &&
    !validatedUrl.includes("/adminpanel/login") &&
    isAuthenticatedAdminHtml(validationHtml);

  return {
    statsHtml,
    paramsText,
    finalCookieHeader: buildCookieHeader(jar),
    validated,
    validatedUrl,
    usercardsStatus,
    usercardsUrl,
  };
}

async function completeOfferSessionFromSessionToken(
  authorizeUrl: string,
  sessionToken: string,
  jar: CookieJar,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const userAgent = OFFER_BROWSER_USER_AGENT;
  const authorizeWithSession = new URL(authorizeUrl);
  authorizeWithSession.searchParams.set("sessionToken", sessionToken);

  const finalResponse = await followRedirects(authorizeWithSession.toString(), jar, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://olxgroup.okta-emea.com/",
    },
  });

  const enriched = await enrichOfferAdminSession(jar, finalResponse);
  const cookieHeader = buildOfferStandvirtualCookieHeader(jar);
  const finalUrl = enriched.validatedUrl || finalResponse.url;
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  if (!enriched.validated) {
    return json({
      ok: false,
      error: "Offer admin session not authenticated after sessionToken redirect",
      cookie_length: cookieHeader.length,
      cookie_names: getCookieNames(cookieHeader),
      final_url: finalUrl,
      validated: false,
      usercards_status: enriched.usercardsStatus,
      usercards_url: enriched.usercardsUrl,
      stats_contains_admin_markers: isAuthenticatedAdminHtml(enriched.statsHtml),
      params_loaded: enriched.paramsText.length > 0,
      auth_path: "sessionTokenRedirect",
    }, 502);
  }

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
    cookie_length: cookieHeader.length,
    cookie_names: getCookieNames(cookieHeader),
    final_url: finalUrl,
    validated: enriched.validated,
    usercards_status: enriched.usercardsStatus,
    usercards_url: enriched.usercardsUrl,
    stats_contains_admin_markers: isAuthenticatedAdminHtml(enriched.statsHtml),
    params_loaded: enriched.paramsText.length > 0,
  });
}

async function completeOfferSessionFromStateToken(
  stateToken: string,
  jar: CookieJar,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const userAgent = OFFER_BROWSER_USER_AGENT;
  const oktaRedirectUrl =
    `https://olxgroup.okta-emea.com/login/token/redirect?stateToken=${encodeURIComponent(stateToken)}`;

  const finalResponse = await followRedirects(oktaRedirectUrl, jar, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://olxgroup.okta-emea.com/",
    },
  });

  const enriched = await enrichOfferAdminSession(jar, finalResponse);
  const cookieHeader = buildOfferStandvirtualCookieHeader(jar);
  const finalUrl = enriched.validatedUrl || finalResponse.url;
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  if (!enriched.validated) {
    return json({
      ok: false,
      error: "Offer admin session not authenticated after stateToken redirect",
      cookie_length: cookieHeader.length,
      cookie_names: getCookieNames(cookieHeader),
      final_url: finalUrl,
      validated: false,
      usercards_status: enriched.usercardsStatus,
      usercards_url: enriched.usercardsUrl,
      stats_contains_admin_markers: isAuthenticatedAdminHtml(enriched.statsHtml),
      params_loaded: enriched.paramsText.length > 0,
      auth_path: "stateTokenRedirect",
    }, 502);
  }

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
    cookie_length: cookieHeader.length,
    cookie_names: getCookieNames(cookieHeader),
    final_url: finalUrl,
    validated: enriched.validated,
    usercards_status: enriched.usercardsStatus,
    usercards_url: enriched.usercardsUrl,
    stats_contains_admin_markers: isAuthenticatedAdminHtml(enriched.statsHtml),
    params_loaded: enriched.paramsText.length > 0,
    auth_path: "stateTokenRedirect",
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
): Promise<{ sessionToken: string | null; stateToken?: string | null; detail?: string }> {
  const userAgent = OFFER_BROWSER_USER_AGENT;

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
    const returnedStateToken =
      typeof pollJson.stateToken === "string" ? pollJson.stateToken : stateToken;
    if (sessionToken) {
      return { sessionToken, stateToken: returnedStateToken };
    }

    const status = typeof pollJson.status === "string" ? pollJson.status : "";
    const factorResult =
      typeof pollJson.factorResult === "string" ? pollJson.factorResult : "";

    if (
      status === "SUCCESS" ||
      factorResult === "SUCCESS"
    ) {
      return { sessionToken, stateToken: returnedStateToken };
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
      const userAgent = OFFER_BROWSER_USER_AGENT;

      await primeOfferStandvirtualCookies(jar);

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
        const pendingExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const { data: pendingOfferSession, error: pendingOfferSessionError } = await supabaseAdmin
          .from("offer_sessions")
          .insert({
            cookie_header: buildCookieHeader(jar),
            expires_at: pendingExpiresAt,
          })
          .select("offer_session_id")
          .single();

        if (pendingOfferSessionError || !pendingOfferSession) {
          return json({ ok: false, error: "Failed to create pending Offer login session" }, 500);
        }

        return json({
          ok: true,
          requires_mfa: true,
          offer_session_id: pendingOfferSession.offer_session_id,
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

      const pendingOfferSessionId = getOfferSessionId(req);
      let jar: CookieJar = new Map();
      if (pendingOfferSessionId) {
        const { data: pendingOfferSession } = await supabaseAdmin
          .from("offer_sessions")
          .select("cookie_header, expires_at")
          .eq("offer_session_id", pendingOfferSessionId)
          .single();

        if (pendingOfferSession && new Date(pendingOfferSession.expires_at) >= new Date()) {
          jar = cookieHeaderToJar(pendingOfferSession.cookie_header);
        }
      }

      const userAgent = OFFER_BROWSER_USER_AGENT;

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
          const stateTokenToUse = polled.stateToken || state_token;
          const redirected = await completeOfferSessionFromStateToken(
            stateTokenToUse,
            jar,
            supabaseAdmin,
          );

          const redirectedBody = await redirected.clone().json().catch(() => null);
          if (redirected.ok && redirectedBody?.validated) {
            return redirected;
          }

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

      const redirected = await completeOfferSessionFromStateToken(
        state_token,
        jar,
        supabaseAdmin,
      );
      const redirectedBody = await redirected.clone().json().catch(() => null);
      if (redirected.ok && redirectedBody?.validated) {
        return redirected;
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
        cookie_length: offerSession.cookie_header.length,
        cookie_names: getCookieNames(offerSession.cookie_header),
        expires_at: offerSession.expires_at,
      });
    }

    if (path === "/offer/send" && req.method === "POST") {
      const offerSessionId = getOfferSessionId(req);
      if (!offerSessionId) {
        return json({ success: false, errorMessage: "Not authenticated" }, 401);
      }

      const { data: offerSession } = await supabaseAdmin
        .from("offer_sessions")
        .select("cookie_header, expires_at")
        .eq("offer_session_id", offerSessionId)
        .single();

      if (!offerSession) {
        return json({ success: false, errorMessage: "Session not found" }, 401);
      }

      if (new Date(offerSession.expires_at) < new Date()) {
        await supabaseAdmin.from("offer_sessions").delete().eq("offer_session_id", offerSessionId);
        return json({ success: false, errorMessage: "Session expired" }, 401);
      }

      const { advert, promotion } = await req.json();
      if (!advert || !promotion) {
        return json({ success: false, advert, promotion, status: 400, errorMessage: "Missing advert or promotion" }, 400);
      }

      try {
        const pagamentoUrl = `https://www.standvirtual.com/adminpanel/pagamento/${encodeURIComponent(advert)}/`;
        const statsRes = await fetch("https://www.standvirtual.com/adminpanel/stats/", {
          method: "GET",
          headers: {
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "cache-control": "no-cache",
            pragma: "no-cache",
            "sec-ch-ua": "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "upgrade-insecure-requests": "1",
            "user-agent": OFFER_BROWSER_USER_AGENT,
            Cookie: offerSession.cookie_header,
          },
          redirect: "follow",
        });
        const statsHtml = await statsRes.text().catch(() => "");
        const formToken = extractOfferFormToken(statsHtml);
        const userId = getCookieValue(offerSession.cookie_header, "user_id");
        const paymentReferer = buildOfferPaymentReferer(advert, userId, formToken);
        const upstreamRes = await fetch(pagamentoUrl, {
          method: "POST",
          headers: {
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded",
            origin: "https://www.standvirtual.com",
            pragma: "no-cache",
            priority: "u=0, i",
            referer: paymentReferer,
            "sec-ch-ua": "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "user-agent": OFFER_BROWSER_USER_AGENT,
            Cookie: offerSession.cookie_header,
          },
          body: new URLSearchParams({ id_index: String(promotion) }),
          redirect: "follow",
        });

        const status = upstreamRes.status;
        const finalUrl = upstreamRes.url;
        const responseText = await upstreamRes.text().catch(() => "");
        const wasRedirectedToLogin =
          finalUrl.includes("/adminpanel/login") ||
          finalUrl.includes("/login") ||
          responseText.toLowerCase().includes("login");
        const message = responseText.includes("Ad was paid successfully")
          ? "Ad was paid successfully"
          : wasRedirectedToLogin
            ? "Standvirtual redirected to login. The captured cookie is not valid for this request."
          : responseText.substring(0, 500) || `HTTP ${status}`;
        const success =
          (status === 200 || status === 201 || status === 202) &&
          responseText.includes("Ad was paid successfully");

        return json({
          success,
          advert,
          promotion,
          status,
          finalUrl,
          statsUrl: statsRes.url,
          formTokenFound: Boolean(formToken),
          userIdFound: Boolean(userId),
          cookie_length: offerSession.cookie_header.length,
          cookie_names: getCookieNames(offerSession.cookie_header),
          message,
          errorMessage: success ? undefined : message,
        }, success ? 200 : status >= 400 ? status : 502);
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
