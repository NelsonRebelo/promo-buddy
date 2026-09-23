import { supabase } from "@/integrations/supabase/client";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vas-api`;
const SESSION_KEY = "vas_session_id";
const OFFER_SESSION_KEY = "offer_session_id";
const OFFER_MFA_KEY = "offer_mfa_challenge";
const AUTH_EMAIL_KEY = "promo_buddy_auth_email";
const ORDER_REQUEST_TIMEOUT_MS = 30000;

function setAuthEmail(email: string) {
  localStorage.setItem(AUTH_EMAIL_KEY, email.trim().toLowerCase());
}

function clearAuthEmail() {
  localStorage.removeItem(AUTH_EMAIL_KEY);
}

export function getStoredAuthEmail(): string | null {
  return localStorage.getItem(AUTH_EMAIL_KEY);
}

function getSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

function setSessionId(id: string) {
  localStorage.setItem(SESSION_KEY, id);
}

function clearSessionId() {
  localStorage.removeItem(SESSION_KEY);
}

function getOfferSessionId(): string | null {
  return localStorage.getItem(OFFER_SESSION_KEY);
}

function setOfferSessionId(id: string) {
  localStorage.setItem(OFFER_SESSION_KEY, id);
}

function clearOfferSessionId() {
  localStorage.removeItem(OFFER_SESSION_KEY);
}

export type OfferMfaFactor = {
  id: string;
  factorType: string;
  provider?: string | null;
  vendorName?: string | null;
  label?: string | null;
  verifyHref?: string | null;
};

export type OfferMfaChallenge = {
  state_token: string;
  authorize_url: string;
  factors: OfferMfaFactor[];
  preferred_factor_id?: string | null;
};

function setOfferMfaChallenge(challenge: OfferMfaChallenge) {
  localStorage.setItem(OFFER_MFA_KEY, JSON.stringify(challenge));
}

export function getOfferMfaChallenge(): OfferMfaChallenge | null {
  const raw = localStorage.getItem(OFFER_MFA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OfferMfaChallenge;
  } catch {
    return null;
  }
}

export function clearOfferMfaChallenge() {
  localStorage.removeItem(OFFER_MFA_KEY);
}

async function request(path: string, options: RequestInit = {}) {
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (supabaseKey) {
    headers.apikey = supabaseKey;
    headers.Authorization = `Bearer ${supabaseKey}`;
  }
  const sessionId = getSessionId();
  if (sessionId) {
    headers["x-vas-session"] = sessionId;
  }
  const res = await fetch(`${FUNCTION_URL}${path}`, {
    ...options,
    headers,
  });
  return res;
}

async function offerRequest(path: string, options: RequestInit = {}) {
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (supabaseKey) {
    headers.apikey = supabaseKey;
    headers.Authorization = `Bearer ${supabaseKey}`;
  }
  const offerSessionId = getOfferSessionId();
  if (offerSessionId) {
    headers["x-offer-session"] = offerSessionId;
  }
  return fetch(`${FUNCTION_URL}${path}`, {
    ...options,
    headers,
  });
}

async function orderRequest(path: string, options: RequestInit = {}) {
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ORDER_REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (supabaseKey) {
    headers.apikey = supabaseKey;
  }
  if (accessToken || supabaseKey) {
    headers.Authorization = `Bearer ${accessToken || supabaseKey}`;
  }

  try {
    return await fetch(`${FUNCTION_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getOrderStatus() {
  const res = await orderRequest("/order/status", { method: "GET" });
  if (!res.ok) {
    return { loggedIn: false, allowed: false, ...(await res.json().catch(() => ({}))) };
  }
  return res.json();
}

type OrderMethod = "postpay" | "admin";

type OrderRequestDebug = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  payload: unknown;
};

function getOrderRequesterEmail() {
  return (import.meta.env.VITE_ORDER_MANAGEMENT_REQUESTER_EMAIL || "nelson.rebelo@olx.com").trim().toLowerCase();
}

function getOrderManagementUrl() {
  return (
    import.meta.env.VITE_ORDER_MANAGEMENT_API_URL ||
    "https://service-m-go-order-management.eks-01.shared.prd.eu-west-1.verticals.olx.org/api/v2/order"
  );
}

function getOrderErrorDetail(responseBody: unknown, fallback: string) {
  if (!responseBody || typeof responseBody !== "object") return fallback;
  const body = responseBody as { error?: { detail?: unknown; title?: unknown; validation?: unknown } };
  const validation = Array.isArray(body.error?.validation) ? body.error.validation : [];
  const validationDetails = validation
    .map((entry) => (entry && typeof entry === "object" ? (entry as { detail?: unknown }).detail : null))
    .filter((detail): detail is string => typeof detail === "string" && detail.trim().length > 0);

  return (
    validationDetails.join(" ") ||
    (typeof body.error?.detail === "string" ? body.error.detail : "") ||
    (typeof body.error?.title === "string" ? body.error.title : "") ||
    fallback
  );
}

