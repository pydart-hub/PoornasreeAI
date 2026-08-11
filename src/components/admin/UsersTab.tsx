"use client";

import { useState, useMemo } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Loader2,
  UserX,
  Filter,
  Users as UsersIcon,
} from "lucide-react";
import { Badge, Avatar } from "@/components/ui";
import type { ApiUser } from "./types";
import { cn } from "@/lib/utils";

interface UsersTabProps {
  users: ApiUser[];
  usersLoading: boolean;
  userSearch: string;
  onSetUserSearch: (v: string) => void;
  onFetchUsers: () => void;
  onCreateUser: () => void;
  onDeleteUser: (id: string) => void;
  deletingUserId: string | null;
  currentUserId: string;
  getRoleBadge?: (role: string) => { label: string; variant: string };
}

type RoleFilter = "all" | "admin" | "service" | "dealer" | "sales" | "customer_support" | "customer";

function normalizeRole(role: string): RoleFilter {
  const r = (role || "").toLowerCase().trim();
  if (r === "admin") return "admin";
  if (r === "service" || r === "service_engineer" || r === "engineer" || r === "service_manager" || r === "assistant_service_manager") return "service";
  if (r === "dealer") return "dealer";
  if (r === "sales") return "sales";
  if (r === "customer_support" || r === "support" || r === "customer_service") return "customer_support";
  if (r === "customer") return "customer";
  return "all";
}

function formatRoleBadge(role: string) {
  const norm = normalizeRole(role);
  if (norm === "admin") return { label: "Administrator", variant: "default" as const };
  if (norm === "service") return { label: "Service Engineer", variant: "info" as const };
  if (norm === "dealer") return { label: "Dealer", variant: "success" as const };
  if (norm === "sales") return { label: "Sales", variant: "success" as const };
  if (norm === "customer_support") return { label: "Customer Support", variant: "warning" as const };
  if (norm === "customer") return { label: "Customer", variant: "accent" as const };
  return { label: role.replace(/_/g, " "), variant: "default" as const };
}

export default function UsersTab({
  users,
  usersLoading,
  userSearch,
  onSetUserSearch,
  onFetchUsers,
  onCreateUser,
  onDeleteUser,
  deletingUserId,
  currentUserId,
  getRoleBadge,
}: UsersTabProps) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  // Calculate role counts with normalized roles
  const roleCounts = useMemo(() => {
    const counts = {
      all: users.length,
      admin: 0,
      service: 0,
      dealer: 0,
      sales: 0,
      customer_support: 0,
      customer: 0,
    };
    for (const u of users) {
      const norm = normalizeRole(u.role);
      if (norm in counts) {
        counts[norm]++;
      }
    }
    return counts;
  }, [users]);

  // Filter users based on search and role filter
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Role filter check
      if (roleFilter !== "all") {
        const norm = normalizeRole(u.role);
        if (norm !== roleFilter) {
          return false;
        }
      }
      // Search query check
      if (!userSearch) return true;
      const q = userSearch.toLowerCase().trim();
      return (
        u.firstName.toLowerCase().includes(q) ||
        (u.lastName ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, roleFilter]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
      {/* Header & Create User */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-primary" /> System Users &amp; Roles
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {filteredUsers.length} of {users.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage administrator accounts, service engineers, dealers, sales reps, and customer access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onFetchUsers}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            title="Refresh user list"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", usersLoading && "animate-spin")} />
            <span>Refresh</span>
          </button>

          <button
            onClick={onCreateUser}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-600 active:scale-95 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* Compact Dropdown & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
        {/* Role Select Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-primary" />
            Role Filter:
          </span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All Roles ({roleCounts.all})</option>
            <option value="admin">Admins ({roleCounts.admin})</option>
            <option value="service">Service Engineers ({roleCounts.service})</option>
            <option value="dealer">Dealers ({roleCounts.dealer})</option>
            <option value="sales">Sales ({roleCounts.sales})</option>
            <option value="customer_support">Support ({roleCounts.customer_support})</option>
            <option value="customer">Customers ({roleCounts.customer})</option>
          </select>
        </div>

        {/* Search input */}
        <div className="relative shrink-0 sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={userSearch}
            onChange={(e) => onSetUserSearch(e.target.value)}
            placeholder="Search name, email, role…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Table List */}
      {usersLoading && users.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          {/* Table Header */}
          <div className="hidden sm:grid sm:grid-cols-[1.2fr_1.5fr_1fr_80px_44px] gap-4 px-5 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
            {["User", "Email", "Role", "Chats", ""].map((h) => (
              <span
                key={h}
                className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                {h}
              </span>
            ))}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <UserX className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-50" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No users found
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Try adjusting your role dropdown or search query.
              </p>
            </div>
          ) : (
            filteredUsers.map((u, i) => {
              const badge = getRoleBadge ? getRoleBadge(u.role) : formatRoleBadge(u.role);
              const isSelf = u.id === currentUserId;
              return (
                <div
                  key={u.id}
                  className={cn(
                    "flex flex-col sm:grid sm:grid-cols-[1.2fr_1.5fr_1fr_80px_44px] gap-2 sm:gap-4 px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors items-center",
                    i < filteredUsers.length - 1 &&
                      "border-b border-slate-100 dark:border-slate-800/80",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={`${u.firstName} ${u.lastName ?? ""}`}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {u.firstName} {u.lastName ?? ""}
                        {isSelf && (
                          <span className="ml-1.5 text-[10px] font-extrabold text-primary bg-primary-50 dark:bg-primary-950/60 px-1.5 py-0.2 rounded-md">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Joined {new Date(u.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center min-w-0">
                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      {u.email}
                    </p>
                  </div>

                  <div className="flex items-center">
                    <Badge variant={badge.variant as any} size="sm">
                      {badge.label}
                    </Badge>
                  </div>

                  <div className="flex items-center">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {u._count.conversations}
                    </span>
                  </div>

                  <div className="flex items-center justify-end">
                    {!isSelf && (
                      <button
                        onClick={() => onDeleteUser(u.id)}
                        disabled={deletingUserId === u.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
                        title="Delete user"
                      >
                        {deletingUserId === u.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
