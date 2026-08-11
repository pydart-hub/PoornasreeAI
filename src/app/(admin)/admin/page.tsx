"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart2,
  Ticket,
  Package,
  Youtube,
  GraduationCap,
  FileText,
  Film,
  Users,
  MessageSquare,
  LayoutDashboard,
  LifeBuoy,
  UserCheck,
  Palette,
  Bot,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";
import type { ApiUser, ApiDocument, ApiVideo } from "@/components/admin/types";

import AdminLayout from "@/components/admin/AdminLayout";
import SubNav, { type SubNavItem } from "@/components/admin/SubNav";

import DashboardTab from "@/components/admin/DashboardTab";
import DocumentsTab from "@/components/admin/DocumentsTab";
import UsersTab from "@/components/admin/UsersTab";
import VideosTab from "@/components/admin/VideosTab";
import AnalyticsTab from "@/components/admin/AnalyticsTab";

import RdVideosTab from "@/components/admin/RdVideosTab";
import TicketsTab from "@/components/admin/TicketsTab";
import ProductsTab from "@/components/admin/ProductsTab";
import WhatsAppSettingsTab from "@/components/admin/WhatsAppSettingsTab";
import WhatsappAnalyticsPanel from "@/components/admin/WhatsappAnalyticsPanel";
import RegisteredCustomersTab from "@/components/admin/RegisteredCustomersTab";
import TestCustomerPanel from "@/components/admin/TestCustomerPanel";
import BrandingTab from "@/components/admin/BrandingTab";
import TroubleshootingTemplatesTab from "@/components/admin/TroubleshootingTemplatesTab";
import ManualComplaintsTab from "@/components/admin/ManualComplaintsTab";

import ExcelEditorModal from "@/components/admin/ExcelEditorModal";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getRoleBadge(role: string) {
  const map: Record<string, { label: string; variant: string }> = {
    admin:            { label: "Administrator",     variant: "default" },
    service:          { label: "Service Engineer",  variant: "info" },
    sales:            { label: "Sales",             variant: "success" },
    customer:         { label: "Customer",          variant: "accent" },
    customer_support: { label: "Customer Support",  variant: "warning" },
  };
  return map[role] ?? { label: role, variant: "default" };
}

// ─────────────────────────────────────────────
// Core Navigation Union Types
// ─────────────────────────────────────────────
type MainTab = "dashboard" | "whatsapp" | "training" | "users" | "support" | "analytics";

type WhatsAppSubTab = "settings" | "analytics" | "customers";
type TrainingSubTab = "documents" | "videos" | "rdvideos" | "troubleshooting";
type UsersSubTab = "system-users";
type SupportSubTab = "tickets" | "complaints" | "products";
type AnalyticsSubTab = "analytics" | "branding" | "test-panel";

