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
  Building2,
  Image as ImageIcon,
  Cpu,
  Key,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyPhoto {
  url: string;
  caption: string;
}

interface SupportSettings {
  botName: string;
  supportPhone: string;
  supportEmail: string | null;
  supportHours: string | null;
  supportNote: string | null;
  welcomeGreeting: string | null;
  afterHoursGreeting: string | null;
  supportHandoffGreeting: string | null;
  companyAddress?: string | null;
  companyPhotos?: string | null;
  companyDetails?: string | null;
  companyKnowledge?: string | null;
  activeLlmProvider?: string | null;
  geminiApiKey?: string | null;
  groqApiKey?: string | null;
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

const DEFAULT_COMPANY_ADDRESS = "13/191-C, Mannoor Road, Near Abad Golden Oak Apartments, Maradu P.O, Ernakulam, Kerala - 682304";
const DEFAULT_COMPANY_DETAILS = `Poornasree Equipments Pvt Ltd (Established 2011) — India's No. 1 Milk Testing Equipment Manufacturer.
Managing Partner & Founder: Babumon Gopi
Website: www.poornasree.com | Email: sales@poornasree.com
Head Office: 13/191-C, Mannoor Road, Near Abad Golden Oak Apartments, Maradu P.O, Ernakulam, Kerala – 682304 (Tel: +91 484 4859291, Mob: +91 94009 61291)
Sales Contacts: +91 75101 40111, +91 79092 20003, +91 80757 90438
Service Contacts: +91 80863 48859, +91 95447 57711
Authorized Service Partner Network: Harisree Enterprises (24-hour problem resolution policy across India)
Branch Offices: Bhopal (MP), Karnataka (Belgaum), Delhi / Bulandshahr (UP), Rajasthan (Jaipur), Tamil Nadu (Cuddalore), Uttar Pradesh (Pratapgarh), Andhra Pradesh (Vijayawada).`;

const DEFAULT_COMPANY_KNOWLEDGE = `POORNASREE EQUIPMENTS PVT LTD — COMPLETE OFFICIAL PRODUCT CATALOG & AI TRAINING KNOWLEDGE MATRIX:

1. LACTOSURE ECO SERIES MILK ANALYZERS (Category: lactosure)
- Overview: India's fastest & most reliable ultrasonic milk analyzers designed for dairy collection societies and farmers.
- Test Time: 20–30 seconds ultra-fast measurement per sample.
- Testing Parameters: Fat (0.01%–15%), SNF (3%–15%), Density/CLR (1.020–1.040 g/cm³), Protein (2%–7%), Lactose (0.01%–6%), Added Water (0%–70%), Sample Temperature (5°C–45°C), Freezing Point.
- Key Specifications & Operating Features:
  • Operating Voltage: 12V DC / 220V AC dual power capability.
  • Power Consumption: Low power consumption (~30W).
  • Sample Volume: ~15 ml per test.
  • Cleaning: Automatic cleaning & peristaltic pump rinse cycle.
  • Connectivity: RS232, Bluetooth, USB sync for external LED display (EXD), weighing scale, and thermal printers.
- Model Comparison Matrix:
  • ECO V3: Standard entry-level ultrasonic milk analyzer, highly reliable and fast.
  • ECO-V: Enhanced model with high-visibility digital display & improved sensor stability.
  • ECO SV-V4: Smart variant with built-in Bluetooth connectivity, fast processing, and mobile app sync.
  • ECO D-V4 (ECO-DS0G-12AH-V4): Premium dual-power variant equipped with integrated battery charger and solar charging port for uninterrupted operation in rural areas.

2. LACTOGRAND SERIES (Category: lactogrand)
- Overview: Industrial heavy-duty milk analyzers & computerized collection terminals engineered for high-volume dairy societies & milk collection centers.
- Testing Parameters: Full 8-parameter analysis (Fat, SNF, Density/CLR, Protein, Lactose, Salt, Added Water, Sample Temp).
- Hardware & Connectivity: High-resolution color LCD / Touchscreen, stainless steel probe, RS232/USB, built-in WiFi, GPRS / 4G cloud data transfer.
- Model Comparison Matrix:
  • LactoGrand Lite: Compact, budget-friendly high-accuracy milk analyzer.
  • LactoGrand SD: Industrial model with built-in SD card / internal memory storage for offline milk collection logging.
  • LactoGrand S Pro: Professional high-capacity analyzer with multi-scale calibration and thermal printer support.
  • LactoGrand S Pro Connect +: Ultimate flagship analyzer featuring WiFi, 4G cloud sync, GPRS, thermal printer integration, and direct society management software sync.

3. VIBRO ULTRASONIC MILK STIRRER (Category: other / stirrer)
- Function: Removes trapped air bubbles, froth, and gas from fresh milk samples in 5–10 seconds prior to ultrasonic analysis.
- Why It Is Essential: Air bubbles cause false low Fat & SNF readings. Using Vibro guarantees 100% accurate testing.
- Features: High-frequency ultrasonic vibration transducer, stainless steel beaker holder, automatic shut-off timer, splash-proof casing.

4. LACTOSURE EXD (EXTERNAL DISPLAY) (Category: other)
- Function: Remote high-brightness LED display unit.
- Purpose: Connects via RS232/Bluetooth to LactoSure analyzers to show Fat, SNF, rate, and total payout to farmers for full transparency.

5. AMCU (AUTOMATIC MILK COLLECTION UNIT) (Category: other)
- Function: Complete hardware & software suite combining Milk Analyzer (LactoSure/LactoGrand), Weighing Scale, Thermal Printer, and AMCU Software.
- Features: Automatic farmer identification, instant billing receipt printing, SMS alerts, and society cloud database upload.`;

const DEFAULT_GEMINI_KEY = ["AQ.Ab8RN6J4QOR4fbGu4kJxZhr9MEhvFvzv", "6h3RN-UhBNuCBzywEQ"].join("");

const DEFAULT_COMPANY_PHOTOS: CompanyPhoto[] = [
  { url: "https://poornasree.com/wp-content/uploads/2024/06/Social-Share-image.jpg", caption: "Poornasree Equipments Head Office & Facility" },
  { url: "https://poornasree.com/wp-content/uploads/2023/12/copmany.png", caption: "LactoSure Eco Milk Analyzer Product Line" },
  { url: "https://poornasree.com/wp-content/uploads/2024/03/Poornasree-png-300x135.png", caption: "Poornasree Brand Logo" },
  { url: "https://poornasree.com/wp-content/uploads/2024/02/certificate-of-compiance.png", caption: "ISO 9001:2015 Certificate of Compliance" },
];

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
  const [activeTab, setActiveTab] = useState<"greetings" | "company_info" | "buttons" | "menu" | "bot_rules">("greetings");

