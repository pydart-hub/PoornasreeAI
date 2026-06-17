"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  LogOut,
  Upload,
  Trash2,
  PanelLeftClose,
  PanelLeft,
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
  Database,
  Plus,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Logo, Avatar, ThemeToggle, Badge, LoadingScreen, ResponsiveSidebar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";
import {
  getDocuments,
  saveDocument,
  deleteDocument,
  extractTextFromFile,
  formatFileSize,
  type TrainedDocument,
} from "@/lib/documentStore";
import {
  getKnowledgeRows,
  addKnowledgeRow,
  deleteKnowledgeRow,
  type KnowledgeRow,
} from "@/lib/knowledgeStore";
import ManualComplaintsTab from "@/components/admin/ManualComplaintsTab";

// ─────────────────────────────────────────────────────────────
// MOCK USERS (mirrors AuthProvider mock data)
// ─────────────────────────────────────────────────────────────
const ALL_USERS = [
  { id: "usr_001", firstName: "Admin", lastName: "Poornasree", email: "admin@poornasree.com", role: "admin", department: "Administration", status: "online" as const },
  { id: "usr_002", firstName: "Rajan", lastName: "Kumar", email: "service@poornasree.com", role: "service", department: "Service", status: "online" as const },
  { id: "usr_003", firstName: "Priya", lastName: "Sharma", email: "rd@poornasree.com", role: "service", department: "Service", status: "offline" as const },
  { id: "usr_005", firstName: "Amit", lastName: "Patel", email: "customer@example.com", role: "customer", department: "Customer", status: "offline" as const },
];

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, exact: true },
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function getRoleBadge(role: string) {
  const map: Record<string, { label: string; variant: "info" | "success" | "warning" | "accent" | "default" }> = {
    service: { label: "Service Engineer", variant: "info" },

    admin: { label: "Administrator", variant: "default" },
    customer: { label: "Customer", variant: "info" },
    user: { label: "Standard User", variant: "default" },
  };
  return map[role] ?? { label: role, variant: "default" as const };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const today = new Date().toLocaleDateString("en-IN", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
});

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "\u{1F4C4}";
  if (["doc", "docx"].includes(ext)) return "\u{1F4DD}";
  if (["xls", "xlsx", "csv"].includes(ext)) return "\u{1F4CA}";
  if (["json"].includes(ext)) return "\u{1F527}";
  if (["txt", "md", "log"].includes(ext)) return "\u{1F4C3}";
  return "\u{1F4CE}";
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"documents" | "users" | "knowledge">("documents");
  const [documents, setDocuments] = useState<TrainedDocument[]>([]);
  const [knowledgeRows, setKnowledgeRows] = useState<KnowledgeRow[]>([]);
  const [newComplaint, setNewComplaint] = useState("");
  const [newTroubleshooting, setNewTroubleshooting] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [uploadMessage, setUploadMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Load documents
  const refreshDocuments = useCallback(() => {
    setDocuments(getDocuments());
    setKnowledgeRows(getKnowledgeRows());
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  // Responsive
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // Auth guard — only admin
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
    if (!isLoading && user && user.role !== "admin") router.replace("/");
  }, [user, isLoading, router]);

  // Handle file upload
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!user) return;
    setUploading(true);
    setUploadMessage(null);

    let successCount = 0;
    let errorCount = 0;

    for (const file of Array.from(files)) {
      try {
        const content = await extractTextFromFile(file);

        const doc: TrainedDocument = {
          id: crypto.randomUUID(),
          fileName: file.name,
          fileType: file.type || "unknown",
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
          uploadedBy: `${user.firstName} ${user.lastName ?? ""}`.trim(),
          content,
          status: content.length > 10 ? "trained" : "error",
        };

        saveDocument(doc);
        successCount++;
      } catch {
        errorCount++;
      }
    }

    refreshDocuments();
    setUploading(false);

    if (successCount > 0 && errorCount === 0) {
      setUploadMessage({ text: `${successCount} document(s) uploaded & trained successfully!`, type: "success" });
    } else if (successCount > 0 && errorCount > 0) {
      setUploadMessage({ text: `${successCount} uploaded, ${errorCount} failed.`, type: "error" });
    } else {
      setUploadMessage({ text: "Upload failed. Please try again.", type: "error" });
    }

    setTimeout(() => setUploadMessage(null), 5000);
  }, [user, refreshDocuments]);

  const handleDeleteDoc = useCallback((id: string) => {
    deleteDocument(id);
    refreshDocuments();
  }, [refreshDocuments]);

  const handleAddKnowledge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComplaint.trim() || !newTroubleshooting.trim()) return;
    addKnowledgeRow({
      complaint: newComplaint,
      documentIssueSteps: newTroubleshooting,
    });
    setNewComplaint("");
    setNewTroubleshooting("");
    refreshDocuments();
  };

  const handleDeleteKnowledge = (id: string) => {
    if (!confirm("Delete this entry?")) return;
    deleteKnowledgeRow(id);
    refreshDocuments();
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Filter users
  const filteredUsers = ALL_USERS.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.firstName.toLowerCase().includes(q) ||
      u.lastName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q)
    );
  });

  if (isLoading) return <LoadingScreen message="Loading dashboard..." />;
  if (!user) return null;

  const roleBadge = getRoleBadge(user.role);
  const trainedCount = documents.filter((d) => d.status === "trained").length;

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-surface dark:bg-surface-dark">

      {/* ── Sidebar ── */}
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={260}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark shrink-0">
          <Logo variant="full" size="sm" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              typeof window !== "undefined" &&
              (item.exact
                ? window.location.pathname === item.href
                : window.location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300"
                    : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <span className="opacity-70">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

          <div className="pt-3 pb-1 px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary mb-2">
              Admin
            </p>
            <button
              onClick={() => setActiveTab("documents")}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                activeTab === "documents"
                  ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium"
                  : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              )}
            >
              <FileText className="w-3.5 h-3.5" /> Documents
              {trainedCount > 0 && (
                <span className="ml-auto text-xs bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 px-1.5 py-0.5 rounded-full">
                  {trainedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                activeTab === "users"
                  ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium"
                  : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              )}
            >
              <Users className="w-3.5 h-3.5" /> Users
              <span className="ml-auto text-xs bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 px-1.5 py-0.5 rounded-full">
                {ALL_USERS.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("knowledge")}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors mt-0.5",
                activeTab === "knowledge"
                  ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium"
                  : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              )}
            >
              <Database className="w-3.5 h-3.5" /> Knowledge Base
              {knowledgeRows.length > 0 && (
                <span className="ml-auto text-xs bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 px-1.5 py-0.5 rounded-full">
                  {knowledgeRows.length}
                </span>
              )}
            </button>
          </div>
        </nav>

        <div className="shrink-0 border-t border-line dark:border-line-dark p-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">Theme</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2 p-2 rounded-xl hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
            <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" status="online" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{user.department}</p>
            </div>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">

        <header className="sticky top-0 z-10 bg-surface/80 dark:bg-surface-dark/80 backdrop-blur border-b border-line dark:border-line-dark px-4 sm:px-6 py-3 flex items-center gap-3">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors shrink-0"
            >
              {isMobile ? <Menu className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          )}
          <div className="flex-1">
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{today}</p>
          </div>
          <Badge variant={roleBadge.variant} dot>{roleBadge.label}</Badge>
        </header>

        <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-8">

          {/* Welcome */}
          <section>
            <div className="flex items-center gap-3 mb-1">
              <Shield className="w-5 h-5 text-primary dark:text-primary-300" />
              <h1 className="text-2xl font-bold text-content dark:text-content-dark">
                {getGreeting()}, {user.firstName}!
              </h1>
            </div>
            <p className="text-content-secondary dark:text-content-dark-secondary text-sm">
              Admin Dashboard — Upload training documents and manage users.
            </p>
          </section>

          {/* Quick Stats */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
              <div className="inline-flex p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 mb-2">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-xl font-bold text-content dark:text-content-dark">{documents.length}</p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Total Documents</p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
              <div className="inline-flex p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-xl font-bold text-content dark:text-content-dark">{trainedCount}</p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Trained &amp; Active</p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
              <div className="inline-flex p-2 rounded-xl bg-violet-50 dark:bg-violet-500/10 mb-2">
                <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="text-xl font-bold text-content dark:text-content-dark">{ALL_USERS.length}</p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Total Users</p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
              <div className="inline-flex p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 mb-2">
                <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-xl font-bold text-content dark:text-content-dark">AI</p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Chat Powered</p>
            </div>
          </section>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary w-fit">
            <button
              onClick={() => setActiveTab("documents")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === "documents"
                  ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                  : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
              )}
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>Documents</span>
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === "users"
                  ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                  : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Users</span>
            </button>
            <button
              onClick={() => setActiveTab("knowledge")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === "knowledge"
                  ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                  : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
              )}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Knowledge Base</span>
            </button>
          </div>

          {/* ── Documents Tab ── */}
          {activeTab === "documents" && (
            <section className="space-y-6">

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
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                <div className="flex flex-col items-center gap-3">
                  {uploading ? (
                    <>
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-sm font-medium text-content dark:text-content-dark">Processing &amp; training document...</p>
                    </>
                  ) : (
                    <>
                      <div className="p-4 rounded-2xl bg-primary/10 dark:bg-primary-400/10">
                        <Upload className="w-8 h-8 text-primary dark:text-primary-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-content dark:text-content-dark">
                          Click to upload or drag &amp; drop files here
                        </p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">
                          Supports any format — PDF, DOCX, CSV, JSON, TXT, Excel, and more
                        </p>
                      </div>
                      <p className="text-xs text-primary dark:text-primary-300 font-medium">
                        Documents will be automatically trained for AI chat responses
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Upload status message */}
              {uploadMessage && (
                <div
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium animate-fade-in",
                    uploadMessage.type === "success"
                      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20"
                      : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20"
                  )}
                >
                  {uploadMessage.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  {uploadMessage.text}
                </div>
              )}

              {/* Documents list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-content dark:text-content-dark">
                    Trained Documents ({documents.length})
                  </h2>
                </div>

                {documents.length === 0 ? (
                  <div className="text-center py-12 rounded-2xl border border-dashed border-line dark:border-line-dark">
                    <File className="w-10 h-10 text-content-secondary dark:text-content-dark-secondary mx-auto mb-3 opacity-40" />
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                      No documents uploaded yet
                    </p>
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">
                      Upload documents above to train the AI for answering user questions
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
                        <span className="text-2xl shrink-0">{getFileIcon(doc.fileName)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                            {doc.fileName}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                              {formatFileSize(doc.fileSize)}
                            </span>
                            <span className="text-xs text-content-secondary dark:text-content-dark-secondary flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(doc.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                              by {doc.uploadedBy}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <Badge
                            variant={doc.status === "trained" ? "success" : doc.status === "processing" ? "warning" : "error"}
                            dot
                            size="sm"
                          >
                            {doc.status === "trained" ? "Trained" : doc.status === "processing" ? "Processing" : "Error"}
                          </Badge>
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* How it works */}
              <div className="p-5 rounded-2xl bg-primary/5 dark:bg-primary-400/5 border border-primary/20 dark:border-primary-400/20">
                <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-2">
                  How Document Training Works
                </h3>
                <ol className="text-xs text-content-secondary dark:text-content-dark-secondary space-y-1.5 list-decimal list-inside">
                  <li>Upload any document (PDF, DOCX, CSV, TXT, JSON, Excel, etc.)</li>
                  <li>The system extracts text content from the document automatically</li>
                  <li>Content is stored and indexed for the AI knowledge base</li>
                  <li>When any user asks a question about machine malfunction, the AI searches your uploaded documents and gives answers based on the instructions in those documents</li>
                </ol>
              </div>
            </section>
          )}

          {/* ── Knowledge Base Tab ── */}
          {activeTab === "knowledge" && (
            <section className="space-y-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-content dark:text-content-dark">
                      Structured Knowledge Base
                    </h2>
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                      Manually add complaints and troubleshooting steps to train the AI.
                    </p>
                  </div>
                </div>

                {/* Add new entry form */}
                <form onSubmit={handleAddKnowledge} className="mb-6 p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark flex gap-3 flex-col sm:flex-row items-end">
                  <div className="flex-1 w-full space-y-1">
                    <label className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary">Complaint</label>
                    <input
                      required
                      value={newComplaint}
                      onChange={(e) => setNewComplaint(e.target.value)}
                      placeholder="e.g. Machine is making a loud noise"
                      className="w-full h-10 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="flex-1 w-full space-y-1">
                    <label className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary">Troubleshooting Steps</label>
                    <input
                      required
                      value={newTroubleshooting}
                      onChange={(e) => setNewTroubleshooting(e.target.value)}
                      placeholder="e.g. Check the motor bearings and tighten belts"
                      className="w-full h-10 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-600 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </form>

                {/* Excel-like Table View */}
                <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                  <div className="hidden sm:grid sm:grid-cols-[1fr_2fr_auto] gap-4 px-5 py-3 border-b border-line dark:border-line-dark bg-surface-tertiary dark:bg-surface-dark-tertiary">
                    <span className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">Complaint</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">Troubleshooting Steps</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary text-right">Actions</span>
                  </div>

                  {knowledgeRows.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No manual entries yet. Add one above.</p>
                    </div>
                  ) : (
                    knowledgeRows.map((row, i) => (
                      <div
                        key={row.id}
                        className={cn(
                          "flex flex-col sm:grid sm:grid-cols-[1fr_2fr_auto] gap-2 sm:gap-4 px-5 py-4 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors items-start sm:items-center",
                          i < knowledgeRows.length - 1 && "border-b border-line dark:border-line-dark"
                        )}
                      >
                        <p className="text-sm font-medium text-content dark:text-content-dark">{row.complaint}</p>
                        <p className="text-sm text-content-secondary dark:text-content-dark-secondary whitespace-pre-wrap">{row.documentIssueSteps}</p>
                        <div className="flex items-center justify-end w-full sm:w-auto">
                          <button
                            onClick={() => handleDeleteKnowledge(row.id)}
                            className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <hr className="border-line dark:border-line-dark" />
              
              {/* Manual Customer Complaints View */}
              <ManualComplaintsTab />
            </section>
          )}

          {/* ── Users Tab ── */}
          {activeTab === "users" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-content dark:text-content-dark">
                  All Users ({ALL_USERS.length})
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users..."
                    className="h-9 pl-9 pr-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                {/* Table header */}
                <div className="hidden sm:grid sm:grid-cols-5 gap-4 px-5 py-3 border-b border-line dark:border-line-dark bg-surface-tertiary dark:bg-surface-dark-tertiary">
                  <span className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">User</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">Email</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">Role</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">Department</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">Status</span>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No users found</p>
                  </div>
                ) : (
                  filteredUsers.map((u, i) => {
                    const badge = getRoleBadge(u.role);
                    return (
                      <div
                        key={u.id}
                        className={cn(
                          "flex flex-col sm:grid sm:grid-cols-5 gap-2 sm:gap-4 px-5 py-4 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors",
                          i < filteredUsers.length - 1 && "border-b border-line dark:border-line-dark"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar name={`${u.firstName} ${u.lastName}`} size="sm" status={u.status} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                              {u.firstName} {u.lastName}
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
                          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">{u.department}</p>
                        </div>
                        <div className="flex items-center">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-medium",
                            u.status === "online" ? "text-emerald-600 dark:text-emerald-400" : "text-content-secondary dark:text-content-dark-secondary"
                          )}>
                            <span className={cn(
                              "w-2 h-2 rounded-full",
                              u.status === "online" ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                            )} />
                            {u.status === "online" ? "Online" : "Offline"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
