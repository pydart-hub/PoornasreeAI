"use client";

import { useState } from "react";
import {
  X,
  Wrench,
  User,
  Phone,
  MapPin,
  FileText,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { getStates, getDistricts, findPincode } from "@/lib/indiaLocations";

interface EngineerOption {
  id: string;
  firstName: string;
  lastName?: string | null;
  whatsappNumber?: string | null;
  activeTickets?: number;
  engineerPincodes?: Array<{ code: string; place?: string | null }>;
}

interface DirectAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineers: EngineerOption[];
  onSuccess: (ticket: any) => void;
}

const PURPOSE_PRESETS = [
  "Routine Maintenance",
  "Calibration & Testing",
  "Preventive Checkup",
  "Machine Inspection",
  "Warranty Checkup",
  "Emergency Repair Visit",
];

export function DirectAssignModal({
  isOpen,
  onClose,
  engineers,
  onSuccess,
}: DirectAssignModalProps) {
  const [purpose, setPurpose] = useState(PURPOSE_PRESETS[0]);
  const [customPurpose, setCustomPurpose] = useState("");
  const [isCustomPurpose, setIsCustomPurpose] = useState(false);
  const [engineerId, setEngineerId] = useState(engineers[0]?.id || "");
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [place, setPlace] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("Kerala");
  const [machineName, setMachineName] = useState("");
  const [machineSerialNumber, setMachineSerialNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePincodeChange = (code: string) => {
    setPincode(code);
    const cleaned = code.trim();
    if (cleaned.length === 6) {
      // Auto-lookup from indiaLocations if available
      const match = findPincode(cleaned);
      if (match) {
        if (match.name && !place) setPlace(match.name);
        if (match.district && !district) setDistrict(match.district);
        if (match.state) setState(match.state);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const activePurpose = isCustomPurpose ? customPurpose.trim() : purpose;
    if (!activePurpose) {
      setError("Please specify the purpose or service type.");
      return;
    }

    if (!engineerId) {
      setError("Please select an engineer to assign this visit.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/manager/direct-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          engineerId,
          purpose: activePurpose,
          customerName: customerName.trim() || undefined,
          phoneNumber: phoneNumber.trim() || undefined,
          customerAddress: customerAddress.trim() || undefined,
          place: place.trim() || undefined,
          district: district.trim() || undefined,
          state: state.trim() || undefined,
          pincode: pincode.trim() || undefined,
          machineName: machineName.trim() || undefined,
          machineSerialNumber: machineSerialNumber.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to dispatch direct assignment");
      }

      onSuccess(data.ticket);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to assign service");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedEng = engineers.find((e) => e.id === engineerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-surface-dark-card border border-slate-200 dark:border-line-dark rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-line-dark bg-slate-50/50 dark:bg-surface-dark-secondary">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-content dark:text-content-dark">
                Direct Service / Checkup Assignment
              </h3>
              <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary">
                Dispatch an engineer for maintenance, calibration or visit without customer ticket
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-content-tertiary hover:text-content dark:text-content-dark-tertiary dark:hover:text-content-dark hover:bg-slate-100 dark:hover:bg-line-dark transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Purpose / Category */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">
              Assignment Purpose / Task <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PURPOSE_PRESETS.map((p) => {
                const isSelected = !isCustomPurpose && purpose === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setIsCustomPurpose(false);
                      setPurpose(p);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                      isSelected
                        ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                        : "bg-slate-50 dark:bg-surface-dark-secondary text-content dark:text-content-dark border-slate-200 dark:border-line-dark hover:bg-slate-100 dark:hover:bg-line-dark"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsCustomPurpose(true)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  isCustomPurpose
                    ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                    : "bg-slate-50 dark:bg-surface-dark-secondary text-content dark:text-content-dark border-slate-200 dark:border-line-dark hover:bg-slate-100 dark:hover:bg-line-dark"
                }`}
              >
                + Custom Purpose
              </button>
            </div>
            {isCustomPurpose && (
              <input
                type="text"
                placeholder="Enter custom service task (e.g. Power Supply Board Inspection)"
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                className="w-full mt-2 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              />
            )}
          </div>

          {/* 2. Assign Engineer */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">
              Assign to Engineer <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={engineerId}
                onChange={(e) => setEngineerId(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none appearance-none"
              >
                {engineers.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.firstName} {eng.lastName || ""} {eng.whatsappNumber ? `(${eng.whatsappNumber})` : ""} · {eng.activeTickets || 0} active tickets
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-content-tertiary pointer-events-none" />
            </div>
            {selectedEng && (
              <p className="text-[11px] text-content-tertiary dark:text-content-dark-tertiary">
                WhatsApp assignment alert will be dispatched to {selectedEng.firstName} {selectedEng.whatsappNumber ? `at ${selectedEng.whatsappNumber}` : "(no WhatsApp number)"}.
              </p>
            )}
          </div>

          {/* 3. Customer / Center Info */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-surface-dark-secondary/60 border border-slate-200/70 dark:border-line-dark space-y-3">
            <span className="text-xs font-semibold text-content dark:text-content-dark flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-primary-500" /> Customer / Dairy / Contact Info
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-content-tertiary dark:text-content-dark-tertiary block mb-1">
                  Customer / Dairy Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Anand Milk Society / John Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-content-tertiary dark:text-content-dark-tertiary block mb-1">
                  Customer Mobile / WhatsApp
                </label>
                <input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-content-tertiary dark:text-content-dark-tertiary block mb-1">
                Full Service Address / Landmark
              </label>
              <input
                type="text"
                placeholder="Door No, Street, Landmark"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* 4. Location & Pincode */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1">
              <label className="text-[11px] font-medium text-content-secondary dark:text-content-dark-secondary block mb-1">
                Pincode
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="682001"
                value={pincode}
                onChange={(e) => handlePincodeChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark font-mono outline-none focus:border-primary-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="text-[11px] font-medium text-content-secondary dark:text-content-dark-secondary block mb-1">
                Place / Town
              </label>
              <input
                type="text"
                placeholder="e.g. Aluva"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark outline-none focus:border-primary-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="text-[11px] font-medium text-content-secondary dark:text-content-dark-secondary block mb-1">
                District
              </label>
              <input
                type="text"
                placeholder="e.g. Ernakulam"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark outline-none focus:border-primary-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="text-[11px] font-medium text-content-secondary dark:text-content-dark-secondary block mb-1">
                State
              </label>
              <input
                type="text"
                placeholder="Kerala"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* 5. Machine & Serial (Optional - triggers Passtest warranty lookup) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-content-secondary dark:text-content-dark-secondary block mb-1">
                Machine Model / Name
              </label>
              <input
                type="text"
                placeholder="e.g. Lactosure Eco / Stirrer"
                value={machineName}
                onChange={(e) => setMachineName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-content-secondary dark:text-content-dark-secondary block mb-1">
                Serial Number (auto-fetches Passtest warranty)
              </label>
              <input
                type="text"
                placeholder="e.g. LSE-2024-0891"
                value={machineSerialNumber}
                onChange={(e) => setMachineSerialNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark font-mono outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* 6. Manager Instructions / Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-content-secondary dark:text-content-dark-secondary block">
              Instructions for Engineer
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Please verify ultrasonic transducer, replace tube kit and check zero calibration."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-line-dark bg-white dark:bg-surface-dark text-content dark:text-content-dark outline-none focus:border-primary-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-line-dark">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-content-secondary dark:text-content-dark-secondary hover:bg-slate-100 dark:hover:bg-line-dark transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl text-white bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-500/20 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Assigning & Notifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Assign Service Visit</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
