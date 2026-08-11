"use client";

import { useMemo } from "react";
import {
  BarChart2,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Activity,
  RefreshCw,
  Download,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import WhatsappAnalyticsPanel from "./WhatsappAnalyticsPanel";
import { cn } from "@/lib/utils";

// ── Overview data ────────────────────────────────────────────────────────
interface OverviewAnalytics {
  totalConversations: number;
  totalSupportRequests: number;
  escalationRate: number;
  aiResolutionRate: number;
  resolvedCount: number;
  pendingCount: number;
  activeCount: number;
  topMachines: { name: string; count: number }[];
  recentIssues: {
    id: string;
    problem: string;
    status: string;
    customer: { firstName: string; lastName: string | null };
    createdAt: string;
  }[];
}

interface TimelineEntry {
  date: string;
  conversations: number;
  support: number;
}

// ── Customer analytics ───────────────────────────────────────────────────
interface CustomerAnalytics {
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
  }[];
  timeline: { date: string; conversations: number; support: number }[];
}

// ── Service analytics ────────────────────────────────────────────────────
interface ServiceAnalytics {
  totalConversations: number;
  resolvedCount: number;
  pendingCount: number;
  activeCount: number;
  topTopics: { keyword: string; count: number }[];
  topMachines: { name: string; count: number }[];
  timeline: { date: string; conversations: number }[];
}

