// ── src/lib/api.ts ───────────────────────────────────────────────────────
// Typed helpers for the PoornasreeAI admin API.
// All requests are made to /api/* which Next.js proxies to the API container.

export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName?: string | null;
  role: string;
  createdAt: string;
  _count: { conversations: number };
}

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  role: string;
}

// ── Shared fetch wrapper ─────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

// ── User management ──────────────────────────────────────────────────────

/** Fetch all users (admin only). */
export async function getUsers(): Promise<ApiUser[]> {
  const data = await apiFetch<{ users: ApiUser[] }>("/api/admin/users");
  return data.users;
}

/** Create a new user with a specific role (admin only). */
export async function createUser(payload: CreateUserPayload): Promise<ApiUser> {
  const data = await apiFetch<{ user: ApiUser }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.user;
}

/** Delete a user by ID (admin only). */
export async function deleteUser(id: string): Promise<void> {
  await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
}

// ── Auth ──────────────────────────────────────────────────────────────────

/** Fetch the currently authenticated user. */
export async function getMe(): Promise<ApiUser> {
  const data = await apiFetch<{ user: ApiUser }>("/api/auth/me");
  return data.user;
}
