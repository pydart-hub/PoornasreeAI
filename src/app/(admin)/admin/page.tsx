"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  LogOut,
  Upload,
  Trash2,
  PanelLeftClose,
  Menu,
  Users,
  FileUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  File,
  Clock,
  Search,
  Shield,
  UserX,
  RefreshCw,
  BarChart2,
  TrendingUp,
  Activity,
  AlertTriangle,
  Youtube,
  Plus,
  Pencil,
  X,
  Download,
  Film,
  Ticket,
  Package,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar, Badge, LoadingScreen, ResponsiveSidebar, SidebarBrand } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";
import RdVideosTab from "@/components/admin/RdVideosTab";
import TicketsTab from "@/components/admin/TicketsTab";
import ProductsTab from "@/components/admin/ProductsTab";
import WhatsAppSettingsTab from "@/components/admin/WhatsAppSettingsTab";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  role: string;
  createdAt: string;
  _count: { conversations: number };
}

interface ApiDocument {
  id: string;
  title: string;
  createdAt: string;
  uploadedBy: string;
  chunkCount: number;
  documentType: "service" | "customer";
  status: "trained" | "pending";
}

interface ApiVideo {
  id: string;
  title: string;
  description?: string | null;
  youtubeUrl: string;
  keywords: string;
  createdAt: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getRoleBadge(role: string) {
  const map: Record<string, { label: string; variant: "info" | "success" | "warning" | "accent" | "default" }> = {
    admin:    { label: "Administrator",    variant: "default" },
    service:  { label: "Service Engineer", variant: "info" },
    sales:    { label: "Sales",            variant: "success" },
    customer: { label: "Customer",         variant: "accent" },
  };
  return map[role] ?? { label: role, variant: "default" as const };
}



// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"documents" | "users" | "analytics" | "videos" | "rdvideos" | "tickets" | "products" | "whatsapp">("documents");

  // Users state
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Documents state
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [uploadDocType, setUploadDocType] = useState<"service" | "customer">("service");

