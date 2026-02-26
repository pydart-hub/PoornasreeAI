"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  BarChart2,
  Upload,
  Download,
  Tag,
  PlayCircle,
  Search,
  TrendingUp,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Flame,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Menu,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Filter,
  MoreVertical,
  Zap,
  Shield,
  BookOpen,
  X,
  FileSpreadsheet,
  Video,
  Link2,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Logo, Avatar, ThemeToggle, Badge, LoadingScreen } from "@/components/ui";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const STATS = [
  {
    label: "Total Chats Today",
    value: "47",
    delta: "+12%",
    up: true,
    sub: "vs yesterday",
    icon: <MessageSquare className="w-5 h-5" />,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    label: "Active Sessions",
    value: "8",
    delta: "+3",
    up: true,
    sub: "right now",
    icon: <Activity className="w-5 h-5" />,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    label: "Resolved Issues",
    value: "34",
    delta: "72%",
    up: true,
    sub: "resolution rate",
    icon: <CheckCircle2 className="w-5 h-5" />,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10",
  },
  {
    label: "Escalated",
    value: "5",
    delta: "-2",
    up: false,
    sub: "from last week",
    icon: <AlertTriangle className="w-5 h-5" />,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    label: "Avg. Response",
    value: "1.9s",
    delta: "-0.3s",
    up: true,
    sub: "AI latency",
    icon: <Clock className="w-5 h-5" />,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
  },
  {
    label: "Docs in RAG",
    value: "12",
    delta: "+2",
    up: true,
    sub: "training files",
    icon: <BookOpen className="w-5 h-5" />,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
  },
];

const RECENT_CHATS = [
  { id: "c1", user: "Rajan Kumar", role: "service", message: "VIBRO not working – LED is off", product: "VIBRO", tag: "hardware", status: "resolved", time: "2 min ago", model: "Mistral 7B", tokens: 312 },
  { id: "c2", user: "Priya Sharma", role: "r_and_d", message: "ECOD-DPST display not responding on power up", product: "ECOD-DPST", tag: "display", status: "open", time: "11 min ago", model: "Mistral 7B", tokens: 489 },
  { id: "c3", user: "Amit Patel", role: "sales", message: "Solar charger board shows no charging LED", product: "Solar Charger", tag: "power", status: "resolved", time: "28 min ago", model: "Mistral 7B", tokens: 278 },
  { id: "c4", user: "Kavitha R.", role: "service", message: "Analyzer mainboard T2 temperature error after calibration", product: "Mainboard", tag: "calibration", status: "escalated", time: "1h ago", model: "Mistral 7B", tokens: 601 },
  { id: "c5", user: "Dinesh M.", role: "production", message: "Pump running in wrong direction", product: "Pump", tag: "motor", status: "resolved", time: "2h ago", model: "Mistral 7B", tokens: 195 },
  { id: "c6", user: "Lakshmi V.", role: "service", message: "Battery full LED not turning on after full charge", product: "Battery", tag: "power", status: "open", time: "3h ago", model: "Mistral 7B", tokens: 220 },
];

const TRENDING_QUERIES = [
  { rank: 1, query: "VIBRO not working – LED not on", product: "VIBRO", count: 34, tag: "hardware", trend: +8 },
  { rank: 2, query: "Analyzer Mainboard T2/Temperature error", product: "Mainboard", count: 28, tag: "calibration", trend: +5 },
  { rank: 3, query: "ECOD-DPST display not working", product: "ECOD-DPST", count: 22, tag: "display", trend: -2 },
  { rank: 4, query: "Battery not charging – solar charger", product: "Solar Charger", count: 19, tag: "power", trend: +3 },
  { rank: 5, query: "Pump not responding or wrong direction", product: "Pump", count: 14, tag: "motor", trend: 0 },
  { rank: 6, query: "Compact adapter zero output voltage", product: "Compact Adapter", count: 11, tag: "hardware", trend: +2 },
  { rank: 7, query: "ECOD USB port not detected", product: "ECOD-DPST", count: 9, tag: "connectivity", trend: -1 },
  { rank: 8, query: "Charger adapter LED on but no output", product: "Charger Adapter", count: 7, tag: "power", trend: 0 },
];

const DOCUMENTS = [
  { id: "d1", name: "Training syllabus and documents.xlsx.csv", type: "csv", size: "48 KB", status: "indexed", chunks: 77, category: "troubleshooting", uploadedBy: "Admin", uploadedAt: "2026-02-20" },
  { id: "d2", name: "VIBRO Service Manual v2.pdf", type: "pdf", size: "2.1 MB", status: "indexed", chunks: 134, category: "manual", uploadedBy: "Admin", uploadedAt: "2026-02-18" },
  { id: "d3", name: "Analyzer Mainboard Datasheet.pdf", type: "pdf", size: "1.8 MB", status: "indexed", chunks: 98, category: "manual", uploadedBy: "Admin", uploadedAt: "2026-02-15" },
  { id: "d4", name: "ECOD-DPST Fault Codes.json", type: "json", size: "120 KB", status: "processing", chunks: 0, category: "troubleshooting", uploadedBy: "Admin", uploadedAt: "2026-02-26" },
  { id: "d5", name: "Pump Motor Specs.xlsx.csv", type: "csv", size: "32 KB", status: "failed", chunks: 0, category: "training", uploadedBy: "Admin", uploadedAt: "2026-02-25" },
];

const VIDEOS = [
  { id: "v1", title: "VIBRO Stirrer — Complete Repair & Troubleshooting", product: "VIBRO", url: "https://www.youtube.com/watch?v=example1", views: "12.4K", duration: "8:42", tags: ["repair", "hardware"] },
  { id: "v2", title: "ECOD-DPST Board Display & Keypad Fault Fix", product: "ECOD-DPST", url: "https://www.youtube.com/watch?v=example2", views: "9.1K", duration: "11:15", tags: ["display", "keypad"] },
  { id: "v3", title: "Analyzer Mainboard — Calibration & Sensor Setup", product: "Mainboard", url: "https://www.youtube.com/watch?v=example3", views: "18.2K", duration: "14:30", tags: ["calibration", "sensor"] },
  { id: "v4", title: "Solar Charger Board — Voltage Testing Guide", product: "Solar Charger", url: "https://www.youtube.com/watch?v=example4", views: "5.7K", duration: "6:55", tags: ["power", "voltage"] },
];

const PRODUCTS_LIST = ["VIBRO", "Solar Charger", "Compact Adapter", "Charger Adapter", "ECOD-DPST", "Pump", "Battery", "Mainboard", "Others"];