// ── Props ────────────────────────────────────────────────────────────────
interface AnalyticsTabProps {
  analyticsView: "overview" | "customer" | "service" | "whatsapp";
  analytics: OverviewAnalytics | null;
  analyticsLoading: boolean;
  timeline: TimelineEntry[];
  customerAnalytics: CustomerAnalytics | null;
  customerAnalyticsLoading: boolean;
  serviceAnalytics: ServiceAnalytics | null;
  serviceAnalyticsLoading: boolean;
  waAnalyticsReload: number;
  onSetAnalyticsView: (v: "overview" | "customer" | "service" | "whatsapp") => void;
  onFetchAnalytics: () => void;
  onFetchCustomerAnalytics: () => void;
  onFetchServiceAnalytics: () => void;
  onSetAnalytics: (v: OverviewAnalytics | null) => void;
  onSetCustomerAnalytics: (v: CustomerAnalytics | null) => void;
  onSetServiceAnalytics: (v: ServiceAnalytics | null) => void;
  onSetWaAnalyticsReload: (n: number) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────
const CELLS = [
  <Cell key="pending" fill="#f59e0b" />,
  <Cell key="active" fill="#3b82f6" />,
  <Cell key="resolved" fill="#10b981" />,
];

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "resolved"
      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "active"
        ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
        : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────
export default function AnalyticsTab({
  analyticsView,
  analytics,
  analyticsLoading,
  timeline,
  customerAnalytics,
  customerAnalyticsLoading,
  serviceAnalytics,
  serviceAnalyticsLoading,
  waAnalyticsReload,
  onSetAnalyticsView,
  onFetchAnalytics,
  onFetchCustomerAnalytics,
  onFetchServiceAnalytics,
  onSetAnalytics,
  onSetCustomerAnalytics,
  onSetServiceAnalytics,
  onSetWaAnalyticsReload,
}: AnalyticsTabProps) {
  const handleRefresh = () => {
    if (analyticsView === "overview") {
      onSetAnalytics(null);
      onFetchAnalytics();
    } else if (analyticsView === "customer") {
      onSetCustomerAnalytics(null);
      onFetchCustomerAnalytics();
    } else if (analyticsView === "whatsapp") {
      onSetWaAnalyticsReload(waAnalyticsReload + 1);
    } else {
      onSetServiceAnalytics(null);
      onFetchServiceAnalytics();
    }
  };

  const refreshing = useMemo(
    () =>
      analyticsLoading || customerAnalyticsLoading || serviceAnalyticsLoading,
    [analyticsLoading, customerAnalyticsLoading, serviceAnalyticsLoading],
  );

  return (
    <section className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-content dark:text-content-dark">
          Analytics
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="/api/admin/export/chats"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Chats CSV
          </a>
          <a
            href="/api/admin/export/support"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Support CSV
          </a>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={cn("w-4 h-4", refreshing && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* View selector sub-nav */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary w-fit">
        {[
          { key: "overview" as const, label: "Overview", icon: <BarChart2 className="w-3.5 h-3.5" /> },
          { key: "customer" as const, label: "Customer", icon: <span className="text-sm">User</span> },
          { key: "service" as const, label: "Service", icon: <span className="text-sm">Service</span> },
          { key: "whatsapp" as const, label: "WhatsApp", icon: <span className="text-sm">Msg</span> },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => onSetAnalyticsView(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              analyticsView === key
                ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ─── Overview View ─── */}
      {analyticsView === "overview" && (
        <>
          {analyticsLoading ? (
            <LoadingState />
          ) : !analytics ? (
            <EmptyState icon={<BarChart2 />} />
          ) : (
            <>
              {/* KPI Cards */}
              <KPICards
                items={[
                  { label: "Total Conversations", value: analytics.totalConversations, icon: <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />, bg: "bg-blue-50 dark:bg-blue-500/10" },
                  { label: "Support Escalations", value: analytics.totalSupportRequests, icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />, bg: "bg-amber-50 dark:bg-amber-500/10" },
                  { label: "Escalation Rate", value: `${analytics.escalationRate}%`, icon: <TrendingUp className="w-5 h-5 text-rose-600 dark:text-rose-400" />, bg: "bg-rose-50 dark:bg-rose-500/10" },
                  { label: "AI Resolution Rate", value: `${analytics.aiResolutionRate}%`, icon: <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />, bg: "bg-emerald-50 dark:bg-emerald-500/10" },
                ]}
              />

              {/* Timeline */}
              {timeline.length > 0 && (
                <Card title="Activity — Last 30 Days">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timeline} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickFormatter={(v: string) => v.slice(5)} interval={Math.floor(timeline.length / 6)} />
                      <YAxis tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend formatter={(v: string) => v === "conversations" ? "Conversations" : "Support Tickets"} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="conversations" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="support" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Charts row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {analytics.topMachines.length > 0 && (
                  <Card title="Top Reported Machines">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={analytics.topMachines} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={90} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
                <Card title="Support Request Status">
                  {(analytics.pendingCount + analytics.activeCount + analytics.resolvedCount) === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-sm text-content-secondary dark:text-content-dark-secondary">No support requests yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={[{ name: "Pending", value: analytics.pendingCount }, { name: "Active", value: analytics.activeCount }, { name: "Resolved", value: analytics.resolvedCount }]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                          {CELLS}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </div>

              {/* Recent Issues */}
              {analytics.recentIssues.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-3">Recent Issues</h3>
                  <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                    {analytics.recentIssues.map((issue, i) => (
                      <div key={issue.id} className={cn("px-4 py-3", i < analytics.recentIssues.length - 1 && "border-b border-line dark:border-line-dark")}>
                        <p className="text-sm text-content dark:text-content-dark truncate">{issue.problem}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{issue.customer.firstName} {issue.customer.lastName ?? ""}</span>
                          <StatusBadge status={issue.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Customer Analytics View ─── */}
      {analyticsView === "customer" && (
        <>
          {customerAnalyticsLoading ? (
            <LoadingState />
          ) : !customerAnalytics ? (
            <EmptyState icon={<BarChart2 />} />
          ) : (
            <>
              <KPICards
                items={[
                  { label: "Customer Conversations", value: customerAnalytics.totalConversations, icon: <MessageSquare className="w-5 h-5 text-primary-600 dark:text-primary-400" />, bg: "bg-primary-50 dark:bg-primary-500/10" },
                  { label: "Support Escalations", value: customerAnalytics.totalSupportRequests, icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />, bg: "bg-amber-50 dark:bg-amber-500/10" },
                  { label: "AI Resolution Rate", value: `${customerAnalytics.totalConversations > 0 ? Math.round(((customerAnalytics.totalConversations - customerAnalytics.totalSupportRequests) / customerAnalytics.totalConversations) * 100) : 100}%`, icon: <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />, bg: "bg-emerald-50 dark:bg-emerald-500/10" },
                ]}
              />

              {/* Timeline */}
              {customerAnalytics.timeline.length > 0 && (
                <Card title="Customer Activity — Last 30 Days">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={customerAnalytics.timeline} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickFormatter={(v: string) => v.slice(5)} interval={Math.floor(customerAnalytics.timeline.length / 6)} />
                      <YAxis tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend formatter={(v: string) => v === "conversations" ? "Conversations" : "Support Tickets"} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="conversations" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="support" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Complaints + Questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {customerAnalytics.topComplaints.length > 0 && (
                  <Card title="Most Reported Complaints" icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={customerAnalytics.topComplaints} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="keyword" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={85} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
                {customerAnalytics.topQuestions.length > 0 && (
                  <Card title="Most Asked (Keywords)" icon={<MessageSquare className="w-4 h-4 text-primary-500" />}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={customerAnalytics.topQuestions} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="keyword" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={85} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>

              {/* Status + Recent Issues */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Card title="Support Request Status">
                  {(customerAnalytics.pendingCount + customerAnalytics.activeCount + customerAnalytics.resolvedCount) === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-sm text-content-secondary dark:text-content-dark-secondary">No support requests yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={[{ name: "Pending", value: customerAnalytics.pendingCount }, { name: "Active", value: customerAnalytics.activeCount }, { name: "Resolved", value: customerAnalytics.resolvedCount }]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                          {CELLS}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>
                {customerAnalytics.recentIssues.length > 0 && (
                  <Card title="Recent Customer Issues">
                    <div className="space-y-2 overflow-y-auto max-h-[210px] pr-1 scrollbar-thin">
                      {customerAnalytics.recentIssues.map((issue) => (
                        <div key={issue.id} className="px-3 py-2 rounded-xl bg-surface-hover dark:bg-surface-dark-hover">
                          <p className="text-xs text-content dark:text-content-dark truncate">{issue.problem}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{issue.customer.firstName} {issue.customer.lastName ?? ""}</span>
                            <StatusBadge status={issue.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Service Analytics View ─── */}
      {analyticsView === "service" && (
        <>
          {serviceAnalyticsLoading ? (
            <LoadingState />
          ) : !serviceAnalytics ? (
            <EmptyState icon={<BarChart2 />} />
          ) : (
            <>
              <KPICards
                items={[
                  { label: "Service Conversations", value: serviceAnalytics.totalConversations, icon: <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />, bg: "bg-blue-50 dark:bg-blue-500/10" },
                  { label: "Resolved Tickets", value: serviceAnalytics.resolvedCount, icon: <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />, bg: "bg-emerald-50 dark:bg-emerald-500/10" },
                  { label: "Open Tickets", value: serviceAnalytics.pendingCount + serviceAnalytics.activeCount, icon: <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />, bg: "bg-rose-50 dark:bg-rose-500/10" },
                ]}
              />

              {/* Timeline */}
              {serviceAnalytics.timeline.length > 0 && (
                <Card title="Service Activity — Last 30 Days">
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
                </Card>
              )}

              {/* Charts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {serviceAnalytics.topTopics.length > 0 && (
                  <Card title="Most Looked-Up Topics">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={serviceAnalytics.topTopics} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="keyword" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={85} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
                {serviceAnalytics.topMachines.length > 0 && (
                  <Card title="Top Reported Machines">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={serviceAnalytics.topMachines} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={85} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>

              {/* Support Status Pie */}
              <div className="max-w-sm">
                <Card title="Support Ticket Status">
                  {(serviceAnalytics.pendingCount + serviceAnalytics.activeCount + serviceAnalytics.resolvedCount) === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-sm text-content-secondary dark:text-content-dark-secondary">No tickets yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={[{ name: "Pending", value: serviceAnalytics.pendingCount }, { name: "Active", value: serviceAnalytics.activeCount }, { name: "Resolved", value: serviceAnalytics.resolvedCount }]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                          {CELLS}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── WhatsApp View ─── */}
      {analyticsView === "whatsapp" && (
        <WhatsappAnalyticsPanel reloadToken={waAnalyticsReload} />
      )}
    </section>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
    </div>
  );
}

function EmptyState({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="text-center py-16 rounded-2xl border border-dashed border-line dark:border-line-dark">
      <div className="mx-auto mb-3 text-content-secondary dark:text-content-dark-secondary opacity-40 w-10 h-10">
        {icon}
      </div>
      <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
        No analytics data available
      </p>
    </div>
  );
}

interface KPICardItem {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  bg: string;
}

function KPICards({ items }: { items: KPICardItem[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark"
        >
          <div className={`inline-flex p-2 rounded-xl mb-2 ${item.bg}`}>
            {item.icon}
          </div>
          <p className="text-xl font-bold text-content dark:text-content-dark">{item.value}</p>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
      {icon ? (
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <h3 className="text-sm font-semibold text-content dark:text-content-dark">{title}</h3>
        </div>
      ) : (
        <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">{title}</h3>
      )}
      {children}
    </div>
  );
}
