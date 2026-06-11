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
  whatsappNumber?: string | null;
  pincode?: { code: string; place?: string | null; state?: string | null } | null;
  _count: { conversations: number };
  managedPincodes?: { code: string; regionName: string | null }[];
  engineerPincodes?: { code: string; regionName: string | null }[];
}

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  role: string;
  whatsappNumber?: string;
  pincode?: string;
  pincodeIds?: string[];
  city?: string;
  state?: string;
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
  payload: {
    firstName?: string;
    lastName?: string;
    email?: string;
    newPassword?: string;
    role?: string;
    whatsappNumber?: string | null;
    pincode?: string | null;
    city?: string | null;
    state?: string | null;
  }
): Promise<ApiUser> {
  const data = await apiFetch<{ user: ApiUser }>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.user;
}

export interface DealerImportResult {
  deleted?: number;
  created: number;
  skipped: number;
  errors: number;
  skippedEmails: string[];
}

/** Bulk import dealers from Excel (admin only). Replaces all dealers by default. */
export async function importDealersAdmin(
  file: File,
  replaceAll = true,
): Promise<DealerImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (!replaceAll) formData.append("replaceAll", "false");

  const res = await fetch("/api/admin/import/dealers", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as DealerImportResult;
}

/** Delete all dealer accounts (admin only). */
export async function deleteAllDealersAdmin(): Promise<{ deleted: number; message: string }> {
  return apiFetch<{ deleted: number; message: string }>("/api/admin/dealers/all", {
    method: "DELETE",
  });
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

// ── Work Reports ─────────────────────────────────────────────────────────

export interface ReplacedPart {
  id: string;
  partName: string;
  partNumber?: string | null;
  quantity: number;
  createdAt: string;
}

export interface WorkReportImage {
  id: string;
  url: string;
  fileName: string;
  createdAt: string;
}

/** Work report belongs to an engineer job (submitted by engineer or ticket has assignee). */
export function isEngineerWorkReport(report: WorkReport): boolean {
  if (report.dealer?.role === "service_engineer") return true;
  if (report.ticket?.assignedEngineerId) return true;
  return false;
}

/** Resolve work-report image URLs (stored as /uploads/... paths). */
export function workReportImageSrc(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) {
    return url;
  }
  return url.startsWith("/") ? url : `/${url}`;
}

export interface WorkReport {
  id: string;
  ticketId: string;
  dealerId: string;
  problemDiagnosed?: string | null;
  workDone?: string | null;
  warrantyClaimRequested: boolean;
  createdAt: string;
  updatedAt: string;
  dealer?: { id: string; firstName: string; lastName?: string | null; role?: string | null } | null;
  ticket?: {
    id: string;
    ticketNumber?: string | null;
    machineName?: string | null;
    machineSerialNumber?: string | null;
    machineCustomer?: string | null;
    issueDescription?: string | null;
    status: string;
    assignedEngineerId?: string | null;
    assignedEngineer?: {
      id: string;
      firstName: string;
      lastName?: string | null;
      role?: string | null;
    } | null;
  } | null;
  parts?: ReplacedPart[];
  images?: WorkReportImage[];
  _count?: { parts: number; images: number };
}

export interface UpsertWorkReportPayload {
  problemDiagnosed?: string;
  workDone?: string;
  warrantyClaimRequested?: boolean;
  parts?: { partName: string; partNumber?: string; quantity?: number }[];
}

/** List work reports. Dealer sees own; manager/admin see all. */
export async function listWorkReports(): Promise<WorkReport[]> {
  const data = await apiFetch<{ reports: WorkReport[] }>("/api/work-reports");
  return data.reports;
}

/** Get a single work report by ticketId. */
export async function getWorkReport(ticketId: string): Promise<WorkReport | null> {
  try {
    const data = await apiFetch<{ report: WorkReport }>(`/api/work-reports/${ticketId}`);
    return data.report;
  } catch {
    return null;
  }
}

/** Create or update a work report (dealer or assigned engineer). */
export async function upsertWorkReport(
  ticketId: string,
  payload: UpsertWorkReportPayload
): Promise<WorkReport> {
  const data = await apiFetch<{ report: WorkReport }>(`/api/work-reports/${ticketId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.report;
}

/** Upload an image to a work report. Returns the created image record. */
export async function uploadWorkReportImage(
  ticketId: string,
  file: File
): Promise<WorkReportImage> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`/api/work-reports/${ticketId}/images`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return (data as { image: WorkReportImage }).image;
}

/** Delete an image from a work report. */
export async function deleteWorkReportImage(
  ticketId: string,
  imageId: string
): Promise<void> {
  await apiFetch(`/api/work-reports/${ticketId}/images/${imageId}`, {
    method: "DELETE",
  });
}

/** Dealer accepts an assigned ticket. */
export async function dealerAcceptTicket(ticketId: string) {
  const data = await apiFetch<{ ticket: unknown }>(`/api/tickets/${ticketId}/dealer-accept`, {
    method: "PATCH",
  });
  return data.ticket;
}

/** Dealer rejects an assigned ticket (returns to SM for engineer assignment). */
export async function dealerRejectTicket(ticketId: string) {
  const data = await apiFetch<{ ticket: unknown }>(`/api/tickets/${ticketId}/dealer-reject`, {
    method: "PATCH",
  });
  return data.ticket;
}

/** Dealer completes an accepted ticket (closes without OTP). */
export async function dealerCompleteTicket(ticketId: string) {
  const data = await apiFetch<{ ticket: unknown }>(`/api/tickets/${ticketId}/dealer-complete`, {
    method: "PATCH",
  });
  return data.ticket;
}
