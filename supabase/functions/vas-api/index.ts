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

const OKTA_IDX_ACCEPT = "application/json; okta-version=1.0.0";
const OKTA_IDX_ION = "application/ion+json; okta-version=1.0.0";
const OKTA_USER_AGENT_EXTENDED = "okta-auth-js/7.14.2 okta-signin-widget-7.45.2 okta-hosted";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

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

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildInvestmentCurl(url: string, payload: Record<string, unknown>, headers: Record<string, string>): string {
  const headerParts = Object.entries(headers).flatMap(([name, value]) => [
    "-H",
    shellSingleQuote(`${name}: ${value}`),
  ]);

  return [
    "curl",
    shellSingleQuote(url),
    "-X",
    "POST",
    ...headerParts,
    "--data-raw",
    shellSingleQuote(JSON.stringify(payload)),
  ].join(" ");
}

function buildBearerToken(accessToken: string): string {
  const trimmedToken = accessToken.trim();
  return trimmedToken.toLowerCase().startsWith("bearer ")
    ? trimmedToken
    : `Bearer ${trimmedToken}`;
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

function cloneCookieJar(jar: CookieJar): CookieJar {
  return new Map(jar);
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

async function validateOfferAdminCookie(cookieHeader: string): Promise<{ ok: boolean; finalUrl: string; status: number }> {
  const response = await fetch("https://www.standvirtual.com/adminpanel/stats/", {
    method: "GET",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": OFFER_BROWSER_USER_AGENT,
      Cookie: cookieHeader,
    },
    redirect: "follow",
  });

  const finalUrl = response.url || "";
  const lowerUrl = finalUrl.toLowerCase();
  const redirectedToLogin =
    lowerUrl.includes("/adminpanel/login") ||
    lowerUrl.includes("olxgroup.okta-emea.com");

  return {
    ok: response.ok && !redirectedToLogin,
    finalUrl,
    status: response.status,
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
        "User-Agent": OFFER_BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    hops += 1;
  }

  return response;
}

function extractHtmlRedirectUrl(html: string, baseUrl: string): string | null {
  const concatenatedJsRedirect = html.match(
    /(?:window\.)?location\.replace\(\s*((?:(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*')\s*(?:\+\s*)?)*)\s*\)/i,
  )?.[1];
  if (concatenatedJsRedirect) {
    const parts = [...concatenatedJsRedirect.matchAll(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'/g)]
      .map((match) => decodeJsStringLiteral(match[0]));
    if (parts.length > 0) {
      const resolved = resolveHtmlRedirectUrl(parts.join(""), baseUrl);
      if (resolved) return resolved;
    }
  }

  const patterns = [
    /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i,
    /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /document\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /location\.replace\(\s*["']([^"']+)["']\s*\)/i,
    /location\.assign\(\s*["']([^"']+)["']\s*\)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const resolved = resolveHtmlRedirectUrl(match[1], baseUrl);
    if (resolved) return resolved;
  }

  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : _;
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeJsStringLiteral(literal: string): string {
  const quote = literal[0];
  const raw = literal.endsWith(quote) ? literal.slice(1, -1) : literal;
  return raw
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function resolveHtmlRedirectUrl(rawValue: string, baseUrl: string): string | null {
  const decoded = decodeHtmlEntities(rawValue.trim());
  const normalized = decoded.replace(/^\/login\/(https?:\/\/)/i, "$1");

  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractHtmlFormRedirect(
  html: string,
  baseUrl: string,
): { url: string; method: "GET" | "POST"; body: URLSearchParams } | null {
  const formMatch = html.match(/<form\b([^>]*)>([\s\S]*?)<\/form>/i);
  if (!formMatch) return null;

  const [, rawAttrs, formInnerHtml] = formMatch;
  const actionMatch = rawAttrs.match(/\baction=["']([^"']+)["']/i);
  const methodMatch = rawAttrs.match(/\bmethod=["']([^"']+)["']/i);

  if (!actionMatch?.[1]) return null;

  const url = resolveHtmlRedirectUrl(actionMatch[1], baseUrl);
  if (!url) return null;

  const method = (methodMatch?.[1] || "GET").trim().toUpperCase() === "POST" ? "POST" : "GET";
  const body = new URLSearchParams();
  const inputRegex = /<input\b([^>]*)>/gi;

  for (const match of formInnerHtml.matchAll(inputRegex)) {
    const attrs = match[1];
    const nameMatch = attrs.match(/\bname=["']([^"']+)["']/i);
    if (!nameMatch?.[1]) continue;
    const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i);
    const inputType = (typeMatch?.[1] || "text").trim().toLowerCase();
    if (["submit", "button", "image", "file", "reset"].includes(inputType)) continue;
    const valueMatch = attrs.match(/\bvalue=["']([^"']*)["']/i);
    body.append(decodeHtmlEntities(nameMatch[1]), decodeHtmlEntities(valueMatch?.[1] || ""));
  }

  return { url, method, body };
}

function summarizeHtmlRedirectMechanism(html: string): Record<string, unknown> {
  const formMatch = html.match(/<form\b([^>]*)>([\s\S]*?)<\/form>/i);
  const formAction = formMatch?.[1]?.match(/\baction=["']([^"']+)["']/i)?.[1] ?? null;
  const formMethod = formMatch?.[1]?.match(/\bmethod=["']([^"']+)["']/i)?.[1]?.toUpperCase() ?? null;
  const inputCount = formMatch
    ? Array.from(formMatch[2].matchAll(/<input\b/gi)).length
    : 0;
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return {
    has_meta_refresh: /<meta[^>]+http-equiv=["']refresh["']/i.test(html),
    has_js_location: /window\.location|document\.location|location\.replace|location\.assign/i.test(html),
    has_form: Boolean(formMatch),
    form_action: formAction ? decodeHtmlEntities(formAction) : null,
    form_method: formMethod,
    form_input_count: inputCount,
    has_auto_submit_script: /document\.forms(?:\[\d+\])?[\s\S]{0,120}\.submit\(\)|\.submit\(\)/i.test(html),
    title: titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
  };
}

function decodeJsHexEscapes(value: string): string {
  return value
    .replace(/\\x([0-9a-f]{2})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function extractOktaPageStateToken(html: string): string | null {
  const match = html.match(/var\s+stateToken\s*=\s*'([^']+)'/i);
  if (!match?.[1]) return null;
  return decodeJsHexEscapes(match[1]);
}

function getIdxRemediations(payload: Record<string, unknown>): Record<string, unknown>[] {
  const remediation = asRecord(payload.remediation);
  return asArray(remediation?.value).map(asRecord).filter(Boolean) as Record<string, unknown>[];
}

function getIdxRemediation(
  payload: Record<string, unknown>,
  names: string[],
): Record<string, unknown> | null {
  const wanted = new Set(names);
  return getIdxRemediations(payload).find((remediation) =>
    typeof remediation.name === "string" && wanted.has(remediation.name)
  ) ?? null;
}

function getIdxRemediationNames(payload: Record<string, unknown>): string[] {
  return getIdxRemediations(payload)
    .map((remediation) => typeof remediation.name === "string" ? remediation.name : null)
    .filter((name): name is string => Boolean(name));
}

function hasIdxDeviceChallengePoll(payload: Record<string, unknown>): boolean {
  return getIdxRemediationNames(payload).includes("device-challenge-poll");
}

function getIdxSyntheticPushFactor(payload: Record<string, unknown>): OfferFactor | null {
  const challenge = asRecord(payload.authenticatorChallenge);
  const value = asRecord(challenge?.value);
  const current = asRecord(payload.currentAuthenticatorEnrollment);
  const currentValue = asRecord(current?.value);
  const displayName =
    (typeof value?.displayName === "string" && value.displayName) ||
    (typeof currentValue?.displayName === "string" && currentValue.displayName) ||
    "Okta Verify Push";
  const key =
    (typeof value?.key === "string" && value.key) ||
    (typeof currentValue?.key === "string" && currentValue.key) ||
    "okta_verify";

  if (!hasIdxDeviceChallengePoll(payload) && !challenge) {
    return null;
  }

  return {
    id: "idx-device-challenge",
    factorType: "push",
    provider: key,
    vendorName: displayName,
    label: displayName,
  };
}

function buildIdxRemediationPayload(
  schema: unknown,
  provided: Record<string, unknown>,
  path = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of asArray(schema)) {
    const entry = asRecord(field);
    const name = typeof entry?.name === "string" ? entry.name : null;
    if (!name) continue;

    const fieldPath = path ? `${path}.${name}` : name;
    const nestedForm = asRecord(entry.form);
    const providedValue = Object.prototype.hasOwnProperty.call(provided, fieldPath)
      ? provided[fieldPath]
      : undefined;

    if (nestedForm?.value) {
      const nestedPayload = buildIdxRemediationPayload(nestedForm.value, provided, fieldPath);
      if (Object.keys(nestedPayload).length > 0) {
        result[name] = nestedPayload;
      } else if (providedValue && typeof providedValue === "object") {
        result[name] = providedValue;
      }
      continue;
    }

    if (providedValue !== undefined) {
      result[name] = providedValue;
      continue;
    }

    if (typeof entry.value === "string" || typeof entry.value === "number" || typeof entry.value === "boolean") {
      result[name] = entry.value;
    }
  }

  return result;
}

async function postIdxJson(
  url: string,
  jar: CookieJar,
  body: Record<string, unknown>,
  contentType: string,
  referer: string,
): Promise<Record<string, unknown>> {
  const response = await fetchWithJar(url, jar, {
    method: "POST",
    headers: {
      "User-Agent": OFFER_BROWSER_USER_AGENT,
      Accept: OKTA_IDX_ACCEPT,
      "Content-Type": contentType,
      Origin: "https://olxgroup.okta-emea.com",
      Referer: referer,
      "X-Okta-User-Agent-Extended": OKTA_USER_AGENT_EXTENDED,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let jsonBody: Record<string, unknown> = {};
  try {
    jsonBody = text ? JSON.parse(text) : {};
  } catch {
    jsonBody = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      (typeof jsonBody.messages === "object" && jsonBody.messages && JSON.stringify(jsonBody.messages)) ||
      (typeof jsonBody.errorSummary === "string" && jsonBody.errorSummary) ||
      text.substring(0, 500) ||
      `Okta IDX request failed: ${response.status}`,
    );
  }

  return jsonBody;
}

async function postIdxRemediation(
  remediation: Record<string, unknown>,
  jar: CookieJar,
  provided: Record<string, unknown>,
  referer: string,
): Promise<Record<string, unknown>> {
  const href = typeof remediation.href === "string" ? remediation.href : null;
  const method = typeof remediation.method === "string" ? remediation.method.toUpperCase() : "POST";
  if (!href || method !== "POST") {
    throw new Error("Okta remediation is missing a POST target.");
  }

  const payload = buildIdxRemediationPayload(remediation.value, provided);
  return await postIdxJson(href, jar, payload, "application/json", referer);
}

function findIdxStateHandleDeep(value: unknown, depth = 0): string | null {
  if (depth > 8) return null;
  if (typeof value === "string") {
    return value.startsWith("02.id.") ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findIdxStateHandleDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  if (typeof record.stateHandle === "string" && record.stateHandle.startsWith("02.id.")) {
    return record.stateHandle;
  }

  for (const nested of Object.values(record)) {
    const found = findIdxStateHandleDeep(nested, depth + 1);
    if (found) return found;
  }

  return null;
}

function parseIdxStateHandle(payload: Record<string, unknown>): string | null {
  const deep = findIdxStateHandleDeep(payload);
  if (deep) return deep;
  if (typeof payload.stateHandle === "string") return payload.stateHandle;
  return null;
}

function getIdxCompletionUrl(payload: Record<string, unknown>): string | null {
  const remediations = getIdxRemediations(payload);
  for (const remediation of remediations) {
    const href = typeof remediation.href === "string" ? remediation.href : null;
    if (!href) continue;
    if (
      href.includes("/login/token/redirect") ||
      href.includes("/oauth2/default/v1/authorize/redirect")
    ) {
      return href;
    }
  }
  return null;
}

function parseOfferIdxFactors(payload: Record<string, unknown>): OfferFactor[] {
  const authenticators = asRecord(payload.authenticators);
  const values = asArray(authenticators?.value);
  const factors: OfferFactor[] = [];

  for (const item of values) {
    const authenticator = asRecord(item);
    if (!authenticator) continue;
    const id = typeof authenticator.id === "string" ? authenticator.id : null;
    if (!id) continue;

    const methods = asArray(authenticator.methods);
    for (const methodItem of methods) {
      const method = asRecord(methodItem);
      const methodType = typeof method?.type === "string" ? method.type : null;
      if (!methodType) continue;
      factors.push({
        id,
        factorType: methodType,
        provider: typeof authenticator.key === "string" ? authenticator.key : null,
        vendorName: typeof authenticator.displayName === "string" ? authenticator.displayName : null,
        label: typeof authenticator.label === "string"
          ? authenticator.label
          : typeof authenticator.displayName === "string"
            ? authenticator.displayName
            : null,
      });
    }
  }

  return factors;
}

function parseOfferIdxFactorsFromRemediationOptions(payload: Record<string, unknown>): OfferFactor[] {
  const factors: OfferFactor[] = [];
  for (const remediation of getIdxRemediations(payload)) {
    const fields = asArray(remediation.value).map(asRecord).filter(Boolean) as Record<string, unknown>[];
    const authenticatorField = fields.find((field) => field.name === "authenticator");
    if (!authenticatorField) continue;
    const options = asArray(authenticatorField.options).map(asRecord).filter(Boolean) as Record<string, unknown>[];
    for (const option of options) {
      const optionValue = asRecord(option.value);
      const form = asRecord(optionValue?.form);
      const formFields = asArray(form?.value).map(asRecord).filter(Boolean) as Record<string, unknown>[];
      const idField = formFields.find((field) => field.name === "id");
      const methodField = formFields.find((field) => field.name === "methodType");
      const id = typeof idField?.value === "string" ? idField.value : null;
      const methodType = typeof methodField?.value === "string" ? methodField.value : null;
      if (!id || !methodType) continue;
      factors.push({
        id,
        factorType: methodType,
        provider: null,
        vendorName: typeof option.label === "string" ? option.label : null,
        label: typeof option.label === "string" ? option.label : null,
      });
    }
  }
  return factors;
}

function mergeOfferFactors(...groups: OfferFactor[][]): OfferFactor[] {
  const merged: OfferFactor[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const factor of group) {
      const key = `${factor.id}::${factor.factorType.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(factor);
    }
  }
  return merged;
}

async function followOfferHtmlRedirects(
  initialResponse: Response,
  jar: CookieJar,
  limit = 3,
): Promise<{ response: Response; redirectChain: string[]; lastHtml: string }> {
  let response = initialResponse;
  let lastHtml = await response.clone().text().catch(() => "");
  const redirectChain: string[] = [];

  for (let hop = 0; hop < limit; hop += 1) {
    const nextUrl = extractHtmlRedirectUrl(lastHtml, response.url);
    const formRedirect = nextUrl ? null : extractHtmlFormRedirect(lastHtml, response.url);
    if (!nextUrl && !formRedirect) break;

    if (nextUrl) {
      redirectChain.push(nextUrl);
      response = await followRedirects(
        nextUrl,
        jar,
        {
          method: "GET",
          headers: {
            "User-Agent": OFFER_BROWSER_USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            Referer: response.url,
          },
        },
      );
    } else if (formRedirect) {
      const targetUrl = formRedirect.method === "GET"
        ? `${formRedirect.url}${formRedirect.url.includes("?") ? "&" : "?"}${formRedirect.body.toString()}`
        : formRedirect.url;
      redirectChain.push(`${formRedirect.method} ${targetUrl}`);
      response = await followRedirects(
        targetUrl,
        jar,
        {
          method: formRedirect.method,
          headers: {
            "User-Agent": OFFER_BROWSER_USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            Referer: response.url,
            ...(formRedirect.method === "POST"
              ? { "Content-Type": "application/x-www-form-urlencoded" }
              : {}),
          },
          ...(formRedirect.method === "POST"
            ? { body: formRedirect.body.toString() }
            : {}),
        },
      );
    }
    lastHtml = await response.clone().text().catch(() => "");
  }

  return { response, redirectChain, lastHtml };
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
    "/adminpanel/usercards/",
    "ads_display_type",
    "user_id",
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
  const paramsLooksAuthenticated =
    paramsRes.status === 200 &&
    paramsText.trim().length > 0 &&
    !paramsRes.url.includes("/adminpanel/login") &&
    !paramsText.toLowerCase().includes("<html") &&
    !paramsText.toLowerCase().includes("login");

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
  const usercardsHtml = await usercardsRes.text().catch(() => "");
  const usercardsLooksAuthenticated =
    usercardsStatus === 200 &&
    !usercardsUrl.includes("/adminpanel/login") &&
    !usercardsHtml.toLowerCase().includes("login");

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
  const statsLooksAuthenticated =
    !validatedUrl.includes("/adminpanel/login") &&
    isAuthenticatedAdminHtml(statsHtml);
  const validationLooksAuthenticated = isAuthenticatedAdminHtml(validationHtml);
  const validated =
    validationRes.status === 200 &&
    !validatedUrl.includes("/adminpanel/login") &&
    (
      validationLooksAuthenticated ||
      statsLooksAuthenticated ||
      paramsLooksAuthenticated ||
      usercardsLooksAuthenticated
    );

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
  const runSessionTokenAttempt = async (
    initialUrl: string,
    authPath: string,
  ) => {
    const finalResponse = await followRedirects(initialUrl, jar, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://olxgroup.okta-emea.com/",
      },
    });
    const postAuth = await followOfferHtmlRedirects(finalResponse, jar);
    const enriched = await enrichOfferAdminSession(jar, postAuth.response);
    const cookieHeader = buildOfferStandvirtualCookieHeader(jar);
    const finalUrl = enriched.validatedUrl || postAuth.response.url;

    return { postAuth, enriched, cookieHeader, finalUrl, authPath };
  };

  const authorizeWithSession = new URL(authorizeUrl);
  authorizeWithSession.searchParams.set("sessionToken", sessionToken);
  let attempt = await runSessionTokenAttempt(
    authorizeWithSession.toString(),
    "sessionTokenRedirect",
  );

  const certErrorDetected =
    attempt.postAuth.response.url.includes("/auth/cert/primaryAuth") ||
    attempt.postAuth.lastHtml.includes("piv.card.error.empty") ||
    attempt.postAuth.lastHtml.includes("/cert/error");

  if (!attempt.enriched.validated && certErrorDetected) {
    const sessionCookieRedirect = new URL("https://olxgroup.okta-emea.com/login/sessionCookieRedirect");
    sessionCookieRedirect.searchParams.set("token", sessionToken);
    sessionCookieRedirect.searchParams.set("redirectUrl", authorizeUrl);
    attempt = await runSessionTokenAttempt(
      sessionCookieRedirect.toString(),
      "sessionCookieRedirect",
    );
  }

  const { postAuth, enriched, cookieHeader, finalUrl, authPath } = attempt;
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
      post_auth_url: postAuth.response.url,
      html_redirect_chain: postAuth.redirectChain,
      post_auth_debug: summarizeHtmlRedirectMechanism(postAuth.lastHtml),
      post_auth_snippet: postAuth.lastHtml.substring(0, 500),
      auth_path: authPath,
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
    post_auth_url: postAuth.response.url,
    html_redirect_chain: postAuth.redirectChain,
    auth_path: authPath,
  });
}

async function completeOfferSessionFromStateToken(
  stateToken: string,
  jar: CookieJar,
  supabaseAdmin: ReturnType<typeof createClient>,
  authorizeUrl?: string,
  completionUrl?: string,
) {
  const userAgent = OFFER_BROWSER_USER_AGENT;
  const runStateTokenAttempt = async (
    initialUrl: string,
    authPath: string,
  ) => {
    const finalResponse = await followRedirects(initialUrl, jar, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://olxgroup.okta-emea.com/",
      },
    });
    const postAuth = await followOfferHtmlRedirects(finalResponse, jar);
    const enriched = await enrichOfferAdminSession(jar, postAuth.response);
    const cookieHeader = buildOfferStandvirtualCookieHeader(jar);
    const finalUrl = enriched.validatedUrl || postAuth.response.url;
    return { postAuth, enriched, cookieHeader, finalUrl, authPath };
  };

  const oktaRedirectUrl =
    completionUrl ||
    `https://olxgroup.okta-emea.com/login/token/redirect?stateToken=${encodeURIComponent(stateToken)}`;
  let attempt = await runStateTokenAttempt(oktaRedirectUrl, "stateTokenRedirect");

  const hasCertError = (current: typeof attempt) =>
    current.postAuth.response.url.includes("/auth/cert/primaryAuth") ||
    current.postAuth.response.url.includes("/cert/error") ||
    current.postAuth.redirectChain.some((entry) => entry.includes("/login/cert") || entry.includes("/auth/cert/primaryAuth")) ||
    current.postAuth.lastHtml.includes("piv.card.error.empty") ||
    current.postAuth.lastHtml.includes("/cert/error");
  const isOktaHome = (current: typeof attempt) =>
    current.postAuth.response.url.includes("olxgroup.okta-emea.com/app/UserHome");

  // First retry through Standvirtual's own Okta entrypoint to preserve app context.
  if (!attempt.enriched.validated && (isOktaHome(attempt) || hasCertError(attempt) || attempt.finalUrl.includes("/adminpanel/login/"))) {
    attempt = await runStateTokenAttempt(
      "https://www.standvirtual.com/adminpanel/login/loginwithokta/",
      "stateTokenRedirect+loginwithokta",
    );
  }

  const shouldRetryWithAuthorize =
    !attempt.enriched.validated &&
    Boolean(authorizeUrl) &&
    (
      isOktaHome(attempt) ||
      attempt.finalUrl.includes("/adminpanel/login/")
    ) &&
    !hasCertError(attempt);

  if (shouldRetryWithAuthorize && authorizeUrl) {
    const resumeAuthorizeUrl = new URL(authorizeUrl);
    // We only need app-context callback; keep current browser session context.
    resumeAuthorizeUrl.searchParams.delete("sessionToken");
    attempt = await runStateTokenAttempt(
      resumeAuthorizeUrl.toString(),
      "stateTokenRedirect+authorize",
    );
  }

  const { postAuth, enriched, cookieHeader, finalUrl, authPath } = attempt;
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
      post_auth_url: postAuth.response.url,
      html_redirect_chain: postAuth.redirectChain,
      post_auth_debug: summarizeHtmlRedirectMechanism(postAuth.lastHtml),
      post_auth_snippet: postAuth.lastHtml.substring(0, 500),
      auth_path: authPath,
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
    post_auth_url: postAuth.response.url,
    html_redirect_chain: postAuth.redirectChain,
    auth_path: authPath,
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
    if (type === "totp" || type === "otp" || type === "token:software:totp") return 120;
    if (type === "push" && provider === "okta_verify") return 100;
    if (type === "push" && provider === "okta") return 95;
    if (type === "push") return 90;
    if (vendor.includes("push")) return 80;
    if (type === "signed_nonce") return 20;
    if (vendor.includes("fastpass")) return 10;
    return 0;
  };

  return [...factors].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function isPasscodeFactorType(factorType: string): boolean {
  const t = factorType.toLowerCase();
  return t === "totp" || t === "otp" || t === "token:software:totp";
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

async function pollForOfferIdxStateToken(
  stateHandle: string,
  jar: CookieJar,
): Promise<{ stateToken: string | null; detail?: string }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(2000);

    const pollJson = await postIdxJson(
      "https://olxgroup.okta-emea.com/idp/idx/authenticators/poll",
      jar,
      {
        autoChallenge: true,
        stateHandle,
      },
      OKTA_IDX_ION,
      "https://olxgroup.okta-emea.com/",
    ).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

    if (typeof pollJson.error === "string") {
      return { stateToken: null, detail: pollJson.error };
    }

    const returnedStateHandle = parseIdxStateHandle(pollJson) || stateHandle;
    const remediation = getIdxRemediations(pollJson);
    const hasPendingChallenge = remediation.some((item) =>
      typeof item.name === "string" && item.name.includes("challenge")
    );
    const hasSuccessRedirect = remediation.some((item) =>
      typeof item.href === "string" && item.href.includes("/login/token/redirect")
    );

    if (hasSuccessRedirect || (!hasPendingChallenge && returnedStateHandle !== stateHandle)) {
      return { stateToken: returnedStateHandle };
    }
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
    if (path === "/offer/manual-cookie" && req.method === "POST") {
      const { cookie } = await req.json();
      const cookieHeader = typeof cookie === "string" ? cookie.trim() : "";

      if (!cookieHeader) {
        return json({ ok: false, error: "Missing cookie value" }, 400);
      }

      if (!cookieHeader.includes("=")) {
        return json({ ok: false, error: "Invalid cookie format" }, 400);
      }

      const validation = await validateOfferAdminCookie(cookieHeader);
      if (!validation.ok) {
        return json({
          ok: false,
          error: "Cookie is not authenticated for Standvirtual admin",
          detail: validation.finalUrl || `HTTP ${validation.status}`,
        }, 401);
      }

      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      const { data: offerSession, error: offerSessionError } = await supabaseAdmin
        .from("offer_sessions")
        .insert({
          cookie_header: cookieHeader,
          expires_at: expiresAt,
        })
        .select("offer_session_id")
        .single();

      if (offerSessionError || !offerSession) {
        return json({ ok: false, error: "Failed to create Offer session" }, 500);
      }

      return json({
        ok: true,
        offer_session_id: offerSession.offer_session_id,
        message: "Offer session cookie validated.",
      });
    }

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
      const authorizeFlowUrl = new URL(authorizeUrl);
      const authorizeFlowUrlString = authorizeFlowUrl.toString();

      const authorizePage = await fetchWithJar(authorizeFlowUrlString, jar, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          Referer: "https://www.standvirtual.com/adminpanel/login/",
        },
      });
      const authorizeHtml = await authorizePage.text();
      const pageStateToken = extractOktaPageStateToken(authorizeHtml);
      if (!pageStateToken) {
        return json({
          ok: false,
          error: "Failed to bootstrap Okta IDX login flow",
          detail: authorizeHtml.substring(0, 500),
        }, 502);
      }

      let idxJson: Record<string, unknown>;
      try {
        idxJson = await postIdxJson(
          "https://olxgroup.okta-emea.com/idp/idx/introspect",
          jar,
          { stateToken: pageStateToken },
          OKTA_IDX_ION,
          authorizeFlowUrlString,
        );
      } catch (error) {
        return json({
          ok: false,
          error: "Failed to start Okta IDX login flow",
          detail: error instanceof Error ? error.message : String(error),
        }, 502);
      }

      const identifyRemediation = getIdxRemediation(idxJson, ["identify", "identify-authenticator"]);
      if (identifyRemediation) {
        try {
          idxJson = await postIdxRemediation(
            identifyRemediation,
            jar,
            {
              identifier: username,
              "credentials.passcode": password,
            },
            authorizeFlowUrlString,
          );
        } catch (error) {
          return json({
            ok: false,
            error: "Offer authentication failed",
            detail: error instanceof Error ? error.message : String(error),
            step: "identify",
          }, 401);
        }
      } else {
        const bootstrapStateHandle = parseIdxStateHandle(idxJson);
        if (bootstrapStateHandle && hasIdxDeviceChallengePoll(idxJson)) {
          try {
            idxJson = await postIdxJson(
              "https://olxgroup.okta-emea.com/idp/idx/authenticators/poll",
              jar,
              { stateHandle: bootstrapStateHandle },
              "application/json",
              authorizeFlowUrlString,
            );
          } catch {
            // Best-effort refresh of the current IDX transaction.
          }
        }
      }

      const passwordRemediation = getIdxRemediation(idxJson, ["challenge-authenticator", "challenge-poll"]);
      const passwordLikeRemediation = passwordRemediation && JSON.stringify(passwordRemediation).includes("passcode")
        ? passwordRemediation
        : getIdxRemediations(idxJson).find((remediation) => JSON.stringify(remediation).includes("passcode")) ?? null;

      if (passwordLikeRemediation) {
        try {
          idxJson = await postIdxRemediation(
            passwordLikeRemediation,
            jar,
            {
              "credentials.passcode": password,
            },
            authorizeFlowUrlString,
          );
        } catch (error) {
          return json({
            ok: false,
            error: "Offer authentication failed",
            detail: error instanceof Error ? error.message : String(error),
            step: "challenge-answer-password",
          }, 401);
        }
      }

      const idxStateHandle = parseIdxStateHandle(idxJson);
      if (!idxStateHandle) {
        return json({
          ok: false,
          error: "Okta IDX did not return a state handle",
        }, 502);
      }

      const factors = mergeOfferFactors(
        parseOfferIdxFactors(idxJson),
        parseOfferIdxFactorsFromRemediationOptions(idxJson),
      );
      const idxCompletionUrl = getIdxCompletionUrl(idxJson);
      const preferredFactor = choosePreferredOfferFactor(factors);
      if (!preferredFactor) {
        const redirected = await completeOfferSessionFromStateToken(
          idxStateHandle,
          jar,
          supabaseAdmin,
          authorizeFlowUrlString,
          idxCompletionUrl ?? undefined,
        );
        return redirected;
      }

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
        state_token: idxStateHandle,
        authorize_url: authorizeFlowUrlString,
        factors,
        preferred_factor_id: preferredFactor.id,
      });
    }

    if (path === "/offer/verify-mfa" && req.method === "POST") {
      const { state_token, factor_id, authorize_url, factor_type, passcode } = await req.json();
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
      const chosenMethodType = typeof factor_type === "string" && factor_type.trim().length > 0
        ? factor_type.toLowerCase()
        : "push";
      const expectsPasscode = isPasscodeFactorType(chosenMethodType);
      if (expectsPasscode && (!passcode || String(passcode).trim().length === 0)) {
        return json({ ok: false, error: "MFA code is required for this method." }, 400);
      }
      if (expectsPasscode && factor_id === "idx-device-challenge") {
        return json({
          ok: false,
          error: "Code MFA is not available for this challenge. Please start login again.",
        }, 409);
      }

      if (factor_id === "idx-device-challenge" && !expectsPasscode) {
        const polled = await pollForOfferIdxStateToken(state_token, jar);
        if (!polled.stateToken) {
          return json({
            ok: false,
            error: "MFA approval did not complete successfully",
            detail: polled.detail || "Timed out waiting for device challenge approval.",
          }, 502);
        }

        return await completeOfferSessionFromStateToken(
          polled.stateToken,
          cloneCookieJar(jar),
          supabaseAdmin,
          authorize_url,
        );
      }

      let idxJson: Record<string, unknown>;
      try {
        idxJson = await postIdxJson(
          "https://olxgroup.okta-emea.com/idp/idx/challenge",
          jar,
          {
            authenticator: {
              id: factor_id,
              methodType: chosenMethodType,
            },
            stateHandle: state_token,
          },
          OKTA_IDX_ION,
          authorize_url,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (detail.includes("Expected: IDENTIFY")) {
          return json({
            ok: false,
            error: "MFA state became invalid. Please start login again.",
            detail,
          }, 409);
        }
        return json({
          ok: false,
          error: "Offer MFA verification failed",
          detail,
        }, 401);
      }

      if (expectsPasscode) {
        const codeRemediation =
          getIdxRemediation(idxJson, ["challenge-authenticator", "challenge-poll"]) ??
          getIdxRemediations(idxJson).find((remediation) => JSON.stringify(remediation).includes("passcode")) ??
          null;

        if (!codeRemediation) {
          return json({
            ok: false,
            error: "MFA code challenge was not returned by Okta",
            detail: JSON.stringify({
              remediations: getIdxRemediationNames(idxJson),
              keys: Object.keys(idxJson),
            }).substring(0, 500),
          }, 502);
        }

        try {
          idxJson = await postIdxRemediation(
            codeRemediation,
            jar,
            {
              "credentials.totp": String(passcode).trim(),
              "credentials.passcode": String(passcode).trim(),
            },
            authorize_url,
          );
        } catch (error) {
          return json({
            ok: false,
            error: "MFA code verification failed",
            detail: error instanceof Error ? error.message : String(error),
          }, 401);
        }

        const codeStateHandle = parseIdxStateHandle(idxJson) || state_token;
        const idxCompletionUrl = getIdxCompletionUrl(idxJson);
        return await completeOfferSessionFromStateToken(
          codeStateHandle,
          cloneCookieJar(jar),
          supabaseAdmin,
          authorize_url,
          idxCompletionUrl ?? undefined,
        );
      }

      const nextStateHandle = parseIdxStateHandle(idxJson) || state_token;
      const polled = await pollForOfferIdxStateToken(nextStateHandle, jar);
      if (!polled.stateToken) {
        return json({
          ok: false,
          error: "MFA approval did not complete successfully",
          detail: polled.detail || JSON.stringify(idxJson).substring(0, 500),
        }, 502);
      }

      return await completeOfferSessionFromStateToken(
        polled.stateToken,
        cloneCookieJar(jar),
        supabaseAdmin,
        authorize_url,
        undefined,
      );
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
        const loginUrlMarker = "https://www.standvirtual.com/adminpanel/login/";
        const paymentUrlMarker = "https://www.standvirtual.com/adminpanel/pagamento/";
        const statsRedirectedToLogin = statsRes.url.includes(loginUrlMarker);
        const paymentRedirectedToLogin = finalUrl.includes(loginUrlMarker);
        const responseContainsLoginUrl = responseText.includes(loginUrlMarker);
        const paymentLandedOnPagamento = finalUrl.startsWith(paymentUrlMarker);
        const successStatus = status === 200 || status === 201 || status === 202;
        const success =
          successStatus &&
          paymentLandedOnPagamento &&
          !paymentRedirectedToLogin;
        const message = success
          ? "Offer promotion request completed successfully."
          : statsRedirectedToLogin
            ? "Standvirtual redirected to login. The captured cookie is not valid for this request."
          : paymentRedirectedToLogin
            ? "Standvirtual redirected the payment request. The session is valid, but this promotion may not be available for this advert or current state."
          : !paymentLandedOnPagamento
            ? "Standvirtual did not return to the payment page for this request."
          : responseContainsLoginUrl
            ? "Standvirtual returned a login-like response for the payment request. Check this advert and promotion eligibility."
          : responseText.substring(0, 500) || `HTTP ${status}`;

        return json({
          success,
          advert,
          promotion,
          status,
          finalUrl,
          statsUrl: statsRes.url,
          statsRedirectedToLogin,
          paymentRedirectedToLogin,
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

      const promotionId = Number(promotion);
      if (!Number.isSafeInteger(promotionId)) {
        return json({
          success: false,
          advert,
          promotion,
          status: 400,
          errorMessage: "Promotion must be a numeric ID",
        }, 400);
      }

      try {
        const upstreamUrl = `${session.base_url}/account/adverts/${encodeURIComponent(advert)}/promotions/`;
        const upstreamPayload = {
          payment_type: "account",
          promotion_ids: [promotionId],
        };
        const upstreamHeaders = {
          Accept: "*/*",
          "Content-Type": "application/json",
          Authorization: buildBearerToken(session.access_token),
          "Cache-Control": "no-cache",
          "User-Agent": "PostmanRuntime/7.44.1",
        };
        const upstreamCurl = buildInvestmentCurl(upstreamUrl, upstreamPayload, upstreamHeaders);
        const upstreamRes = await fetch(
          upstreamUrl,
          {
            method: "POST",
            headers: upstreamHeaders,
            body: JSON.stringify(upstreamPayload),
          }
        );

        const status = upstreamRes.status;

        if (status === 200 || status === 201 || status === 202) {
          return json({ success: true, advert, promotion, status, upstreamUrl, upstreamPayload, upstreamCurl });
        }

        let errorMessage = `HTTP ${status}`;
        try {
          const errBody = await upstreamRes.text();
          if (errBody) errorMessage = errBody.substring(0, 500);
        } catch {}

        return json({ success: false, advert, promotion, status, errorMessage, upstreamUrl, upstreamPayload, upstreamCurl });
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
