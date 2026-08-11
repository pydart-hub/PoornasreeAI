"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RegisteredCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
  registeredAt: string | null;
  updatedAt: string | null;
  serialNumber: string | null;
  machineModel: string | null;
  machineCustomer: string | null;
  address: string | null;
  pincode: string | null;
  place: string | null;
  district: string | null;
  state: string | null;
  googleMapLink: string | null;
  productCode: string | null;
  invoiceDate: string | null;
  warrantyMonths: number | null;
}

type SortKey = "registeredAt" | "name" | "state";

export default function RegisteredCustomersTab() {
  const [customers, setCustomers] = useState<RegisteredCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("registeredAt");
  const [selectedCustomer, setSelectedCustomer] = useState<RegisteredCustomer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<RegisteredCustomer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<RegisteredCustomer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", address: "", pincode: "", place: "", state: "" });
  const [actionLoading, setActionLoading] = useState(false);

  const openEdit = (c: RegisteredCustomer) => {
    setEditForm({
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address || "",
      pincode: c.pincode || "",
      place: c.place || "",
      state: c.state || "",
    });
    setEditingCustomer(c);
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${deletingCustomer.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete customer");
        return;
      }
      setCustomers((prev) => prev.filter((c) => c.id !== deletingCustomer.id));
      setDeletingCustomer(null);
    } catch {
      alert("Failed to delete customer");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingCustomer) return;
    setActionLoading(true);
    try {
      const parts = editForm.name.trim().split(" ");
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      const res = await fetch(`/api/admin/users/${editingCustomer.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email: editForm.email, whatsappNumber: editForm.phone }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update customer");
        return;
      }
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === editingCustomer.id
            ? { ...c, name: editForm.name, phone: editForm.phone, email: editForm.email }
            : c
        )
      );
      setSelectedCustomer((prev) =>
        prev && prev.id === editingCustomer.id
          ? { ...prev, name: editForm.name, phone: editForm.phone, email: editForm.email }
          : prev
      );
      setEditingCustomer(null);
    } catch {
      alert("Failed to update customer");
    } finally {
      setActionLoading(false);
    }
  };

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/registered-customers", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setCustomers(data.customers || []);
    } catch (err) {
      console.error("Failed to load registered customers:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const [stateFilter, setStateFilter] = useState("all");

  const uniqueStates = useMemo(() => {
    return Array.from(new Set(customers.map((c) => c.state).filter(Boolean))) as string[];
  }, [customers]);

  const filtered = useMemo(() => {
    let list = customers;
    if (stateFilter !== "all") {
      list = list.filter((c) => c.state === stateFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.serialNumber || "").toLowerCase().includes(q) ||
          (c.address || "").toLowerCase().includes(q) ||
          (c.place || "").toLowerCase().includes(q) ||
          (c.district || "").toLowerCase().includes(q) ||
          (c.state || "").toLowerCase().includes(q)
        );
      });
    }
    list = [...list];
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "state") return (a.state || "").localeCompare(b.state || "");
      const aDate = a.registeredAt || a.createdAt;
      const bDate = b.registeredAt || b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    return list;
  }, [customers, search, sortBy, stateFilter]);

  const handleExportCsv = () => {
    const headers = [
      "Name",
      "Phone",
      "Email",
      "Registered At",
      "Serial Number",
      "Machine Model",
      "Dealer/Customer",
      "Product Code",
      "Invoice Date",
      "Warranty (months)",
      "Address",
      "Pincode",
      "Place",
      "District",
      "State",
      "Google Maps Link",
    ];
    const rows = filtered.map((c) => [
      c.name,
      c.phone,
      c.email,
      c.registeredAt ? new Date(c.registeredAt).toISOString() : "",
      c.serialNumber || "",
      c.machineModel || "",
      c.machineCustomer || "",
      c.productCode || "",
      c.invoiceDate || "",
      c.warrantyMonths ?? "",
      c.address || "",
      c.pincode || "",
      c.place || "",
      c.district || "",
      c.state || "",
      c.googleMapLink || "",
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registered-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-content dark:text-content-dark flex items-center gap-2">
            <User className="w-4 h-4" />
            Registered Customers ({filtered.length})
          </h2>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">
            Customers who registered via WhatsApp chatbot
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, place…"
              className="h-9 pl-9 pr-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 w-64"
            />
          </div>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All States</option>
            {uniqueStates.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="registeredAt">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="state">Sort by State</option>
          </select>
          <button
            onClick={fetchCustomers}
            disabled={loading}
            className="h-9 px-3 rounded-xl text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors text-sm"
            title="Refresh"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "↻"}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="h-9 px-3 rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark overflow-hidden">
        {loading && customers.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-content-secondary">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading registered customers…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-content-secondary">
            <User className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">
              {search ? "No customers match your search." : "No registered customers yet."}
            </p>
            {!search && (
              <p className="text-xs mt-1 opacity-70">
                Customers will appear here after they register via WhatsApp.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover dark:bg-surface-dark-hover text-content-secondary dark:text-content-dark-secondary text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 font-medium">Serial</th>
                  <th className="text-left px-4 py-3 font-medium">Model</th>
                  <th className="text-left px-4 py-3 font-medium">Location</th>
                  <th className="text-left px-4 py-3 font-medium">Pincode</th>
                  <th className="text-left px-4 py-3 font-medium">Registered</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-line dark:border-line-dark hover:bg-surface-hover/50 dark:hover:bg-surface-dark-hover/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-content dark:text-content-dark">
                        {c.name}
                      </div>
                      {c.machineCustomer && (
                        <div className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                          Dealer: {c.machineCustomer}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-content dark:text-content-dark whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 opacity-60" />
                        {c.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-content dark:text-content-dark font-mono text-xs">
                      {c.serialNumber || "—"}
                    </td>
                    <td className="px-4 py-3 text-content dark:text-content-dark">
                      {c.machineModel || "—"}
                    </td>
                    <td className="px-4 py-3 text-content dark:text-content-dark">
                      <div className="flex items-start gap-1.5 max-w-xs">
                        <MapPin className="w-3 h-3 opacity-60 mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                          {c.address ? (
                            <>
                              <div className="line-clamp-2">{c.address}</div>
                              {(c.place || c.district || c.state) && (
                                <div className="text-content-secondary dark:text-content-dark-secondary mt-0.5">
                                  {[c.place, c.district, c.state].filter(Boolean).join(", ")}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-content-secondary dark:text-content-dark-secondary">—</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-content dark:text-content-dark font-mono text-xs">
                      {c.pincode || "—"}
                    </td>
                    <td className="px-4 py-3 text-content-secondary dark:text-content-dark-secondary text-xs whitespace-nowrap">
                      {c.registeredAt
                        ? new Date(c.registeredAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(c)}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-xs font-medium flex items-center gap-1"
                          title="Edit customer"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingCustomer(c)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 text-xs font-medium flex items-center gap-1"
                          title="Delete customer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                        <button
                          onClick={() => setSelectedCustomer(c)}
                          className="text-primary hover:text-primary-hover text-xs font-medium"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* Edit Modal */}
      {editingCustomer && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setEditingCustomer(null)}
        >
          <div
            className="bg-surface dark:bg-surface-dark rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-content dark:text-content-dark">Edit Customer</h3>
              <button
                onClick={() => setEditingCustomer(null)}
                className="text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark text-xl"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Full Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Phone</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Email</label>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Address</label>
                <input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Pincode</label>
                  <input
                    value={editForm.pincode}
                    onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value })}
                    className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">State</label>
                  <input
                    value={editForm.state}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                    className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditingCustomer(null)}
                  disabled={actionLoading}
                  className="h-9 px-4 rounded-xl border border-line dark:border-line-dark text-sm text-content-secondary hover:text-content dark:hover:text-content-dark transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={actionLoading}
                  className="h-9 px-4 rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCustomer && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setDeletingCustomer(null)}
        >
          <div
            className="bg-surface dark:bg-surface-dark rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-6 space-y-4">
              <h3 className="text-lg font-bold text-content dark:text-content-dark">Delete Customer</h3>
              <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                Are you sure you want to delete <strong className="text-content dark:text-content-dark">{deletingCustomer.name}</strong> ({deletingCustomer.phone})?
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeletingCustomer(null)}
                  disabled={actionLoading}
                  className="h-9 px-4 rounded-xl border border-line dark:border-line-dark text-sm text-content-secondary hover:text-content dark:hover:text-content-dark transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="h-9 px-4 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CustomerDetailModal({
  customer,
  onClose,
}: {
  customer: RegisteredCustomer;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface dark:bg-surface-dark rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-content dark:text-content-dark">
            Customer Details
          </h3>
          <button
            onClick={onClose}
            className="text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark text-xl"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Personal Info */}
          <section>
            <h4 className="text-sm font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
              Personal Information
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Name" value={customer.name} />
              <Field
                label="Phone"
                value={
                  <a
                    href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {customer.phone}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                }
              />
              <Field label="Email" value={customer.email} />
              <Field
                label="Registered At"
                value={
                  customer.registeredAt
                    ? new Date(customer.registeredAt).toLocaleString("en-IN")
                    : "—"
                }
              />
            </div>
          </section>

          {/* Machine Info */}
          {(customer.serialNumber || customer.machineModel) && (
            <section>
              <h4 className="text-sm font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
                Machine Details (from Passtest)
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Serial Number" value={customer.serialNumber || "—"} mono />
                <Field label="Model" value={customer.machineModel || "—"} />
                <Field label="Product Code" value={customer.productCode || "—"} mono />
                <Field label="Dealer/Customer" value={customer.machineCustomer || "—"} />
                <Field label="Invoice Date" value={customer.invoiceDate || "—"} />
                <Field
                  label="Warranty"
                  value={
                    customer.warrantyMonths != null
                      ? `${customer.warrantyMonths} months`
                      : "—"
                  }
                />
              </div>
            </section>
          )}

          {/* Address */}
          <section>
            <h4 className="text-sm font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-3">
              Service Address
            </h4>
            <div className="space-y-3 text-sm">
              <Field label="Full Address" value={customer.address || "—"} />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Pincode" value={customer.pincode || "—"} mono />
                <Field label="Place" value={customer.place || "—"} />
                <Field label="District" value={customer.district || "—"} />
              </div>
              <Field label="State" value={customer.state || "—"} />
              {customer.googleMapLink && (
                <Field
                  label="Google Maps"
                  value={
                    <a
                      href={customer.googleMapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 break-all"
                    >
                      {customer.googleMapLink}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  }
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-content-secondary dark:text-content-dark-secondary mb-0.5">
        {label}
      </div>
      <div className={cn("text-content dark:text-content-dark", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}