export async function sendOrderPromotion(
  advert: string,
  promotion: string,
  method: OrderMethod,
  userUuid: string,
  apiKey?: string,
) {
  const endpoint = getOrderManagementUrl();
  const normalizedApiKey = (apiKey || import.meta.env.VITE_ORDER_MANAGEMENT_API_KEY || "").trim();
  const promotionId = Number(promotion);
  const advertId = Number(advert);
  const payload = {
    site_urn: "urn:site:standvirtualcom",
    user: {
      uuid: userUuid.trim(),
    },
    payments: [
      {
        method,
      },
    ],
    products: [
      {
        id: promotionId,
        advert_id: advertId,
      },
    ],
    requester: {
      source: "ccc",
      type: "admin",
      id: `urn:user:${getOrderRequesterEmail()}`,
    },
  };
  const requestDebug: OrderRequestDebug = {
    url: endpoint,
    method: "POST",
    headers: {
      "x-site-urn": "urn:site:standvirtualcom",
      "x-method": "payment_create",
      "x-platform": "business",
      "x-api-key": "[redacted]",
      "Content-Type": "application/json",
    },
    payload,
  };

  if (!normalizedApiKey) {
    return {
      status: 400,
      data: {
        success: false,
        status: 400,
        errorMessage: "Order Management API key is required.",
        requestDebug,
      },
    };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ORDER_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-site-urn": "urn:site:standvirtualcom",
        "x-method": "payment_create",
        "x-platform": "business",
        "x-api-key": normalizedApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text().catch(() => "");
    let responseBody: unknown = null;
    if (responseText) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = null;
      }
    }

    const metaStatus = responseBody && typeof responseBody === "object"
      ? (responseBody as { meta?: { status_code?: unknown } }).meta?.status_code
      : undefined;
    const apiStatus = typeof metaStatus === "number" ? metaStatus : response.status;
    const success = apiStatus === 201;
    const errorMessage = success
      ? undefined
      : getOrderErrorDetail(responseBody, responseText.substring(0, 500) || `HTTP ${apiStatus}`);

    return {
      status: response.status,
      data: {
        success,
        advert,
        promotion,
        status: apiStatus,
        httpStatus: response.status,
        method,
        message: success ? "Order management request completed successfully." : errorMessage,
        errorMessage,
        requestDebug,
        response: responseBody,
      },
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      status: timedOut ? "timeout" : "network error",
      data: {
        success: false,
        advert,
        promotion,
        status: timedOut ? "timeout" : "network error",
        method,
        errorMessage: timedOut
          ? "Order management request timed out from the browser."
          : error instanceof TypeError
            ? "Browser request failed. This is usually CORS, VPN, or network access."
            : error instanceof Error
              ? error.message
              : "Network error",
        requestDebug,
      },
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function logoutOrderManagement() {
  await supabase.auth.signOut();
}

export async function login(data: { username: string; password: string }) {
  const res = await request("/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    return {
      ...json,
      ok: false,
      error: json.error || json.message || `HTTP ${res.status}`,
      detail: json.detail,
    };
  }
  if (json.ok && json.session_id) {
    setSessionId(json.session_id);
    setAuthEmail(data.username);
  }
  return json;
}

export async function logout() {
  const res = await request("/logout", { method: "POST" });
  clearSessionId();
  clearAuthEmail();
  return res.json();
}

export async function getStatus() {
  const res = await request("/status", { method: "GET" });
  return res.json();
}

export async function sendVas(advert: string, promotion: string) {
  const res = await request("/vas/send", {
    method: "POST",
    body: JSON.stringify({ advert, promotion }),
  });
  return { status: res.status, data: await res.json() };
}

export async function offerLogin(data: { username: string; password: string }) {
  const res = await offerRequest("/offer/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    return {
      ...json,
      ok: false,
      error: json.error || json.message || `HTTP ${res.status}`,
      detail: json.detail,
    };
  }
  if (json.ok && json.offer_session_id) {
    setOfferSessionId(json.offer_session_id);
    setAuthEmail(data.username);
  }
  if (json.ok && json.requires_mfa && json.state_token && json.authorize_url) {
    setAuthEmail(data.username);
    setOfferMfaChallenge({
      state_token: json.state_token,
      authorize_url: json.authorize_url,
      factors: Array.isArray(json.factors) ? json.factors : [],
      preferred_factor_id: json.preferred_factor_id ?? null,
    });
  }
  return json;
}

export async function offerLoginWithCookie(data: { cookie: string }) {
  const res = await offerRequest("/offer/manual-cookie", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    return {
      ...json,
      ok: false,
      error: json.error || json.message || `HTTP ${res.status}`,
      detail: json.detail,
    };
  }
  if (json.ok && json.offer_session_id) {
    setOfferSessionId(json.offer_session_id);
    clearOfferMfaChallenge();
  }
  return json;
}

export async function offerVerifyMfa(data: {
  state_token: string;
  authorize_url: string;
  factor_id: string;
  factor_type?: string;
  passcode?: string;
}) {
  const res = await offerRequest("/offer/verify-mfa", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    return {
      ...json,
      ok: false,
      error: json.error || json.message || `HTTP ${res.status}`,
      detail: json.detail,
    };
  }
  if (json.ok && json.offer_session_id) {
    setOfferSessionId(json.offer_session_id);
    clearOfferMfaChallenge();
  }
  return json;
}

export async function getOfferStatus() {
  const res = await offerRequest("/offer/status", { method: "GET" });
  return res.json();
}

export async function sendOfferPromotion(advert: string, promotion: string) {
  const res = await offerRequest("/offer/send", {
    method: "POST",
    body: JSON.stringify({ advert, promotion }),
  });
  return { status: res.status, data: await res.json() };
}

export function clearOfferSession() {
  clearOfferSessionId();
  clearOfferMfaChallenge();
  clearAuthEmail();
}
