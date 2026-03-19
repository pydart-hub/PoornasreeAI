"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  Trash2,
  Loader2,
  ArrowLeft,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  UserX,
  Shield,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar, Badge, LoadingScreen, ThemeToggle } from "@/components/ui";
import { Logo } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  getUsers,
  createUser,
  deleteUser,
  type ApiUser,
  type CreateUserPayload,
} from "@/lib/api";

// ── Constants ────────────────────────────────────────────────────────────
const ROLES = [
  { value: "service",   label: "Service Engineer" },
  { value: "sales",     label: "Sales" },
  { value: "customer_service", label: "Customer Service" },
  { value: "admin",     label: "Administrator" },
] as const;

const ROLE_BADGE: Record<
  string,
  { label: string; variant: "info" | "success" | "warning" | "accent" | "default" }
> = {
  service:  { label: "Service Engineer",   variant: "info" },
  admin:    { label: "Administrator",      variant: "default" },
  sales:    { label: "Sales",              variant: "success" },
  customer: { label: "Customer",           variant: "accent" },
  customer_service: { label: "Customer Service", variant: "warning" },
};

function getRoleBadge(role: string) {
  return ROLE_BADGE[role] ?? { label: role, variant: "default" as const };
}

// ── Empty form state ─────────────────────────────────────────────────────
const EMPTY_FORM = (): CreateUserPayload => ({
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  role: "service",
});

// ── Validation ───────────────────────────────────────────────────────────
function validate(form: CreateUserPayload): Partial<Record<keyof CreateUserPayload, string>> {
  const errors: Partial<Record<keyof CreateUserPayload, string>> = {};
  if (!form.email.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Enter a valid email address";
  }
  if (!form.password) {
    errors.password = "Password is required";
  } else if (form.password.length < 8) {
    errors.password = "Must be at least 8 characters";
  }
  if (!form.firstName.trim()) {
    errors.firstName = "First name is required";
  }
  if (!form.role) {
    errors.role = "Role is required";
  }
  return errors;
}