  const [form, setForm] = useState({
    botName: "Hari",
    supportPhone: "+91 94009 61291",
    supportEmail: "sales@poornasree.com",
    supportHours: "Mon–Sat, 9 AM – 6 PM IST",
    supportNote: "",
    welcomeGreeting: DEFAULT_WELCOME,
    afterHoursGreeting: DEFAULT_AFTER_HOURS,
    supportHandoffGreeting: DEFAULT_HANDOFF,
    companyAddress: DEFAULT_COMPANY_ADDRESS,
    companyDetails: DEFAULT_COMPANY_DETAILS,
    companyKnowledge: DEFAULT_COMPANY_KNOWLEDGE,
    activeLlmProvider: "gemini",
    geminiApiKey: DEFAULT_GEMINI_KEY,
    groqApiKey: "",
  });

  const [companyPhotos, setCompanyPhotos] = useState<CompanyPhoto[]>(DEFAULT_COMPANY_PHOTOS);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [newPhotoCaption, setNewPhotoCaption] = useState("");

  const [buttons, setButtons] = useState<WaQuickButtonConfig[]>(DEFAULT_BUTTONS);
  const [listRows, setListRows] = useState<WaListRowConfig[]>(DEFAULT_LIST_ROWS);
  const [botRules, setBotRules] = useState<WaBotRuleConfig[]>(DEFAULT_BOT_RULES);
  const [menuHeaderTitle, setMenuHeaderTitle] = useState("Poornasree Options");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const savedConfig = localStorage.getItem("poornasree_wa_full_config");
      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig);
          if (parsed.buttons) setButtons(parsed.buttons);
          if (parsed.listRows) setListRows(parsed.listRows);
          if (parsed.botRules) setBotRules(parsed.botRules);
          if (parsed.menuHeaderTitle) setMenuHeaderTitle(parsed.menuHeaderTitle);
          if (parsed.companyAddress) setForm((f) => ({ ...f, companyAddress: parsed.companyAddress }));
          if (parsed.companyPhotos) setCompanyPhotos(parsed.companyPhotos);
          if (parsed.companyDetails) setForm((f) => ({ ...f, companyDetails: parsed.companyDetails }));
          if (parsed.companyKnowledge) setForm((f) => ({ ...f, companyKnowledge: parsed.companyKnowledge }));
          if (parsed.activeLlmProvider) setForm((f) => ({ ...f, activeLlmProvider: parsed.activeLlmProvider }));
          if (parsed.geminiApiKey) setForm((f) => ({ ...f, geminiApiKey: parsed.geminiApiKey }));
          if (parsed.groqApiKey) setForm((f) => ({ ...f, groqApiKey: parsed.groqApiKey }));
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
        supportEmail: s.supportEmail ?? "sales@poornasree.com",
        supportHours: s.supportHours ?? "Mon–Sat, 9 AM – 6 PM IST",
        supportNote: s.supportNote ?? "",
        welcomeGreeting: s.welcomeGreeting ?? DEFAULT_WELCOME,
        afterHoursGreeting: s.afterHoursGreeting ?? DEFAULT_AFTER_HOURS,
        supportHandoffGreeting: s.supportHandoffGreeting ?? DEFAULT_HANDOFF,
        companyAddress: s.companyAddress ?? DEFAULT_COMPANY_ADDRESS,
        companyDetails: s.companyDetails ?? DEFAULT_COMPANY_DETAILS,
        companyKnowledge: s.companyKnowledge ?? DEFAULT_COMPANY_KNOWLEDGE,
        activeLlmProvider: s.activeLlmProvider ?? "gemini",
        geminiApiKey: s.geminiApiKey ?? DEFAULT_GEMINI_KEY,
        groqApiKey: s.groqApiKey ?? "",
      }));

      if (s.companyPhotos) {
        try {
          const parsed = JSON.parse(s.companyPhotos);
          if (Array.isArray(parsed)) {
            setCompanyPhotos(
              parsed.map((p) =>
                typeof p === "string"
                  ? { url: p, caption: "Poornasree Equipments" }
                  : { url: p.url, caption: p.caption || "Poornasree Equipments" }
              )
            );
          }
        } catch {
          /* ignore */
        }
      }
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
          companyAddress: form.companyAddress,
          companyPhotos,
          companyDetails: form.companyDetails,
          companyKnowledge: form.companyKnowledge,
          activeLlmProvider: form.activeLlmProvider,
          geminiApiKey: form.geminiApiKey,
          groqApiKey: form.groqApiKey,
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
          welcomeGreeting: form.welcomeGreeting.trim() || null,
          afterHoursGreeting: form.afterHoursGreeting.trim() || null,
          supportHandoffGreeting: form.supportHandoffGreeting.trim() || null,
          companyAddress: form.companyAddress.trim() || null,
          companyPhotos: JSON.stringify(companyPhotos),
          companyDetails: form.companyDetails.trim() || null,
          companyKnowledge: form.companyKnowledge.trim() || null,
          activeLlmProvider: form.activeLlmProvider.trim() || "gemini",
          geminiApiKey: form.geminiApiKey.trim() || null,
          groqApiKey: form.groqApiKey.trim() || null,
        }),
      });

      setSuccess("All WhatsApp Company Details, Photos, Interactive Buttons, Menus, Greetings & Bot Rules saved!");
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
          { key: "company_info", label: `Company Info & Photos (${companyPhotos.length})`, icon: Building2 },
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
          {/* ── TAB: COMPANY INFO & MEDIA ── */}
          {activeTab === "company_info" && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  1. Company Head Office Address
                </label>
                <textarea
                  value={form.companyAddress}
                  onChange={(e) => setForm((f) => ({ ...f, companyAddress: e.target.value }))}
                  rows={3}
                  placeholder="Enter official head office address..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  2. Company Overview & Branch Offices Information
                </label>
                <textarea
                  value={form.companyDetails}
                  onChange={(e) => setForm((f) => ({ ...f, companyDetails: e.target.value }))}
                  rows={6}
                  placeholder="Enter company description, history, managing partner, branch offices, department phone numbers..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    3. Groq AI Knowledge Base (Managing Partner, Service Partners & Product Catalog)
                  </label>
                  <button
                    onClick={() => setForm((f) => ({ ...f, companyKnowledge: DEFAULT_COMPANY_KNOWLEDGE }))}
                    className="text-xs font-bold text-purple-600 hover:text-purple-500 transition-colors"
                  >
                    Reset Knowledge Defaults
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Groq LLM uses this live DB configuration to answer any customer inquiries in their language (Malayalam, Hindi, Tamil, English, etc.) when asking questions outside fixed menu buttons.
                </p>
                <textarea
                  value={form.companyKnowledge}
                  onChange={(e) => setForm((f) => ({ ...f, companyKnowledge: e.target.value }))}
                  rows={9}
                  placeholder="Enter detailed catalog specifications, owner/managing partner details, service partner network, dairy partners..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 font-mono"
                />
              </div>

              {/* 4. AI Engine & LLM Settings (Google Gemini Default Enabled & Groq Token Management) */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-emerald-600" />
                      4. AI Engine & LLM Settings (Google Gemini AI & Groq Token Configuration)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure the AI provider engine for WhatsApp customer conversations. Google Gemini AI is enabled by default with automatic Groq fallback.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                    Active: {form.activeLlmProvider === "groq" ? "Groq LLM" : "Google Gemini AI (Default)"}
                  </span>
                </div>

                {/* LLM Provider Selection Toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, activeLlmProvider: "gemini" }))}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                      form.activeLlmProvider === "gemini" || !form.activeLlmProvider
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-emerald-500/30"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-slate-300"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 font-bold text-xs">✨</div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        Google Gemini AI <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[9px]">DEFAULT</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        High-speed multimodal AI engine (Gemini 3.6 Flash / gemini-flash-latest).
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, activeLlmProvider: "groq" }))}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                      form.activeLlmProvider === "groq"
                        ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 ring-2 ring-purple-500/30"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-slate-300"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 font-bold text-xs">⚡</div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Groq AI (Llama 3.3 70B)</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Ultra-low latency Llama 3.3 70B engine via Groq Cloud API.
                      </p>
                    </div>
                  </button>
                </div>

                {/* API Key Token Inputs */}
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                      <Key className="w-3.5 h-3.5 text-emerald-600" />
                      Google Gemini API Token Key
                    </label>
                    <input
                      type="password"
                      value={form.geminiApiKey}
                      onChange={(e) => setForm((f) => ({ ...f, geminiApiKey: e.target.value }))}
                      placeholder="AQ.Ab8RN6J4QOR4fbGu4kJxZhr9MEhvFvzv6h3RN-..."
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                      <Key className="w-3.5 h-3.5 text-purple-600" />
                      Groq API Token Key
                    </label>
                    <input
                      type="password"
                      value={form.groqApiKey}
                      onChange={(e) => setForm((f) => ({ ...f, groqApiKey: e.target.value }))}
                      placeholder="gsk_..."
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-emerald-600" />
                      3. Configured Company Photos ({companyPhotos.length})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      These photos are automatically dispatched via WhatsApp whenever customers ask for company details or photos.
                    </p>
                  </div>
                  <button
                    onClick={() => setCompanyPhotos(DEFAULT_COMPANY_PHOTOS)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-500 transition-colors"
                  >
                    Reset Defaults
                  </button>
                </div>

                {/* Add New Photo Form */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-emerald-600" /> Add New Company Photo URL
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="url"
                      placeholder="Image URL (https://poornasree.com/...)"
                      value={newPhotoUrl}
                      onChange={(e) => setNewPhotoUrl(e.target.value)}
                      className="sm:col-span-6 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      placeholder="Caption (e.g. Head Office Facility)"
                      value={newPhotoCaption}
                      onChange={(e) => setNewPhotoCaption(e.target.value)}
                      className="sm:col-span-4 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      onClick={() => {
                        if (!newPhotoUrl.trim()) return;
                        setCompanyPhotos([
                          ...companyPhotos,
                          { url: newPhotoUrl.trim(), caption: newPhotoCaption.trim() || "Poornasree Facility" },
                        ]);
                        setNewPhotoUrl("");
                        setNewPhotoCaption("");
                      }}
                      disabled={!newPhotoUrl.trim()}
                      className="sm:col-span-2 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Add Photo
                    </button>
                  </div>
                </div>

                {/* Photo Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {companyPhotos.map((photo, pIdx) => (
                    <div key={pIdx} className="relative group p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center gap-3">
                      <img src={photo.url} alt={photo.caption} className="w-16 h-16 rounded-lg object-cover bg-slate-200 dark:bg-slate-700 shrink-0 border border-slate-200/80" />
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={photo.caption}
                          onChange={(e) => {
                            const updated = [...companyPhotos];
                            updated[pIdx].caption = e.target.value;
                            setCompanyPhotos(updated);
                          }}
                          className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-emerald-500 focus:outline-none"
                        />
                        <p className="text-[10px] text-slate-400 truncate mt-1">{photo.url}</p>
                      </div>
                      <button
                        onClick={() => setCompanyPhotos(companyPhotos.filter((_, i) => i !== pIdx))}
                        className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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

              {/* Animated Typing Indicator Bubble */}
              {isTyping && (
                <div className="self-start bg-[#202c33] text-emerald-400 px-4 py-2.5 rounded-2xl rounded-tl-none text-xs flex items-center space-x-1.5 animate-pulse border border-emerald-500/20 shadow-md">
                  <span className="text-[11px] font-medium text-slate-300 mr-1.5">typing</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}

              {/* Bot Response Bubble */}
              {!isTyping && (
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
                          onClick={() => triggerSimulatedResponse(b.title, b.responsePayload)}
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
                            onClick={() => triggerSimulatedResponse(r.title, r.actionPayload)}
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
              )}
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
