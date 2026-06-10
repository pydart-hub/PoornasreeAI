"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiManualComplaint {
  id: string;
  phoneNumber: string;
  machineName: string | null;
  complaint: string;
  isReviewed: boolean;
  createdAt: string;
}

export default function ManualComplaintsTab() {
  const [complaints, setComplaints] = useState<ApiManualComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/manual-complaints", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setComplaints(data.complaints);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleReview = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/manual-complaints/${id}/review`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        setComplaints((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isReviewed: true } : c))
        );
      }
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this complaint?")) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/manual-complaints/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setComplaints((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setActionId(null);
    }
  };

  if (loading && complaints.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold text-content dark:text-content-dark">
            Manual Customer Complaints
          </h2>
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
            Complaints entered manually by customers when they select "Other".
          </p>
        </div>
      </div>

      {complaints.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-line dark:border-line-dark">
          <AlertCircle className="w-10 h-10 text-content-secondary dark:text-content-dark-secondary mx-auto mb-3 opacity-40" />
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
            No manual complaints found
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
          {complaints.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors",
                i < complaints.length - 1 && "border-b border-line dark:border-line-dark",
                c.isReviewed && "opacity-60 bg-surface-hover dark:bg-surface-dark-hover"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content dark:text-content-dark break-words">
                  {c.complaint}
                </p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                    📞 {c.phoneNumber}
                  </span>
                  {c.machineName && (
                    <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                      ⚙️ {c.machineName}
                    </span>
                  )}
                  <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                    🕒 {new Date(c.createdAt).toLocaleDateString("en-IN")}
                  </span>
                  {c.isReviewed && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Reviewed
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {!c.isReviewed && (
                  <button
                    onClick={() => handleReview(c.id)}
                    disabled={actionId === c.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {actionId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Mark Reviewed
                  </button>
                )}
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={actionId === c.id}
                  className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                  title="Delete complaint"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
