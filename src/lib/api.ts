const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vas-api`;

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${FUNCTION_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res;
}

export async function login(data: { username: string; password: string }) {
  const res = await request("/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function logout() {
  const res = await request("/logout", { method: "POST" });
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
