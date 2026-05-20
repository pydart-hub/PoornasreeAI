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
  Pencil,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar, Badge, LoadingScreen, ThemeToggle } from "@/components/ui";
import { Logo } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  getUsers,
  createUser,
  deleteUser,
  updateUser,
  type ApiUser,
  type CreateUserPayload,
} from "@/lib/api";

// ── Constants ────────────────────────────────────────────────────────────
const ROLES = [
  { value: "service",                   label: "Service Engineer" },
  { value: "service_manager",           label: "Service Manager" },
  { value: "assistant_service_manager", label: "Asst. Service Manager" },
  { value: "marketing",                 label: "Marketing" },
  { value: "admin",                     label: "Administrator" },
] as const;

const ROLE_BADGE: Record<
  string,
  { label: string; variant: "info" | "success" | "warning" | "accent" | "default" }
> = {
  service:                  { label: "Service Engineer",    variant: "info" },
  service_manager:          { label: "Service Manager",     variant: "info" },
  assistant_service_manager:{ label: "Asst. Service Mgr",  variant: "warning" },
  service_engineer:         { label: "Field Engineer",      variant: "info" },
  admin:                    { label: "Administrator",       variant: "default" },
  marketing:                { label: "Marketing",           variant: "accent" },
  sales:                    { label: "Sales",               variant: "success" },
  dealer:                   { label: "Dealer",              variant: "success" },
  customer:                 { label: "Customer",            variant: "accent" },
  customer_service:         { label: "Customer Service",    variant: "warning" },
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
  const [roleFilter, setRoleFilter]   = useState<string>("all");

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

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", role: "service", newPassword: "" });
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string | undefined>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  const [editShowPassword, setEditShowPassword] = useState(false);

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

  // ── Edit user ─────────────────────────────────────────────────────
  const openEditModal = (u: ApiUser) => {
    setEditingUser(u);
    setEditForm({
      firstName: u.firstName,
      lastName: u.lastName ?? "",
      email: u.email,
      role: u.role,
      newPassword: "",
    });
    setEditFieldErrors({});
    setEditSubmitError(null);
    setEditShowPassword(false);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    if (editSubmitting) return;
    setEditModalOpen(false);
    setEditingUser(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!editForm.firstName.trim()) errors.firstName = "First name is required";
    if (!editForm.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) {
      errors.email = "Enter a valid email address";
    }
    if (editForm.newPassword && editForm.newPassword.length < 8) {
      errors.newPassword = "Must be at least 8 characters";
    }
    if (!editForm.role) errors.role = "Role is required";
    if (Object.keys(errors).length > 0) {
      setEditFieldErrors(errors);
      return;
    }
    setEditSubmitting(true);
    setEditSubmitError(null);
    try {
      const payload: Record<string, string> = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
      };
      if (editForm.newPassword) payload.newPassword = editForm.newPassword;
      const updated = await updateUser(editingUser!.id, payload);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      setEditModalOpen(false);
      setEditingUser(null);
      setSuccessBanner(`User "${updated.email}" updated successfully.`);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      setEditSubmitError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setEditSubmitting(false);
    }
  };

  const setEditField = (key: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    if (editFieldErrors[key]) setEditFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // ── Role counts for filter pills ────────────────────────────────────
  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});
  const presentRoles = Object.keys(roleCounts).sort();

  // ── Filter ───────────────────────────────────────────────────────────
  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
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

        {/* Search + filter bar */}
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

          {/* Role filter dropdown */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
          >
            <option value="all">All Roles ({users.length})</option>
            {presentRoles.map((role) => {
              const b = getRoleBadge(role);
              return (
                <option key={role} value={role}>
                  {b.label} ({roleCounts[role]})
                </option>
              );
            })}
          </select>

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
              {search || roleFilter !== "all" ? "No users match your filters" : "No users yet"}
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
            <div className="hidden sm:grid grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_80px] gap-4 px-5 py-3 border-b border-line dark:border-line-dark bg-surface-tertiary dark:bg-surface-dark-tertiary text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">
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
                    "flex flex-col sm:grid sm:grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_80px] gap-2 sm:gap-4 px-5 py-4 transition-colors hover:bg-surface-hover dark:hover:bg-surface-dark-hover",
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
                    <span className="sm:hidden text-[10px] uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary font-semibold mr-2">Email:</span>
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary truncate">
                      {u.email}
                    </p>
                  </div>

                  {/* Role */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center">
                      <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                    </div>
                    {/* Pincode badges for managers/engineers */}
                    {u.managedPincodes && u.managedPincodes.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="text-[10px] text-blue-600 dark:text-blue-400">
                          Manages: {u.managedPincodes.map(p => p.code).join(", ")}
                        </span>
                      </div>
                    )}
                    {u.engineerPincodes && u.engineerPincodes.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          Serves: {u.engineerPincodes.map(p => p.code).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Created */}
                  <div className="flex items-center">
                    <span className="sm:hidden text-[10px] uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary font-semibold mr-2">Joined:</span>
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
                    <span className="sm:hidden text-[10px] uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary font-semibold mr-2">Chats:</span>
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                      {u._count?.conversations ?? 0}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEditModal(u)}
                      className="p-1.5 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Edit user"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
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

      {/* ── Edit User Modal ── */}
      {editModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEditModal} />
          <div className="relative w-full max-w-md bg-surface dark:bg-surface-dark-card rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-primary dark:text-primary-300" />
                <h2 className="text-base font-semibold text-content dark:text-content-dark">Edit User</h2>
              </div>
              <button onClick={closeEditModal} disabled={editSubmitting} className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} noValidate className="px-6 py-5 space-y-4">
              {editSubmitError && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{editSubmitError}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">First Name <span className="text-red-500">*</span></label>
                  <input value={editForm.firstName} onChange={(e) => setEditField("firstName", e.target.value)} className={cn("w-full h-9 px-3 rounded-lg border text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2", editFieldErrors.firstName ? "border-red-400 focus:ring-red-300/40" : "border-line dark:border-line-dark focus:ring-primary/30")} />
                  {editFieldErrors.firstName && <p className="mt-1 text-xs text-red-500">{editFieldErrors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">Last Name</label>
                  <input value={editForm.lastName} onChange={(e) => setEditField("lastName", e.target.value)} className="w-full h-9 px-3 rounded-lg border border-line dark:border-line-dark text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">Email Address <span className="text-red-500">*</span></label>
                <input type="email" value={editForm.email} onChange={(e) => setEditField("email", e.target.value)} className={cn("w-full h-9 px-3 rounded-lg border text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2", editFieldErrors.email ? "border-red-400 focus:ring-red-300/40" : "border-line dark:border-line-dark focus:ring-primary/30")} />
                {editFieldErrors.email && <p className="mt-1 text-xs text-red-500">{editFieldErrors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">New Password <span className="text-xs font-normal">(leave blank to keep current)</span></label>
                <div className="relative">
                  <input type={editShowPassword ? "text" : "password"} value={editForm.newPassword} onChange={(e) => setEditField("newPassword", e.target.value)} placeholder="Min 8 characters" className={cn("w-full h-9 px-3 pr-10 rounded-lg border text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2", editFieldErrors.newPassword ? "border-red-400 focus:ring-red-300/40" : "border-line dark:border-line-dark focus:ring-primary/30")} />
                  <button type="button" onClick={() => setEditShowPassword((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark transition-colors">
                    {editShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {editFieldErrors.newPassword && <p className="mt-1 text-xs text-red-500">{editFieldErrors.newPassword}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">Role <span className="text-red-500">*</span></label>
                <select value={editForm.role} onChange={(e) => setEditField("role", e.target.value)} className={cn("w-full h-9 px-3 rounded-lg border text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 appearance-none cursor-pointer", editFieldErrors.role ? "border-red-400 focus:ring-red-300/40" : "border-line dark:border-line-dark focus:ring-primary/30")}>
                  {ROLES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                </select>
                {editFieldErrors.role && <p className="mt-1 text-xs text-red-500">{editFieldErrors.role}</p>}
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={closeEditModal} disabled={editSubmitting} className="flex-1 h-9 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40">Cancel</button>
                <button type="submit" disabled={editSubmitting} className="flex-1 h-9 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {editSubmitting ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving…</>) : (<><Pencil className="w-4 h-4" />Save Changes</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
