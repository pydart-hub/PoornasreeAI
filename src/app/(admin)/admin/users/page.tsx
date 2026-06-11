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
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  XCircle,
  Store,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar, Badge, LoadingScreen, ThemeToggle } from "@/components/ui";
import { Logo } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  getUsers,
  createUser,
  deleteUser,
  updateUser,
  importDealersAdmin,
  deleteAllDealersAdmin,
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

// All roles accepted by backend (superset of ROLES — includes dealer, sales, etc.)
const VALID_IMPORT_ROLES = ["admin", "service", "service_manager", "assistant_service_manager", "service_engineer", "sales", "dealer", "customer_service", "marketing"];

// ── Bulk import parsed row type ───────────────────────────────────────────
interface ParsedRow {
  rowNum: number;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  error?: string;
  status?: "pending" | "success" | "error" | "skipped";
  serverError?: string;
}

// ── Excel column header aliases (case-insensitive) ────────────────────────
function normaliseKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s_-]+/g, "");
}
const FIRST_NAME_KEYS  = new Set(["firstname", "first", "name", "dealername", "contactname", "contact", "dealernam"]);
const LAST_NAME_KEYS   = new Set(["lastname", "last", "surname", "familyname"]);
const EMAIL_KEYS       = new Set(["email", "emailaddress", "email", "mail"]);
const PASSWORD_KEYS    = new Set(["password", "pass", "pwd", "userpassword"]);
const ROLE_KEYS        = new Set(["role", "type", "usertype", "roletype"]);

function resolveHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const k = normaliseKey(h);
    if (FIRST_NAME_KEYS.has(k))  map.firstName = h;
    if (LAST_NAME_KEYS.has(k))   map.lastName  = h;
    if (EMAIL_KEYS.has(k))       map.email     = h;
    if (PASSWORD_KEYS.has(k))    map.password  = h;
    if (ROLE_KEYS.has(k))        map.role      = h;
  }
  return map;
}

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
  whatsappNumber: "",
  pincodeIds: [],
});

