"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  MessageSquare,
  Radio,
  Search,
  Clock,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type WhatsappGroupBy = "state" | "district" | "place";
type PeriodPreset = "7d" | "30d" | "90d" | "all";
type LocationFilter = "all" | "known" | "unknown";
type SortKey = "lastActive" | "name" | "state";

interface WhatsappUserRow {
  phoneNumber: string;
  name: string | null;
  state: string;
  district: string;
  place: string;
  pincode: string | null;
  lastActiveAt: string;
}

interface LiveWhatsappUser {
  phoneNumber: string;
  name: string | null;
  state: string;
  district: string;
  place: string;
  pincode: string | null;
  sessionState: string;
  isBotPaused: boolean;
  lastActiveAt: string;
  lastMessage: { role: string; content: string; createdAt: string } | null;
}

function hasKnownLocation(u: WhatsappUserRow): boolean {
  return (
    (u.state && u.state !== "Unknown") ||
    (u.district && u.district !== "Unknown") ||
    (u.place && u.place !== "Unknown") ||
    !!u.pincode
  );
}

function periodToSinceDate(period: PeriodPreset): Date | null {
  if (period === "all") return null;
  const d = new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  d.setDate(d.getDate() - (days - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function chartLabel(groupBy: WhatsappGroupBy, u: WhatsappUserRow): string {
  if (groupBy === "district") {
    if (u.district && u.district !== "Unknown") return `${u.district}, ${u.state}`;
    if (u.state && u.state !== "Unknown") return `${u.state} (district unknown)`;
    return "Unknown";
  }
  if (groupBy === "place") {
    if (u.place && u.place !== "Unknown") return `${u.place}, ${u.district}`;
    if (u.district && u.district !== "Unknown") return `${u.district} (place unknown)`;
    return "Unknown";
  }
  return u.state || "Unknown";
}

function buildFilterOptions(users: WhatsappUserRow[]) {
  const states = [
    ...new Set(users.map((u) => u.state).filter((s) => s && s !== "Unknown")),
  ].sort((a, b) => a.localeCompare(b));
  const districtKeys = new Set<string>();
  const districts: { district: string; state: string; label: string }[] = [];
  for (const u of users) {
    if (!u.district || u.district === "Unknown") continue;
    const key = `${u.district}|${u.state}`;
    if (districtKeys.has(key)) continue;
    districtKeys.add(key);
    districts.push({ district: u.district, state: u.state, label: `${u.district}, ${u.state}` });
  }
  districts.sort((a, b) => a.label.localeCompare(b.label));
  return { states, districts };
}

function filterUsers(
  users: WhatsappUserRow[],
  opts: {
    period: PeriodPreset;
    stateFilter: string;
    districtFilter: string;
    locationFilter: LocationFilter;
    search: string;
  },
): WhatsappUserRow[] {
  const since = periodToSinceDate(opts.period);
  const search = opts.search.trim().toLowerCase();
  const digits = search.replace(/\D/g, "");

  return users.filter((u) => {
    if (since && new Date(u.lastActiveAt) < since) return false;

    if (opts.locationFilter === "known" && !hasKnownLocation(u)) return false;
    if (opts.locationFilter === "unknown" && hasKnownLocation(u)) return false;

    if (opts.stateFilter && u.state.toLowerCase() !== opts.stateFilter.toLowerCase()) return false;
    if (opts.districtFilter && u.district.toLowerCase() !== opts.districtFilter.toLowerCase()) return false;

    if (search) {
      const matchName = u.name?.toLowerCase().includes(search);
      const phoneDigits = u.phoneNumber.replace(/\D/g, "");
      const matchPhone =
        u.phoneNumber.toLowerCase().includes(search) ||
        (!!digits && phoneDigits.includes(digits));
      if (!matchName && !matchPhone) return false;
    }
    return true;
  });
}

function sortUsers(users: WhatsappUserRow[], sort: SortKey, sortDir: "asc" | "desc"): WhatsappUserRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    if (sort === "name") {
      return (a.name ?? "").localeCompare(b.name ?? "") * dir;
    }
    if (sort === "state") {
      const cmp = a.state.localeCompare(b.state);
      return (cmp !== 0 ? cmp : a.district.localeCompare(b.district)) * dir;
    }
    return (new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime()) * dir;
  });
}

