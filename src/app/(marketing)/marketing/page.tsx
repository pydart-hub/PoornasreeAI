"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Palette,
  Users,
  Megaphone,
  Upload,
  Plus,
  Trash2,
  FileUp,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  ImageIcon,
  LogOut,
  LayoutDashboard,
  Loader2,
  TrendingUp,
  Target,
  Zap,
  Star,
  ChevronRight,
  Menu,
  Search,
  Eye,
  Globe,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Branding {
  id: string;
  companyName: string;
  logoUrl?: string | null;
  address?: string | null;
  primaryColor: string;
  tagline?: string | null;
}

interface MarketingLead {
  id: string;
  name: string;
  phone: string;
  source: string;
  tags?: string | null;
  createdAt: string;
}

interface Campaign {
  id: string;
  title: string;
  imageUrl: string;
  caption?: string | null;
  status: "draft" | "sending" | "sent";
  sentAt?: string | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  _count: { leads: number };
}

// ─────────────────────────────────────────────
// API Helper
// ─────────────────────────────────────────────
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

// ─────────────────────────────────────────────
// Toast message
// ─────────────────────────────────────────────
function Toast({ msg }: { msg: { text: string; type: "success" | "error" } | null }) {
  if (!msg) return null;
  return (
    <div className={cn(
      "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg",
      msg.type === "success"
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
        : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
    )}>
      {msg.type === "success"
        ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
      {msg.text}
    </div>
  );
}

// ─────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────
function StatCard({
  icon, label, value, gradient, trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  gradient: string;
  trend?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("absolute inset-0 opacity-5", gradient)} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="mt-1.5 text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
          {trend && (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> {trend}
            </p>
          )}
        </div>
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-white", gradient)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
type Tab = "overview" | "branding" | "leads" | "campaigns";

export default function MarketingPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Data for overview stats
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Auth guard
  useEffect(() => {
    if (!isLoading && (!user || (user.role !== "marketing" && user.role !== "admin"))) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  const loadAll = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [brandingData, leadData, campData] = await Promise.all([
        apiFetch<Branding>("/api/branding").catch(() => null),
        apiFetch<{ leads: MarketingLead[] }>("/api/marketing/leads").catch(() => ({ leads: [] })),
        apiFetch<{ campaigns: Campaign[] }>("/api/marketing/campaigns").catch(() => ({ campaigns: [] })),
      ]);
      if (brandingData) setBranding(brandingData);
      setLeads(leadData.leads);
      setCampaigns(campData.campaigns);
    } catch { /* ignore */ }
    setStatsLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
        </div>
      </div>
    );
  }

  const sentCount = campaigns.reduce((s, c) => s + c.sentCount, 0);
  const activeCampaigns = campaigns.filter(c => c.status !== "draft").length;

  const NAV_ITEMS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "overview",   label: "Overview",   icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "branding",   label: "Branding",   icon: <Palette className="w-4 h-4" /> },
    { key: "leads",      label: "Leads",      icon: <Users className="w-4 h-4" />, badge: leads.length },
    { key: "campaigns",  label: "Campaigns",  icon: <Megaphone className="w-4 h-4" />, badge: activeCampaigns || undefined },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* ════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════ */}
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300",
        "bg-gradient-to-b from-violet-950 via-purple-900 to-fuchsia-950",
        "shadow-2xl shadow-violet-950/50",
        // Desktop
        sidebarOpen ? "md:w-64" : "md:w-16",
        // Mobile
        mobileMenuOpen ? "w-64" : "-translate-x-full md:translate-x-0",
        "md:relative md:inset-auto md:h-screen"
      )}>
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 left-0 w-24 h-24 bg-violet-400/20 rounded-full blur-2xl pointer-events-none" />

        {/* Logo */}
        <div className={cn(
          "relative flex items-center gap-3 px-4 py-5 border-b border-white/10",
          !sidebarOpen && "md:justify-center md:px-0"
        )}>
          <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0 ring-1 ring-white/20">
            <Zap className="w-5 h-5 text-fuchsia-300" />
          </div>
          {(sidebarOpen || mobileMenuOpen) && (
            <div>
              <p className="text-sm font-bold text-white leading-tight">Marketing Hub</p>
              <p className="text-[10px] text-violet-300/70 font-medium">Poornasree AI</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="hidden md:flex ml-auto p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          >
            <ChevronRight className={cn("w-4 h-4 transition-transform", sidebarOpen && "rotate-180")} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => { setActiveTab(item.key); setMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                "group relative",
                activeTab === item.key
                  ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
                  : "text-violet-200/60 hover:text-white hover:bg-white/8",
                !sidebarOpen && "md:justify-center md:px-0"
              )}
            >
              {activeTab === item.key && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-fuchsia-400 rounded-full" />
              )}
              <span className={cn(activeTab === item.key ? "text-fuchsia-300" : "text-violet-300/60 group-hover:text-violet-200")}>
                {item.icon}
              </span>
              {(sidebarOpen || mobileMenuOpen) && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge != null && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-fuchsia-500/30 text-fuchsia-200">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        {/* User + logout */}
        <div className={cn(
          "px-3 py-4 border-t border-white/10 space-y-2",
          !sidebarOpen && "md:flex md:flex-col md:items-center"
        )}>
          {(sidebarOpen || mobileMenuOpen) && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/8">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-400 to-violet-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {user.firstName[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.firstName} {user.lastName ?? ""}</p>
                <p className="text-[10px] text-violet-300/60 truncate">{user.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => { logout(); router.replace("/login"); }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium",
              "text-violet-300/60 hover:text-white hover:bg-white/10 transition-colors",
              !sidebarOpen && "md:justify-center md:px-0"
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {(sidebarOpen || mobileMenuOpen) && "Sign out"}
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 md:px-6 py-3.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Menu className="w-5 h-5 text-slate-500" />
          </button>

          <div className="flex-1 flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {NAV_ITEMS.find(n => n.key === activeTab)?.label}
              </span>
            </span>
            {/* Breadcrumb dot */}
            <span className="hidden sm:block w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span className="hidden sm:block text-xs text-slate-400 dark:text-slate-500">Marketing Hub</span>
          </div>

          <button
            onClick={loadAll}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-violet-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", statsLoading && "animate-spin")} />
          </button>

          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold text-white">
            {user.firstName[0].toUpperCase()}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {activeTab === "overview" && (
            <OverviewTab
              leads={leads}
              campaigns={campaigns}
              branding={branding}
              sentCount={sentCount}
              loading={statsLoading}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === "branding" && <BrandingSection onBrandingUpdate={setBranding} />}
          {activeTab === "leads" && <LeadsSection onLeadsChange={setLeads} />}
          {activeTab === "campaigns" && <CampaignsSection />}
        </main>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
// Overview Tab
// ═════════════════════════════════════════════
function OverviewTab({
  leads, campaigns, branding, sentCount, loading, onNavigate,
}: {
  leads: MarketingLead[];
  campaigns: Campaign[];
  branding: Branding | null;
  sentCount: number;
  loading: boolean;
  onNavigate: (tab: Tab) => void;
}) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const draftCount = campaigns.filter(c => c.status === "draft").length;
  const sentCampaigns = campaigns.filter(c => c.status === "sent").length;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Hero greeting */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8 text-white shadow-xl shadow-violet-500/25">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIwLjMiIG9wYWNpdHk9IjAuMiIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
        <div className="absolute top-4 right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 right-24 w-20 h-20 bg-fuchsia-300/20 rounded-full blur-xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-yellow-300" />
              <span className="text-xs font-medium text-white/70 uppercase tracking-widest">Marketing Dashboard</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">{greeting} 👋</h1>
            <p className="mt-1 text-white/70 text-sm">{today}</p>
            {branding && (
              <div className="mt-3 flex items-center gap-2">
                {branding.logoUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={branding.logoUrl} alt="Logo" className="w-7 h-7 object-contain rounded-lg bg-white/20 p-0.5" />
                )}
                <span className="text-sm font-semibold">{branding.companyName}</span>
                {branding.tagline && <span className="text-xs text-white/60">· {branding.tagline}</span>}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate("campaigns")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-medium transition-colors ring-1 ring-white/20"
            >
              <Megaphone className="w-4 h-4" /> New Campaign
            </button>
            <button
              onClick={() => onNavigate("leads")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-medium transition-colors ring-1 ring-white/20"
            >
              <Plus className="w-4 h-4" /> Add Lead
            </button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Users className="w-5 h-5" />} label="Total Leads" value={leads.length} gradient="bg-gradient-to-br from-blue-500 to-cyan-500" trend="+imported" />
          <StatCard icon={<Megaphone className="w-5 h-5" />} label="Campaigns" value={campaigns.length} gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
          <StatCard icon={<Send className="w-5 h-5" />} label="Messages Sent" value={sentCount.toLocaleString()} gradient="bg-gradient-to-br from-fuchsia-500 to-pink-500" trend={`${sentCampaigns} delivered`} />
          <StatCard icon={<Target className="w-5 h-5" />} label="Draft Queued" value={draftCount} gradient="bg-gradient-to-br from-amber-500 to-orange-500" />
        </div>
      )}

      {/* Quick action cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            tab: "branding" as Tab,
            icon: <Palette className="w-6 h-6" />,
            title: "Brand Identity",
            desc: "Update logo, colors, tagline & company info",
            gradient: "from-violet-500/10 to-purple-500/10",
            border: "border-violet-200 dark:border-violet-800/50",
            iconBg: "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300",
          },
          {
            tab: "leads" as Tab,
            icon: <Users className="w-6 h-6" />,
            title: "Lead Database",
            desc: "Import & manage your marketing contact list",
            gradient: "from-blue-500/10 to-cyan-500/10",
            border: "border-blue-200 dark:border-blue-800/50",
            iconBg: "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300",
          },
          {
            tab: "campaigns" as Tab,
            icon: <Megaphone className="w-6 h-6" />,
            title: "WhatsApp Campaigns",
            desc: "Create & blast marketing campaigns to leads",
            gradient: "from-fuchsia-500/10 to-pink-500/10",
            border: "border-fuchsia-200 dark:border-fuchsia-800/50",
            iconBg: "bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-600 dark:text-fuchsia-300",
          },
        ].map((card) => (
          <button
            key={card.tab}
            onClick={() => onNavigate(card.tab)}
            className={cn(
              "group text-left p-5 rounded-2xl border bg-gradient-to-br transition-all",
              "hover:shadow-lg hover:-translate-y-0.5",
              card.gradient, card.border
            )}
          >
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110", card.iconBg)}>
              {card.icon}
            </div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{card.title}</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{card.desc}</p>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:gap-2 transition-all">
              <span>Open</span> <ChevronRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>

      {/* Recent leads preview */}
      {leads.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Recent Leads</h3>
            <button onClick={() => onNavigate("leads")} className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {leads.slice(0, 5).map((lead) => (
              <div key={lead.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {lead.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{lead.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{lead.phone}</p>
                </div>
                {lead.tags && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                    {lead.tags.split(",")[0]}
                  </span>
                )}
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full",
                  lead.source === "csv"
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                )}>
                  {lead.source}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════
// Branding Section
// ═════════════════════════════════════════════
function BrandingSection({ onBrandingUpdate }: { onBrandingUpdate: (b: Branding) => void }) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ companyName: "", address: "", primaryColor: "#2563eb", tagline: "" });
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchBranding = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Branding>("/api/branding");
      setBranding(data);
      onBrandingUpdate(data);
      setForm({
        companyName: data.companyName || "",
        address: data.address || "",
        primaryColor: data.primaryColor || "#2563eb",
        tagline: data.tagline || "",
      });
    } catch { /* ignore */ }
    setLoading(false);
  }, [onBrandingUpdate]);

  useEffect(() => { fetchBranding(); }, [fetchBranding]);

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    try {
      const data = await apiFetch<Branding>("/api/marketing/branding", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setBranding(data);
      onBrandingUpdate(data);
      setMessage({ text: "Brand identity saved successfully!", type: "success" });
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setMessage(null);
    try {
      const res = await fetch("/api/marketing/branding/logo", {
        method: "POST", credentials: "include", body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setBranding(data);
        onBrandingUpdate(data);
        setMessage({ text: "Logo uploaded successfully!", type: "success" });
      } else {
        setMessage({ text: data.error || "Upload failed", type: "error" });
      }
    } catch {
      setMessage({ text: "Upload failed", type: "error" });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const colorPresets = ["#7c3aed", "#2563eb", "#059669", "#dc2626", "#ea580c", "#0891b2", "#be185d", "#374151"];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Brand Identity</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Define your company&apos;s visual identity and messaging.</p>
      </div>

      <Toast msg={message} />

      {/* Logo card */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Globe className="w-4 h-4 text-violet-500" /> Company Logo
        </h3>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center bg-slate-50 dark:bg-slate-800 overflow-hidden">
            {branding?.logoUrl
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain" />
              : <ImageIcon className="w-6 h-6 text-slate-400" />
            }
          </div>
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium cursor-pointer transition-colors shadow-sm shadow-violet-500/30">
            <Upload className="w-4 h-4" /> Upload Logo
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Brand info card */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Star className="w-4 h-4 text-fuchsia-500" /> Brand Info
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Company Name</label>
            <input
              type="text" value={form.companyName}
              onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              placeholder="e.g. Poornasree Engineering"
              className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tagline</label>
            <input
              type="text" value={form.tagline}
              onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
              placeholder="e.g. Engineering excellence, every time"
              className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Address</label>
            <textarea
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              rows={2}
              placeholder="Company address"
              className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition resize-none"
            />
          </div>
        </div>
      </div>

      {/* Color card */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Palette className="w-4 h-4 text-pink-500" /> Brand Color
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="color" value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              className="w-11 h-11 rounded-xl border border-slate-300 dark:border-slate-600 cursor-pointer"
            />
            <input
              type="text" value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              className="w-28 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {colorPresets.map(c => (
              <button
                key={c}
                title={c}
                onClick={() => setForm(f => ({ ...f, primaryColor: c }))}
                className={cn(
                  "w-7 h-7 rounded-lg transition-transform hover:scale-110",
                  form.primaryColor === c && "ring-2 ring-offset-2 ring-slate-400 scale-110"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <p className="text-xs text-slate-500 mb-2">Preview</p>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg text-white text-sm font-medium shadow-sm" style={{ backgroundColor: form.primaryColor }}>
              Primary Button
            </button>
            <span className="px-3 py-2 rounded-lg text-sm font-medium" style={{ color: form.primaryColor, backgroundColor: `${form.primaryColor}18` }}>
              Accent Text
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-semibold text-sm shadow-lg shadow-violet-500/30 disabled:opacity-50 transition-all"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        Save Brand Identity
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════
// Leads Section
// ═════════════════════════════════════════════
function LeadsSection({ onLeadsChange }: { onLeadsChange: (leads: MarketingLead[]) => void }) {
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [addForm, setAddForm] = useState({ name: "", phone: "", tags: "" });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ leads: MarketingLead[] }>("/api/marketing/leads");
      setLeads(data.leads);
      onLeadsChange(data.leads);
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setLoading(false);
  }, [onLeadsChange]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.phone) return;
    setAdding(true); setMessage(null);
    try {
      await apiFetch("/api/marketing/leads", { method: "POST", body: JSON.stringify(addForm) });
      setAddForm({ name: "", phone: "", tags: "" });
      setMessage({ text: "Lead added successfully!", type: "success" });
      setShowAddForm(false);
      fetchLeads();
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/marketing/leads/${id}`, { method: "DELETE" }).catch(() => null);
    const updated = leads.filter(x => x.id !== id);
    setLeads(updated);
    onLeadsChange(updated);
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/marketing/leads/import", { method: "POST", credentials: "include", body: formData });
      const data = await res.json();
      if (res.ok) { setMessage({ text: `Imported ${data.imported} leads`, type: "success" }); fetchLeads(); }
      else setMessage({ text: data.error || "Import failed", type: "error" });
    } catch {
      setMessage({ text: "Import failed", type: "error" });
    }
    setImporting(false);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const csv = "name,phone,tags\nJohn Doe,919876543210,vip\nJane Smith,918765432109,";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leads_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search)
  );

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Lead Database</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{leads.length} contacts in your list</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm text-slate-600 dark:text-slate-300 font-medium">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Import CSV
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSVImport} />
          </label>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
          >
            <Download className="w-4 h-4" /> Template
          </button>
          <button
            onClick={() => setShowAddForm(s => !s)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm shadow-violet-500/30"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddForm ? "Cancel" : "Add Lead"}
          </button>
        </div>
      </div>

      <Toast msg={message} />

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="p-5 rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 space-y-4">
          <h3 className="font-semibold text-sm text-violet-800 dark:text-violet-300 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Lead
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              required placeholder="Full Name *" value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-2.5 rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-violet-500/40 focus:outline-none"
            />
            <input
              required placeholder="Phone (e.g. 919876543210) *" value={addForm.phone}
              onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
              className="px-3 py-2.5 rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-900 text-sm font-mono focus:ring-2 focus:ring-violet-500/40 focus:outline-none"
            />
            <input
              placeholder="Tags (comma-separated)" value={addForm.tags}
              onChange={e => setAddForm(f => ({ ...f, tags: e.target.value }))}
              className="px-3 py-2.5 rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-violet-500/40 focus:outline-none"
            />
          </div>
          <button type="submit" disabled={adding}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add to List
          </button>
        </form>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          placeholder="Search by name or phone…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{search ? "No leads match your search" : "No leads yet"}</p>
          <p className="text-xs mt-1">{!search && "Import a CSV or add manually using the button above"}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tags</th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {lead.name[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{lead.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{lead.phone}</td>
                  <td className="hidden sm:table-cell px-4 py-3">
                    {lead.tags
                      ? lead.tags.split(",").map(t => (
                          <span key={t} className="inline-block mr-1 px-2 py-0.5 rounded-full text-[10px] bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                            {t.trim()}
                          </span>
                        ))
                      : <span className="text-slate-400">—</span>
                    }
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      lead.source === "csv"
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    )}>
                      {lead.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(lead.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════
// Campaigns Section
// ═════════════════════════════════════════════
function CampaignsSection() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "sent" | "sending">("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [campData, leadData] = await Promise.all([
        apiFetch<{ campaigns: Campaign[] }>("/api/marketing/campaigns"),
        apiFetch<{ leads: MarketingLead[] }>("/api/marketing/leads"),
      ]);
      setCampaigns(campData.campaigns);
      setLeads(leadData.leads);
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !imageFile) return;
    setCreating(true); setMessage(null);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("caption", caption);
      formData.append("leadIds", JSON.stringify(Array.from(selectedLeadIds)));
      formData.append("image", imageFile);
      const res = await fetch("/api/marketing/campaigns", { method: "POST", credentials: "include", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      setMessage({ text: "Campaign created successfully!", type: "success" });
      setTitle(""); setCaption(""); setImageFile(null); setImagePreview(null);
      setSelectedLeadIds(new Set()); setShowForm(false);
      fetchAll();
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/marketing/campaigns/${id}`, { method: "DELETE" }).catch(() => null);
    setCampaigns(c => c.filter(x => x.id !== id));
  };

  const handleSend = async (campaign: Campaign) => {
    if (campaign._count.leads === 0) {
      setMessage({ text: "No leads assigned — add leads to this campaign first", type: "error" });
      return;
    }
    setSendingId(campaign.id); setMessage(null);
    try {
      const data = await apiFetch<{ message: string; total: number }>(
        `/api/marketing/campaigns/${campaign.id}/send`, { method: "POST" }
      );
      setMessage({ text: `${data.message} — sending to ${data.total} leads`, type: "success" });
      setTimeout(fetchAll, 3000);
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setSendingId(null);
  };

  const statusConfig: Record<string, { label: string; classes: string }> = {
    draft:   { label: "Draft",   classes: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
    sending: { label: "Sending", classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    sent:    { label: "Sent",    classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  };

  const filtered = filterStatus === "all" ? campaigns : campaigns.filter(c => c.status === filterStatus);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">WhatsApp Campaigns</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Blast marketing messages to your lead list</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm shadow-violet-500/30"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancel" : "New Campaign"}
          </button>
        </div>
      </div>

      <Toast msg={message} />

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="p-6 rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-gradient-to-br from-violet-50/80 to-fuchsia-50/80 dark:from-violet-950/30 dark:to-fuchsia-950/30 space-y-5">
          <h3 className="font-bold text-sm text-violet-800 dark:text-violet-300 flex items-center gap-2">
            <Megaphone className="w-4 h-4" /> Create Campaign
          </h3>

          {/* Image upload */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaign Image *</label>
            <label className="mt-2 flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors">
              <ImageIcon className="w-8 h-8 text-violet-400" />
              <span className="text-sm text-slate-500">{imageFile ? imageFile.name : "Click to upload image or collage"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} required />
            </label>
            {imagePreview && (
              <div className="mt-3 relative w-40 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" className="w-40 h-28 object-cover rounded-xl border border-violet-200 dark:border-violet-700" />
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-sm">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaign Title *</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Monsoon Sale 2026"
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Leads</label>
              <div className="mt-1.5 flex items-center gap-3 px-3 py-2.5 rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-900 text-sm">
                <span className="font-medium text-violet-700 dark:text-violet-300">{selectedLeadIds.size}</span>
                <span className="text-slate-400">/ {leads.length} selected</span>
                <button type="button" onClick={() => setSelectedLeadIds(new Set(leads.map(l => l.id)))} className="ml-auto text-xs text-violet-600 hover:underline">All</button>
                <button type="button" onClick={() => setSelectedLeadIds(new Set())} className="text-xs text-slate-400 hover:underline">None</button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Caption (sent with image)</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
              placeholder="Exciting offers from Poornasree! Contact us for details."
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
          </div>

          {/* Lead checkboxes */}
          {leads.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-violet-200 dark:border-violet-700 divide-y divide-violet-100 dark:divide-violet-800 bg-white dark:bg-slate-900">
              {leads.map(lead => (
                <label key={lead.id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors">
                  <input type="checkbox" checked={selectedLeadIds.has(lead.id)} onChange={() => toggleLead(lead.id)}
                    className="rounded border-violet-300 accent-violet-600" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{lead.name}</span>
                  <span className="text-xs text-slate-400 font-mono">{lead.phone}</span>
                </label>
              ))}
            </div>
          )}

          <button type="submit" disabled={creating || !imageFile || !title}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90 text-white font-semibold text-sm disabled:opacity-50 transition-all shadow-lg shadow-violet-500/30">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            Create Campaign
          </button>
        </form>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 w-fit">
        {(["all", "draft", "sending", "sent"] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
              filterStatus === s
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}>
            {s === "all" ? `All (${campaigns.length})` : `${s} (${campaigns.filter(c => c.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Campaign grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No campaigns yet</p>
          <p className="text-xs mt-1">Create your first WhatsApp campaign above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(camp => (
            <div key={camp.id} className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
              {/* Image */}
              <div className="relative h-36 bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={camp.imageUrl} alt={camp.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span className={cn(
                  "absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full",
                  statusConfig[camp.status]?.classes
                )}>
                  {statusConfig[camp.status]?.label}
                </span>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{camp.title}</h3>
                  {camp.caption && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{camp.caption}</p>}
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{camp._count.leads} leads</span>
                  {camp.sentCount > 0 && <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3" />{camp.sentCount} sent</span>}
                  {camp.failedCount > 0 && <span className="flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" />{camp.failedCount} failed</span>}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleSend(camp)}
                    disabled={sendingId === camp.id || camp.status === "sending"}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
                      camp.status === "sent"
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default"
                        : "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-90 shadow-sm shadow-violet-500/20 disabled:opacity-50"
                    )}
                  >
                    {sendingId === camp.id
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending</>
                      : camp.status === "sent"
                        ? <><Eye className="w-3 h-3" /> Resend</>
                        : <><Send className="w-3 h-3" /> Send</>
                    }
                  </button>
                  <button
                    onClick={() => handleDelete(camp.id)}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-900 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