// ── Validation ───────────────────────────────────────────────────────────
function validate(form: CreateUserPayload): Partial<Record<keyof CreateUserPayload, string>> {
  const errors: Partial<Record<keyof CreateUserPayload, string>> = {};
  if (!form.email.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Enter a valid email address";
  }
  if (form.role !== "service_engineer") {
    if (!form.password) {
      errors.password = "Password is required";
    } else if (form.password.length < 8) {
      errors.password = "Must be at least 8 characters";
    }
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
  const [myPincodes, setMyPincodes]   = useState<any[]>([]);
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
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", role: "service", newPassword: "", whatsappNumber: "", pincodeIds: [] as string[] });
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string | undefined>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  const [editShowPassword, setEditShowPassword] = useState(false);

  // Bulk import state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<ParsedRow[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkDone, setBulkDone] = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  // Dealer Excel import state
  const [dealerImportOpen, setDealerImportOpen] = useState(false);
  const [dealerImportFile, setDealerImportFile] = useState<File | null>(null);
  const [dealerImportLoading, setDealerImportLoading] = useState(false);
  const [dealerImportReplaceAll, setDealerImportReplaceAll] = useState(true);
  const [deletingAllDealers, setDeletingAllDealers] = useState(false);
  const [dealerImportResult, setDealerImportResult] = useState<{ deleted?: number; created: number; skipped: number; errors: number; skippedEmails: string[] } | null>(null);
  const dealerImportFileRef = useRef<HTMLInputElement>(null);

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

  const fetchPincodes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pincodes", {
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setMyPincodes(data.pincodes || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchUsers();
      fetchPincodes();
    }
  }, [user, fetchUsers, fetchPincodes]);

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
        ...(form.role === "service_engineer" && form.whatsappNumber ? { whatsappNumber: form.whatsappNumber } : {}),
        ...(form.role === "service_engineer" && form.pincodeIds ? { pincodeIds: form.pincodeIds } : {}),
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
      whatsappNumber: u.whatsappNumber || "",
      pincodeIds: u.engineerPincodes?.map((p: any) => p.id) || [],
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

  // ── Bulk import helpers ──────────────────────────────────────────────
  const generateTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["firstName", "lastName", "email", "password", "role"],
      ["Rajan",     "Kumar",    "rajan.kumar@example.com", "Dealer@2026", "dealer"],
      ["Sunita",    "Patel",    "sunita.patel@example.com", "Dealer@2026", "dealer"],
    ]);
    ws["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, "poornasree_users_template.xlsx");
  };

  const parseSheetToRows = (file: File): Promise<ParsedRow[]> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target!.result, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          if (raw.length === 0) { resolve([]); return; }

          const headers = Object.keys(raw[0]);
          const colMap = resolveHeaders(headers);

          const rows: ParsedRow[] = raw.map((r, i) => {
            const get = (field: keyof typeof colMap) =>
              colMap[field] ? String(r[colMap[field]] ?? "").trim() : "";

            const firstName = get("firstName");
            const lastName  = get("lastName");
            const email     = get("email");
            const password  = get("password") || "Poorna@2026";
            const role      = get("role") || "dealer";

            let error: string | undefined;
            if (!firstName) error = "First name is required";
            else if (!email) error = "Email is required";
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Invalid email";
            else if (password.length < 8) error = "Password too short (min 8 chars)";
            else if (!VALID_IMPORT_ROLES.includes(role)) error = `Invalid role: "${role}"`;

            return { rowNum: i + 2, firstName, lastName, email, password, role, error, status: "pending" };
          });

          resolve(rows);
        } catch {
          resolve([]);
        }
      };
      reader.readAsBinaryString(file);
    });
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rows = await parseSheetToRows(file);
    setBulkRows(rows);
    setBulkProgress(null);
    setBulkDone(false);
  };

  const openBulkModal = () => {
    setBulkRows([]);
    setBulkProgress(null);
    setBulkDone(false);
    setBulkImporting(false);
    setBulkModalOpen(true);
    if (bulkFileRef.current) bulkFileRef.current.value = "";
  };

  const closeBulkModal = () => {
    if (bulkImporting) return;
    setBulkModalOpen(false);
  };

  const openDealerImportModal = () => {
    setDealerImportFile(null);
    setDealerImportResult(null);
    setDealerImportReplaceAll(false);
    setDealerImportLoading(false);
    setDealerImportOpen(true);
    if (dealerImportFileRef.current) dealerImportFileRef.current.value = "";
  };

  const closeDealerImportModal = () => {
    if (dealerImportLoading) return;
    setDealerImportOpen(false);
  };

  const handleDealerImport = async () => {
    if (!dealerImportFile) return;
    setDealerImportLoading(true);
    setDealerImportResult(null);
    try {
      const result = await importDealersAdmin(dealerImportFile, dealerImportReplaceAll);
      setDealerImportResult(result);
      setDealerImportFile(null);
      if (result.created > 0) {
        await fetchUsers();
        setSuccessBanner(`${result.created} dealer${result.created !== 1 ? "s" : ""} imported successfully.`);
      }
    } catch (err) {
      setDealerImportResult({
        created: 0,
        skipped: 0,
        errors: 1,
        skippedEmails: [err instanceof Error ? err.message : "Import failed"],
      });
    } finally {
      setDealerImportLoading(false);
    }
  };

  const handleBulkImport = async () => {
    const valid = bulkRows.filter((r) => !r.error);
    if (valid.length === 0) return;

    setBulkImporting(true);
    setBulkProgress({ done: 0, total: valid.length });

    const updatedRows = [...bulkRows];
    let done = 0;

    for (const row of valid) {
      const idx = updatedRows.findIndex((r) => r.rowNum === row.rowNum);
      try {
        const created = await createUser({
          email:     row.email,
          password:  row.password,
          firstName: row.firstName,
          lastName:  row.lastName || undefined,
          role:      row.role,
        });
        updatedRows[idx] = { ...updatedRows[idx], status: "success" };
        setUsers((prev) => [{ ...created, _count: { conversations: 0 } }, ...prev]);
      } catch (err) {
        updatedRows[idx] = {
          ...updatedRows[idx],
          status: "error",
          serverError: err instanceof Error ? err.message : "Failed",
        };
      }
      done++;
      setBulkRows([...updatedRows]);
      setBulkProgress({ done, total: valid.length });
    }

    // Mark invalid rows as skipped
    for (const row of bulkRows.filter((r) => r.error)) {
      const idx = updatedRows.findIndex((r) => r.rowNum === row.rowNum);
      updatedRows[idx] = { ...updatedRows[idx], status: "skipped" };
    }
    setBulkRows([...updatedRows]);
    setBulkImporting(false);
    setBulkDone(true);

    const successCount = updatedRows.filter((r) => r.status === "success").length;
    if (successCount > 0) {
      setSuccessBanner(`${successCount} user${successCount !== 1 ? "s" : ""} imported successfully.`);
      setTimeout(() => setSuccessBanner(null), 5000);
    }
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
        <Logo variant="brand" size="sm" />
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
            <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-500/10">
              <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
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

          <div className="flex items-center gap-2">
            <button
              onClick={openDealerImportModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 active:scale-95 transition-all shadow-sm"
            >
              <Store className="w-4 h-4" />
              Import Dealers
            </button>
            <button
              onClick={async () => {
                const count = users.filter(u => u.role === "dealer").length;
                if (count === 0) { setSuccessBanner("No dealers to delete."); return; }
                if (!confirm(`Delete all ${count} dealer(s)? Tickets are kept; dealer links will be cleared.`)) return;
                setDeletingAllDealers(true);
                try {
                  const { deleted, message } = await deleteAllDealersAdmin();
                  await fetchUsers();
                  setSuccessBanner(message || `Deleted ${deleted} dealer(s).`);
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : "Failed to delete all dealers");
                } finally {
                  setDeletingAllDealers(false);
                }
              }}
              disabled={deletingAllDealers}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-500/10 active:scale-95 transition-all disabled:opacity-50"
            >
              {deletingAllDealers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete All Dealers
            </button>
            <button
              onClick={openBulkModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Upload Sheet
            </button>
            <button
              onClick={openModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Create User
            </button>
          </div>
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
                    {u.role === "dealer" && u.pincode && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <MapPin className="w-3 h-3 text-green-500 shrink-0" />
                        <span className="text-[10px] text-green-700 dark:text-green-400">
                          {u.pincode.code}
                          {u.pincode.place ? ` · ${u.pincode.place}` : ""}
                          {u.pincode.state ? `, ${u.pincode.state}` : ""}
                        </span>
                      </div>
                    )}
                    {u.role === "dealer" && u.whatsappNumber && (
                      <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary">
                        {u.whatsappNumber}
                      </span>
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
              {form.role !== "service_engineer" && (
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

              )}

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

              {/* Additional Fields for Service Engineer */}
              {form.role === "service_engineer" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                      WhatsApp Number <span className="text-content-tertiary">(Optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={form.whatsappNumber || ""}
                      onChange={(e) => setField("whatsappNumber", e.target.value)}
                      placeholder="e.g. 919876543210"
                      className="w-full h-9 px-3 rounded-lg border border-line dark:border-line-dark text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                      Assign Pincodes
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg custom-scrollbar">
                      {myPincodes.length === 0 ? (
                        <p className="text-xs text-content-tertiary col-span-2 text-center py-2">No pincodes available</p>
                      ) : (
                        myPincodes.map((p: any) => (
                          <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-surface-hover dark:hover:bg-surface-dark-hover p-1 rounded transition-colors">
                            <input
                              type="checkbox"
                              checked={(form.pincodeIds || []).includes(p.id)}
                              onChange={(e) => {
                                const current = form.pincodeIds || [];
                                setField(
                                  "pincodeIds",
                                  e.target.checked
                                    ? [...current, p.id]
                                    : current.filter((id: string) => id !== p.id)
                                );
                              }}
                              className="rounded border-line"
                            />
                            <span className="truncate" title={`${p.code} - ${p.place}`}>
                              {p.code} <span className="text-content-tertiary">({p.place})</span>
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

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
              {/* Additional Fields for Service Engineer */}
              {editForm.role === "service_engineer" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                      WhatsApp Number <span className="text-content-tertiary">(Optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={editForm.whatsappNumber || ""}
                      onChange={(e) => setEditField("whatsappNumber", e.target.value)}
                      placeholder="e.g. 919876543210"
                      className="w-full h-9 px-3 rounded-lg border border-line dark:border-line-dark text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                      Assign Pincodes
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg custom-scrollbar">
                      {myPincodes.length === 0 ? (
                        <p className="text-xs text-content-tertiary col-span-2 text-center py-2">No pincodes available</p>
                      ) : (
                        myPincodes.map((p: any) => (
                          <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-surface-hover dark:hover:bg-surface-dark-hover p-1 rounded transition-colors">
                            <input
                              type="checkbox"
                              checked={(editForm.pincodeIds || []).includes(p.id)}
                              onChange={(e) => {
                                const current = editForm.pincodeIds || [];
                                setEditField(
                                  "pincodeIds",
                                  e.target.checked
                                    ? [...current, p.id]
                                    : current.filter((id: string) => id !== p.id)
                                );
                              }}
                              className="rounded border-line"
                            />
                            <span className="truncate" title={`${p.code} - ${p.place}`}>
                              {p.code} <span className="text-content-tertiary">({p.place})</span>
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

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

      {/* ── Bulk Import Modal ── */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeBulkModal} />
          <div className="relative w-full max-w-3xl bg-surface dark:bg-surface-dark-card rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-semibold text-content dark:text-content-dark">Bulk Import Users</h2>
              </div>
              <button onClick={closeBulkModal} disabled={bulkImporting} className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Format info + template download */}
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-2">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Required Excel format</p>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr className="bg-emerald-100 dark:bg-emerald-500/20">
                        {["firstName *", "lastName", "email *", "password", "role"].map(h => (
                          <th key={h} className="border border-emerald-300 dark:border-emerald-500/40 px-2 py-1 text-left font-semibold text-emerald-800 dark:text-emerald-300">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-emerald-700 dark:text-emerald-400">
                        <td className="border border-emerald-200 dark:border-emerald-500/30 px-2 py-1">Rajan</td>
                        <td className="border border-emerald-200 dark:border-emerald-500/30 px-2 py-1">Kumar</td>
                        <td className="border border-emerald-200 dark:border-emerald-500/30 px-2 py-1">rajan@example.com</td>
                        <td className="border border-emerald-200 dark:border-emerald-500/30 px-2 py-1 italic opacity-70">(blank = Poorna@2026)</td>
                        <td className="border border-emerald-200 dark:border-emerald-500/30 px-2 py-1 italic opacity-70">(blank = dealer)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Valid roles: {VALID_IMPORT_ROLES.join(", ")}
                </p>
                <button
                  onClick={generateTemplate}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download template (.xlsx)
                </button>
              </div>

              {/* File upload area */}
              {!bulkDone && (
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                    Select Excel file (.xlsx or .xls)
                  </label>
                  <label className={cn(
                    "flex flex-col items-center justify-center gap-2 w-full h-24 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
                    bulkImporting ? "opacity-50 cursor-not-allowed border-line dark:border-line-dark" : "border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                  )}>
                    <Upload className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm text-content-secondary dark:text-content-dark-secondary">
                      {bulkRows.length > 0 ? `${bulkRows.length} rows loaded — drop new file to replace` : "Click to choose or drop file here"}
                    </span>
                    <input
                      ref={bulkFileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      disabled={bulkImporting}
                      onChange={handleBulkFileChange}
                    />
                  </label>
                </div>
              )}

              {/* Progress bar */}
              {bulkImporting && bulkProgress && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-content-secondary dark:text-content-dark-secondary">
                    <span>Importing…</span>
                    <span>{bulkProgress.done} / {bulkProgress.total}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-tertiary dark:bg-surface-dark-tertiary overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Preview table */}
              {bulkRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-2">
                    Preview — {bulkRows.filter(r => !r.error).length} valid / {bulkRows.filter(r => !!r.error).length} invalid rows
                  </p>
                  <div className="rounded-xl border border-line dark:border-line-dark overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-tertiary dark:bg-surface-dark-tertiary sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-content-secondary dark:text-content-dark-secondary w-10">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-content-secondary dark:text-content-dark-secondary">Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-content-secondary dark:text-content-dark-secondary">Email</th>
                          <th className="px-3 py-2 text-left font-semibold text-content-secondary dark:text-content-dark-secondary">Role</th>
                          <th className="px-3 py-2 text-left font-semibold text-content-secondary dark:text-content-dark-secondary w-40">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((row) => (
                          <tr key={row.rowNum} className={cn(
                            "border-t border-line dark:border-line-dark",
                            row.error ? "bg-red-50/50 dark:bg-red-500/5" : ""
                          )}>
                            <td className="px-3 py-2 text-content-tertiary dark:text-content-dark-tertiary">{row.rowNum}</td>
                            <td className="px-3 py-2 text-content dark:text-content-dark font-medium">{row.firstName} {row.lastName}</td>
                            <td className="px-3 py-2 text-content-secondary dark:text-content-dark-secondary truncate max-w-[200px]">{row.email}</td>
                            <td className="px-3 py-2 text-content-secondary dark:text-content-dark-secondary">{row.role}</td>
                            <td className="px-3 py-2">
                              {row.status === "success" && (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                  <CheckCircle className="w-3.5 h-3.5" /> Created
                                </span>
                              )}
                              {row.status === "error" && (
                                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium" title={row.serverError}>
                                  <XCircle className="w-3.5 h-3.5" /> {row.serverError ?? "Failed"}
                                </span>
                              )}
                              {row.status === "skipped" && (
                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium" title={row.error}>
                                  <AlertCircle className="w-3.5 h-3.5" /> Skipped
                                </span>
                              )}
                              {(row.status === "pending" || !row.status) && row.error && (
                                <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400" title={row.error}>
                                  <XCircle className="w-3.5 h-3.5" /> {row.error}
                                </span>
                              )}
                              {(row.status === "pending" || !row.status) && !row.error && (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Done summary */}
              {bulkDone && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Import complete — {bulkRows.filter(r => r.status === "success").length} created,{" "}
                  {bulkRows.filter(r => r.status === "error").length} failed,{" "}
                  {bulkRows.filter(r => r.status === "skipped").length} skipped
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-line dark:border-line-dark flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={closeBulkModal}
                disabled={bulkImporting}
                className="px-4 py-2 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40"
              >
                {bulkDone ? "Close" : "Cancel"}
              </button>
              {!bulkDone && (
                <button
                  onClick={handleBulkImport}
                  disabled={bulkImporting || bulkRows.filter(r => !r.error).length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkImporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Importing…</>
                  ) : (
                    <><Upload className="w-4 h-4" />Import {bulkRows.filter(r => !r.error).length} Users</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Import Dealers Modal ── */}
      {dealerImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDealerImportModal} />
          <div className="relative w-full max-w-md bg-surface dark:bg-surface-dark-card rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                <h2 className="text-base font-semibold text-content dark:text-content-dark">Import Dealers</h2>
              </div>
              <button onClick={closeDealerImportModal} disabled={dealerImportLoading} className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl border border-primary-200 dark:border-primary-500/30 bg-primary-50 dark:bg-primary-500/10 p-4 text-xs text-primary-800 dark:text-primary-300 space-y-1">
                <p className="font-semibold mb-1">Excel columns (header may be on row 5):</p>
                <p>• <span className="font-medium">DEALER NAME</span> (required)</p>
                <p>• STATE, PINCODE, CITY, MOBILE NUMBER</p>
                <p className="opacity-80">Email/password auto-generated if omitted (Dealer@2026)</p>
              </div>

              <label className="flex items-start gap-2 text-xs text-content-secondary dark:text-content-dark-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={dealerImportReplaceAll}
                  onChange={e => setDealerImportReplaceAll(e.target.checked)}
                  className="mt-0.5 rounded border-line"
                />
                <span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">Replace all existing dealers</span>
                  {" "}before import
                </span>
              </label>

              <label className={cn(
                "flex flex-col items-center justify-center gap-2 w-full h-24 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
                dealerImportLoading ? "opacity-50 cursor-not-allowed border-line dark:border-line-dark" : "border-primary-300 dark:border-primary-500/40 hover:bg-primary-50 dark:hover:bg-primary-500/10"
              )}>
                <Upload className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                <span className="text-sm text-content-secondary dark:text-content-dark-secondary">
                  {dealerImportFile ? dealerImportFile.name : "Click to select .xlsx file"}
                </span>
                <input
                  ref={dealerImportFileRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  disabled={dealerImportLoading}
                  onChange={e => { setDealerImportFile(e.target.files?.[0] ?? null); setDealerImportResult(null); }}
                />
              </label>

              {dealerImportResult && (
                <div className={cn(
                  "rounded-lg p-3 text-sm space-y-1",
                  dealerImportResult.errors > 0
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200"
                    : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200"
                )}>
                  <p className="font-semibold">
                    {dealerImportResult.deleted != null && dealerImportResult.deleted > 0 ? `${dealerImportResult.deleted} deleted · ` : ""}
                    {dealerImportResult.created} created · {dealerImportResult.skipped} skipped · {dealerImportResult.errors} errors
                  </p>
                  {dealerImportResult.skippedEmails.length > 0 && (
                    <p className="text-xs opacity-80 truncate">
                      {dealerImportResult.skippedEmails.slice(0, 3).join("; ")}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-line dark:border-line-dark flex items-center justify-end gap-3">
              <button
                onClick={closeDealerImportModal}
                disabled={dealerImportLoading}
                className="px-4 py-2 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDealerImport}
                disabled={!dealerImportFile || dealerImportLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {dealerImportLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Importing…</>
                ) : (
                  <><Upload className="w-4 h-4" />Import Dealers</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