function aggregateByLocation(users: WhatsappUserRow[], groupBy: WhatsappGroupBy) {
  const map = new Map<string, number>();
  for (const u of users) {
    const label = chartLabel(groupBy, u);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

const CHART_TOP_N = 10;
const CHART_HEIGHT = 280;
const CHART_POINT_WIDTH = 56;

function prepareChartRows(
  rows: { name: string; count: number }[],
  expanded: boolean,
): { display: { name: string; count: number }[]; hiddenCount: number; hasMore: boolean } {
  if (expanded || rows.length <= CHART_TOP_N) {
    return { display: rows, hiddenCount: 0, hasMore: rows.length > CHART_TOP_N };
  }
  const top = rows.slice(0, CHART_TOP_N);
  const rest = rows.slice(CHART_TOP_N);
  const othersCount = rest.reduce((sum, r) => sum + r.count, 0);
  if (othersCount <= 0) {
    return { display: top, hiddenCount: 0, hasMore: false };
  }
  return {
    display: [...top, { name: `Others (${rest.length} ${rest.length === 1 ? "region" : "regions"})`, count: othersCount }],
    hiddenCount: rest.length,
    hasMore: true,
  };
}

function exportUsersCsv(users: WhatsappUserRow[]) {
  const header = ["Phone", "Name", "State", "District", "Place", "Pincode", "Last active"];
  const rows = users.map((u) => [
    u.phoneNumber,
    u.name ?? "",
    u.state,
    u.district,
    u.place,
    u.pincode ?? "",
    u.lastActiveAt,
  ]);
  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `whatsapp-chatbot-users-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZES = [10, 25, 50, 100] as const;
const LIVE_POLL_MS = 15_000;

function formatSessionState(state: string): string {
  return state.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function messageRoleLabel(role: string): string {
  if (role === "user") return "Customer";
  if (role === "bot") return "Bot";
  if (role === "support") return "Support";
  return role;
}

function deriveLiveUsersFromAnalytics(
  users: WhatsappUserRow[],
  windowMinutes: number,
): LiveWhatsappUser[] {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  return users
    .filter((u) => new Date(u.lastActiveAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
    .map((u) => ({
      phoneNumber: u.phoneNumber,
      name: u.name,
      state: u.state,
      district: u.district,
      place: u.place,
      pincode: u.pincode,
      sessionState: "active",
      isBotPaused: false,
      lastActiveAt: u.lastActiveAt,
      lastMessage: null,
    }));
}

export default function WhatsappAnalyticsPanel({ reloadToken = 0 }: { reloadToken?: number }) {
  const [allUsers, setAllUsers] = useState<WhatsappUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [groupBy, setGroupBy] = useState<WhatsappGroupBy>("state");
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [stateFilter, setStateFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<SortKey>("lastActive");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [liveUsers, setLiveUsers] = useState<LiveWhatsappUser[]>([]);
  const [liveApiAvailable, setLiveApiAvailable] = useState<boolean | null>(null);
  const [liveWindow, setLiveWindow] = useState(15);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveFetchedAt, setLiveFetchedAt] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/analytics/whatsapp", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load WhatsApp analytics");
        return;
      }
      const users = (Array.isArray(json.users) ? json.users : []) as WhatsappUserRow[];
      setAllUsers(users);
    } finally {
      setLoading(false);
    }
  }, []);


  const fetchLiveUsers = useCallback(async () => {
    setLiveLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics/whatsapp/live?minutes=${liveWindow}`, {
        credentials: "include",
      });
      if (res.status === 404) {
        setLiveApiAvailable(false);
        return;
      }
      if (!res.ok) return;
      setLiveApiAvailable(true);
      const json = await res.json();
      setLiveUsers(Array.isArray(json.liveUsers) ? json.liveUsers : []);
      setLiveFetchedAt(json.fetchedAt ?? new Date().toISOString());
    } finally {
      setLiveLoading(false);
    }
  }, [liveWindow]);

  const refreshLivePanel = useCallback(async () => {
    await Promise.all([fetchData(), fetchLiveUsers()]);
  }, [fetchData, fetchLiveUsers]);

  useEffect(() => {
    refreshLivePanel();
    const timer = setInterval(refreshLivePanel, LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshLivePanel, reloadToken]);

  const derivedLiveUsers = useMemo(
    () => deriveLiveUsersFromAnalytics(allUsers, liveWindow),
    [allUsers, liveWindow],
  );

  const displayLiveUsers = liveApiAvailable === true ? liveUsers : derivedLiveUsers;

  const filterOptions = useMemo(() => buildFilterOptions(allUsers), [allUsers]);

  const districtOptions = useMemo(() => {
    if (!stateFilter) return filterOptions.districts;
    return filterOptions.districts.filter(
      (d) => d.state.toLowerCase() === stateFilter.toLowerCase(),
    );
  }, [filterOptions.districts, stateFilter]);

  const filteredUsers = useMemo(() => {
    const filtered = filterUsers(allUsers, {
      period,
      stateFilter,
      districtFilter,
      locationFilter,
      search: searchInput,
    });
    return sortUsers(filtered, sort, sortDir);
  }, [allUsers, period, stateFilter, districtFilter, locationFilter, searchInput, sort, sortDir]);

  const byLocation = useMemo(
    () => aggregateByLocation(filteredUsers, groupBy),
    [filteredUsers, groupBy],
  );

  const chartRows = useMemo(
    () => prepareChartRows(byLocation, chartExpanded),
    [byLocation, chartExpanded],
  );

  const lineChartData = useMemo(
    () =>
      chartRows.display.map((r) => ({
        ...r,
        shortName: r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name,
      })),
    [chartRows.display],
  );

  const lineChartWidth = Math.max(560, lineChartData.length * CHART_POINT_WIDTH);

  useEffect(() => {
    setChartExpanded(false);
  }, [groupBy, period, stateFilter, districtFilter, locationFilter, searchInput]);

  const usersWithLocation = useMemo(
    () => filteredUsers.filter(hasKnownLocation).length,
    [filteredUsers],
  );

  useEffect(() => {
    setPage(1);
  }, [period, stateFilter, districtFilter, locationFilter, searchInput, groupBy, sort, sortDir]);

  const pageUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  const groupByLabel =
    groupBy === "state" ? "state" : groupBy === "district" ? "district" : "place";

  const toggleSort = (key: SortKey) => {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setSortDir(key === "lastActive" ? "desc" : "asc");
    }
  };

  if (loading && allUsers.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
      </div>
    );
  }

  if (allUsers.length === 0 && error) {
    return (
      <div className="text-center py-16 rounded-2xl border border-dashed border-line dark:border-line-dark">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
        Unique customers who messaged the WhatsApp chatbot (staff and dealer numbers excluded). Location from tickets or pincode collected in chat.
        {filteredUsers.length !== allUsers.length && (
          <span className="ml-1">
            Showing {filteredUsers.length} of {allUsers.length} users (filtered).
          </span>
        )}
      </p>

      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
            Period
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodPreset)}
              className="text-sm rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark px-2 py-1.5 min-w-[7rem]"
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
            Location data
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value as LocationFilter)}
              className="text-sm rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark px-2 py-1.5 min-w-[9rem]"
            >
              <option value="all">All users</option>
              <option value="known">Known location</option>
              <option value="unknown">Unknown location</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
            State
            <select
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                setDistrictFilter("");
              }}
              className="text-sm rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark px-2 py-1.5 min-w-[8rem]"
            >
              <option value="">All states</option>
              {filterOptions.states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-content-secondary dark:text-content-dark-secondary">
            District
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="text-sm rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark px-2 py-1.5 min-w-[10rem]"
            >
              <option value="">All districts</option>
              {districtOptions.map((d) => (
                <option key={d.label} value={d.district}>{d.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-content-secondary dark:text-content-dark-secondary flex-1 min-w-[12rem]">
            Search phone / name
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary opacity-60" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Updates as you type"
                className="w-full text-sm rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark pl-8 pr-2 py-1.5"
              />
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Group chart by</span>
          {(["state", "district", "place"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
                groupBy === g
                  ? "bg-emerald-600 text-white"
                  : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary hover:text-content dark:hover:text-content-dark",
              )}
            >
              {g}
            </button>
          ))}

          <span className="w-px h-5 bg-line dark:bg-line-dark mx-1" />

          <button
            type="button"
            onClick={() => {
              setPeriod("all");
              setStateFilter("");
              setDistrictFilter("");
              setLocationFilter("all");
              setSearchInput("");
              setGroupBy("state");
              setSort("lastActive");
              setSortDir("desc");
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-line dark:border-line-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
          >
            Reset filters
          </button>
          <button
            type="button"
            onClick={() => exportUsersCsv(filteredUsers)}
            disabled={filteredUsers.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line dark:border-line-dark hover:bg-surface-hover disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV ({filteredUsers.length})
          </button>
          <button
            type="button"
            onClick={() => fetchData()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-line dark:border-line-dark hover:bg-surface-hover"
          >
            Reload data
          </button>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-content-secondary" />}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
          <div className="inline-flex p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 mb-2">
            <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-content dark:text-content-dark">{filteredUsers.length}</p>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Matching users</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
          <div className="inline-flex p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 mb-2">
            <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xl font-bold text-content dark:text-content-dark">{usersWithLocation}</p>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">With location known</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark col-span-2 sm:col-span-1">
          <div className="inline-flex p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-xl font-bold text-content dark:text-content-dark">{filteredUsers.length - usersWithLocation}</p>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Location unknown</p>
        </div>
      </div>

      <div className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark overflow-hidden">
        <div className="px-4 py-3 border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <h3 className="text-sm font-semibold text-content dark:text-content-dark">
              Live users
            </h3>
            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
              ({displayLiveUsers.length} active
              {liveApiAvailable === false ? ", from analytics" : ""})
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-content-secondary dark:text-content-dark-secondary">
              Window
              <select
                value={liveWindow}
                onChange={(e) => setLiveWindow(Number(e.target.value))}
                className="rounded border border-line dark:border-line-dark bg-surface dark:bg-surface-dark px-1.5 py-0.5"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => refreshLivePanel()}
              className="p-1.5 rounded-lg border border-line dark:border-line-dark hover:bg-surface-hover"
              title="Refresh live users"
            >
              <Radio className={cn("w-3.5 h-3.5", liveLoading && "animate-pulse")} />
            </button>
            {liveFetchedAt && (
              <span className="text-content-secondary dark:text-content-dark-secondary flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(new Date(liveFetchedAt))}
              </span>
            )}
          </div>
        </div>

        {displayLiveUsers.length === 0 ? (
          <p className="px-4 py-8 text-sm text-center text-content-secondary dark:text-content-dark-secondary">
            No customers active on WhatsApp in the last {liveWindow} minutes.
          </p>
        ) : (
          <div className="divide-y divide-line/60 dark:divide-line-dark/60 max-h-[24rem] overflow-y-auto">
            {displayLiveUsers.map((u) => (
              <div key={u.phoneNumber} className="px-4 py-3 hover:bg-surface-hover/50 dark:hover:bg-surface-dark-hover/50">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                      {u.name ?? "Unknown"}
                      <span className="ml-2 font-mono text-xs font-normal text-content-secondary dark:text-content-dark-secondary">
                        {u.phoneNumber}
                      </span>
                    </p>
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                      <MapPin className="w-3 h-3 inline mr-0.5 opacity-70" />
                      {hasKnownLocation(u)
                        ? [u.place !== "Unknown" ? u.place : null, u.district !== "Unknown" ? u.district : null, u.state !== "Unknown" ? u.state : null]
                            .filter(Boolean)
                            .join(", ") || "—"
                        : "Location unknown"}
                      {u.pincode ? ` · ${u.pincode}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary">
                      {formatSessionState(u.sessionState)}
                    </span>
                    {u.isBotPaused && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        Human support
                      </span>
                    )}
                    <span className="text-[10px] text-content-secondary dark:text-content-dark-secondary">
                      {formatRelativeTime(new Date(u.lastActiveAt))}
                    </span>
                  </div>
                </div>
                {u.lastMessage && (
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary line-clamp-2 pl-2 border-l-2 border-emerald-500/40">
                    <span className="font-medium text-content dark:text-content-dark">
                      {messageRoleLabel(u.lastMessage.role)}:
                    </span>{" "}
                    {u.lastMessage.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {byLocation.length > 0 && (
        <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-content dark:text-content-dark">
                Users by {groupByLabel}
              </h3>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                {byLocation.length} {byLocation.length === 1 ? "region" : "regions"} · {filteredUsers.length} users
              </p>
            </div>
            {chartRows.hasMore && (
              <button
                type="button"
                onClick={() => setChartExpanded((v) => !v)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line dark:border-line-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              >
                {chartExpanded ? `Show top ${CHART_TOP_N}` : `Show all ${byLocation.length}`}
              </button>
            )}
          </div>

          <div className="h-[280px] w-full overflow-x-auto rounded-xl border border-line/60 dark:border-line-dark/60 bg-surface-tertiary/30 dark:bg-surface-dark-tertiary/20">
            <ResponsiveContainer width={lineChartWidth} height={CHART_HEIGHT}>
              <LineChart
                data={lineChartData}
                margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis
                  dataKey="shortName"
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.65 }}
                  interval={0}
                  angle={lineChartData.length > 6 ? -35 : 0}
                  textAnchor={lineChartData.length > 6 ? "end" : "middle"}
                  height={lineChartData.length > 6 ? 56 : 32}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.65 }}
                  width={36}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(_label, payload) => {
                    const row = payload?.[0]?.payload as { name?: string } | undefined;
                    return row?.name ?? _label;
                  }}
                  formatter={(value: number) => [`${value} users`, "Count"]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#059669" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {!chartExpanded && chartRows.hiddenCount > 0 && (
            <p className="text-[11px] text-content-secondary dark:text-content-dark-secondary mt-3">
              {chartRows.hiddenCount} more {chartRows.hiddenCount === 1 ? "region" : "regions"} grouped under Others.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark overflow-hidden">
        <div className="px-4 py-3 border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-content dark:text-content-dark">User log</h3>
          <div className="flex items-center gap-2 text-xs text-content-secondary">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="rounded border border-line dark:border-line-dark bg-surface dark:bg-surface-dark px-1.5 py-0.5"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-content-secondary dark:text-content-dark-secondary border-b border-line dark:border-line-dark bg-surface-tertiary/50 dark:bg-surface-dark-tertiary/50">
              <tr>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">
                  <button type="button" className="hover:underline" onClick={() => toggleSort("name")}>
                    Name {sort === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-4 py-2 font-medium">
                  <button type="button" className="hover:underline" onClick={() => toggleSort("state")}>
                    State {sort === "state" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-4 py-2 font-medium">District</th>
                <th className="px-4 py-2 font-medium">Place</th>
                <th className="px-4 py-2 font-medium">Pincode</th>
                <th className="px-4 py-2 font-medium">
                  <button type="button" className="hover:underline" onClick={() => toggleSort("lastActive")}>
                    Last active {sort === "lastActive" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-4 py-2 font-medium w-8" />
              </tr>
            </thead>
            <tbody>
              {pageUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-content-secondary dark:text-content-dark-secondary">
                    No users match these filters.
                  </td>
                </tr>
              ) : (
                pageUsers.map((u) => (
                  <tr key={u.phoneNumber} className="border-b border-line/60 dark:border-line-dark/60 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap text-content dark:text-content-dark">{u.phoneNumber}</td>
                    <td className="px-4 py-2 text-content dark:text-content-dark">{u.name ?? "—"}</td>
                    <td className="px-4 py-2 text-content dark:text-content-dark">{u.state}</td>
                    <td className="px-4 py-2 text-content dark:text-content-dark">{u.district}</td>
                    <td className="px-4 py-2 text-content dark:text-content-dark">{u.place}</td>
                    <td className="px-4 py-2 text-content dark:text-content-dark">{u.pincode ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-content-secondary dark:text-content-dark-secondary whitespace-nowrap">
                      {new Date(u.lastActiveAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href="/support-dashboard"
                        title="Open support inbox"
                        className="text-emerald-600 dark:text-emerald-400 hover:opacity-80"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredUsers.length > 0 && (
          <div className="px-4 py-2 border-t border-line dark:border-line-dark flex items-center justify-between text-xs text-content-secondary">
            <span>
              Page {page} of {totalPages} · {filteredUsers.length} row{filteredUsers.length === 1 ? "" : "s"}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1 rounded disabled:opacity-30 hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1 rounded disabled:opacity-30 hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
