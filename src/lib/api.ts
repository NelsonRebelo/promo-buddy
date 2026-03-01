const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vas-api`;
const SESSION_KEY = "vas_session_id";

function getSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

function setSessionId(id: string) {
  localStorage.setItem(SESSION_KEY, id);
}

function clearSessionId() {
  localStorage.removeItem(SESSION_KEY);
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

export async function login(data: { username: string; password: string }) {
  const res = await request("/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      error: json.error || json.message || `HTTP ${res.status}`,
      detail: json.detail,
    };
  }
  if (json.ok && json.session_id) {
    setSessionId(json.session_id);
  }
  return json;
}

export async function logout() {
  const res = await request("/logout", { method: "POST" });
  clearSessionId();
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

export async function getOfferTokenInfo() {
  const res = await request("/offer/token-info", { method: "GET" });
  return res.json();
}
