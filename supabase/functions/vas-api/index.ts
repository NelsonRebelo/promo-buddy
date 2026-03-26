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

function cookieHeaderToJar(cookieHeader: string): CookieJar {
  const jar: CookieJar = new Map();
  for (const pair of cookieHeader.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const name = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!name) continue;
    jar.set(name, value);
  }
  return jar;
}

function encodeOfferMfaState(stateHandle: string, jar: CookieJar): string {
  const payload = JSON.stringify({
    stateHandle,
    cookieHeader: buildCookieHeader(jar),
  });
  return btoa(payload);
}

function decodeOfferMfaState(encoded: string): { stateHandle: string; jar: CookieJar } | null {
  try {
    const decoded = atob(encoded);
    const payload = JSON.parse(decoded) as { stateHandle?: string; cookieHeader?: string };
    if (!payload.stateHandle || typeof payload.stateHandle !== "string") return null;
    return {
      stateHandle: payload.stateHandle,
      jar: cookieHeaderToJar(payload.cookieHeader || ""),
    };
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJsonValue(input: unknown, path: string[]): unknown {
  let current = input;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getString(input: unknown, path: string[]): string | null {
  const value = getJsonValue(input, path);
  return typeof value === "string" ? value : null;
}

function getArray(input: unknown, path: string[]): unknown[] {
  const value = getJsonValue(input, path);
  return Array.isArray(value) ? value : [];
}

function parseStateTokenFromAuthorizeHtml(html: string): string | null {
  const match = html.match(/var stateToken = '([^']+)'/);
  if (!match) return null;
  return match[1].replace(/\\x2D/g, "-");
}

function parseIdxMessages(payload: Record<string, unknown>): string[] {
  const values = getArray(payload, ["messages", "value"]);
  return values
    .map((value) =>
      value && typeof value === "object" && typeof (value as Record<string, unknown>).message === "string"
        ? ((value as Record<string, unknown>).message as string)
        : null
    )
    .filter((value): value is string => Boolean(value));
}

function findIdxRemediation(
  payload: Record<string, unknown>,
  name: string,
): Record<string, unknown> | null {
  const remediations = getArray(payload, ["remediation", "value"]);
  for (const remediation of remediations) {
    if (
      remediation &&
      typeof remediation === "object" &&
      (remediation as Record<string, unknown>).name === name
    ) {
      return remediation as Record<string, unknown>;
    }
  }
  return null;
}

function remediationFieldValue(
  remediation: Record<string, unknown>,
  fieldName: string,
): unknown {
  const fields = Array.isArray(remediation.value) ? remediation.value : [];
  for (const field of fields) {
    if (field && typeof field === "object" && (field as Record<string, unknown>).name === fieldName) {
      return (field as Record<string, unknown>).value;
    }
  }
  return undefined;
}

function collectIdxAuthenticatorCandidates(
  input: unknown,
  out: Array<{ id: string; methodType?: string | null; label?: string | null }>,
) {
  if (!input || typeof input !== "object") return;

  if (Array.isArray(input)) {
    for (const item of input) collectIdxAuthenticatorCandidates(item, out);
    return;
  }

  const obj = input as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : null;
  const methodType = typeof obj.methodType === "string" ? obj.methodType : null;
  const label =
    typeof obj.label === "string" ? obj.label :
    typeof obj.displayName === "string" ? obj.displayName :
    typeof obj.name === "string" ? obj.name :
    null;

  if (id && id.startsWith("aut")) {
    if (Array.isArray(obj.methods)) {
      for (const method of obj.methods) {
        if (method && typeof method === "object") {
          const mt = typeof (method as Record<string, unknown>).type === "string"
            ? ((method as Record<string, unknown>).type as string)
            : typeof (method as Record<string, unknown>).methodType === "string"
              ? ((method as Record<string, unknown>).methodType as string)
              : null;
          out.push({ id, methodType: mt, label });
        }
      }
    } else {
      out.push({ id, methodType, label });
    }
  }

  for (const value of Object.values(obj)) {
    collectIdxAuthenticatorCandidates(value, out);
  }
}

function choosePreferredIdxFactor(payload: Record<string, unknown>): OfferFactor | null {
  const candidates: Array<{ id: string; methodType?: string | null; label?: string | null }> = [];
  collectIdxAuthenticatorCandidates(payload, candidates);
  if (candidates.length === 0) return null;

  const score = (candidate: { methodType?: string | null; label?: string | null }) => {
    const method = (candidate.methodType || "").toLowerCase();
    const label = (candidate.label || "").toLowerCase();
    if (method === "signed_nonce") return 100;
    if (method === "push") return 90;
    if (label.includes("fastpass")) return 80;
    if (label.includes("okta verify")) return 70;
    return 0;
  };

  const best = [...candidates].sort((a, b) => score(b) - score(a))[0];
  return {
    id: best.id,
    factorType: best.methodType || "push",
    provider: "okta",
    vendorName: best.label || "Okta Verify",
    label: best.label || "Okta Verify",
  };
}

async function fetchIdxJson(
  url: string,
  jar: CookieJar,
  body: Record<string, unknown>,
  referer: string,
): Promise<{ response: Response; payload: Record<string, unknown>; text: string }> {
  const response = await fetchWithJar(url, jar, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 PromoBuddy/1.0",
      Accept: "application/ion+json; okta-version=1.0.0",
      "Content-Type": "application/ion+json; okta-version=1.0.0",
      Origin: "https://olxgroup.okta-emea.com",
      Referer: referer,
      "X-Okta-User-Agent-Extended": "okta-auth-js/7.14.0 okta-signin-widget-7.43.0",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  return { response, payload, text };
}

async function initializeOfferIdxFlow(jar: CookieJar): Promise<{
  authorizeUrl: string;
  authorizeHtml: string;
  authorizeStateToken: string;
  introspectPayload: Record<string, unknown>;
}> {
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
    throw new Error(`Missing authorize URL: ${detail.substring(0, 300)}`);
  }

  const authorizePage = await fetchWithJar(authorizeUrl, jar, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml",
      Referer: "https://www.standvirtual.com/adminpanel/login/",
    },
  });
  const authorizeHtml = await authorizePage.text();
  const authorizeStateToken = parseStateTokenFromAuthorizeHtml(authorizeHtml);
  if (!authorizeStateToken) {
    throw new Error("Missing authorize state token");
  }

  const { payload: introspectPayload } = await fetchIdxJson(
    "https://olxgroup.okta-emea.com/idp/idx/introspect",
    jar,
    { stateToken: authorizeStateToken },
    authorizeUrl,
  );

  return {
    authorizeUrl,
    authorizeHtml,
    authorizeStateToken,
    introspectPayload,
  };
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
}> {
  const userAgent = "Mozilla/5.0 PromoBuddy/1.0";
  let statsHtml = "";
  let validatedUrl = initialStatsResponse.url;

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
  };
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
      "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://olxgroup.okta-emea.com/",
    },
  });

  const enriched = await enrichOfferAdminSession(jar, finalResponse);
  const cookieHeader = enriched.finalCookieHeader;
  const finalUrl = enriched.validatedUrl || finalResponse.url;
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
    validated: enriched.validated,
    stats_contains_admin_markers: isAuthenticatedAdminHtml(enriched.statsHtml),
    params_loaded: enriched.paramsText.length > 0,
  });
}

