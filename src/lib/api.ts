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

/** Update a user by ID (admin only). */
export async function updateUser(
  id: string,
  payload: { firstName?: string; lastName?: string; email?: string; newPassword?: string }
): Promise<ApiUser> {
  const data = await apiFetch<{ user: ApiUser }>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.user;
}

// ── Sales user management ──────────────────────────────────────────────────

/** List all users (sales role). */
export async function getSalesUsers(): Promise<ApiUser[]> {
  const data = await apiFetch<{ users: ApiUser[] }>("/api/sales/users");
  return data.users;
}

export interface SalesCreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
}

/** Create a customer account (sales role — role is always customer). */
export async function createSalesUser(payload: SalesCreateUserPayload): Promise<ApiUser> {
  const data = await apiFetch<{ user: ApiUser }>("/api/sales/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.user;
}

/** Update a customer's details (sales role). */
export async function updateSalesUser(
  id: string,
  payload: { firstName?: string; lastName?: string; email?: string; newPassword?: string }
): Promise<ApiUser> {
  const data = await apiFetch<{ user: ApiUser }>(`/api/sales/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.user;
}

/** Delete a customer account (sales role). */
export async function deleteSalesUser(id: string): Promise<void> {
  await apiFetch(`/api/sales/users/${id}`, { method: "DELETE" });
}

/** Fetch analytics summary (sales role). */
export async function getSalesAnalytics(): Promise<SalesAnalytics> {
  return apiFetch<SalesAnalytics>("/api/sales/analytics");
}

export async function getSalesAnalyticsTimeline(): Promise<{ date: string; conversations: number; support: number }[]> {
  const data = await apiFetch<{ timeline: { date: string; conversations: number; support: number }[] }>("/api/sales/analytics/timeline");
  return data.timeline;
}

export interface SalesAnalytics {
  totalConversations: number;
  totalSupportRequests: number;
  escalationRate: number;
  aiResolutionRate: number;
  resolvedCount: number;
  pendingCount: number;
  activeCount: number;
  topMachines: { name: string; count: number }[];
  recentIssues: { id: string; problem: string; status: string; customer: { firstName: string; lastName: string | null }; createdAt: string }[];
}

// ── Auth ──────────────────────────────────────────────────────────────────

/** Fetch the currently authenticated user. */
export async function getMe(): Promise<ApiUser> {
  const data = await apiFetch<{ user: ApiUser }>("/api/auth/me");
  return data.user;
}

// ── Video Resource management (admin) ────────────────────────────────────

export interface VideoResource {
  id: string;
  title: string;
  description?: string | null;
  youtubeUrl: string;
  keywords: string;
  createdAt: string;
}

export interface VideoPayload {
  title: string;
  description?: string;
  youtubeUrl: string;
  keywords: string;
}

/** List all video resources (admin only). */
export async function getVideos(): Promise<VideoResource[]> {
  const data = await apiFetch<{ videos: VideoResource[] }>("/api/admin/videos");
  return data.videos;
}

/** Create a video resource (admin only). */
export async function createVideo(payload: VideoPayload): Promise<VideoResource> {
  const data = await apiFetch<{ video: VideoResource }>("/api/admin/videos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.video;
}

/** Update a video resource (admin only). */
export async function updateVideo(id: string, payload: Partial<VideoPayload>): Promise<VideoResource> {
  const data = await apiFetch<{ video: VideoResource }>(`/api/admin/videos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.video;
}

/** Delete a video resource (admin only). */
export async function deleteVideo(id: string): Promise<void> {
  await apiFetch(`/api/admin/videos/${id}`, { method: "DELETE" });
}

// ── Customer Service Analytics ───────────────────────────────────────────

export interface CustomerAnalytics {
  totalConversations: number;
  totalSupportRequests: number;
  resolvedCount: number;
  pendingCount: number;
  activeCount: number;
  topComplaints: { keyword: string; count: number }[];
  topQuestions: { keyword: string; count: number }[];
  recentIssues: {
    id: string;
    problem: string;
    status: string;
    customer: { firstName: string; lastName: string | null };
    createdAt: string;
  }[];
  timeline: { date: string; conversations: number; support: number }[];
}

/** Fetch customer analytics (customer_service / admin / sales). */
export async function getCustomerAnalytics(): Promise<CustomerAnalytics> {
  return apiFetch<CustomerAnalytics>("/api/admin/analytics/customer");
}
