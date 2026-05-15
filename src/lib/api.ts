const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vas-api`;
const OFFER_HELPER_URL = "http://127.0.0.1:43125";
const SESSION_KEY = "vas_session_id";
const OFFER_SESSION_KEY = "offer_session_id";
const AUTH_EMAIL_KEY = "promo_buddy_auth_email";

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

export type OfferHelperSessionStatus =
  | {
      ok: true;
      status: "starting" | "waiting_for_login";
      session_id?: string;
      message?: string | null;
      validated_url?: string | null;
      cookie_header?: string | null;
      error?: string | null;
    }
  | {
      ok: true;
      status: "authenticated";
      session_id: string;
      message?: string | null;
      validated_url: string;
      cookie_header: string;
    }
  | {
      ok: false;
      status?: "failed";
      error: string;
      detail?: string;
    };

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

async function parseJsonResponse(res: Response, label: string) {
  const text = await res.text();
  if (!text) {
    throw new Error(`${label} returned an empty response.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned an invalid response: ${text.slice(0, 200)}`);
  }
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

export async function getOfferHelperHealth() {
  const res = await fetch(`${OFFER_HELPER_URL}/health`, {
    method: "GET",
  });
  return parseJsonResponse(res, "Local helper health check");
}

export async function startOfferBrowserSession() {
  const res = await fetch(`${OFFER_HELPER_URL}/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      origin: window.location.origin,
    }),
  });
  return parseJsonResponse(res, "Local helper connect");
}

export async function getOfferBrowserSessionStatus(sessionId: string): Promise<OfferHelperSessionStatus> {
  const res = await fetch(`${OFFER_HELPER_URL}/session/${encodeURIComponent(sessionId)}/status`, {
    method: "GET",
  });
  return parseJsonResponse(res, "Local helper session status");
}

export async function closeOfferBrowserSession(sessionId: string) {
  const res = await fetch(`${OFFER_HELPER_URL}/session/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
  });
  return parseJsonResponse(res, "Local helper session close");
}

export async function importOfferSession(data: { cookie_header: string; validated_url?: string | null }) {
  const res = await offerRequest("/offer/import-session", {
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
  clearAuthEmail();
}
