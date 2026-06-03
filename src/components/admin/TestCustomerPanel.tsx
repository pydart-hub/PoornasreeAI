"use client";

import { useState } from "react";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";

type TestCustomerPanelProps = {
  /** API endpoint (admin or service manager). */
  apiPath?: string;
  /** Called after a successful clear (e.g. refresh ticket list). */
  onCleared?: () => void;
};

/**
 * Temporary tool: reset one WhatsApp test customer's tickets and chat state.
 */
export default function TestCustomerPanel({
  apiPath = "/api/manager/test/customer",
  onCleared,
}: TestCustomerPanelProps) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClear() {
    const trimmed = phone.replace(/\D/g, "");
    if (trimmed.length < 10) {
      setError("Enter a valid 10-digit mobile number.");
      setMessage(null);
      return;
    }

    const label = phone.trim() || trimmed;
    if (
      !window.confirm(
        `Delete all tickets and WhatsApp session data for ${label}?\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(apiPath, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      setMessage(
        `Cleared ${data.total} record(s): ${data.tickets} ticket(s), ${data.conversationSessions} session(s), ${data.simulateMessages} message(s). You can test again from Hi on WhatsApp.`,
      );
      onCleared?.();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            WhatsApp test reset (temporary)
          </h3>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-1">
            Use your test mobile number to clear tickets and chat state so the customer flow starts fresh.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 9048740132"
          className="flex-1 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-500/40 bg-white dark:bg-surface-dark-card text-sm"
        />
        <button
          type="button"
          onClick={handleClear}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-60 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          Delete customer data
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {message && <p className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>}
    </div>
  );
}