async function completeOfferSessionFromStateToken(
  stateToken: string,
  jar: CookieJar,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const userAgent = "Mozilla/5.0 PromoBuddy/1.0";
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
  const cookieHeader = enriched.finalCookieHeader;
  const finalUrl = enriched.validatedUrl || finalResponse.url;
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  if (!enriched.validated) {
    return json({
      ok: false,
      error: "Offer admin session not authenticated after stateToken redirect",
      cookie: cookieHeader,
      final_url: finalUrl,
      validated: false,
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
    final_url: finalUrl,
    validated: enriched.validated,
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

async function pollForOfferStateToken(
  stateHandle: string,
  jar: CookieJar,
): Promise<{ stateToken: string | null; stateHandle?: string | null; detail?: string }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(2000);

    const { payload, text } = await fetchIdxJson(
      "https://olxgroup.okta-emea.com/idp/idx/authenticators/poll",
      jar,
      {
        autoChallenge: true,
        stateHandle,
      },
      "https://olxgroup.okta-emea.com/",
    );

    const nextStateHandle = getString(payload, ["stateHandle"]) || stateHandle;
    const messages = parseIdxMessages(payload);
    const status = getString(payload, ["status"]) || "";
    const factorResult = getString(payload, ["factorResult"]) || "";

    if (status === "SUCCESS" || factorResult === "SUCCESS") {
      return {
        stateToken: nextStateHandle.split("~c.")[0],
        stateHandle: nextStateHandle,
      };
    }

    if (
      status === "PENDING" ||
      status === "MFA_CHALLENGE" ||
      factorResult === "WAITING" ||
      factorResult === "PENDING" ||
      messages.some((message) => /push sent|approve/i.test(message))
    ) {
      continue;
    }

    return {
      stateToken: null,
      stateHandle: nextStateHandle,
      detail: messages.join(" | ") || text.substring(0, 500),
    };
  }

  return { stateToken: null, detail: "Timed out waiting for MFA approval." };
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
      let initialized;
      try {
        initialized = await initializeOfferIdxFlow(jar);
      } catch (error) {
        return json(
          {
            ok: false,
            error: "Failed to initialize Offer Promotion login flow",
            detail: error instanceof Error ? error.message : String(error),
          },
          502,
        );
      }

      const identify = findIdxRemediation(initialized.introspectPayload, "identify");
      if (!identify || typeof identify.href !== "string") {
        return json(
          {
            ok: false,
            error: "Offer login flow missing identify remediation",
          },
          502,
        );
      }

      const stateHandle =
        (typeof remediationFieldValue(identify, "stateHandle") === "string"
          ? (remediationFieldValue(identify, "stateHandle") as string)
          : null) || getString(initialized.introspectPayload, ["stateHandle"]);

      if (!stateHandle) {
        return json(
          {
            ok: false,
            error: "Offer login flow missing state handle",
          },
          502,
        );
      }

      const { response: identifyRes, payload: identifyPayload, text: identifyText } = await fetchIdxJson(
        identify.href,
        jar,
        {
          identifier: username,
          credentials: { passcode: password },
          rememberMe: false,
          stateHandle,
        },
        initialized.authorizeUrl,
      );

      const identifyMessages = parseIdxMessages(identifyPayload);
      if (!identifyRes.ok) {
        return json(
          {
            ok: false,
            error: `Offer authentication failed: ${identifyRes.status}`,
            detail: identifyMessages.join(" | ") || identifyText.substring(0, 500),
          },
          401,
        );
      }

      const nextStateHandle = getString(identifyPayload, ["stateHandle"]) || stateHandle;
      const preferredFactor = choosePreferredIdxFactor(identifyPayload);

      if (!preferredFactor) {
        return json(
          {
            ok: false,
            error: "Offer login did not return a supported MFA authenticator",
            detail: identifyMessages.join(" | ") || identifyText.substring(0, 500),
          },
          502,
        );
      }

      return json({
        ok: true,
        requires_mfa: true,
        state_token: encodeOfferMfaState(nextStateHandle, jar),
        authorize_url: initialized.authorizeUrl,
        factors: [preferredFactor],
        preferred_factor_id: preferredFactor.id,
        auth_path: "idx-identify",
      });
    }

    if (path === "/offer/verify-mfa" && req.method === "POST") {
      const { state_token, factor_id } = await req.json();
      if (!state_token || !factor_id) {
        return json({ ok: false, error: "Missing MFA verification fields" }, 400);
      }

      const decodedState = decodeOfferMfaState(state_token);
      if (!decodedState) {
        return json({ ok: false, error: "Invalid MFA state" }, 400);
      }

      const jar = decodedState.jar;
      const stateHandle = decodedState.stateHandle;

      const { response: challengeRes, payload: challengePayload, text: challengeText } = await fetchIdxJson(
        "https://olxgroup.okta-emea.com/idp/idx/challenge",
        jar,
        {
          authenticator: {
            id: factor_id,
            methodType: "push",
          },
          stateHandle,
        },
        "https://olxgroup.okta-emea.com/",
      );

      const challengeMessages = parseIdxMessages(challengePayload);
      if (!challengeRes.ok) {
        return json(
          {
            ok: false,
            error: `Offer MFA challenge failed: ${challengeRes.status}`,
            detail: challengeMessages.join(" | ") || challengeText.substring(0, 500),
          },
          401,
        );
      }

      const challengeStateHandle = getString(challengePayload, ["stateHandle"]) || stateHandle;
      const polled = await pollForOfferStateToken(challengeStateHandle, jar);
      if (!polled.stateToken) {
        return json(
          {
            ok: false,
            error: "MFA approval did not complete successfully",
            detail: polled.detail || challengeMessages.join(" | ") || challengeText.substring(0, 500),
          },
          502,
        );
      }

      return await completeOfferSessionFromStateToken(polled.stateToken, jar, supabaseAdmin);
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
