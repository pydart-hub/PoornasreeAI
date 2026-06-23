"use client";

import { useState, useMemo } from "react";
import { Search, MapPin, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PincodeInfo {
  id: string;
  code: string;
  place?: string | null;
  district?: string | null;
  state?: string | null;
}

interface PincodeSelectorProps {
  selectedPincodeIds: string[];
  onChange: (ids: string[]) => void;
  allPincodes: PincodeInfo[];
}

export default function PincodeSelector({
  selectedPincodeIds,
  onChange,
  allPincodes,
}: PincodeSelectorProps) {
  const [search, setSearch] = useState("");
  const [activeState, setActiveState] = useState("All");

  // Get all unique states
  const states = useMemo(() => {
    const list = new Set<string>();
    allPincodes.forEach((p) => {
      if (p.state) list.add(p.state);
    });
    return Array.from(list).sort();
  }, [allPincodes]);

  // Group pincodes for state selection count helper
  const stateCounts = useMemo(() => {
    const counts: Record<string, { total: number; selected: number }> = {};
    allPincodes.forEach((p) => {
      const s = p.state || "Other";
      if (!counts[s]) counts[s] = { total: 0, selected: 0 };
      counts[s].total++;
      if (selectedPincodeIds.includes(p.id)) {
        counts[s].selected++;
      }
    });
    return counts;
  }, [allPincodes, selectedPincodeIds]);

  // Filter pincodes based on active state and search query
  const filteredPincodes = useMemo(() => {
    return allPincodes.filter((p) => {
      // State match
      if (activeState !== "All") {
        const s = p.state || "Other";
        if (s !== activeState) return false;
      }
      // Search match
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const code = p.code.toLowerCase();
        const place = (p.place || "").toLowerCase();
        const district = (p.district || "").toLowerCase();
        const state = (p.state || "").toLowerCase();
        return (
          code.includes(q) ||
          place.includes(q) ||
          district.includes(q) ||
          state.includes(q)
        );
      }
      return true;
    });
  }, [allPincodes, activeState, search]);

  const handleTogglePincode = (id: string) => {
    const isSelected = selectedPincodeIds.includes(id);
    if (isSelected) {
      onChange(selectedPincodeIds.filter((x) => x !== id));
    } else {
      onChange([...selectedPincodeIds, id]);
    }
  };

  const handleSelectFiltered = () => {
    const filteredIds = filteredPincodes.map((p) => p.id);
    const newSelection = Array.from(new Set([...selectedPincodeIds, ...filteredIds]));
    onChange(newSelection);
  };

  const handleClearFiltered = () => {
    const filteredIds = filteredPincodes.map((p) => p.id);
    const newSelection = selectedPincodeIds.filter((id) => !filteredIds.includes(id));
    onChange(newSelection);
  };

  const totalSelectedInFiltered = useMemo(() => {
    return filteredPincodes.filter((p) => selectedPincodeIds.includes(p.id)).length;
  }, [filteredPincodes, selectedPincodeIds]);

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary dark:text-content-dark-secondary pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pincode, place or state..."
          className="w-full pl-9 pr-8 py-2 rounded-xl text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-content-tertiary dark:placeholder:text-content-dark-tertiary"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content dark:text-content-dark-tertiary dark:hover:text-content-dark p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* State Filter Chips */}
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wider">
          Filter by State
        </label>
        <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1">
          {/* "All" chip */}
          <button
            type="button"
            onClick={() => setActiveState("All")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer",
              activeState === "All"
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-surface dark:bg-surface text-content-secondary dark:text-content-dark-secondary border-line dark:border-line-dark hover:border-primary/50"
            )}
          >
            All States ({allPincodes.length})
          </button>

          {states.map((state) => {
            const counts = stateCounts[state] || { total: 0, selected: 0 };
            const isSelected = activeState === state;
            return (
              <button
                key={state}
                type="button"
                onClick={() => setActiveState(state)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5",
                  isSelected
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-surface dark:bg-surface text-content-secondary dark:text-content-dark-secondary border-line dark:border-line-dark hover:border-primary/50"
                )}
              >
                <span>{state}</span>
                <span
                  className={cn(
                    "text-[10px] px-1 py-0.5 rounded-full font-bold",
                    isSelected
                      ? "bg-white/20 text-white"
                      : counts.selected > 0
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-slate-100 dark:bg-slate-800 text-content-tertiary dark:text-content-dark-tertiary"
                  )}
                >
                  {counts.selected > 0 ? `${counts.selected}/${counts.total}` : counts.total}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Select Actions */}
      <div className="flex items-center justify-between text-xs py-1 border-b border-line/50 dark:border-line-dark/50">
        <span className="text-content-secondary dark:text-content-dark-secondary font-medium">
          {filteredPincodes.length} pincode{filteredPincodes.length !== 1 ? "s" : ""} found
          {totalSelectedInFiltered > 0 && (
            <span className="text-primary dark:text-primary-300 font-semibold ml-1">
              ({totalSelectedInFiltered} selected)
            </span>
          )}
        </span>

        {filteredPincodes.length > 0 && (
          <div className="flex items-center gap-2">
            {totalSelectedInFiltered < filteredPincodes.length ? (
              <button
                type="button"
                onClick={handleSelectFiltered}
                className="text-primary hover:text-primary-hover font-semibold cursor-pointer"
              >
                Select All
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClearFiltered}
                className="text-rose-500 hover:text-rose-600 font-semibold cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pincodes Grid */}
      {filteredPincodes.length === 0 ? (
        <div className="text-center py-8 rounded-xl border border-dashed border-line dark:border-line-dark bg-slate-50/50 dark:bg-slate-900/50">
          <MapPin className="w-6 h-6 mx-auto mb-1.5 text-content-tertiary dark:text-content-dark-tertiary opacity-40" />
          <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary italic">
            No pincodes match your search/filter
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto p-1 bg-slate-50/50 dark:bg-slate-900/50 border border-line dark:border-line-dark rounded-xl custom-scrollbar">
          {filteredPincodes.map((p) => {
            const isSelected = selectedPincodeIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleTogglePincode(p.id)}
                className={cn(
                  "flex items-start gap-2.5 p-2 rounded-lg border text-left transition-all cursor-pointer group shadow-sm",
                  isSelected
                    ? "bg-primary/5 dark:bg-primary/10 border-primary text-primary"
                    : "bg-surface dark:bg-surface border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:border-primary/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                {/* Selection Circle indicator */}
                <div
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    isSelected
                      ? "bg-primary border-primary text-white"
                      : "border-slate-300 dark:border-slate-600 group-hover:border-primary bg-white dark:bg-slate-700"
                  )}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>

                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={cn(
                        "text-xs font-bold font-mono tracking-wide",
                        isSelected ? "text-primary dark:text-primary-300" : "text-content dark:text-content-dark"
                      )}
                    >
                      {p.code}
                    </span>
                    {p.state && (
                      <span className="text-[9px] uppercase font-semibold text-content-tertiary dark:text-content-dark-tertiary opacity-70 truncate max-w-[80px]">
                        {p.state}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary truncate mt-0.5">
                    {[p.place, p.district].filter(Boolean).join(", ")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