  // Videos state
  const [videos, setVideos] = useState<ApiVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoForm, setVideoForm] = useState<{ title: string; description: string; youtubeUrl: string; keywords: string }>({ title: "", description: "", youtubeUrl: "", keywords: "" });
  const [videoFormError, setVideoFormError] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [editingVideo, setEditingVideo] = useState<ApiVideo | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  // Analytics state
  const [analyticsView, setAnalyticsView] = useState<"overview" | "customer" | "service">("overview");
  const [analytics, setAnalytics] = useState<{
    totalConversations: number;
    totalSupportRequests: number;
    escalationRate: number;
    aiResolutionRate: number;
    resolvedCount: number;
    pendingCount: number;
    activeCount: number;
    topMachines: { name: string; count: number }[];
    recentIssues: { id: string; problem: string; status: string; customer: { firstName: string; lastName: string | null }; createdAt: string }[];
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [timeline, setTimeline] = useState<{ date: string; conversations: number; support: number }[]>([]);

  // Customer analytics state
  const [customerAnalytics, setCustomerAnalytics] = useState<{
    totalConversations: number;
    totalSupportRequests: number;
    resolvedCount: number;
    pendingCount: number;
    activeCount: number;
    topComplaints: { keyword: string; count: number }[];
    topQuestions: { keyword: string; count: number }[];
    recentIssues: { id: string; problem: string; status: string; customer: { firstName: string; lastName: string | null } }[];
    timeline: { date: string; conversations: number; support: number }[];
  } | null>(null);
  const [customerAnalyticsLoading, setCustomerAnalyticsLoading] = useState(false);

  // Service analytics state
  const [serviceAnalytics, setServiceAnalytics] = useState<{
    totalConversations: number;
    topMachines: { name: string; count: number }[];
    topTopics: { keyword: string; count: number }[];
    resolvedCount: number;
    pendingCount: number;
    activeCount: number;
    timeline: { date: string; conversations: number }[];
  } | null>(null);
  const [serviceAnalyticsLoading, setServiceAnalyticsLoading] = useState(false);

  // ── Responsive ──────────────────────────────
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // ── Auth guard ───────────────────────────────
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
    if (!isLoading && user && user.role !== "admin") router.replace("/login");
  }, [user, isLoading, router]);

  // ── Fetch users ──────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ── Fetch documents ───────────────────────────
  const fetchDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/admin/documents", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setDocuments(data.documents);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  // ── Fetch analytics ───────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const [res, tlRes] = await Promise.all([
        fetch("/api/admin/analytics",          { credentials: "include" }),
        fetch("/api/admin/analytics/timeline", { credentials: "include" }),
      ]);
      const data   = await res.json();
      const tlData = await tlRes.json();
      if (res.ok)   setAnalytics(data);
      if (tlRes.ok) setTimeline(tlData.timeline ?? []);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // ── Fetch customer analytics ──────────────────
  const fetchCustomerAnalytics = useCallback(async () => {
    setCustomerAnalyticsLoading(true);
    try {
      const res = await fetch("/api/admin/analytics/customer", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setCustomerAnalytics(data);
    } finally {
      setCustomerAnalyticsLoading(false);
    }
  }, []);

  // ── Fetch service analytics ───────────────────
  const fetchServiceAnalytics = useCallback(async () => {
    setServiceAnalyticsLoading(true);
    try {
      const res = await fetch("/api/admin/analytics/service", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setServiceAnalytics(data);
    } finally {
      setServiceAnalyticsLoading(false);
    }
  }, []);

  // ── Fetch videos ──────────────────────────────
  const fetchVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const res = await fetch("/api/admin/videos", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setVideos(data.videos);
    } finally {
      setVideosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchUsers();
      fetchDocuments();
      fetchVideos();
    }
  }, [user, fetchUsers, fetchDocuments, fetchVideos]);

  // Fetch analytics when tab becomes active
  useEffect(() => {
    if (activeTab === "analytics" && user?.role === "admin" && !analytics && !analyticsLoading) {
      fetchAnalytics();
    }
  }, [activeTab, user, analytics, analyticsLoading, fetchAnalytics]);

  // Fetch view-specific analytics when switching views
  useEffect(() => {
    if (activeTab !== "analytics" || user?.role !== "admin") return;
    if (analyticsView === "customer" && !customerAnalytics && !customerAnalyticsLoading) {
      fetchCustomerAnalytics();
    }
    if (analyticsView === "service" && !serviceAnalytics && !serviceAnalyticsLoading) {
      fetchServiceAnalytics();
    }
  }, [analyticsView, activeTab, user, customerAnalytics, customerAnalyticsLoading, serviceAnalytics, serviceAnalyticsLoading, fetchCustomerAnalytics, fetchServiceAnalytics]);

  // ── Video CRUD ───────────────────────────────
  const handleSaveVideo = useCallback(async () => {
    setVideoFormError("");
    const { title, youtubeUrl, keywords } = videoForm;
    if (!title.trim() || !youtubeUrl.trim() || !keywords.trim()) {
      setVideoFormError("Title, YouTube URL, and keywords are required.");
      return;
    }
    setSavingVideo(true);
    try {
      const url = editingVideo ? `/api/admin/videos/${editingVideo.id}` : "/api/admin/videos";
      const method = editingVideo ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(videoForm),
      });
      const data = await res.json();
      if (!res.ok) { setVideoFormError(data.error ?? "Save failed"); return; }
      await fetchVideos();
      setEditingVideo(null);
      setVideoForm({ title: "", description: "", youtubeUrl: "", keywords: "" });
    } finally {
      setSavingVideo(false);
    }
  }, [videoForm, editingVideo, fetchVideos]);

  const startEditVideo = useCallback((v: ApiVideo) => {
    setEditingVideo(v);
    setVideoForm({ title: v.title, description: v.description ?? "", youtubeUrl: v.youtubeUrl, keywords: v.keywords });
    setVideoFormError("");
  }, []);

  const cancelEditVideo = useCallback(() => {
    setEditingVideo(null);
    setVideoForm({ title: "", description: "", youtubeUrl: "", keywords: "" });
    setVideoFormError("");
  }, []);

  const handleDeleteVideo = useCallback(async (id: string) => {
    if (!confirm("Delete this video? This cannot be undone.")) return;
    setDeletingVideoId(id);
    try {
      await fetch(`/api/admin/videos/${id}`, { method: "DELETE", credentials: "include" });
      setVideos((prev) => prev.filter((v) => v.id !== id));
      if (editingVideo?.id === id) cancelEditVideo();
    } finally {
      setDeletingVideoId(null);
    }
  }, [editingVideo, cancelEditVideo]);

  // ── Upload PDF ───────────────────────────────
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    setUploadMessage(null);
    let successCount = 0;
    let errorCount = 0;

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("documentType", uploadDocType);
      try {
        const res = await fetch("/api/admin/documents", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (res.ok) {
          successCount++;
        } else {
          errorCount++;
          const body = await res.json().catch(() => ({}));
          console.error("[upload] HTTP", res.status, body);
        }
      } catch (uploadErr) {
        errorCount++;
        console.error("[upload] network error", uploadErr);
      }
    }

    try {
      await fetchDocuments();
    } finally {
      setUploading(false);
    }

    if (successCount > 0 && errorCount === 0) {
      setUploadMessage({ text: `${successCount} document(s) uploaded and trained successfully!`, type: "success" });
    } else if (successCount > 0) {
      setUploadMessage({ text: `${successCount} uploaded, ${errorCount} failed.`, type: "error" });
    } else {
      setUploadMessage({ text: "Upload failed. Please check the file and try again.", type: "error" });
    }
    setTimeout(() => setUploadMessage(null), 5000);
  }, [fetchDocuments, uploadDocType]);

  // ── Delete document ──────────────────────────
  const handleDeleteDoc = useCallback(async (id: string) => {
    setDeletingDocId(id);
    try {
      await fetch(`/api/admin/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingDocId(null);
    }
  }, []);

  // ── Delete user ──────────────────────────────
  const handleDeleteUser = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
    setDeletingUserId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== id));
    } finally {
      setDeletingUserId(null);
    }
  }, []);

  // ── Drag & drop ──────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  // ── Filter users ─────────────────────────────
  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.firstName.toLowerCase().includes(q) ||
      (u.lastName ?? "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const trainedCount = documents.filter((d) => d.status === "trained").length;

  if (isLoading) return <LoadingScreen message="Loading admin panel..." />;
  if (!user) return null;

  return (
    <div className="h-[100dvh] flex overflow-hidden">

      {/* ── Sidebar ── */}
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={260}>
        <div className="flex flex-col h-full bg-gradient-to-b from-primary-900 via-primary-800 to-primary-900">

          <SidebarBrand title="Admin Panel" onClose={isMobile ? () => setSidebarOpen(false) : undefined} compact className="border-white/10" />

          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
            <a href="/admin" className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium bg-white/15 text-white">
              <LayoutDashboard className="w-4 h-4 opacity-70" />
              Overview
            </a>

            <div className="pt-3 pb-1 px-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 px-2">Manage</p>
              {([
                { key: "documents", label: "Documents", icon: <FileText className="w-3.5 h-3.5" />, count: documents.length },
                { key: "users",     label: "Users",     icon: <Users className="w-3.5 h-3.5" />,     count: users.length },
                { key: "videos",    label: "Videos",    icon: <Youtube className="w-3.5 h-3.5" />,   count: videos.length },
                { key: "rdvideos",  label: "Eng. Videos", icon: <Film className="w-3.5 h-3.5" />,    count: null },
                { key: "tickets",   label: "Tickets",   icon: <Ticket className="w-3.5 h-3.5" />,    count: null },
                { key: "products",  label: "Products",  icon: <Package className="w-3.5 h-3.5" />,   count: null },
                { key: "whatsapp",  label: "WhatsApp",  icon: <MessageSquare className="w-3.5 h-3.5" />, count: null },
                { key: "analytics", label: "Analytics", icon: <BarChart2 className="w-3.5 h-3.5" />, count: null },
              ] as const).map(({ key, label, icon, count }) => (
                <button key={key} onClick={() => key === "users" ? router.push("/admin/users") : setActiveTab(key as typeof activeTab)}
                  className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                    activeTab === key ? "bg-white/20 text-white font-semibold" : "text-white/60 hover:text-white hover:bg-white/10"
                  )}>
                  {icon}
                  {label}
                  {count !== null && (
                    <span className={cn("ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full",
                      activeTab === key ? "bg-white/20 text-white" : "bg-white/10 text-white/60"
                    )}>{count}</span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          <div className="shrink-0 border-t border-white/10 px-3 py-3 space-y-2">
            <div className="flex items-center gap-2 px-2 py-2 rounded-xl">
              <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" status="online" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{user.firstName} {user.lastName ?? ""}</p>
                <p className="text-[10px] text-white/50 truncate">{user.email}</p>
              </div>
            </div>
            <button onClick={() => { logout(); router.replace("/login"); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors">
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* ── Gradient Header Banner ── */}
        <div className="shrink-0 bg-gradient-to-r from-primary-900 via-primary-800 to-primary-900 px-4 sm:px-6 pt-3 pb-4">
          {/* Top row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen((v) => !v)}
                className="md:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0">
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-base font-bold text-white leading-tight">Admin Panel</h1>
                <p className="text-xs text-white/50">{user.firstName} {user.lastName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => { logout(); router.replace("/login"); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="bg-white/15 rounded-2xl px-4 py-3.5 border border-white/25 shadow-inner">
              <div className="flex items-start justify-between">
                <p className="text-3xl font-black text-white">{documents.length}</p>
                <FileText className="w-5 h-5 text-primary-200 opacity-70 mt-1" />
              </div>
              <p className="text-[11px] text-primary-200 font-semibold mt-1 uppercase tracking-wide">Documents</p>
            </div>
            <div className={cn("rounded-2xl px-4 py-3.5 border shadow-inner", trainedCount > 0 ? "bg-emerald-500/30 border-emerald-300/40" : "bg-white/10 border-white/20")}>
              <div className="flex items-start justify-between">
                <p className={cn("text-3xl font-black", trainedCount > 0 ? "text-emerald-200" : "text-white/50")}>{trainedCount}</p>
                <CheckCircle2 className={cn("w-5 h-5 mt-1", trainedCount > 0 ? "text-emerald-300 opacity-70" : "text-white/20")} />
              </div>
              <p className={cn("text-[11px] font-semibold mt-1 uppercase tracking-wide", trainedCount > 0 ? "text-emerald-200" : "text-white/40")}>Trained</p>
            </div>
            <button onClick={() => router.push("/admin/users")} className={cn("rounded-2xl px-4 py-3.5 border shadow-inner text-left transition-all hover:scale-[1.02] hover:brightness-110", users.length > 0 ? "bg-primary-500/30 border-primary-300/40" : "bg-white/10 border-white/20")}>
              <div className="flex items-start justify-between">
                <p className={cn("text-3xl font-black", users.length > 0 ? "text-primary-200" : "text-white/50")}>{users.length}</p>
                <Users className={cn("w-5 h-5 mt-1", users.length > 0 ? "text-primary-300 opacity-70" : "text-white/20")} />
              </div>
              <p className={cn("text-[11px] font-semibold mt-1 uppercase tracking-wide", users.length > 0 ? "text-primary-200" : "text-white/40")}>Manage Users</p>
            </button>
            <div className="bg-white/15 rounded-2xl px-4 py-3.5 border border-white/25 shadow-inner">
              <div className="flex items-start justify-between">
                <p className="text-3xl font-black text-white">{users.reduce((s, u) => s + (u._count?.conversations ?? 0), 0)}</p>
                <MessageSquare className="w-5 h-5 text-primary-200 opacity-70 mt-1" />
              </div>
              <p className="text-[11px] text-primary-200 font-semibold mt-1 uppercase tracking-wide">Conversations</p>
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto bg-slate-100 scrollbar-thin">
          <div className="px-4 sm:px-6 py-4 max-w-5xl mx-auto space-y-4">

          {/* Tab switcher */}
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-white border border-slate-200 shadow-sm w-fit">
            {([
              { key: "documents", label: "Documents", icon: <FileUp className="w-3.5 h-3.5" /> },
              { key: "users", label: "Users", icon: <Users className="w-3.5 h-3.5" /> },
              { key: "analytics", label: "Analytics", icon: <BarChart2 className="w-3.5 h-3.5" /> },
              { key: "videos", label: "Videos", icon: <Youtube className="w-3.5 h-3.5" /> },
              { key: "rdvideos", label: "Engineers Video", icon: <Film className="w-3.5 h-3.5" /> },
              { key: "tickets", label: "Tickets", icon: <Ticket className="w-3.5 h-3.5" /> },
              { key: "products", label: "Products", icon: <Package className="w-3.5 h-3.5" /> },
              { key: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="w-3.5 h-3.5" /> },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => t.key === "users" ? router.push("/admin/users") : setActiveTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === t.key
                    ? "bg-primary-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Documents Tab ── */}
          {activeTab === "documents" && (
            <section className="space-y-6">

              {/* Document type selector */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-content dark:text-content-dark">Upload for:</span>
                <div className="flex gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary">
                  {(["service", "customer"] as const).map((dt) => (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => setUploadDocType(dt)}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                        uploadDocType === dt
                          ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                          : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
                      )}
                    >
                      {dt === "service" ? "🔧 Service" : "👤 Customer"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all",
                  dragOver
                    ? "border-primary bg-primary/5 dark:bg-primary-400/5 scale-[1.01]"
                    : "border-line dark:border-line-dark hover:border-primary/50 dark:hover:border-primary-400/50 hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.json,.csv,.txt,.docx,.xlsx"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                <div className="flex flex-col items-center gap-3">
                  {uploading ? (
                    <>
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-sm font-medium text-content dark:text-content-dark">Uploading & embedding document…</p>
                    </>
                  ) : (
                    <>
                      <div className="p-4 rounded-2xl bg-primary/10 dark:bg-primary-400/10">
                        <Upload className="w-8 h-8 text-primary dark:text-primary-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-content dark:text-content-dark">
                          Click to upload or drag & drop files here
                        </p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">
                          PDF, JSON, CSV, TXT, DOCX · max 50 MB
                        </p>
                      </div>
                      <p className="text-xs text-primary dark:text-primary-300 font-medium">
                        Documents are automatically embedded for AI chat responses
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Upload feedback */}
              {uploadMessage && (
                <div className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium",
                  uploadMessage.type === "success"
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20"
                    : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20"
                )}>
                  {uploadMessage.type === "success"
                    ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                    : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {uploadMessage.text}
                </div>
              )}

              {/* Documents list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-content dark:text-content-dark">
                    Uploaded Documents ({documents.length})
                  </h2>
                  <button
                    onClick={fetchDocuments}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("w-4 h-4", docsLoading && "animate-spin")} />
                  </button>
                </div>

                {docsLoading && documents.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-12 rounded-2xl border border-dashed border-line dark:border-line-dark">
                    <File className="w-10 h-10 text-content-secondary dark:text-content-dark-secondary mx-auto mb-3 opacity-40" />
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No documents uploaded yet</p>
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">
                      Upload PDFs above to train the AI
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                    {documents.map((doc, i) => (
                      <div
                        key={doc.id}
                        className={cn(
                          "flex items-center gap-4 px-5 py-4 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors",
                          i < documents.length - 1 && "border-b border-line dark:border-line-dark"
                        )}
                      >
                        <span className="text-2xl shrink-0">📄</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-content dark:text-content-dark truncate">{doc.title}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-content-secondary dark:text-content-dark-secondary flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(doc.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                              by {doc.uploadedBy}
                            </span>
                            {doc.chunkCount > 0 && (
                              <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                                {doc.chunkCount} chunks
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            doc.documentType === "service"
                              ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400"
                          )}>
                            {doc.documentType === "service" ? "🔧 Service" : "👤 Customer"}
                          </span>
                          <Badge
                            variant={doc.status === "trained" ? "success" : "warning"}
                            dot
                            size="sm"
                          >
                            {doc.status === "trained" ? "Trained" : "Pending"}
                          </Badge>
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            disabled={deletingDocId === doc.id}
                            className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                            title="Delete document"
                          >
                            {deletingDocId === doc.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Users Tab ── */}
          {activeTab === "users" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-base font-bold text-content dark:text-content-dark">
                  All Users ({users.length})
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search users…"
                      className="h-9 pl-9 pr-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
                    />
                  </div>
                  <button
                    onClick={fetchUsers}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("w-4 h-4", usersLoading && "animate-spin")} />
                  </button>
                  <button
                    onClick={() => router.push("/admin/users")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Create User
                  </button>
                </div>
              </div>

              {usersLoading && users.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                </div>
              ) : (
                <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                  {/* Table header */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_1.5fr_1fr_80px_44px] gap-4 px-5 py-3 border-b border-line dark:border-line-dark bg-surface-tertiary dark:bg-surface-dark-tertiary">
                    {["User", "Email", "Role", "Chats", ""].map((h) => (
                      <span key={h} className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">
                        {h}
                      </span>
                    ))}
                  </div>

                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <UserX className="w-8 h-8 mx-auto mb-2 text-content-secondary dark:text-content-dark-secondary opacity-40" />
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No users found</p>
                    </div>
                  ) : (
                    filteredUsers.map((u, i) => {
                      const badge = getRoleBadge(u.role);
                      const isSelf = u.id === user.id;
                      return (
                        <div
                          key={u.id}
                          className={cn(
                            "flex flex-col sm:grid sm:grid-cols-[1fr_1.5fr_1fr_80px_44px] gap-2 sm:gap-4 px-5 py-4 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors",
                            i < filteredUsers.length - 1 && "border-b border-line dark:border-line-dark"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar name={`${u.firstName} ${u.lastName ?? ""}`} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                                {u.firstName} {u.lastName ?? ""}
                                {isSelf && <span className="ml-1.5 text-xs text-primary dark:text-primary-300">(you)</span>}
                              </p>
                              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                                {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <p className="text-sm text-content-secondary dark:text-content-dark-secondary truncate">{u.email}</p>
                          </div>
                          <div className="flex items-center">
                            <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                          </div>
                          <div className="flex items-center">
                            <span className="text-sm text-content-secondary dark:text-content-dark-secondary">
                              {u._count.conversations}
                            </span>
                          </div>
                          <div className="flex items-center justify-end">
                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={deletingUserId === u.id}
                                className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                                title="Delete user"
                              >
                                {deletingUserId === u.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Trash2 className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Videos Tab ── */}
          {activeTab === "videos" && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-content dark:text-content-dark">
                  Video Recommendations ({videos.length})
                </h2>
                <button
                  onClick={fetchVideos}
                  className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={cn("w-4 h-4", videosLoading && "animate-spin")} />
                </button>
              </div>

              <p className="text-sm text-content-secondary dark:text-content-dark-secondary -mt-4">
                Add YouTube videos here. They will be automatically shown to users in chat when their question matches the keywords you provide.
              </p>

              {/* Add / Edit form */}
              <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-content dark:text-content-dark">
                  {editingVideo ? "Edit Video" : "Add New Video"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Title *</label>
                    <input
                      value={videoForm.title}
                      onChange={(e) => setVideoForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. How to calibrate VIBRO milk analyzer"
                      className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">YouTube URL *</label>
                    <input
                      value={videoForm.youtubeUrl}
                      onChange={(e) => setVideoForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Keywords * <span className="font-normal">(comma-separated)</span></label>
                    <input
                      value={videoForm.keywords}
                      onChange={(e) => setVideoForm((f) => ({ ...f, keywords: e.target.value }))}
                      placeholder="e.g. vibro,calibration,fat,snf,milk"
                      className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Description <span className="font-normal">(optional)</span></label>
                    <input
                      value={videoForm.description}
                      onChange={(e) => setVideoForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Short description shown under the title"
                      className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                {videoFormError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {videoFormError}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveVideo}
                    disabled={savingVideo}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {savingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : editingVideo ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {editingVideo ? "Save Changes" : "Add Video"}
                  </button>
                  {editingVideo && (
                    <button
                      onClick={cancelEditVideo}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-line-dark text-sm text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Video list */}
              {videosLoading && videos.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                </div>
              ) : videos.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border border-dashed border-line dark:border-line-dark">
                  <Youtube className="w-10 h-10 text-content-secondary dark:text-content-dark-secondary mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No videos added yet</p>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">Add YouTube videos above — they will appear in chat responses</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                  {videos.map((v, i) => {
                    const videoId = (() => {
                      try {
                        const u = new URL(v.youtubeUrl);
                        if (u.hostname === "youtu.be") return u.pathname.slice(1);
                        return u.searchParams.get("v") ?? "";
                      } catch { return ""; }
                    })();
                    const thumb = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
                    return (
                      <div
                        key={v.id}
                        className={cn(
                          "flex items-center gap-4 px-5 py-4 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors",
                          i < videos.length - 1 && "border-b border-line dark:border-line-dark"
                        )}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={v.title} className="w-20 h-14 object-cover rounded-xl shrink-0 bg-surface-tertiary dark:bg-surface-dark-tertiary" />
                        ) : (
                          <div className="w-20 h-14 rounded-xl shrink-0 bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                            <Youtube className="w-6 h-6 text-red-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-content dark:text-content-dark truncate">{v.title}</p>
                          {v.description && (
                            <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate mt-0.5">{v.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {v.keywords.split(",").filter(Boolean).map((kw) => (
                              <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium">
                                {kw.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <a
                            href={v.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Open on YouTube"
                          >
                            <Youtube className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => startEditVideo(v)}
                            className="p-1.5 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 dark:hover:bg-primary-400/10 transition-colors"
                            title="Edit video"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteVideo(v.id)}
                            disabled={deletingVideoId === v.id}
                            className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                            title="Delete video"
                          >
                            {deletingVideoId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ── Analytics Tab ── */}
          {activeTab === "analytics" && (
            <section className="space-y-6">

              {/* Header row */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-base font-bold text-content dark:text-content-dark">Analytics</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <a href="/api/admin/export/chats" download className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors">
                    <Download className="w-3.5 h-3.5" />Chats CSV
                  </a>
                  <a href="/api/admin/export/support" download className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors">
                    <Download className="w-3.5 h-3.5" />Support CSV
                  </a>
                  <button
                    onClick={() => {
                      if (analyticsView === "overview") { setAnalytics(null); fetchAnalytics(); }
                      else if (analyticsView === "customer") { setCustomerAnalytics(null); fetchCustomerAnalytics(); }
                      else { setServiceAnalytics(null); fetchServiceAnalytics(); }
                    }}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("w-4 h-4", (analyticsLoading || customerAnalyticsLoading || serviceAnalyticsLoading) && "animate-spin")} />
                  </button>
                </div>
              </div>

              {/* View selector sub-nav */}
              <div className="flex gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary w-fit">
                {([
                  { key: "overview"  as const, label: "Overview",  icon: <BarChart2 className="w-3.5 h-3.5" /> },
                  { key: "customer"  as const, label: "Customer",  icon: <span className="text-sm">👤</span> },
                  { key: "service"   as const, label: "Service",   icon: <span className="text-sm">🔧</span> },
                ]).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => setAnalyticsView(key)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      analyticsView === key
                        ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                        : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
                    )}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>

              {/* ─── Overview View ─── */}
              {analyticsView === "overview" && (
                analyticsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                  </div>
                ) : !analytics ? (
                  <div className="text-center py-16 rounded-2xl border border-dashed border-line dark:border-line-dark">
                    <BarChart2 className="w-10 h-10 mx-auto mb-3 text-content-secondary dark:text-content-dark-secondary opacity-40" />
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No analytics data available</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 mb-2"><MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{analytics.totalConversations}</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Total Conversations</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 mb-2"><AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{analytics.totalSupportRequests}</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Support Escalations</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 mb-2"><TrendingUp className="w-5 h-5 text-rose-600 dark:text-rose-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{analytics.escalationRate}%</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Escalation Rate</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 mb-2"><Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{analytics.aiResolutionRate}%</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">AI Resolution Rate</p>
                      </div>
                    </div>
                    {timeline.length > 0 && (
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Activity — Last 30 Days</h3>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={timeline} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickFormatter={(v: string) => v.slice(5)} interval={Math.floor(timeline.length / 6)} />
                            <YAxis tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            <Legend formatter={(v: string) => v === "conversations" ? "Conversations" : "Support Tickets"} wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="conversations" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                            <Line type="monotone" dataKey="support"       stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {analytics.topMachines.length > 0 && (
                        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                          <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Top Reported Machines</h3>
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={analytics.topMachines} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={90} />
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Support Request Status</h3>
                        {(analytics.pendingCount + analytics.activeCount + analytics.resolvedCount) === 0 ? (
                          <div className="flex items-center justify-center h-[200px] text-sm text-content-secondary dark:text-content-dark-secondary">No support requests yet</div>
                        ) : (
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={[{ name: "Pending", value: analytics.pendingCount }, { name: "Active", value: analytics.activeCount }, { name: "Resolved", value: analytics.resolvedCount }]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                <Cell fill="#f59e0b" /><Cell fill="#3b82f6" /><Cell fill="#10b981" />
                              </Pie>
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                    {analytics.recentIssues.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-3">Recent Issues</h3>
                        <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                          {analytics.recentIssues.map((issue, i) => (
                            <div key={issue.id} className={cn("px-4 py-3", i < analytics.recentIssues.length - 1 && "border-b border-line dark:border-line-dark")}>
                              <p className="text-sm text-content dark:text-content-dark truncate">{issue.problem}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{issue.customer.firstName} {issue.customer.lastName ?? ""}</span>
                                <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full", issue.status === "resolved" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : issue.status === "active" ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400")}>{issue.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              )}

              {/* ─── Customer Analytics View ─── */}
              {analyticsView === "customer" && (
                customerAnalyticsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                  </div>
                ) : !customerAnalytics ? (
                  <div className="text-center py-16 rounded-2xl border border-dashed border-line dark:border-line-dark">
                    <BarChart2 className="w-10 h-10 mx-auto mb-3 text-content-secondary dark:text-content-dark-secondary opacity-40" />
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No customer analytics data yet</p>
                  </div>
                ) : (
                  <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-primary-50 dark:bg-primary-500/10 mb-2"><MessageSquare className="w-5 h-5 text-primary-600 dark:text-primary-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{customerAnalytics.totalConversations}</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Customer Conversations</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 mb-2"><AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{customerAnalytics.totalSupportRequests}</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Support Escalations</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 mb-2"><Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">
                          {customerAnalytics.totalConversations > 0
                            ? Math.round(((customerAnalytics.totalConversations - customerAnalytics.totalSupportRequests) / customerAnalytics.totalConversations) * 100)
                            : 100}%
                        </p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">AI Resolution Rate</p>
                      </div>
                    </div>

                    {/* Timeline */}
                    {customerAnalytics.timeline.length > 0 && (
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Customer Activity — Last 30 Days</h3>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={customerAnalytics.timeline} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickFormatter={(v: string) => v.slice(5)} interval={Math.floor(customerAnalytics.timeline.length / 6)} />
                            <YAxis tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            <Legend formatter={(v: string) => v === "conversations" ? "Conversations" : "Support Tickets"} wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="conversations" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                            <Line type="monotone" dataKey="support"       stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Most Reported Complaints + Most Asked Questions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {customerAnalytics.topComplaints.length > 0 && (
                        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                          <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <h3 className="text-sm font-semibold text-content dark:text-content-dark">Most Reported Complaints</h3>
                          </div>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={customerAnalytics.topComplaints} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                              <YAxis type="category" dataKey="keyword" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={85} />
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                              <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {customerAnalytics.topQuestions.length > 0 && (
                        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                          <div className="flex items-center gap-2 mb-4">
                            <MessageSquare className="w-4 h-4 text-primary-500" />
                            <h3 className="text-sm font-semibold text-content dark:text-content-dark">Most Asked (Keywords)</h3>
                          </div>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={customerAnalytics.topQuestions} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                              <YAxis type="category" dataKey="keyword" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={85} />
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    {/* Support Status + Recent Issues */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Support Request Status</h3>
                        {(customerAnalytics.pendingCount + customerAnalytics.activeCount + customerAnalytics.resolvedCount) === 0 ? (
                          <div className="flex items-center justify-center h-[200px] text-sm text-content-secondary dark:text-content-dark-secondary">No support requests yet</div>
                        ) : (
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={[{ name: "Pending", value: customerAnalytics.pendingCount }, { name: "Active", value: customerAnalytics.activeCount }, { name: "Resolved", value: customerAnalytics.resolvedCount }]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                <Cell fill="#f59e0b" /><Cell fill="#3b82f6" /><Cell fill="#10b981" />
                              </Pie>
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                      {customerAnalytics.recentIssues.length > 0 && (
                        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                          <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-3">Recent Customer Issues</h3>
                          <div className="space-y-2 overflow-y-auto max-h-[210px] pr-1 scrollbar-thin">
                            {customerAnalytics.recentIssues.map((issue) => (
                              <div key={issue.id} className="px-3 py-2 rounded-xl bg-surface-hover dark:bg-surface-dark-hover">
                                <p className="text-xs text-content dark:text-content-dark truncate">{issue.problem}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{issue.customer.firstName} {issue.customer.lastName ?? ""}</span>
                                  <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full", issue.status === "resolved" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : issue.status === "active" ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400")}>{issue.status}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )
              )}

              {/* ─── Service Analytics View ─── */}
              {analyticsView === "service" && (
                serviceAnalyticsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                  </div>
                ) : !serviceAnalytics ? (
                  <div className="text-center py-16 rounded-2xl border border-dashed border-line dark:border-line-dark">
                    <BarChart2 className="w-10 h-10 mx-auto mb-3 text-content-secondary dark:text-content-dark-secondary opacity-40" />
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No service analytics data yet</p>
                  </div>
                ) : (
                  <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 mb-2"><MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{serviceAnalytics.totalConversations}</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Service Conversations</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 mb-2"><Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{serviceAnalytics.resolvedCount}</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Resolved Tickets</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <div className="inline-flex p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 mb-2"><AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" /></div>
                        <p className="text-xl font-bold text-content dark:text-content-dark">{serviceAnalytics.pendingCount + serviceAnalytics.activeCount}</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Open Tickets</p>
                      </div>
                    </div>

                    {/* Timeline */}
                    {serviceAnalytics.timeline.length > 0 && (
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Service Activity — Last 30 Days</h3>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={serviceAnalytics.timeline} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickFormatter={(v: string) => v.slice(5)} interval={Math.floor(serviceAnalytics.timeline.length / 6)} />
                            <YAxis tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            <Legend formatter={() => "Conversations"} wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="conversations" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Most Looked-Up Topics + Top Reported Machines */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {serviceAnalytics.topTopics.length > 0 && (
                        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                          <div className="flex items-center gap-2 mb-4">
                            <TrendingUp className="w-4 h-4 text-blue-500" />
                            <h3 className="text-sm font-semibold text-content dark:text-content-dark">Most Looked-Up Topics</h3>
                          </div>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={serviceAnalytics.topTopics} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                              <YAxis type="category" dataKey="keyword" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={85} />
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {serviceAnalytics.topMachines.length > 0 && (
                        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                          <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="w-4 h-4 text-rose-500" />
                            <h3 className="text-sm font-semibold text-content dark:text-content-dark">Top Reported Machines</h3>
                          </div>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={serviceAnalytics.topMachines} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={85} />
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                              <Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    {/* Support Status Pie */}
                    <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark max-w-sm">
                      <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Support Ticket Status</h3>
                      {(serviceAnalytics.pendingCount + serviceAnalytics.activeCount + serviceAnalytics.resolvedCount) === 0 ? (
                        <div className="flex items-center justify-center h-[200px] text-sm text-content-secondary dark:text-content-dark-secondary">No tickets yet</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={[{ name: "Pending", value: serviceAnalytics.pendingCount }, { name: "Active", value: serviceAnalytics.activeCount }, { name: "Resolved", value: serviceAnalytics.resolvedCount }]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                              <Cell fill="#f59e0b" /><Cell fill="#3b82f6" /><Cell fill="#10b981" />
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </>
                )
              )}

            </section>
          )}

          {/* ── Engineers Video Tab ── */}
          {activeTab === "rdvideos" && <RdVideosTab />}

          {/* ── Tickets Tab ── */}
          {activeTab === "tickets" && <TicketsTab />}

          {/* ── Products Tab ── */}
          {activeTab === "products" && <ProductsTab />}

          {activeTab === "whatsapp" && <WhatsAppSettingsTab />}

        </div>
      </main>
      </div>
    </div>
  );
}