// ── Component ────────────────────────────────────────────────────────────
export default function UsersManagementPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [users, setUsers]             = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [search, setSearch]           = useState("");

  // Delete state
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen]     = useState(false);
  const [form, setForm]               = useState<CreateUserPayload>(EMPTY_FORM());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CreateUserPayload, string>>>({});
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  // ── Auth guard ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
    if (!isLoading && user && user.role !== "admin") router.replace("/dashboard");
  }, [user, isLoading, router]);

  // ── Fetch users ──────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      // silently ignore — show empty state
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") fetchUsers();
  }, [user, fetchUsers]);

  // ── Modal helpers ────────────────────────────────────────────────────
  const openModal = () => {
    setForm(EMPTY_FORM());
    setFieldErrors({});
    setSubmitError(null);
    setShowPassword(false);
    setModalOpen(true);
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
  };

  // ── Create user ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload: CreateUserPayload = {
        email:     form.email.trim(),
        password:  form.password,
        firstName: form.firstName.trim(),
        lastName:  form.lastName?.trim() || undefined,
        role:      form.role,
      };
      const created = await createUser(payload);
      setUsers((prev) => [
        { ...created, _count: { conversations: 0 } },
        ...prev,
      ]);
      setModalOpen(false);
      setSuccessBanner(`User "${created.email}" created successfully.`);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete user ──────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (u: ApiUser) => {
      if (!confirm(`Delete "${u.email}"? This cannot be undone.`)) return;
      setDeletingId(u.id);
      setDeleteError(null);
      try {
        await deleteUser(u.id);
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Failed to delete user");
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  // ── Filter ───────────────────────────────────────────────────────────
  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.firstName.toLowerCase().includes(q) ||
      (u.lastName ?? "").toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  // ── Field change helper ──────────────────────────────────────────────
  const setField = <K extends keyof CreateUserPayload>(
    key: K,
    value: CreateUserPayload[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  if (isLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-surface dark:bg-surface-dark">

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 bg-surface/80 dark:bg-surface-dark/80 backdrop-blur border-b border-line dark:border-line-dark px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push("/admin")}
          className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors shrink-0"
          title="Back to Admin Dashboard"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Logo variant="full" size="sm" />
        <div className="flex-1" />
        <ThemeToggle />
        <Avatar
          name={`${user.firstName} ${user.lastName ?? ""}`}
          size="sm"
          status="online"
        />
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Page heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-50 dark:bg-violet-500/10">
              <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-content dark:text-content-dark">
                User Management
              </h1>
              <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                Create, view and remove system users
              </p>
            </div>
          </div>

          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Create User
          </button>
        </div>

        {/* Success banner */}
        {successBanner && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successBanner}
          </div>
        )}

        {/* Delete error */}
        {deleteError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {deleteError}
          </div>
        )}

        {/* Search + refresh bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary dark:text-content-dark-secondary pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or role…"
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={fetchUsers}
            disabled={usersLoading}
            className="p-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", usersLoading && "animate-spin")} />
          </button>
          <span className="text-sm text-content-secondary dark:text-content-dark-secondary">
            {filtered.length} {filtered.length === 1 ? "user" : "users"}
          </span>
        </div>

        {/* User table */}
        {usersLoading && users.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-content-secondary dark:text-content-dark-secondary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-line dark:border-line-dark">
            <UserX className="w-10 h-10 mx-auto mb-3 text-content-secondary dark:text-content-dark-secondary opacity-30" />
            <p className="text-sm font-medium text-content-secondary dark:text-content-dark-secondary">
              {search ? "No users match your search" : "No users yet"}
            </p>
            {!search && (
              <button
                onClick={openModal}
                className="mt-3 text-sm text-primary dark:text-primary-300 underline underline-offset-2"
              >
                Create the first user
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">

            {/* Table head */}
            <div className="hidden sm:grid grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_44px] gap-4 px-5 py-3 border-b border-line dark:border-line-dark bg-surface-tertiary dark:bg-surface-dark-tertiary text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">
              <span>User</span>
              <span>Email</span>
              <span>Role</span>
              <span>Created</span>
              <span>Chats</span>
              <span />
            </div>

            {/* Rows */}
            {filtered.map((u, i) => {
              const badge  = getRoleBadge(u.role);
              const isSelf = u.id === user.id;
              return (
                <div
                  key={u.id}
                  className={cn(
                    "flex flex-col sm:grid sm:grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_44px] gap-2 sm:gap-4 px-5 py-4 transition-colors hover:bg-surface-hover dark:hover:bg-surface-dark-hover",
                    i < filtered.length - 1 && "border-b border-line dark:border-line-dark"
                  )}
                >
                  {/* User */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={`${u.firstName} ${u.lastName ?? ""}`}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                        {u.firstName}{u.lastName ? ` ${u.lastName}` : ""}
                        {isSelf && (
                          <span className="ml-1.5 text-xs text-primary dark:text-primary-300">(you)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-center">
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary truncate">
                      {u.email}
                    </p>
                  </div>

                  {/* Role */}
                  <div className="flex items-center">
                    <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                  </div>

                  {/* Created */}
                  <div className="flex items-center">
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                      {new Date(u.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  {/* Chats */}
                  <div className="flex items-center">
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                      {u._count?.conversations ?? 0}
                    </p>
                  </div>

                  {/* Delete */}
                  <div className="flex items-center justify-end">
                    {!isSelf && (
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={deletingId === u.id}
                        className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                        title="Delete user"
                      >
                        {deletingId === u.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create User Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-surface dark:bg-surface-dark-card rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary dark:text-primary-300" />
                <h2 className="text-base font-semibold text-content dark:text-content-dark">
                  Create New User
                </h2>
              </div>
              <button
                onClick={closeModal}
                disabled={submitting}
                className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">

              {/* Submit error */}
              {submitError && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* First name + Last name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    value={form.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
                    placeholder="e.g. Rajan"
                    className={cn(
                      "w-full h-9 px-3 rounded-lg border text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2",
                      fieldErrors.firstName
                        ? "border-red-400 focus:ring-red-300/40"
                        : "border-line dark:border-line-dark focus:ring-primary/30"
                    )}
                  />
                  {fieldErrors.firstName && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.firstName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                    Last Name
                  </label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                    placeholder="e.g. Kumar"
                    className="w-full h-9 px-3 rounded-lg border border-line dark:border-line-dark text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="user@example.com"
                  className={cn(
                    "w-full h-9 px-3 rounded-lg border text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2",
                    fieldErrors.email
                      ? "border-red-400 focus:ring-red-300/40"
                      : "border-line dark:border-line-dark focus:ring-primary/30"
                  )}
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    placeholder="Min 8 characters"
                    className={cn(
                      "w-full h-9 px-3 pr-10 rounded-lg border text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2",
                      fieldErrors.password
                        ? "border-red-400 focus:ring-red-300/40"
                        : "border-line dark:border-line-dark focus:ring-primary/30"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
                )}
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setField("role", e.target.value)}
                  className={cn(
                    "w-full h-9 px-3 rounded-lg border text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 appearance-none cursor-pointer",
                    fieldErrors.role
                      ? "border-red-400 focus:ring-red-300/40"
                      : "border-line dark:border-line-dark focus:ring-primary/30"
                  )}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.role && (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.role}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="flex-1 h-9 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-9 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
