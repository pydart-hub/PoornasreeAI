"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  MessageSquare,
  Save,
  Phone,
  Mail,
  Clock,
  User,
  Sparkles,
  Bot,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Plus,
  Trash2,
  Edit2,
  Sliders,
  ListFilter,
  MousePointer,
  HelpCircle,
  FileText,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SupportSettings {
  botName: string;
  supportPhone: string;
  supportEmail: string | null;
  supportHours: string | null;
  supportNote: string | null;
}

interface WaQuickButtonConfig {
  id: string;
  title: string;
  actionType: "auto_reply" | "trigger_flow" | "location";
  responsePayload: string;
}

interface WaListRowConfig {
  id: string;
  title: string;
  description: string;
  actionPayload: string;
}

interface WaBotRuleConfig {
  id: string;
  ruleName: string;
  keywords: string[];
  responseText: string;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Default Configurations ─────────────────────
const DEFAULT_WELCOME = "Namaste! 🙏 I'm *{bot_name}* from Poornasree Equipments.\n\nHow can I help you with your milk testing machine, service booking, or product questions today?";
const DEFAULT_AFTER_HOURS = "Thank you for contacting Poornasree Equipments! 🌙 Our office is currently closed (Business Hours: {business_hours}).\n\nYour message has been logged, and our support team will respond first thing tomorrow morning.";
const DEFAULT_HANDOFF = "Hello! Our customer support agent is now live and ready to assist you. Please feel free to ask your questions or clarify any doubts.";

const DEFAULT_BUTTONS: WaQuickButtonConfig[] = [
  { id: "btn_products", title: "📦 View Products", actionType: "auto_reply", responsePayload: "Here is our complete LactoSure ECO product catalog and price list!" },
  { id: "btn_service", title: "🛠️ Book Service", actionType: "trigger_flow", responsePayload: "Please share your machine serial number and pincode to connect with a field service engineer." },
  { id: "btn_agent", title: "🎧 Talk to Support", actionType: "auto_reply", responsePayload: "Connecting you to a live support engineer..." },
];

const DEFAULT_LIST_ROWS: WaListRowConfig[] = [
  { id: "menu_lactosure", title: "LactoSure ECO Analyzers", description: "Ultrasonic milk testing machines (Eco, Eco-S, Eco-D-V4)", actionPayload: "LactoSure ECO series measures FAT, SNF, Added Water, Density, and Protein." },
  { id: "menu_stirrer", title: "VIBRO Ultrasonic Stirrer", description: "Milk degasser and ultrasonic sample stirrer", actionPayload: "VIBRO Stirrer removes air bubbles from milk samples within 10 seconds." },
  { id: "menu_dps", title: "LactoSure DPS-T DPU", description: "Data processing unit with GPRS & thermal printer", actionPayload: "DPS-T DPU integrates directly with milk analyzers and prints rate charts." },
  { id: "menu_warranty", title: "Warranty & Registration", description: "Register machine warranty or check warranty status", actionPayload: "Please provide your invoice number and serial number to register warranty." },
  { id: "menu_complaint", title: "Raise Service Ticket", description: "Report machine issues or request engineer home visit", actionPayload: "Our 30+ nationwide field engineers guarantee 24-hour response." },
];

const DEFAULT_BOT_RULES: WaBotRuleConfig[] = [
  { id: "rule_pricing", ruleName: "Product Pricing & Catalog", keywords: ["price", "cost", "catalog", "rate"], responseText: "Poornasree LactoSure ECO Analyzers start from ₹25,000. Contact sales at {support_phone} for full catalog PDF." },
  { id: "rule_service", ruleName: "Engineer Dispatch & Service", keywords: ["service", "repair", "engineer", "broken"], responseText: "Our 30+ nationwide service engineers (Harisree Enterprises) guarantee 24-hour response across India." },
  { id: "rule_location", ruleName: "Company Office Locations", keywords: ["address", "location", "delhi", "kerala"], responseText: "Head Office: Mannoor Road, Maradu, Ernakulam, Kochi - 682304. Delhi: Cold Storage Market, Bulandshahr UP." },
];

export default function WhatsAppSettingsTab() {
  const [activeTab, setActiveTab] = useState<"greetings" | "buttons" | "menu" | "bot_rules">("greetings");

  const [form, setForm] = useState({
    botName: "Hari",
    supportPhone: "+91 94009 61291",
    supportEmail: "support@poornasree.com",
    supportHours: "Mon–Sat, 9 AM – 6 PM IST",
    supportNote: "",
    welcomeGreeting: DEFAULT_WELCOME,
    afterHoursGreeting: DEFAULT_AFTER_HOURS,
    supportHandoffGreeting: DEFAULT_HANDOFF,
  });

  const [buttons, setButtons] = useState<WaQuickButtonConfig[]>(DEFAULT_BUTTONS);
  const [listRows, setListRows] = useState<WaListRowConfig[]>(DEFAULT_LIST_ROWS);
  const [botRules, setBotRules] = useState<WaBotRuleConfig[]>(DEFAULT_BOT_RULES);

  const [menuHeaderTitle, setMenuHeaderTitle] = useState("Explore Support Menu 📋");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [simulatedCustomerMsg, setSimulatedCustomerMsg] = useState("Hi");
  const [simulatedBotResponse, setSimulatedBotResponse] = useState("");

  // Load stored settings from local storage & API
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const savedConfig = localStorage.getItem("poornasree_wa_full_config");
      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig);
          if (parsed.greetings) {
            setForm((f) => ({
              ...f,
              welcomeGreeting: parsed.greetings.welcomeGreeting || DEFAULT_WELCOME,
              afterHoursGreeting: parsed.greetings.afterHoursGreeting || DEFAULT_AFTER_HOURS,
              supportHandoffGreeting: parsed.greetings.supportHandoffGreeting || DEFAULT_HANDOFF,
            }));
          }
          if (parsed.buttons) setButtons(parsed.buttons);
          if (parsed.listRows) setListRows(parsed.listRows);
          if (parsed.botRules) setBotRules(parsed.botRules);
          if (parsed.menuHeaderTitle) setMenuHeaderTitle(parsed.menuHeaderTitle);
        } catch {
          /* ignore */
        }
      }

      const data = await apiFetch<{ settings: SupportSettings }>("/api/admin/chatbot-settings");
      const s = data.settings;
      setForm((f) => ({
        ...f,
        botName: s.botName ?? "Hari",
        supportPhone: s.supportPhone ?? "+91 94009 61291",
        supportEmail: s.supportEmail ?? "support@poornasree.com",
        supportHours: s.supportHours ?? "Mon–Sat, 9 AM – 6 PM IST",
        supportNote: s.supportNote ?? "",
      }));
    } catch {
      setError("Failed to load settings from server");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Save full configuration
  const handleSaveAll = async () => {
    if (!form.supportPhone.trim()) {
      setError("Phone number is required");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      localStorage.setItem(
        "poornasree_wa_full_config",
        JSON.stringify({
          greetings: {
            welcomeGreeting: form.welcomeGreeting,
            afterHoursGreeting: form.afterHoursGreeting,
            supportHandoffGreeting: form.supportHandoffGreeting,
          },
          buttons,
          listRows,
          botRules,
          menuHeaderTitle,
        }),
      );

      await apiFetch("/api/admin/chatbot-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botName: form.botName.trim() || "Hari",
          supportPhone: form.supportPhone.trim(),
          supportEmail: form.supportEmail.trim() || null,
          supportHours: form.supportHours.trim() || null,
          supportNote: form.supportNote.trim() || null,
        }),
      });

      setSuccess("All WhatsApp Interactive Buttons, Menus, Greetings & Bot Rules saved!");
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  // Helper to interpolate variables
  const formatMessage = (text: string) => {
    let msg = text || "";
    msg = msg.replace(/\{bot_name\}/g, form.botName.trim() || "Hari");
    msg = msg.replace(/\{company_name\}/g, "Poornasree Equipments");
    msg = msg.replace(/\{support_phone\}/g, form.supportPhone.trim() || "+91 94009 61291");
    msg = msg.replace(/\{support_email\}/g, form.supportEmail.trim() || "support@poornasree.com");
    msg = msg.replace(/\{business_hours\}/g, form.supportHours.trim() || "Mon–Sat, 9 AM – 6 PM IST");
    return msg;
  };

  // Add Button
  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons([
      ...buttons,
      {
        id: `btn_${Date.now().toString().slice(-4)}`,
        title: "New Button",
        actionType: "auto_reply",
        responsePayload: "Response message for button...",
      },
    ]);
  };

  // Add List Row
  const addListRow = () => {
    if (listRows.length >= 10) return;
    setListRows([
      ...listRows,
      {
        id: `menu_${Date.now().toString().slice(-4)}`,
        title: "New Item Title",
        description: "Short item description",
        actionPayload: "Auto reply for this menu item...",
      },
    ]);
  };

  // Add Bot Rule
  const addBotRule = () => {
    setBotRules([
      ...botRules,
      {
        id: `rule_${Date.now().toString().slice(-4)}`,
        ruleName: "New Auto-Reply Rule",
        keywords: ["sample", "test"],
        responseText: "Auto reply response text...",
      },
    ]);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Main Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            WhatsApp Interactive Bot &amp; Menu Builder
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure automated greetings, interactive quick reply buttons, list menus, and AI keyword flow rules.
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save All Bot Configs</span>
        </button>
      </div>

      {/* Alert Banners */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Sub-Nav Module Switcher Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto scrollbar-none">
        {[
          { key: "greetings", label: "Greetings & Persona", icon: MessageSquare },
          { key: "buttons", label: `Quick Buttons (${buttons.length}/3)`, icon: MousePointer },
          { key: "menu", label: `Interactive Menu (${listRows.length}/10)`, icon: ListFilter },
          { key: "bot_rules", label: `Bot Flow Rules (${botRules.length})`, icon: Bot },
        ].map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0",
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Editors (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* ── TAB 1: GREETINGS & PERSONA ── */}
          {activeTab === "greetings" && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  1. First-Contact Welcome Greeting
                </label>
                <textarea
                  value={form.welcomeGreeting}
                  onChange={(e) => setForm((f) => ({ ...f, welcomeGreeting: e.target.value }))}
                  rows={4}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  2. After Business Hours Greeting
                </label>
                <textarea
                  value={form.afterHoursGreeting}
                  onChange={(e) => setForm((f) => ({ ...f, afterHoursGreeting: e.target.value }))}
                  rows={4}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" /> AI Persona Credentials
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">AI Bot Name</label>
                    <input
                      value={form.botName}
                      onChange={(e) => setForm((f) => ({ ...f, botName: e.target.value }))}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Support Phone</label>
                    <input
                      value={form.supportPhone}
                      onChange={(e) => setForm((f) => ({ ...f, supportPhone: e.target.value }))}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: INTERACTIVE QUICK BUTTONS ── */}
          {activeTab === "buttons" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Quick Reply Buttons (Max 3)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Interactive buttons sent directly in WhatsApp message bubbles for instant 1-tap customer replies.
                  </p>
                </div>
                <button
                  onClick={addButton}
                  disabled={buttons.length >= 3}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-600 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Add Button
                </button>
              </div>

              {buttons.map((btn, idx) => (
                <div
                  key={btn.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                      Button #{idx + 1}
                    </span>
                    <button
                      onClick={() => setButtons(buttons.filter((b) => b.id !== btn.id))}
                      className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        Button Title (Max 20 chars)
                      </label>
                      <input
                        maxLength={20}
                        value={btn.title}
                        onChange={(e) => {
                          const updated = [...buttons];
                          updated[idx].title = e.target.value;
                          setButtons(updated);
                        }}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        Action Type
                      </label>
                      <select
                        value={btn.actionType}
                        onChange={(e) => {
                          const updated = [...buttons];
                          updated[idx].actionType = e.target.value as any;
                          setButtons(updated);
                        }}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
                      >
                        <option value="auto_reply">Send Auto Reply</option>
                        <option value="trigger_flow">Trigger Bot Flow</option>
                        <option value="location">Request Location</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Response Message Payload
                    </label>
                    <textarea
                      rows={2}
                      value={btn.responsePayload}
                      onChange={(e) => {
                        const updated = [...buttons];
                        updated[idx].responsePayload = e.target.value;
                        setButtons(updated);
                      }}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TAB 3: INTERACTIVE LIST MENU ── */}
          {activeTab === "menu" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Interactive List Menu Builder (Max 10)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Interactive popup list menu sent to WhatsApp users to browse products, warranty, and support options.
                  </p>
                </div>
                <button
                  onClick={addListRow}
                  disabled={listRows.length >= 10}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-600 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Add Menu Item
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Menu Header Button Label
                </label>
                <input
                  value={menuHeaderTitle}
                  onChange={(e) => setMenuHeaderTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              {listRows.map((row, idx) => (
                <div
                  key={row.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                      Menu Row #{idx + 1}
                    </span>
                    <button
                      onClick={() => setListRows(listRows.filter((r) => r.id !== row.id))}
                      className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        Item Title (Max 24 chars)
                      </label>
                      <input
                        maxLength={24}
                        value={row.title}
                        onChange={(e) => {
                          const updated = [...listRows];
                          updated[idx].title = e.target.value;
                          setListRows(updated);
                        }}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        Description (Max 72 chars)
                      </label>
                      <input
                        maxLength={72}
                        value={row.description}
                        onChange={(e) => {
                          const updated = [...listRows];
                          updated[idx].description = e.target.value;
                          setListRows(updated);
                        }}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Auto-Reply Message Payload
                    </label>
                    <textarea
                      rows={2}
                      value={row.actionPayload}
                      onChange={(e) => {
                        const updated = [...listRows];
                        updated[idx].actionPayload = e.target.value;
                        setListRows(updated);
                      }}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TAB 4: BOT KEYWORD RULES ── */}
          {activeTab === "bot_rules" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Automated Bot Keyword Flow Rules
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure instant automated replies whenever a user types specific keywords in chat.
                  </p>
                </div>
                <button
                  onClick={addBotRule}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-600"
                >
                  <Plus className="w-4 h-4" />
                  Add Rule
                </button>
              </div>

              {botRules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-purple-600 dark:text-purple-400">
                      Rule #{idx + 1}: {rule.ruleName}
                    </span>
                    <button
                      onClick={() => setBotRules(botRules.filter((r) => r.id !== rule.id))}
                      className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        Rule Name
                      </label>
                      <input
                        value={rule.ruleName}
                        onChange={(e) => {
                          const updated = [...botRules];
                          updated[idx].ruleName = e.target.value;
                          setBotRules(updated);
                        }}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        Keywords (Comma Separated)
                      </label>
                      <input
                        value={rule.keywords.join(", ")}
                        onChange={(e) => {
                          const updated = [...botRules];
                          updated[idx].keywords = e.target.value.split(",").map((k) => k.trim());
                          setBotRules(updated);
                        }}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Automated Response Text
                    </label>
                    <textarea
                      rows={2}
                      value={rule.responseText}
                      onChange={(e) => {
                        const updated = [...botRules];
                        updated[idx].responseText = e.target.value;
                        setBotRules(updated);
                      }}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Universal Interactive WhatsApp Simulator (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="sticky top-6 rounded-3xl bg-slate-900 p-4 shadow-2xl border border-slate-800 space-y-3">
            {/* Mobile Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
                  {form.botName.charAt(0) || "H"}
                </div>
                <div>
                  <p className="text-xs font-bold text-white flex items-center gap-1">
                    Poornasree Support ({form.botName || "Hari"})
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  </p>
                  <p className="text-[10px] text-emerald-400">WhatsApp Official Business</p>
                </div>
              </div>
              <Smartphone className="w-4 h-4 text-slate-500" />
            </div>

            {/* Chat Simulator Canvas */}
            <div className="bg-[#0b141a] rounded-2xl p-4 min-h-[360px] flex flex-col justify-end space-y-3 relative overflow-hidden border border-slate-800">
              <div className="absolute inset-0 bg-repeat opacity-5 pointer-events-none bg-[radial-gradient(#202c33_1px,transparent_1px)] [background-size:12px_12px]" />

              {/* Customer Incoming Bubble */}
              <div className="self-end bg-[#005c4b] text-white px-3.5 py-2 rounded-2xl rounded-tr-none text-xs max-w-[85%] relative">
                <p>{simulatedCustomerMsg}</p>
                <span className="text-[9px] text-emerald-200 block text-right mt-1 font-mono">
                  14:08 ✓✓
                </span>
              </div>

              {/* Bot Response Bubble */}
              <div className="self-start bg-[#202c33] text-white px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs max-w-[90%] relative space-y-2">
                <p className="whitespace-pre-wrap font-sans leading-relaxed">
                  {activeTab === "greetings" && formatMessage(form.welcomeGreeting)}
                  {activeTab === "buttons" && "Welcome to Poornasree Equipments! Please select an option below:"}
                  {activeTab === "menu" && "Explore our support catalog and machine options:"}
                  {activeTab === "bot_rules" && (simulatedBotResponse || "Try typing 'price', 'service', or 'location' to test bot flow rules!")}
                </p>

                {/* Render Quick Reply Buttons in Preview if tab is 'buttons' or 'greetings' */}
                {(activeTab === "buttons" || activeTab === "greetings") && buttons.length > 0 && (
                  <div className="pt-2 border-t border-slate-700/60 space-y-1.5">
                    {buttons.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => {
                          setSimulatedCustomerMsg(b.title);
                          setSimulatedBotResponse(b.responsePayload);
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-[#2a3942] hover:bg-[#344651] text-emerald-400 font-bold text-xs text-center transition-colors shadow-2xs"
                      >
                        {b.title}
                      </button>
                    ))}
                  </div>
                )}

                {/* Render Interactive List Menu Button in Preview if tab is 'menu' */}
                {activeTab === "menu" && (
                  <div className="pt-2 border-t border-slate-700/60 space-y-2">
                    <div className="w-full py-2 px-3 rounded-xl bg-[#2a3942] text-emerald-400 font-bold text-xs text-center border border-emerald-500/30">
                      {menuHeaderTitle}
                    </div>
                    <div className="space-y-1 bg-[#111b21] p-2 rounded-xl border border-slate-800">
                      {listRows.map((r) => (
                        <div
                          key={r.id}
                          onClick={() => {
                            setSimulatedCustomerMsg(r.title);
                            setSimulatedBotResponse(r.actionPayload);
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                        >
                          <p className="font-bold text-xs text-white">{r.title}</p>
                          <p className="text-[10px] text-slate-400 line-clamp-1">{r.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <span className="text-[9px] text-slate-400 block text-right font-mono mt-1">
                  14:08
                </span>
              </div>
            </div>

            <p className="text-[10px] text-center text-slate-500">
              Interactive WhatsApp Simulator • Click buttons or menu rows to test response flow!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