const VALID_MAIN_TABS: MainTab[] = ["dashboard", "whatsapp", "training", "users", "support", "analytics"];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTabState] = useState<MainTab>("dashboard");

  // Inner sub-tabs state
  const [whatsAppSubTab, setWhatsAppSubTabState] = useState<WhatsAppSubTab>("settings");
  const [trainingSubTab, setTrainingSubTabState] = useState<TrainingSubTab>("documents");
  const [usersSubTab, setUsersSubTabState] = useState<UsersSubTab>("system-users");
  const [supportSubTab, setSupportSubTabState] = useState<SupportSubTab>("tickets");
  const [analyticsSubTab, setAnalyticsSubTabState] = useState<AnalyticsSubTab>("analytics");

  // Synchronize state with URL parameters & browser history (pushState / popstate)
  const syncUrlState = useCallback((tab: MainTab, subTab?: string) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    if (subTab) {
      params.set("subTab", subTab);
    } else {
      params.delete("subTab");
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    if (window.location.search !== `?${params.toString()}`) {
      window.history.pushState({ tab, subTab }, "", newUrl);
    }
  }, []);

  const handleTabChange = useCallback((newTab: MainTab) => {
    setActiveTabState(newTab);
    let sub: string | undefined = undefined;
    if (newTab === "whatsapp") sub = whatsAppSubTab;
    if (newTab === "training") sub = trainingSubTab;
    if (newTab === "users") sub = usersSubTab;
    if (newTab === "support") sub = supportSubTab;
    if (newTab === "analytics") sub = analyticsSubTab;
    syncUrlState(newTab, sub);
  }, [whatsAppSubTab, trainingSubTab, usersSubTab, supportSubTab, analyticsSubTab, syncUrlState]);

  const handleSubTabChange = useCallback((tab: MainTab, subTab: string) => {
    if (tab === "whatsapp") setWhatsAppSubTabState(subTab as WhatsAppSubTab);
    if (tab === "training") setTrainingSubTabState(subTab as TrainingSubTab);
    if (tab === "users") setUsersSubTabState(subTab as UsersSubTab);
    if (tab === "support") setSupportSubTabState(subTab as SupportSubTab);
    if (tab === "analytics") setAnalyticsSubTabState(subTab as AnalyticsSubTab);
    syncUrlState(tab, subTab);
  }, [syncUrlState]);

  // ── Listen for Browser Back & Forward Buttons (Popstate) & Mount URL ──
  useEffect(() => {
    const parseAndApplyUrlState = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as MainTab;
      const subTabParam = params.get("subTab");

      if (tabParam && VALID_MAIN_TABS.includes(tabParam)) {
        setActiveTabState(tabParam);
        if (subTabParam) {
          if (tabParam === "whatsapp") setWhatsAppSubTabState(subTabParam as WhatsAppSubTab);
          if (tabParam === "training") setTrainingSubTabState(subTabParam as TrainingSubTab);
          if (tabParam === "users") setUsersSubTabState(subTabParam as UsersSubTab);
          if (tabParam === "support") setSupportSubTabState(subTabParam as SupportSubTab);
          if (tabParam === "analytics") setAnalyticsSubTabState(subTabParam as AnalyticsSubTab);
        }
      }
    };

    // Apply URL params on page mount
    parseAndApplyUrlState();

    // Listen for browser Back/Forward navigation
    const onPopState = () => {
      parseAndApplyUrlState();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Users
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Documents
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [uploadDocType, setUploadDocType] = useState<"service" | "customer">("service");

  // Videos
  const [videos, setVideos] = useState<ApiVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoForm, setVideoForm] = useState({ title: "", description: "", youtubeUrl: "", keywords: "" });
  const [videoFormError, setVideoFormError] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [editingVideo, setEditingVideo] = useState<ApiVideo | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  // Analytics
  const [analyticsView, setAnalyticsView] = useState<"overview" | "customer" | "service" | "whatsapp">("overview");
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [timeline, setTimeline] = useState<Record<string, unknown>[]>([]);
  const [customerAnalytics, setCustomerAnalytics] = useState<Record<string, unknown> | null>(null);
  const [customerAnalyticsLoading, setCustomerAnalyticsLoading] = useState(false);
  const [serviceAnalytics, setServiceAnalytics] = useState<Record<string, unknown> | null>(null);
  const [serviceAnalyticsLoading, setServiceAnalyticsLoading] = useState(false);
  const [waAnalyticsReload, setWaAnalyticsReload] = useState(0);

  // ── Responsive ──────────────────────────────
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // ── Auth guard ──────────────────────────────
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
    if (!isLoading && user && user.role !== "admin") router.replace("/login");
  }, [user, isLoading, router]);

  // ── Fetch functions ─────────────────────────
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

  // ── Initial data load ──────────────────────
  useEffect(() => {
    if (user?.role === "admin") {
      fetchUsers();
      fetchDocuments();
      fetchVideos();
    }
  }, [user, fetchUsers, fetchDocuments, fetchVideos]);

  useEffect(() => {
    if (activeTab === "analytics" && user?.role === "admin" && !analytics && !analyticsLoading) {
      fetchAnalytics();
    }
  }, [activeTab, user, analytics, analyticsLoading, fetchAnalytics]);

  useEffect(() => {
    if (activeTab !== "analytics" || user?.role !== "admin") return;
    if (analyticsView === "customer" && !customerAnalytics && !customerAnalyticsLoading) {
      fetchCustomerAnalytics();
    }
    if (analyticsView === "service" && !serviceAnalytics && !serviceAnalyticsLoading) {
      fetchServiceAnalytics();
    }
  }, [analyticsView, activeTab, user, customerAnalytics, customerAnalyticsLoading, serviceAnalytics, serviceAnalyticsLoading, fetchCustomerAnalytics, fetchServiceAnalytics]);

  // ── Video CRUD ─────────────────────────────
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
      const res = await fetch(url, {
        method: editingVideo ? "PATCH" : "POST",
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

  // ── Upload PDF ─────────────────────────────
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
        if (res.ok) successCount++;
        else { errorCount++; const body = await res.json().catch(() => ({})); console.error("[upload] HTTP", res.status, body); }
      } catch (uploadErr) { errorCount++; console.error("[upload] network error", uploadErr); }
    }

    try { await fetchDocuments(); } finally { setUploading(false); }

    if (successCount > 0 && errorCount === 0) setUploadMessage({ text: `${successCount} document(s) uploaded and trained successfully!`, type: "success" });
    else if (successCount > 0) setUploadMessage({ text: `${successCount} uploaded, ${errorCount} failed.`, type: "error" });
    else setUploadMessage({ text: "Upload failed. Please check the file and try again.", type: "error" });
    setTimeout(() => setUploadMessage(null), 5000);
  }, [fetchDocuments, uploadDocType]);

  // ── Delete document ────────────────────────
  const handleDeleteDoc = useCallback(async (id: string) => {
    setDeletingDocId(id);
    try {
      await fetch(`/api/admin/documents/${id}`, { method: "DELETE", credentials: "include" });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingDocId(null);
    }
  }, []);

  // ── Delete user ────────────────────────────
  const handleDeleteUser = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
    setDeletingUserId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== id));
    } finally {
      setDeletingUserId(null);
    }
  }, []);

  // ── Drag & drop ────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  // ── SubNav Configurations ──────────────────
  const whatsappNavItems: SubNavItem<WhatsAppSubTab>[] = [
    { key: "settings", label: "WhatsApp Persona & API", icon: MessageSquare },
    { key: "analytics", label: "WhatsApp Analytics & Activity", icon: BarChart2 },
    { key: "customers", label: "WhatsApp Registered Customers", icon: UserCheck },
  ];

  const trainingNavItems: SubNavItem<TrainingSubTab>[] = [
    { key: "documents", label: "Training Documents", icon: FileText, count: documents.length },
    { key: "videos", label: "Customer Videos", icon: Youtube, count: videos.length },
    { key: "rdvideos", label: "Engineer & R&D Videos", icon: Film },
    { key: "troubleshooting", label: "Templates & Guides", icon: GraduationCap },
  ];

  const usersNavItems: SubNavItem<UsersSubTab>[] = [
    { key: "system-users", label: "System Users", icon: Users, count: users.length },
  ];

  const supportNavItems: SubNavItem<SupportSubTab>[] = [
    { key: "tickets", label: "Support Tickets", icon: Ticket },
    { key: "complaints", label: "Manual Complaints", icon: AlertCircle },
    { key: "products", label: "Products Catalog", icon: Package },
  ];

  const settingsNavItems: SubNavItem<AnalyticsSubTab>[] = [
    { key: "analytics", label: "AI Analytics", icon: BarChart2 },
    { key: "branding", label: "Branding Settings", icon: Palette },
    { key: "test-panel", label: "Test Customer Panel", icon: Bot },
  ];

  // ── Consolidated Sidebar Nav Sections ──────
  const navSections = [
    {
      label: "Overview",
      items: [
        { key: "dashboard" as MainTab, label: "Dashboard", icon: LayoutDashboard, count: null },
      ],
    },
    {
      label: "Modules",
      items: [
        { key: "whatsapp" as MainTab, label: "WhatsApp Hub", icon: MessageSquare, count: null },
        { key: "training" as MainTab, label: "Knowledge & Training", icon: GraduationCap, count: documents.length + videos.length },
        { key: "users" as MainTab, label: "System Users", icon: Users, count: users.length },
        { key: "support" as MainTab, label: "Support & Operations", icon: LifeBuoy, count: null },
        { key: "analytics" as MainTab, label: "Analytics & Settings", icon: BarChart2, count: null },
      ],
    },
  ];

  // ── Render ─────────────────────────────────
  if (isLoading) return <LoadingScreen message="Loading admin panel..." />;
  if (!user) return null;

  const handleLogout = () => { logout(); router.replace("/login"); };

  return (
    <AdminLayout
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen((v) => !v)}
      onLogout={handleLogout}
      navSections={navSections}
      activeTab={activeTab}
      onTabChange={(tab) => handleTabChange(tab as MainTab)}
      pageTitle="Admin Panel"
    >
      {/* ── 1. Dashboard ── */}
      {activeTab === "dashboard" && (
        <DashboardTab
          documents={documents}
          users={users}
          onNavigateUsers={() => handleTabChange("users")}
          onNavigateTab={(tab, subTab) => {
            handleTabChange(tab as MainTab);
            if (subTab) handleSubTabChange(tab as MainTab, subTab);
          }}
        />
      )}

      {/* ── 2. WhatsApp Hub ── */}
      {activeTab === "whatsapp" && (
        <div className="space-y-6">
          <SubNav<WhatsAppSubTab>
            title="WhatsApp Integration & Customer Portal"
            subtitle="Configure WhatsApp API credentials, AI persona prompts, view live analytics & message activity, and inspect registered customers."
            items={whatsappNavItems}
            activeTab={whatsAppSubTab}
            onTabChange={(sub) => handleSubTabChange("whatsapp", sub)}
          />

          {whatsAppSubTab === "settings" && <WhatsAppSettingsTab />}
          {whatsAppSubTab === "analytics" && <WhatsappAnalyticsPanel />}
          {whatsAppSubTab === "customers" && <RegisteredCustomersTab />}
        </div>
      )}

      {/* ── 3. Knowledge & Training ── */}
      {activeTab === "training" && (
        <div className="space-y-6">
          <SubNav<TrainingSubTab>
            title="Knowledge Base & Training Center"
            subtitle="Manage AI training documents, video tutorials, R&D guides, and troubleshooting templates."
            items={trainingNavItems}
            activeTab={trainingSubTab}
            onTabChange={(sub) => handleSubTabChange("training", sub)}
          />

          {trainingSubTab === "documents" && (
            <DocumentsTab
              documents={documents}
              docsLoading={docsLoading}
              onFetchDocuments={fetchDocuments}
              onHandleFiles={handleFiles}
              onHandleDeleteDoc={handleDeleteDoc}
              onHandleDragOver={handleDragOver}
              onHandleDragLeave={handleDragLeave}
              onHandleDrop={handleDrop}
              uploadDocType={uploadDocType}
              onSetUploadDocType={setUploadDocType}
              uploading={uploading}
              uploadMessage={uploadMessage}
              deletingDocId={deletingDocId}
              editingDocId={editingDocId}
              onSetEditingDocId={setEditingDocId}
              fileInputRef={fileInputRef}
              dragOver={dragOver}
              getRoleBadge={getRoleBadge}
              currentUser={user}
            />
          )}

          {trainingSubTab === "videos" && (
            <VideosTab
              videos={videos}
              videosLoading={videosLoading}
              onFetchVideos={fetchVideos}
              onSaveVideo={handleSaveVideo}
              onStartEditVideo={startEditVideo}
              onCancelEditVideo={cancelEditVideo}
              onDeleteVideo={handleDeleteVideo}
              videoForm={videoForm}
              onSetVideoForm={setVideoForm}
              videoFormError={videoFormError}
              editingVideo={editingVideo}
              savingVideo={savingVideo}
              deletingVideoId={deletingVideoId}
            />
          )}

          {trainingSubTab === "rdvideos" && <RdVideosTab />}
          {trainingSubTab === "troubleshooting" && <TroubleshootingTemplatesTab />}
        </div>
      )}

      {/* ── 4. Users & Accounts ── */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <SubNav<UsersSubTab>
            title="Users & Access Directory"
            subtitle="Manage administrator accounts, service engineers, sales reps, and support staff."
            items={usersNavItems}
            activeTab={usersSubTab}
            onTabChange={(sub) => handleSubTabChange("users", sub)}
          />

          {usersSubTab === "system-users" && (
            <UsersTab
              users={users}
              usersLoading={usersLoading}
              userSearch={userSearch}
              onSetUserSearch={setUserSearch}
              onFetchUsers={fetchUsers}
              onCreateUser={() => router.push("/admin/users")}
              onDeleteUser={handleDeleteUser}
              deletingUserId={deletingUserId}
              currentUserId={user.id}
              getRoleBadge={getRoleBadge}
            />
          )}
        </div>
      )}

      {/* ── 5. Support & Operations ── */}
      {activeTab === "support" && (
        <div className="space-y-6">
          <SubNav<SupportSubTab>
            title="Support & Field Operations"
            subtitle="Track support tickets, review manual complaints, and manage the products catalog."
            items={supportNavItems}
            activeTab={supportSubTab}
            onTabChange={(sub) => handleSubTabChange("support", sub)}
          />

          {supportSubTab === "tickets" && <TicketsTab />}
          {supportSubTab === "complaints" && <ManualComplaintsTab />}
          {supportSubTab === "products" && <ProductsTab />}
        </div>
      )}

      {/* ── 6. Analytics & Settings ── */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <SubNav<AnalyticsSubTab>
            title="Analytics & System Configuration"
            subtitle="View AI performance metrics, customize branding, and test customer AI chat flows."
            items={settingsNavItems}
            activeTab={analyticsSubTab}
            onTabChange={(sub) => handleSubTabChange("analytics", sub)}
          />

          {analyticsSubTab === "analytics" && (
            <AnalyticsTab
              analyticsView={analyticsView}
              analytics={analytics as any}
              analyticsLoading={analyticsLoading}
              timeline={timeline as any}
              customerAnalytics={customerAnalytics as any}
              customerAnalyticsLoading={customerAnalyticsLoading}
              serviceAnalytics={serviceAnalytics as any}
              serviceAnalyticsLoading={serviceAnalyticsLoading}
              waAnalyticsReload={waAnalyticsReload}
              onSetAnalyticsView={setAnalyticsView}
              onFetchAnalytics={fetchAnalytics}
              onFetchCustomerAnalytics={fetchCustomerAnalytics}
              onFetchServiceAnalytics={fetchServiceAnalytics}
              onSetAnalytics={setAnalytics as any}
              onSetCustomerAnalytics={setCustomerAnalytics as any}
              onSetServiceAnalytics={setServiceAnalytics as any}
              onSetWaAnalyticsReload={setWaAnalyticsReload}
            />
          )}

          {analyticsSubTab === "branding" && <BrandingTab />}
          {analyticsSubTab === "test-panel" && <TestCustomerPanel />}
        </div>
      )}

      {/* Excel Editor Modal */}
      {editingDocId && (
        <ExcelEditorModal
          documentId={editingDocId}
          onClose={() => setEditingDocId(null)}
        />
      )}
    </AdminLayout>
  );
}