const WEEKLY_DATA = [
  { day: "Mon", queries: 38, resolved: 29 },
  { day: "Tue", queries: 52, resolved: 40 },
  { day: "Wed", queries: 44, resolved: 33 },
  { day: "Thu", queries: 61, resolved: 48 },
  { day: "Fri", queries: 47, resolved: 34 },
  { day: "Sat", queries: 22, resolved: 18 },
  { day: "Sun", queries: 15, resolved: 13 },
];

const TAG_COLORS: Record<string, string> = {
  hardware: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  calibration: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  display: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  power: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  motor: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
  connectivity: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300",
};

const ISSUE_TAGS = [
  { label: "Hardware", count: 34, color: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20" },
  { label: "Calibration", count: 28, color: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300 border border-violet-200 dark:border-violet-500/20" },
  { label: "Power", count: 22, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20" },
  { label: "Display", count: 16, color: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20" },
  { label: "Connectivity", count: 12, color: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/20" },
  { label: "Motor", count: 9, color: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20" },
  { label: "Escalated", count: 5, color: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300 border border-red-200 dark:border-red-500/20" },
];

const MAX_WEEKLY = Math.max(...WEEKLY_DATA.map((d) => d.queries));

const NAV_SECTIONS = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "chats", label: "Chat Activity", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "analytics", label: "Analytics", icon: <BarChart2 className="w-4 h-4" /> },
  { id: "faqs", label: "Search Trends", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "tags", label: "Issue Tags", icon: <Tag className="w-4 h-4" /> },
  { id: "documents", label: "Documents", icon: <FileText className="w-4 h-4" /> },
  { id: "videos", label: "Video Mapping", icon: <Video className="w-4 h-4" /> },
];

function getToday() {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    open: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    escalated: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    indexed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    processing: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    failed: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    pending: "bg-slate-50 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium", map[status] ?? map.pending)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function DocTypeIcon({ type }: { type: string }) {
  const map: Record<string, string> = { csv: "text-emerald-600", pdf: "text-red-500", json: "text-amber-600", xlsx: "text-emerald-700" };
  return <FileSpreadsheet className={cn("w-4 h-4 shrink-0", map[type] ?? "text-slate-500")} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState("all");
  const [faqSearch, setFaqSearch] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newVideo, setNewVideo] = useState({ title: "", product: "", url: "" });
  const [videos, setVideos] = useState(VIDEOS);
  const [docs, setDocs] = useState(DOCUMENTS);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "admin")) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  const handleExportCSV = () => {
    const headers = ["User", "Role", "Product", "Message", "Tag", "Status", "Time", "Tokens"];
    const rows = RECENT_CHATS.map((c) =>
      [c.user, c.role, c.product, `"${c.message}"`, c.tag, c.status, c.time, c.tokens].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setTimeout(() => {
      const newDoc = {
        id: `d${Date.now()}`,
        name: file.name,
        type: file.name.split(".").pop() ?? "unknown",
        size: `${(file.size / 1024).toFixed(1)} KB`,
        status: "processing",
        chunks: 0,
        category: "training",
        uploadedBy: user?.firstName ?? "Admin",
        uploadedAt: new Date().toISOString().split("T")[0],
      };
      setDocs((prev) => [newDoc, ...prev]);
      setUploading(false);
      setActiveSection("documents");
    }, 1500);
  };

  const handleAddVideo = () => {
    if (!newVideo.title || !newVideo.product || !newVideo.url) return;
    setVideos((prev) => [
      { id: `v${Date.now()}`, ...newVideo, views: "0", duration: "—", tags: [] },
      ...prev,
    ]);
    setNewVideo({ title: "", product: "", url: "" });
    setAddVideoOpen(false);
  };

  const filteredChats = RECENT_CHATS.filter((c) => {
    const matchSearch = chatSearch === "" || c.message.toLowerCase().includes(chatSearch.toLowerCase()) || c.user.toLowerCase().includes(chatSearch.toLowerCase());
    const matchFilter = chatFilter === "all" || c.status === chatFilter;
    return matchSearch && matchFilter;
  });

  const filteredFAQs = TRENDING_QUERIES.filter((q) =>
    faqSearch === "" || q.query.toLowerCase().includes(faqSearch.toLowerCase()) || q.product.toLowerCase().includes(faqSearch.toLowerCase())
  );

  if (isLoading) return <LoadingScreen message="Loading admin dashboard..." />;
  if (!user) return null;

  return (
    <div className="h-screen flex overflow-hidden bg-[#F8FAFC] dark:bg-[#0F1117]">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-col h-full bg-white dark:bg-[#161B27] border-r border-slate-200 dark:border-slate-800 transition-all duration-300 shrink-0 z-40",
          isMobile ? "fixed inset-y-0 left-0" : "relative",
          !sidebarOpen && (isMobile ? "-translate-x-full" : "w-0 overflow-hidden border-r-0"),
          sidebarOpen && "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <Logo variant="full" size="sm" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Admin badge */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 dark:bg-primary-400/5 border border-primary/10 dark:border-primary-400/10">
            <Shield className="w-3.5 h-3.5 text-primary dark:text-primary-300 shrink-0" />
            <span className="text-xs font-semibold text-primary dark:text-primary-300">Administrator</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
          {NAV_SECTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveSection(item.id); if (isMobile) setSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                activeSection === item.id
                  ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              )}
            >
              <span className={cn("opacity-60", activeSection === item.id && "opacity-100")}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-3 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-slate-400 dark:text-slate-500">Theme</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
            <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" status="online" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user.firstName}</p>
              <p className="text-xs text-slate-400 truncate">admin</p>
            </div>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B27] flex items-center px-4 gap-3 z-10">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isMobile ? <Menu className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {NAV_SECTIONS.find((s) => s.id === activeSection)?.label ?? "Dashboard"}
            </h1>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block shrink-0">{getToday()}</p>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-colors shrink-0"
          >
            <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading..." : "Upload Doc"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.pdf,.json,.xlsx" className="hidden" onChange={handleFileUpload} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

            {/* ── OVERVIEW ─────────────────────────────────────── */}
            {activeSection === "overview" && (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {STATS.map((s) => (
                    <div key={s.label} className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-sm transition-shadow">
                      <div className={cn("inline-flex p-2 rounded-xl mb-3", s.bg)}>
                        <span className={s.color}>{s.icon}</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{s.value}</p>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5 leading-tight">{s.label}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {s.up ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-red-400" />}
                        <span className={cn("text-xs font-semibold", s.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>{s.delta}</span>
                        <span className="text-xs text-slate-400">{s.sub}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Weekly bars */}
                  <div className="lg:col-span-2 bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Weekly Chat Activity</p>
                        <p className="text-xs text-slate-400 mt-0.5">Queries vs resolved — last 7 days</p>
                      </div>
                      <BarChart2 className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex items-end gap-2 h-36">
                      {WEEKLY_DATA.map((d) => (
                        <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex flex-col items-center gap-0.5" style={{ height: "120px", justifyContent: "flex-end" }}>
                            <div
                              className="w-full rounded-t-md bg-primary/20 dark:bg-primary-400/20"
                              style={{ height: `${(d.queries / MAX_WEEKLY) * 110}px` }}
                            />
                            <div
                              className="w-full rounded-t-md bg-primary dark:bg-primary-400 -mt-[inherit] absolute"
                              style={{ height: `${(d.resolved / MAX_WEEKLY) * 110}px`, position: "relative" }}
                            />
                          </div>
                          <span className="text-xs text-slate-400">{d.day}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-primary/20 dark:bg-primary-400/20" /><span className="text-xs text-slate-400">Total queries</span></div>
                      <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-primary dark:bg-primary-400" /><span className="text-xs text-slate-400">Resolved</span></div>
                    </div>
                  </div>

                  {/* Resolution donuts */}
                  <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Resolution Breakdown</p>
                    <p className="text-xs text-slate-400 mb-5">This week</p>
                    <div className="space-y-3">
                      {[
                        { label: "Resolved", pct: 72, color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
                        { label: "Open", pct: 18, color: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
                        { label: "Escalated", pct: 10, color: "bg-red-500", text: "text-red-600 dark:text-red-400" },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-600 dark:text-slate-300">{item.label}</span>
                            <span className={cn("text-xs font-bold", item.text)}>{item.pct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all duration-700", item.color)} style={{ width: `${item.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-xs text-slate-400 mb-2">Top category this week</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-primary dark:text-primary-300">Hardware</span>
                        <span className="text-xs text-slate-400">34 issues</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent chats preview */}
                <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Live Chat Feed</p>
                    <button onClick={() => setActiveSection("chats")} className="text-xs text-primary dark:text-primary-300 hover:underline font-medium">
                      View all →
                    </button>
                  </div>
                  {RECENT_CHATS.slice(0, 4).map((chat, i) => (
                    <div key={chat.id} className={cn("flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors", i < 3 && "border-b border-slate-100 dark:border-slate-800")}>
                      <Avatar name={chat.user} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{chat.user}</span>
                          <span className={cn("text-xs px-1.5 py-0.5 rounded-md font-medium", TAG_COLORS[chat.tag] ?? "")}>{chat.tag}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{chat.message}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <StatusPill status={chat.status} />
                        <span className="text-xs text-slate-400">{chat.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── CHAT ACTIVITY ─────────────────────────────────── */}
            {activeSection === "chats" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={chatSearch}
                      onChange={(e) => setChatSearch(e.target.value)}
                      placeholder="Search chats by user or message..."
                      className="w-full pl-9 pr-4 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E2535] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    {["all", "open", "resolved", "escalated"].map((f) => (
                      <button
                        key={f}
                        onClick={() => setChatFilter(f)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-semibold capitalize transition-colors border",
                          chatFilter === f
                            ? "bg-primary text-white border-primary"
                            : "bg-white dark:bg-[#1E2535] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary/50"
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3">User</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3 hidden md:table-cell">Message</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3 hidden sm:table-cell">Product</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3">Tag</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3">Status</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3 hidden lg:table-cell">Tokens</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChats.map((chat, i) => (
                        <tr key={chat.id} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors", i < filteredChats.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <Avatar name={chat.user} size="sm" />
                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{chat.user}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 hidden md:table-cell max-w-[240px]">
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{chat.message}</p>
                          </td>
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{chat.product}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium", TAG_COLORS[chat.tag] ?? "")}>{chat.tag}</span>
                          </td>
                          <td className="px-5 py-3.5"><StatusPill status={chat.status} /></td>
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <span className="text-xs text-slate-400 font-mono">{chat.tokens}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-slate-400 whitespace-nowrap">{chat.time}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredChats.length === 0 && (
                    <div className="py-12 text-center text-sm text-slate-400">No chats match your filters.</div>
                  )}
                </div>
              </div>
            )}

            {/* ── ANALYTICS ─────────────────────────────────────── */}
            {activeSection === "analytics" && (
              <div className="space-y-5">
                {/* Stat summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Queries (7d)", value: "279", color: "text-primary dark:text-primary-300" },
                    { label: "Resolved (7d)", value: "215", color: "text-emerald-600 dark:text-emerald-400" },
                    { label: "Avg Tokens / Chat", value: "349", color: "text-violet-600 dark:text-violet-400" },
                    { label: "Unique Users (7d)", value: "24", color: "text-amber-600 dark:text-amber-400" },
                  ].map((s) => (
                    <div key={s.label} className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                      <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                      <p className="text-xs text-slate-400 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Horizontal product usage bars */}
                <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Query Volume by Product</p>
                  <p className="text-xs text-slate-400 mb-5">All-time resolved queries per equipment type</p>
                  <div className="space-y-3">
                    {[
                      { name: "Analyzer Mainboard", count: 41, color: "bg-rose-500" },
                      { name: "VIBRO", count: 34, color: "bg-blue-500" },
                      { name: "ECOD-DPST Board", count: 28, color: "bg-violet-500" },
                      { name: "Solar Charger Board", count: 21, color: "bg-amber-500" },
                      { name: "Compact Adapter", count: 18, color: "bg-emerald-500" },
                      { name: "Charger Adapter", count: 15, color: "bg-orange-500" },
                      { name: "Pump", count: 12, color: "bg-cyan-500" },
                      { name: "Battery", count: 9, color: "bg-lime-500" },
                      { name: "Others", count: 7, color: "bg-slate-400" },
                    ].map((p) => (
                      <div key={p.name} className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 dark:text-slate-300 w-40 shrink-0 truncate">{p.name}</span>
                        <div className="flex-1 h-5 rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className={cn("h-full rounded-lg transition-all duration-700", p.color)} style={{ width: `${(p.count / 41) * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-6 text-right shrink-0">{p.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Weekly chart */}
                <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Daily Query Volume</p>
                  <p className="text-xs text-slate-400 mb-5">Last 7 days</p>
                  <div className="flex items-end gap-3 h-40">
                    {WEEKLY_DATA.map((d) => (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{d.queries}</span>
                        <div className="w-full relative" style={{ height: "100px" }}>
                          <div
                            className="w-full rounded-t-lg bg-primary/15 dark:bg-primary-400/15 absolute bottom-0"
                            style={{ height: `${(d.queries / MAX_WEEKLY) * 100}%` }}
                          />
                          <div
                            className="w-full rounded-t-md bg-primary dark:bg-primary-400 absolute bottom-0"
                            style={{ height: `${(d.resolved / MAX_WEEKLY) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{d.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── SEARCH TRENDS / FAQs ─────────────────────────── */}
            {activeSection === "faqs" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={faqSearch}
                    onChange={(e) => setFaqSearch(e.target.value)}
                    placeholder="Search trending queries..."
                    className="w-full pl-9 pr-4 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E2535] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <span className="text-xs font-semibold text-slate-400 w-8">#</span>
                    <span className="text-xs font-semibold text-slate-400 flex-1">Query</span>
                    <span className="text-xs font-semibold text-slate-400 hidden sm:block w-28">Product</span>
                    <span className="text-xs font-semibold text-slate-400 hidden md:block w-24">Tag</span>
                    <span className="text-xs font-semibold text-slate-400 w-16 text-right">Count</span>
                    <span className="text-xs font-semibold text-slate-400 w-16 text-right">Trend</span>
                  </div>
                  {filteredFAQs.map((faq, i) => (
                    <div key={faq.rank} className={cn("flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors", i < filteredFAQs.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                      <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        i === 0 ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300" :
                        i === 1 ? "bg-slate-100 dark:bg-slate-700 text-slate-500" :
                        "bg-slate-50 dark:bg-slate-800 text-slate-400"
                      )}>
                        {i === 0 ? <Flame className="w-3.5 h-3.5" /> : `${faq.rank}`}
                      </span>
                      <p className="flex-1 text-sm text-slate-800 dark:text-slate-100 truncate min-w-0">{faq.query}</p>
                      <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block w-28 truncate shrink-0">{faq.product}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium hidden md:block w-24 shrink-0", TAG_COLORS[faq.tag] ?? "")}>{faq.tag}</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100 w-16 text-right shrink-0">{faq.count}</span>
                      <span className={cn("text-xs font-semibold w-16 text-right shrink-0 flex items-center justify-end gap-0.5",
                        faq.trend > 0 ? "text-emerald-600 dark:text-emerald-400" : faq.trend < 0 ? "text-red-500" : "text-slate-400"
                      )}>
                        {faq.trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : faq.trend < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                        {faq.trend !== 0 ? Math.abs(faq.trend) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ISSUE TAGS ────────────────────────────────────── */}
            {activeSection === "tags" && (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {ISSUE_TAGS.map((tag) => (
                    <button
                      key={tag.label}
                      onClick={() => setActiveTagFilter(activeTagFilter === tag.label ? null : tag.label)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                        tag.color,
                        activeTagFilter === tag.label && "ring-2 ring-offset-2 ring-current scale-105"
                      )}
                    >
                      <span className="w-2 h-2 rounded-full bg-current opacity-70" />
                      {tag.label}
                      <span className="ml-1 bg-white/40 dark:bg-black/20 px-1.5 py-0.5 rounded-md text-xs">{tag.count}</span>
                    </button>
                  ))}
                </div>

                <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-5">Issue Distribution</p>
                  <div className="space-y-3">
                    {ISSUE_TAGS.map((tag) => (
                      <div key={tag.label} className="flex items-center gap-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md w-28 text-center", tag.color)}>{tag.label}</span>
                        <div className="flex-1 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-lg bg-primary/60 dark:bg-primary-400/60 transition-all duration-700"
                            style={{ width: `${(tag.count / 34) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-8 text-right">{tag.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {activeTagFilter ? `Issues tagged: ${activeTagFilter}` : "All tagged issues"}
                    </p>
                  </div>
                  {RECENT_CHATS.filter((c) => !activeTagFilter || c.tag === activeTagFilter.toLowerCase()).map((chat, i, arr) => (
                    <div key={chat.id} className={cn("flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors", i < arr.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                      <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium shrink-0", TAG_COLORS[chat.tag] ?? "")}>{chat.tag}</span>
                      <p className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{chat.message}</p>
                      <span className="text-xs text-slate-400 shrink-0">{chat.product}</span>
                      <StatusPill status={chat.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── DOCUMENTS ─────────────────────────────────────── */}
            {activeSection === "documents" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{docs.length} documents — {docs.filter((d) => d.status === "indexed").length} indexed</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Upload New
                  </button>
                </div>

                <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3">File</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3 hidden sm:table-cell">Category</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3">Status</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3 hidden md:table-cell">Chunks</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3 hidden lg:table-cell">Uploaded</th>
                        <th className="text-left text-xs font-semibold text-slate-400 px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((doc, i) => (
                        <tr key={doc.id} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors", i < docs.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <DocTypeIcon type={doc.type} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate max-w-[180px]">{doc.name}</p>
                                <p className="text-xs text-slate-400">{doc.type.toUpperCase()} · {doc.size}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">{doc.category}</span>
                          </td>
                          <td className="px-5 py-3.5"><StatusPill status={doc.status} /></td>
                          <td className="px-5 py-3.5 hidden md:table-cell">
                            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{doc.chunks || "—"}</span>
                          </td>
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <span className="text-xs text-slate-400">{doc.uploadedAt}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1">
                              {doc.status === "failed" && (
                                <button className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors" title="Reprocess">
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => setDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center gap-3 text-sm text-slate-400">
                  <Info className="w-4 h-4 shrink-0" />
                  Accepted formats: CSV, PDF, JSON, XLSX · Max 50 MB per file. Uploaded files are processed through the RAG pipeline automatically.
                </div>
              </div>
            )}

            {/* ── VIDEO MAPPING ──────────────────────────────────── */}
            {activeSection === "videos" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500 dark:text-slate-400">{videos.length} videos mapped to products</p>
                  <button
                    onClick={() => setAddVideoOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Video
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {videos.map((video) => (
                    <div key={video.id} className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center shrink-0">
                        <PlayCircle className="w-5 h-5 text-primary dark:text-primary-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{video.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 px-2 py-0.5 rounded-md font-medium">{video.product}</span>
                          <span className="text-xs text-slate-400">{video.duration}</span>
                          <span className="text-xs text-slate-400">{video.views} views</span>
                        </div>
                        <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1.5 text-xs text-primary dark:text-primary-300 hover:underline truncate">
                          <Link2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{video.url}</span>
                        </a>
                      </div>
                      <button
                        onClick={() => setVideos((prev) => prev.filter((v) => v.id !== video.id))}
                        className="p-1.5 h-fit rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Video Modal */}
                {addVideoOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-[#1E2535] rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 shadow-2xl">
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Map New Video</h3>
                        <button onClick={() => setAddVideoOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Video Title</label>
                          <input
                            value={newVideo.title}
                            onChange={(e) => setNewVideo((v) => ({ ...v, title: e.target.value }))}
                            placeholder="e.g. VIBRO Repair Guide"
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Product</label>
                          <select
                            value={newVideo.product}
                            onChange={(e) => setNewVideo((v) => ({ ...v, product: e.target.value }))}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                          >
                            <option value="">Select product...</option>
                            {PRODUCTS_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">YouTube / Video URL</label>
                          <input
                            value={newVideo.url}
                            onChange={(e) => setNewVideo((v) => ({ ...v, url: e.target.value }))}
                            placeholder="https://youtube.com/watch?v=..."
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-5">
                        <button onClick={() => setAddVideoOpen(false)} className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleAddVideo} className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-colors">
                          Add Video
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}

  MessageSquare,
  FileText,
  Settings,
  LogOut,
  Wrench,
  Zap,
  Cpu,
  Battery,
  Plug,
  Waves,
  CircuitBoard,
  HelpCircle,
  PanelLeftClose,
  PanelLeft,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Menu,
  Mic,
  PlayCircle,
  ExternalLink,
  Tag,
  BarChart2,
  Star,
  Upload,
  Download,
  Flame,
  Volume2,
  Activity,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Logo, Avatar, ThemeToggle, Badge, LoadingScreen } from "@/components/ui";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const PRODUCTS = [
  {
    name: "VIBRO",
    description: "Stirrer / vibration unit issues",
    icon: <Waves className="w-5 h-5" />,
    complaints: ["Not working – LED off", "LED on but not vibrating", "Continuous vibration", "Low vibration", "Blown fuse"],
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-100 dark:border-blue-500/20",
    pill: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
    queryCount: 34,
  },
  {
    name: "Solar Charger Board",
    description: "Charging voltage & LED faults",
    icon: <Zap className="w-5 h-5" />,
    complaints: ["Battery not charging", "Green LED issues", "Cutoff problems", "External battery fault"],
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-100 dark:border-amber-500/20",
    pill: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
    queryCount: 21,
  },
  {
    name: "Compact Adapter",
    description: "Adapter output voltage zero",
    icon: <Plug className="w-5 h-5" />,
    complaints: ["Zero output (LSE V3)", "Zero output (ECO V)", "Voltage fluctuation"],
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-100 dark:border-emerald-500/20",
    pill: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    queryCount: 18,
  },
  {
    name: "Charger Adapter",
    description: "Adapter faults (LSE-S / ECOD)",
    icon: <Battery className="w-5 h-5" />,
    complaints: ["Zero output (LSE-S V3/ECOD/ECOSV)", "LED glowing but no output"],
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-500/10",
    border: "border-orange-100 dark:border-orange-500/20",
    pill: "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300",
    queryCount: 15,
  },
  {
    name: "ECOD-DPST Board",
    description: "Display, keypad, connectivity",
    icon: <CircuitBoard className="w-5 h-5" />,
    complaints: ["Please wait loop", "Display not working", "Keypad fault", "WiFi/GSM issues", "SD card errors", "Printer fault"],
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-100 dark:border-violet-500/20",
    pill: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300",
    queryCount: 28,
  },
  {
    name: "Pump",
    description: "Pump motor & sensor faults",
    icon: <Cpu className="w-5 h-5" />,
    complaints: ["Pump not working", "Wrong direction", "Sensing errors"],
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
    border: "border-cyan-100 dark:border-cyan-500/20",
    pill: "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
    queryCount: 12,
  },
  {
    name: "Battery (ECOD/ECOSV/LSES V3)",
    description: "Battery charge level issues",
    icon: <Battery className="w-5 h-5" />,
    complaints: ["Low battery error shown", "Battery full LED issues"],
    color: "text-lime-600 dark:text-lime-400",
    bg: "bg-lime-50 dark:bg-lime-500/10",
    border: "border-lime-100 dark:border-lime-500/20",
    pill: "bg-lime-100 dark:bg-lime-500/20 text-lime-700 dark:text-lime-300",
    queryCount: 9,
  },
  {
    name: "Analyzer Mainboard",
    description: "Core board, sensors, calibration",
    icon: <Wrench className="w-5 h-5" />,
    complaints: ["T2/Temp errors", "Sensor issues", "Calibration failures", "LCD fault", "WiFi/GSM fault"],
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-100 dark:border-rose-500/20",
    pill: "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300",
    queryCount: 41,
  },
  {
    name: "Others",
    description: "General analyzer issues",
    icon: <HelpCircle className="w-5 h-5" />,
    complaints: ["Analyzer not working (general)"],
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-500/10",
    border: "border-slate-100 dark:border-slate-500/20",
    pill: "bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300",
    queryCount: 7,
  },
];

const STATS = [
  { label: "Queries Today", value: "12", sub: "+3 from yesterday", icon: <MessageSquare className="w-5 h-5" />, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10" },
  { label: "Issues Resolved", value: "9", sub: "75% resolution rate", icon: <CheckCircle2 className="w-5 h-5" />, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  { label: "Open / Escalated", value: "3", sub: "Needs follow-up", icon: <AlertTriangle className="w-5 h-5" />, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" },
  { label: "Avg. AI Response", value: "1.8s", sub: "Mistral 7B model", icon: <Clock className="w-5 h-5" />, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-500/10" },
  { label: "Videos Watched", value: "6", sub: "Troubleshooting guides", icon: <PlayCircle className="w-5 h-5" />, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-500/10" },
  { label: "Docs in Training", value: "4", sub: "RAG knowledge base", icon: <BookOpen className="w-5 h-5" />, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-500/10" },
];

const VIDEO_RECOMMENDATIONS = [
  {
    title: "VIBRO Stirrer — Complete Repair & Troubleshooting",
    product: "VIBRO",
    duration: "8:42",
    views: "12.4K",
    url: "https://www.youtube.com/results?search_query=milk+analyzer+stirrer+vibro+repair",
    thumb: "bg-blue-100 dark:bg-blue-500/20",
    icon: <Waves className="w-4 h-4" />,
    color: "text-blue-600 dark:text-blue-400",
  },
  {
    title: "ECOD-DPST Board Display & Keypad Fault Fix",
    product: "ECOD-DPST",
    duration: "11:15",
    views: "9.1K",
    url: "https://www.youtube.com/results?search_query=ecod+dpst+board+display+repair",
    thumb: "bg-violet-100 dark:bg-violet-500/20",
    icon: <CircuitBoard className="w-4 h-4" />,
    color: "text-violet-600 dark:text-violet-400",
  },
  {
    title: "Analyzer Mainboard — Calibration & Sensor Setup",
    product: "Mainboard",
    duration: "14:30",
    views: "18.2K",
    url: "https://www.youtube.com/results?search_query=milk+analyzer+mainboard+calibration",
    thumb: "bg-rose-100 dark:bg-rose-500/20",
    icon: <Wrench className="w-4 h-4" />,
    color: "text-rose-600 dark:text-rose-400",
  },
  {
    title: "Solar Charger Board — Voltage Testing Guide",
    product: "Solar Charger",
    duration: "6:55",
    views: "5.7K",
    url: "https://www.youtube.com/results?search_query=solar+charger+board+milk+analyzer+voltage",
    thumb: "bg-amber-100 dark:bg-amber-500/20",
    icon: <Zap className="w-4 h-4" />,
    color: "text-amber-600 dark:text-amber-400",
  },
];

const TRENDING_FAQS = [
  { rank: 1, query: "VIBRO not working – LED not on", product: "VIBRO", count: 34, tag: "hardware" },
  { rank: 2, query: "Analyzer Mainboard T2/Temperature error", product: "Mainboard", count: 28, tag: "calibration" },
  { rank: 3, query: "ECOD-DPST display not working", product: "ECOD-DPST", count: 22, tag: "display" },
  { rank: 4, query: "Battery not charging – solar charger", product: "Solar Charger", count: 19, tag: "power" },
  { rank: 5, query: "Pump not responding or wrong direction", product: "Pump", count: 14, tag: "motor" },
];

const TAG_COLORS: Record<string, string> = {
  hardware: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  calibration: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  display: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  power: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  motor: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
};

const ISSUE_TAGS = [
  { label: "Hardware", count: 18, color: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" },
  { label: "Calibration", count: 11, color: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300" },
  { label: "Power / Charging", count: 9, color: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" },
  { label: "Display", count: 7, color: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  { label: "Connectivity", count: 6, color: "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300" },
  { label: "Escalated", count: 3, color: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300" },
];

const RECENT_ACTIVITY = [
  { product: "VIBRO", complaint: "NOT WORKING (NOT ON LED)", time: "2 min ago", status: "resolved", tag: "hardware" },
  { product: "ECOD-DPST BOARD", complaint: "DISPLAY NOT WORKING", time: "18 min ago", status: "resolved", tag: "display" },
  { product: "PUMP", complaint: "PUMP NOT WORKING", time: "45 min ago", status: "open", tag: "motor" },
  { product: "ANALYZER MAINBOARD", complaint: "T2/TEMP ERRORS", time: "1h 20m ago", status: "escalated", tag: "calibration" },
  { product: "SOLAR CHARGER BOARD", complaint: "BATTERY CHARGING VOLTAGE", time: "2h ago", status: "resolved", tag: "power" },
];

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, exact: true },
  { href: "/chat", label: "AI Chat", icon: <MessageSquare className="w-4 h-4" /> },
  { href: "/documents", label: "Documents", icon: <FileText className="w-4 h-4" />, permission: "documents.read" },
  { href: "/settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
];

const MAX_QUERY = Math.max(...PRODUCTS.map((p) => p.queryCount));

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getRoleBadge(role: string) {
  const map: Record<string, { label: string; variant: "info" | "success" | "warning" | "accent" | "default" }> = {
    service: { label: "Service Engineer", variant: "info" },
    r_and_d: { label: "R&D Manager", variant: "success" },
    production: { label: "Production Manager", variant: "warning" },
    sales: { label: "Sales Manager", variant: "accent" },
    admin: { label: "Administrator", variant: "default" },
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

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ServiceDashboard() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"overview" | "analytics" | "videos" | "faqs">("overview");

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [user, isLoading, router]);

  const handleAskAboutProduct = (productName: string, complaint: string) => {
    router.push(`/chat?q=${encodeURIComponent(`${productName}: ${complaint}`)}`);
  };

  if (isLoading) return <LoadingScreen message="Loading dashboard..." />;
  if (!user) return null;

  const roleBadge = getRoleBadge(user.role);

  return (
    <div className="h-screen flex overflow-hidden bg-surface dark:bg-surface-dark">

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-col h-full bg-surface-sidebar dark:bg-surface-dark-sidebar border-r border-line dark:border-line-dark transition-all duration-300 ease-in-out shrink-0",
          isMobile ? "fixed inset-y-0 left-0 z-40 w-[260px]" : "relative",
          !sidebarOpen && (isMobile ? "-translate-x-full" : "w-0 overflow-hidden border-r-0"),
          sidebarOpen && "w-[260px]"
        )}
      >
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
          {NAV_ITEMS.filter(
            (item) => !item.permission || (user.permissions && user.permissions[item.permission])
          ).map((item) => {
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
              Quick Sections
            </p>
            {([
              { id: "overview", label: "Equipment", icon: <Wrench className="w-3.5 h-3.5" /> },
              { id: "analytics", label: "Analytics", icon: <BarChart2 className="w-3.5 h-3.5" /> },
              { id: "videos", label: "Video Guides", icon: <PlayCircle className="w-3.5 h-3.5" /> },
              { id: "faqs", label: "Trending FAQs", icon: <Flame className="w-3.5 h-3.5" /> },
            ] as const).map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                  activeSection === s.id
                    ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium"
                    : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                {s.icon} {s.label}
              </button>
            ))}
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
      </aside>

      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main content ─────────────────────────────── */}
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

        <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-8">

          {/* Welcome */}
          <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-content dark:text-content-dark">
                {getGreeting()}, {user.firstName}! 👋
              </h1>
              <p className="text-content-secondary dark:text-content-dark-secondary mt-1 text-sm">
                Your AI-powered service dashboard — troubleshoot, learn, and track issues in real time.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => router.push("/chat")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-colors"
              >
                <Mic className="w-3.5 h-3.5" /> Voice Chat
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-line dark:border-line-dark text-xs font-medium text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              {user.permissions?.["documents.upload"] && (
                <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-line dark:border-line-dark text-xs font-medium text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                  <Upload className="w-3.5 h-3.5" /> Upload Docs
                </button>
              )}
            </div>
          </section>

          {/* Stats row — 6 cards */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark hover:border-primary/30 dark:hover:border-primary-400/30 transition-colors"
              >
                <div className={cn("inline-flex p-2 rounded-xl mb-3", stat.bg)}>
                  <span className={stat.color}>{stat.icon}</span>
                </div>
                <p className="text-xl font-bold text-content dark:text-content-dark">{stat.value}</p>
                <p className="text-xs font-medium text-content dark:text-content-dark mt-0.5 leading-tight">{stat.label}</p>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5 leading-tight">{stat.sub}</p>
              </div>
            ))}
          </section>

          {/* AI CTA — Audio Input/Output (from PDF) */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-primary-600 dark:from-primary-700 dark:to-primary-500 p-6 text-white">
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 opacity-70" />
                  <p className="text-sm font-medium opacity-80">Poornasree AI — RAG Chatbot</p>
                </div>
                <h2 className="text-xl font-bold mb-1">Ask anything about your equipment</h2>
                <p className="text-sm opacity-80 max-w-lg">
                  Get step-by-step troubleshooting. Supports <strong>text</strong> and <strong>voice input</strong> — AI also responds in natural audio.
                </p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-xs font-medium backdrop-blur">
                    <Mic className="w-3 h-3" /> Audio Input
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-xs font-medium backdrop-blur">
                    <Volume2 className="w-3 h-3" /> Voice Output
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-xs font-medium backdrop-blur">
                    <BookOpen className="w-3 h-3" /> Hindi &amp; English
                  </span>
                </div>
              </div>
              <div className="flex gap-2 sm:flex-col sm:items-end shrink-0">
                <Link href="/chat" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold backdrop-blur transition-colors">
                  <MessageSquare className="w-4 h-4" /> Text Chat <ChevronRight className="w-4 h-4" />
                </Link>
                <Link href="/chat" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-primary text-sm font-semibold hover:bg-white/90 transition-colors">
                  <Mic className="w-4 h-4" /> Voice Chat
                </Link>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
            <div className="absolute bottom-0 right-16 w-32 h-32 rounded-full bg-white/5 translate-y-1/3 pointer-events-none" />
          </section>

          {/* Issue Tags — from PDF: issue tagging & categorization */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
              <h2 className="text-sm font-bold text-content dark:text-content-dark">Issue Categories</h2>
              <span className="text-xs text-content-secondary dark:text-content-dark-secondary">— tap to filter</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ISSUE_TAGS.map((tag) => (
                <button
                  key={tag.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:scale-105 active:scale-100",
                    tag.color
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {tag.label} <span className="opacity-70">({tag.count})</span>
                </button>
              ))}
            </div>
          </section>

          {/* Section tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary w-fit">
            {([
              { id: "overview", label: "Equipment", icon: <Wrench className="w-3.5 h-3.5" /> },
              { id: "analytics", label: "Analytics", icon: <BarChart2 className="w-3.5 h-3.5" /> },
              { id: "videos", label: "Video Guides", icon: <PlayCircle className="w-3.5 h-3.5" /> },
              { id: "faqs", label: "Trending FAQs", icon: <Flame className="w-3.5 h-3.5" /> },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeSection === tab.id
                    ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                    : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
                )}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── Equipment tab ── */}
          {activeSection === "overview" && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-content dark:text-content-dark">Equipment Categories</h2>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                    Click a product → select complaint → opens AI chat with context
                  </p>
                </div>
                <TrendingUp className="w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PRODUCTS.map((product) => {
                  const isExpanded = activeProduct === product.name;
                  return (
                    <div
                      key={product.name}
                      className={cn(
                        "rounded-2xl border transition-all duration-200 overflow-hidden",
                        `${product.bg} ${product.border}`,
                        isExpanded && "ring-2 ring-primary/30 dark:ring-primary-400/30"
                      )}
                    >
                      <button
                        onClick={() => setActiveProduct(isExpanded ? null : product.name)}
                        className="w-full flex items-center gap-3 p-4 text-left"
                      >
                        <span className={cn("p-2 rounded-xl", product.pill)}>
                          <span className={product.color}>{product.icon}</span>
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-semibold truncate", product.color)}>{product.name}</p>
                          <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{product.description}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="text-xs font-bold text-content-secondary dark:text-content-dark-secondary">{product.queryCount}</span>
                          <ChevronRight className={cn("w-4 h-4 text-content-secondary shrink-0 transition-transform", isExpanded && "rotate-90")} />
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-1.5 animate-fade-in">
                          <p className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wider mb-2">Common Complaints</p>
                          {product.complaints.map((complaint) => (
                            <button
                              key={complaint}
                              onClick={() => handleAskAboutProduct(product.name, complaint)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/30 text-left text-xs text-content dark:text-content-dark transition-colors group"
                            >
                              <Wrench className="w-3 h-3 opacity-40 group-hover:opacity-70 shrink-0" />
                              <span className="flex-1">{complaint}</span>
                              <MessageSquare className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Analytics tab (Graphical analytics from PDF) ── */}
          {activeSection === "analytics" && (
            <section className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-content dark:text-content-dark">Query Trends by Product</h2>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">Total resolved queries per equipment</p>
              </div>
              <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card p-5 space-y-3">
                {[...PRODUCTS].sort((a, b) => b.queryCount - a.queryCount).map((product) => (
                  <div key={product.name} className="flex items-center gap-3">
                    <span className={cn("shrink-0 text-xs font-medium w-36 truncate", product.color)}>{product.name}</span>
                    <div className="flex-1 h-6 rounded-lg bg-surface-tertiary dark:bg-surface-dark-tertiary overflow-hidden">
                      <div
                        className={cn("h-full rounded-lg transition-all duration-700", product.pill)}
                        style={{ width: `${(product.queryCount / MAX_QUERY) * 100}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-bold text-content dark:text-content-dark w-8 text-right">{product.queryCount}</span>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="text-base font-bold text-content dark:text-content-dark mb-1">Weekly Activity</h2>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary mb-4">Queries per day — last 7 days</p>
                <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card p-5">
                  <div className="flex items-end justify-between gap-2 h-32">
                    {[
                      { day: "Mon", count: 8 },
                      { day: "Tue", count: 14 },
                      { day: "Wed", count: 10 },
                      { day: "Thu", count: 19 },
                      { day: "Fri", count: 12 },
                      { day: "Sat", count: 5 },
                      { day: "Sun", count: 3 },
                    ].map((d) => (
                      <div key={d.day} className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-xs font-bold text-content dark:text-content-dark">{d.count}</span>
                        <div
                          className="w-full rounded-t-lg bg-primary/80 dark:bg-primary-400/80 transition-all duration-700"
                          style={{ height: `${(d.count / 19) * 100}px` }}
                        />
                        <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{d.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Resolved", count: 9, of: 12, color: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Open", count: 2, of: 12, color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400" },
                  { label: "Escalated", count: 1, of: 12, color: "bg-red-500", textColor: "text-red-600 dark:text-red-400" },
                ].map((item) => (
                  <div key={item.label} className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
                    <p className={cn("text-2xl font-bold", item.textColor)}>{Math.round((item.count / item.of) * 100)}%</p>
                    <p className="text-sm font-medium text-content dark:text-content-dark mt-0.5">{item.label}</p>
                    <div className="mt-3 h-1.5 rounded-full bg-surface-tertiary dark:bg-surface-dark-tertiary overflow-hidden">
                      <div className={cn("h-full rounded-full", item.color)} style={{ width: `${(item.count / item.of) * 100}%` }} />
                    </div>
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">{item.count} of {item.of} queries</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Video Guides tab (Video Recommendation System from PDF) ── */}
          {activeSection === "videos" && (
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-content dark:text-content-dark">Video Troubleshooting Guides</h2>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                  AI-recommended training &amp; repair videos mapped to your equipment
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {VIDEO_RECOMMENDATIONS.map((video) => (
                  <a
                    key={video.title}
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card hover:border-primary/40 dark:hover:border-primary-400/40 hover:shadow-md transition-all overflow-hidden"
                  >
                    <div className={cn("relative h-36 flex items-center justify-center", video.thumb)}>
                      <div className="flex flex-col items-center gap-2">
                        <span className={video.color}>{video.icon}</span>
                        <div className="w-12 h-12 rounded-full bg-white/80 dark:bg-black/40 flex items-center justify-center shadow group-hover:scale-110 transition-transform">
                          <PlayCircle className="w-6 h-6 text-primary dark:text-primary-300" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-mono">{video.duration}</span>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <p className="text-sm font-semibold text-content dark:text-content-dark group-hover:text-primary dark:group-hover:text-primary-300 transition-colors line-clamp-2">
                        {video.title}
                      </p>
                      <div className="flex items-center justify-between mt-auto pt-3">
                        <Badge variant="info" size="sm">{video.product}</Badge>
                        <div className="flex items-center gap-2">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{video.views} views</span>
                          <ExternalLink className="w-3.5 h-3.5 text-content-secondary dark:text-content-dark-secondary group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
              <div className="p-4 rounded-2xl border border-dashed border-line dark:border-line-dark flex items-center gap-3 text-sm text-content-secondary dark:text-content-dark-secondary">
                <PlayCircle className="w-5 h-5 shrink-0 opacity-50" />
                <p>
                  More videos are auto-mapped as new troubleshooting documents are uploaded to the AI training pipeline.{" "}
                  <button className="text-primary dark:text-primary-300 font-medium hover:underline">Upload documents →</button>
                </p>
              </div>
            </section>
          )}

          {/* ── Trending FAQs tab (Search trends from PDF) ── */}
          {activeSection === "faqs" && (
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-content dark:text-content-dark">Search Trends &amp; Frequently Asked Questions</h2>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                  Most queried issues across all service engineers this month
                </p>
              </div>
              <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                {TRENDING_FAQS.map((faq, i) => (
                  <button
                    key={faq.rank}
                    onClick={() => router.push(`/chat?q=${encodeURIComponent(faq.query)}`)}
                    className={cn(
                      "w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors group",
                      i < TRENDING_FAQS.length - 1 && "border-b border-line dark:border-line-dark"
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                        i === 0 ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300" :
                        i === 1 ? "bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300" :
                        i === 2 ? "bg-orange-100 dark:bg-orange-500/20 text-orange-500 dark:text-orange-300" :
                                  "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
                      )}
                    >
                      {i === 0 ? <Flame className="w-3.5 h-3.5" /> : `#${faq.rank}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content dark:text-content-dark group-hover:text-primary dark:group-hover:text-primary-300 truncate transition-colors">
                        {faq.query}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{faq.product}</span>
                        <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-md", TAG_COLORS[faq.tag] ?? "")}>{faq.tag}</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-content dark:text-content-dark">{faq.count}</p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">queries</p>
                      </div>
                      <MessageSquare className="w-4 h-4 text-content-secondary dark:text-content-dark-secondary group-hover:text-primary transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-primary/5 dark:bg-primary-400/5 border border-primary/20 dark:border-primary-400/20">
                  <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-1 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-500" /> Top Category This Week
                  </h3>
                  <p className="text-2xl font-bold text-primary dark:text-primary-300">Hardware</p>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">18 issues — mostly VIBRO &amp; Mainboard</p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20">
                  <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-1 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" /> Resolution Rate
                  </h3>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">75%</p>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">Queries resolved on first AI response</p>
                </div>
              </div>
            </section>
          )}

          {/* Recent Activity — always visible */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-content dark:text-content-dark">Recent Activity</h2>
              <Link href="/chat" className="text-xs text-primary dark:text-primary-300 hover:underline font-medium">
                View all conversations →
              </Link>
            </div>
            <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
              {RECENT_ACTIVITY.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors cursor-pointer",
                    i < RECENT_ACTIVITY.length - 1 && "border-b border-line dark:border-line-dark"
                  )}
                  onClick={() => router.push("/chat")}
                >
                  <div className="shrink-0 h-8 w-8 rounded-xl bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
                    <Wrench className="w-3.5 h-3.5 text-primary dark:text-primary-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content dark:text-content-dark truncate">{item.product}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{item.complaint}</p>
                      <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-md shrink-0", TAG_COLORS[item.tag] ?? "bg-slate-100 text-slate-600")}>
                        {item.tag}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <Badge
                      variant={item.status === "resolved" ? "success" : item.status === "escalated" ? "error" : "warning"}
                      dot
                      size="sm"
                    >
                      {item.status === "resolved" ? "Resolved" : item.status === "escalated" ? "Escalated" : "Open"}
                    </Badge>
                    <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
