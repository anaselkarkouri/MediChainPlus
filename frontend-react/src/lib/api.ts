const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!res.ok) {
    const msg = (payload as { error?: string })?.error ?? text ?? res.statusText;
    throw new Error(msg);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, token?: string) =>
    apiFetch<T>(path, { method: "GET" }, token),

  post: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }, token),

  patch: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }, token),

  put: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }, token),

  delete: <T>(path: string, token?: string) =>
    apiFetch<T>(path, { method: "DELETE" }, token),
};
