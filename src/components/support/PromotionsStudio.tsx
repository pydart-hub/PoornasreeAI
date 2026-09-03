"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  Megaphone,
  Sparkles,
  Image as ImageIcon,
  Users,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Send,
  RefreshCw,
  Upload,
  Eye,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Clock,
  Smartphone,
  Layers,
  Tag,
  Trash2,
  Check,
  ArrowRight,
  ExternalLink,
  Info,
  ShieldCheck,
  History,
  CheckCheck,
  PhoneCall,
  Plus,
  X
} from "lucide-react";

export interface ManualContact {
  phone: string;
  name: string;
}

export interface TemplateVariableDef {
  index: number;
  label: string;
  placeholder: string;
  defaultValue: string;
  autoFill?: "recipient_name" | "custom";
}

export interface PromotionTemplateItem {
  id: string;
  name: string;
  title: string;
  category: "MARKETING";
  badge: string;
  description: string;
  headerType: "IMAGE";
  bodyText: string;
  footerText: string;
  variables: TemplateVariableDef[];
  sampleValues: string[];
  metaStatus?: "APPROVED" | "PENDING" | "REJECTED" | "NOT_SUBMITTED";
  metaId?: string | null;
}

export interface AudienceContact {
  phone: string;
  name: string;
  category: "engineer" | "customer" | "dealer" | "lead" | "manual";
  email?: string | null;
  location?: string | null;
}

export interface CampaignRecord {
  id: string;
  title: string;
  templateName: string;
  templateParams: any;
  imageUrl: string | null;
  targetAudience: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
  results?: Array<{ phone: string; name: string; status: string; error?: string }>;
  createdAt: string;
}

interface PromotionsStudioProps {
  onShowToast: (message: string, type?: "success" | "info" | "warning") => void;
}

export default function PromotionsStudio({ onShowToast }: PromotionsStudioProps) {
  // Navigation / Step state
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [viewHistory, setViewHistory] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<PromotionTemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<PromotionTemplateItem | null>(null);
  const [customParams, setCustomParams] = useState<Record<string, string>>({});
  const [syncingMeta, setSyncingMeta] = useState(false);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Audience & Lead selection state
  const [audienceCategory, setAudienceCategory] = useState<"all" | "engineer" | "customer" | "dealer" | "lead" | "manual">("all");
  const [audienceSearch, setAudienceSearch] = useState("");
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  const [audienceCounts, setAudienceCounts] = useState({ all: 0, engineers: 0, customers: 0, dealers: 0, leads: 0, manual: 0 });
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());

  // Manual custom numbers state
  const [manualContacts, setManualContacts] = useState<ManualContact[]>([]);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualPhoneInput, setManualPhoneInput] = useState("");
  const [manualNameInput, setManualNameInput] = useState("");

  // Campaign execution state
  const [campaignTitle, setCampaignTitle] = useState("");
  const [isTitleUserEdited, setIsTitleUserEdited] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState<{ sent: number; total: number } | null>(null);

  // History state
  const [campaignHistory, setCampaignHistory] = useState<CampaignRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 1. Fetch Templates & Meta Statuses
  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/support-chat/promotions/templates", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        if (data.templates?.length > 0 && !selectedTemplate) {
          selectTemplate(data.templates[0]);
        }
      }
    } catch {
      onShowToast("Failed to load promotion templates", "warning");
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Sync Meta status on-demand
  const handleSyncMetaStatus = async () => {
    setSyncingMeta(true);
    try {
      const res = await fetch("/api/support-chat/promotions/meta-status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const metaStatuses = data.metaStatuses || {};
        setTemplates((prev) =>
          prev.map((t) => ({
            ...t,
            metaStatus: metaStatuses[t.name]?.status || "NOT_SUBMITTED",
            metaId: metaStatuses[t.name]?.id || null,
          }))
        );
        onShowToast("Meta template statuses refreshed successfully", "success");
      }
    } catch {
      onShowToast("Failed to sync Meta statuses", "warning");
    } finally {
      setSyncingMeta(false);
    }
  };

  // 2. Fetch Contacts / Audiences
  const fetchAudiences = async (category = audienceCategory, search = audienceSearch) => {
    setLoadingAudience(true);
    try {
      const q = new URLSearchParams({ category, search }).toString();
      const res = await fetch(`/api/support-chat/promotions/audiences?${q}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
        if (data.counts) {
          setAudienceCounts(data.counts);
        }
        if (Array.isArray(data.manualContacts)) {
          setManualContacts(data.manualContacts.map((m: any) => ({ phone: m.phone, name: m.name })));
        }
      }
    } catch {
      onShowToast("Failed to fetch audience contacts", "warning");
    } finally {
      setLoadingAudience(false);
    }
  };

  // 3. Fetch Campaign History
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/support-chat/promotions/history", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaignHistory(data.campaigns || []);
      }
    } catch {
      onShowToast("Failed to fetch campaign history", "warning");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchAudiences("all", "");
    fetchHistory();
  }, []);

  useEffect(() => {
    fetchAudiences(audienceCategory, audienceSearch);
  }, [audienceCategory, audienceSearch]);

  // Select a template
  const selectTemplate = (tpl: PromotionTemplateItem) => {
    setSelectedTemplate(tpl);
    const initialParams: Record<string, string> = {};
    tpl.variables.forEach((v) => {
      initialParams[String(v.index)] = v.defaultValue;
    });
    setCustomParams(initialParams);
    // Always sync campaign title with chosen template unless user specifically typed a custom non-default title
    if (!isTitleUserEdited || campaignTitle.startsWith("Promotion -")) {
      setCampaignTitle(`Promotion - ${tpl.title}`);
    }
  };

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict Meta WhatsApp file format enforcement: JPG and PNG only
    const allowedTypes = ["image/jpeg", "image/png"];
    const isJpgOrPng = allowedTypes.includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
    if (!isJpgOrPng) {
      onShowToast("Strict Meta WhatsApp Rule: Only JPG (.jpg, .jpeg) and PNG (.png) files are permitted. WebP and other formats are rejected by Meta.", "warning");
      if (e.target) e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      onShowToast("Strict Meta WhatsApp Rule: Image size cannot exceed 5MB.", "warning");
      if (e.target) e.target.value = "";
      return;
    }

    setImageFile(file);
    setUploadingImage(true);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/support-chat/promotions/upload-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.imageUrl);
        if (data.mediaId) {
          setMediaId(data.mediaId);
        }
        onShowToast("Promotion image uploaded & verified with Meta WhatsApp CDN", "success");
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Image upload failed");
      }
    } catch (err: any) {
      onShowToast(err.message || "Image upload failed. Please try again.", "warning");
      setImageFile(null);
    } finally {
      setUploadingImage(false);
    }
  };

  // Contacts list directly from database query (including category and search filters)
  const displayedContacts = contacts;

  // Add manual numbers and save permanently into database
  const handleAddManualContact = async () => {
    if (!manualPhoneInput.trim()) {
      onShowToast("Please enter at least one phone number", "warning");
      return;
    }

    const rawNumbers = manualPhoneInput.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean);
    if (rawNumbers.length === 0) return;

    const leadsToSave: Array<{ name: string; phone: string }> = [];

    for (const raw of rawNumbers) {
      const digits = raw.replace(/\D/g, "");
      if (digits.length < 10) {
        onShowToast(`Invalid number: ${raw}. Must be at least 10 digits.`, "warning");
        continue;
      }
      const normalized = digits.length === 10 ? `91${digits}` : digits;
      const contactName = manualNameInput.trim() || "Valued Customer";
      leadsToSave.push({ phone: normalized, name: contactName });
    }

    if (leadsToSave.length === 0) return;

    try {
      const res = await fetch("/api/support-chat/promotions/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: leadsToSave }),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to save custom numbers to database");
      }

      // Automatically select the newly added numbers
      setSelectedPhones((prev) => {
        const next = new Set(prev);
        leadsToSave.forEach((l) => next.add(l.phone));
        return next;
      });

      setManualPhoneInput("");
      setManualNameInput("");
      setShowManualAdd(false);

      // Refresh audience contacts from database
      await fetchAudiences(audienceCategory, audienceSearch);

      onShowToast(
        `Saved ${leadsToSave.length} custom recipient${leadsToSave.length > 1 ? "s" : ""} to database!`,
        "success"
      );
    } catch (err: any) {
      onShowToast(err.message || "Failed to save custom numbers", "warning");
    }
  };

  // Delete manual custom contact from database
  const handleRemoveManualContact = async (phoneToRemove: string) => {
    try {
      setSelectedPhones((prev) => {
        const next = new Set(prev);
        next.delete(phoneToRemove);
        return next;
      });

      await fetch(`/api/support-chat/promotions/leads/${encodeURIComponent(phoneToRemove)}`, {
        method: "DELETE",
        credentials: "include",
      });

      await fetchAudiences(audienceCategory, audienceSearch);
      onShowToast("Custom number removed from database", "info");
    } catch {
      onShowToast("Failed to remove custom number", "warning");
    }
  };

  // Select all visible contacts
  const handleSelectAllFiltered = () => {
    const next = new Set(selectedPhones);
    displayedContacts.forEach((c) => next.add(c.phone));
    setSelectedPhones(next);
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedPhones(new Set());
  };

  // Toggle single contact
  const toggleContact = (phone: string) => {
    const next = new Set(selectedPhones);
    if (next.has(phone)) next.delete(phone);
    else next.add(phone);
    setSelectedPhones(next);
  };

  // Generate live preview text with interpolated values
  const previewBodyText = useMemo(() => {
    if (!selectedTemplate) return "";
    let text = selectedTemplate.bodyText;
    selectedTemplate.variables.forEach((v) => {
      const val = v.autoFill === "recipient_name"
        ? (selectedPhones.size > 0 ? Array.from(selectedPhones)[0] : "Customer Name")
        : customParams[String(v.index)] || v.defaultValue;
      
      // If auto-fill recipient name, show sample contact name in preview
      const displayVal = v.autoFill === "recipient_name"
        ? (contacts.find((c) => selectedPhones.has(c.phone))?.name || manualContacts.find((m) => selectedPhones.has(m.phone))?.name || "Ramesh (Recipient Name)")
        : val;

      text = text.replace(new RegExp(`\\{\\{${v.index}\\}\\}`, "g"), displayVal);
    });
    return text;
  }, [selectedTemplate, customParams, selectedPhones, contacts, manualContacts]);

  // Handle Broadcast Submission
  const handleSendBroadcast = async () => {
    if (!selectedTemplate) {
      onShowToast("Please select a template", "warning");
      return;
    }
    if (selectedPhones.size === 0) {
      onShowToast("Please select at least one recipient", "warning");
      return;
    }

    setSendingBroadcast(true);
    setBroadcastProgress({ sent: 0, total: selectedPhones.size });

    try {
      const payload = {
        title: campaignTitle.trim() || `Promotion - ${selectedTemplate.title}`,
        templateName: selectedTemplate.name,
        templateParams: customParams,
        imageUrl: imageUrl || undefined,
        mediaId: mediaId || undefined,
        targetAudience: audienceCategory,
        recipientPhones: Array.from(selectedPhones),
        customRecipients: manualContacts,
      };

      const res = await fetch("/api/support-chat/promotions/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const data = await res.json();

      if (res.ok && data.campaign) {
        onShowToast(
          `Campaign sent! ${data.campaign.sentCount} delivered, ${data.campaign.failedCount} failed`,
          data.campaign.sentCount > 0 ? "success" : "warning"
        );
        fetchHistory();
        setViewHistory(true);
      } else {
        throw new Error(data.error || "Failed to send promotion");
      }
    } catch (err: any) {
      onShowToast(err.message || "Failed to send broadcast", "warning");
    } finally {
      setSendingBroadcast(false);
      setBroadcastProgress(null);
    }
  };

  const templateTitleMap = useMemo(() => {
    const map: Record<string, string> = {
      promo_product_launch_v1: "New Product Launch",
      promo_special_offer_v1: "Special Discount & Offer",
      promo_annual_service_v1: "Annual Maintenance & Service",
      promo_warranty_protection_v1: "Warranty Protection & AMC",
      promo_festive_celebration_v1: "Festive Season Celebration",
      promo_software_update_v1: "Software & Cloud Updates",
      promo_customer_feedback_v1: "Post-Service Feedback Survey",
      promo_dealer_referral_v1: "Dealer & Society Referral Program",
      promo_consumables_reorder_v1: "Spares & Consumables Reorder",
      promo_equipment_demo_v1: "Live Product Demonstration Invite",
    };
    templates.forEach((t) => {
      map[t.name] = t.title;
    });
    return map;
  }, [templates]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f0f2f5] dark:bg-[#0c1317]">
      {/* ── Top Header Strip ────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-3.5 bg-white dark:bg-[#111b21] border-b border-[#e9edef] dark:border-[#222d34] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#008069] to-[#00a884] flex items-center justify-center text-white shadow-sm">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[#111b21] dark:text-[#e9edef] tracking-tight">
                Promotions & Meta Templates Studio
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e7f7ef] text-[#008069] dark:bg-[#0a332c] dark:text-[#00a884]">
                Meta Approved
              </span>
            </div>
            <p className="text-xs text-[#667781] dark:text-[#8696a0]">
              Broadcast customizable marketing updates, product announcements, and service reminders with personalized names.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSyncMetaStatus}
            disabled={syncingMeta}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-white transition-all"
            title="Refresh template statuses from Meta Graph API"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", syncingMeta && "animate-spin text-[#008069]")} />
            <span>Sync Meta Status</span>
          </button>

          <button
            onClick={() => setViewHistory(!viewHistory)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm",
              viewHistory
                ? "bg-[#008069] text-white"
                : "bg-white dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43] text-[#111b21] dark:text-[#e9edef] hover:bg-[#f5f6f6]"
            )}
          >
            <History className="w-3.5 h-3.5" />
            <span>{viewHistory ? "Back to Studio" : "Campaign History"}</span>
          </button>
        </div>
      </div>

      {/* ── Main Studio Body ────────────────────────────────────────────────── */}
      {viewHistory ? (
        // ── Campaign History Table View ──
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#111b21] dark:text-[#e9edef]">Campaign Delivery History</h2>
                <p className="text-xs text-[#667781] dark:text-[#8696a0]">Past broadcasts sent to engineers, customers, and leads</p>
              </div>
              <Button size="sm" variant="outline" onClick={fetchHistory} disabled={loadingHistory}>
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loadingHistory && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {loadingHistory ? (
              <div className="p-12 text-center text-sm text-[#667781] dark:text-[#8696a0]">Loading history...</div>
            ) : campaignHistory.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#222d34]">
                <Megaphone className="w-10 h-10 mx-auto text-[#667781] dark:text-[#8696a0] opacity-40 mb-3" />
                <p className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">No promotion campaigns sent yet</p>
                <p className="text-xs text-[#667781] dark:text-[#8696a0] mt-1">Switch back to Studio to craft and launch your first broadcast.</p>
                <Button size="sm" className="mt-4 bg-[#008069] text-white" onClick={() => setViewHistory(false)}>
                  Create Campaign
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#222d34] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#e9edef] dark:border-[#222d34] text-[#54656f] dark:text-[#8696a0] font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Campaign / Title</th>
                        <th className="px-4 py-3">Template</th>
                        <th className="px-4 py-3">Audience</th>
                        <th className="px-4 py-3">Delivery Stats</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e9edef] dark:divide-[#222d34] text-[#111b21] dark:text-[#e9edef]">
                      {campaignHistory.map((c) => (
                        <tr key={c.id} className="hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-sm">{c.title}</div>
                            {c.imageUrl && (
                              <div className="flex items-center gap-1 text-[11px] text-[#008069] dark:text-[#00a884] mt-0.5">
                                <ImageIcon className="w-3 h-3" /> Header image attached
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-xs text-[#111b21] dark:text-[#e9edef]">
                              {templateTitleMap[c.templateName] || c.templateName}
                            </div>
                            <code className="text-[10px] text-[#667781] dark:text-[#8696a0] font-mono">
                              {c.templateName}
                            </code>
                          </td>
                          <td className="px-4 py-3.5 capitalize font-medium">
                            {c.targetAudience} ({c.recipientCount})
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                                ✓ {c.sentCount} Sent
                              </span>
                              {c.failedCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                                  ✕ {c.failedCount} Failed
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={cn(
                                "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                c.status === "completed"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                                  : c.status === "partial"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                              )}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-[#667781] dark:text-[#8696a0]">
                            {new Date(c.createdAt).toLocaleDateString()} {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // ── Step-by-Step Campaign Studio ──
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Wizard Steps Stepper Bar */}
          <div className="shrink-0 px-6 py-2.5 bg-white dark:bg-[#111b21] border-b border-[#e9edef] dark:border-[#222d34] flex items-center justify-between">
            <div className="flex items-center gap-6">
              {[
                { step: 1, label: "1. Choose & Customise Template", icon: Layers },
                { step: 2, label: "2. Image & Audience Selection", icon: Users },
                { step: 3, label: "3. Live Preview & Launch", icon: Send },
              ].map(({ step, label, icon: Icon }) => (
                <button
                  key={step}
                  onClick={() => setActiveStep(step as any)}
                  className={cn(
                    "flex items-center gap-2 text-xs font-semibold py-1.5 transition-all border-b-2",
                    activeStep === step
                      ? "border-[#008069] text-[#008069] dark:border-[#00a884] dark:text-[#00a884]"
                      : "border-transparent text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-white"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {activeStep > 1 && (
                <Button size="sm" variant="ghost" onClick={() => setActiveStep((p) => (p - 1) as any)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
              )}
              {activeStep < 3 && (
                <Button size="sm" className="bg-[#008069] hover:bg-[#008069]/90 text-white" onClick={() => setActiveStep((p) => (p + 1) as any)}>
                  Next Step <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>

          {/* Stepper Content Panels */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto h-full">
              {/* ══════════════════════════════════════════════════════════════════
                  STEP 1: CHOOSE & CUSTOMIZE TEMPLATE
                 ══════════════════════════════════════════════════════════════════ */}
              {activeStep === 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: 10 Meta Templates Cards */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] uppercase tracking-wider">
                        Select Meta WhatsApp Template (10 Available)
                      </h2>
                      <span className="text-xs text-[#667781] dark:text-[#8696a0]">
                        All templates include Image Header & Dynamic Variables
                      </span>
                    </div>

                    {loadingTemplates ? (
                      <div className="p-8 text-center text-sm text-[#667781]">Loading templates...</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {templates.map((tpl) => {
                          const isSelected = selectedTemplate?.id === tpl.id;
                          return (
                            <div
                              key={tpl.id}
                              onClick={() => selectTemplate(tpl)}
                              className={cn(
                                "p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5",
                                isSelected
                                  ? "bg-white dark:bg-[#1f2c34] border-[#008069] dark:border-[#00a884] shadow-md ring-1 ring-[#008069]"
                                  : "bg-white dark:bg-[#111b21] border-[#e9edef] dark:border-[#222d34] hover:border-gray-300 dark:hover:border-gray-700"
                              )}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#f0f2f5] dark:bg-[#202c33] text-[#008069] dark:text-[#00a884]">
                                    {tpl.badge}
                                  </span>

                                  {/* Meta Approval Status Pill */}
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                                      tpl.metaStatus === "APPROVED"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                        : tpl.metaStatus === "PENDING"
                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 animate-pulse"
                                        : tpl.metaStatus === "REJECTED"
                                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                    )}
                                  >
                                    {tpl.metaStatus || "PENDING"}
                                  </span>
                                </div>
                                <h3 className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] leading-snug">
                                  {tpl.title}
                                </h3>
                                <p className="text-[11px] text-[#667781] dark:text-[#8696a0] line-clamp-2 mt-1">
                                  {tpl.description}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-[#f0f2f5] dark:border-[#222d34] text-[10px] text-[#667781] dark:text-[#8696a0]">
                                <span>{tpl.variables.length} Dynamic Variables</span>
                                <span className="font-mono">{tpl.name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Template Customizer & Live Editor */}
                  <div className="lg:col-span-5 space-y-4">
                    {selectedTemplate ? (
                      <div className="bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#222d34] rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-[#e9edef] dark:border-[#222d34]">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#008069] dark:text-[#00a884]">
                              Customizing Template
                            </span>
                            <h3 className="text-sm font-bold text-[#111b21] dark:text-[#e9edef]">
                              {selectedTemplate.title}
                            </h3>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-300">
                            {selectedTemplate.name}
                          </span>
                        </div>

                        {/* Campaign Name Field */}
                        <div>
                          <label className="block text-xs font-semibold text-[#111b21] dark:text-[#e9edef] mb-1">
                            Campaign Title (Internal Reference)
                          </label>
                          <input
                            type="text"
                            value={campaignTitle}
                            onChange={(e) => {
                              setCampaignTitle(e.target.value);
                              setIsTitleUserEdited(true);
                            }}
                            placeholder="e.g. Diwali Dairy Special Offer 2026"
                            className="w-full px-3 py-2 text-xs rounded-xl bg-[#f0f2f5] dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43] text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:ring-1 focus:ring-[#008069]"
                          />
                        </div>

                        {/* Variable Inputs */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold text-[#111b21] dark:text-[#e9edef] uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-[#008069]" />
                            <span>Customize Template Variables</span>
                          </h4>

                          {selectedTemplate.variables.map((v) => {
                            const isAutoName = v.autoFill === "recipient_name";
                            return (
                              <div key={v.index} className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-medium text-[#111b21] dark:text-[#e9edef] flex items-center gap-1.5">
                                    <span className="w-4 h-4 rounded-full bg-[#008069]/10 text-[#008069] flex items-center justify-center text-[10px] font-bold">
                                      {v.index}
                                    </span>
                                    <span>{v.label}</span>
                                  </label>

                                  {isAutoName && (
                                    <span className="text-[10px] font-bold text-[#008069] dark:text-[#00a884] flex items-center gap-1 bg-[#e7f7ef] dark:bg-[#0a332c] px-2 py-0.5 rounded-full">
                                      <Sparkles className="w-2.5 h-2.5" /> Auto-populated per contact
                                    </span>
                                  )}
                                </div>

                                {isAutoName ? (
                                  <div className="px-3 py-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                                    <span>Recipient&apos;s Name will be automatically inserted for each contact</span>
                                    <Check className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={customParams[String(v.index)] ?? v.defaultValue}
                                    onChange={(e) =>
                                      setCustomParams({ ...customParams, [String(v.index)]: e.target.value })
                                    }
                                    placeholder={v.placeholder}
                                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#f0f2f5] dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43] text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:ring-1 focus:ring-[#008069]"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* WhatsApp Message Preview Bubble */}
                        <div className="pt-3 border-t border-[#e9edef] dark:border-[#222d34]">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667781] dark:text-[#8696a0] block mb-2">
                            Live WhatsApp Message Preview
                          </span>
                          <div className="p-3.5 rounded-2xl bg-[#efeae2] dark:bg-[#0b141a] border border-[#e9edef] dark:border-[#222d34]">
                            <div className="max-w-sm rounded-xl p-3.5 bg-white dark:bg-[#202c33] shadow-sm text-xs space-y-2 border-l-4 border-l-[#008069]">
                              <div className="whitespace-pre-line text-[#111b21] dark:text-[#e9edef] leading-relaxed">
                                {previewBodyText}
                              </div>
                              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-[#667781] dark:text-[#8696a0] flex justify-between items-center">
                                <span>{selectedTemplate.footerText}</span>
                                <span>11:30 AM ✓✓</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <Button
                          className="w-full bg-[#008069] hover:bg-[#008069]/90 text-white font-bold"
                          onClick={() => setActiveStep(2)}
                        >
                          Continue to Image & Audience <ArrowRight className="w-4 h-4 ml-1.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#222d34]">
                        <p className="text-sm text-[#667781]">Select a template on the left to customize variables.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════════
                  STEP 2: IMAGE UPLOAD & AUDIENCE SELECTION
                 ══════════════════════════════════════════════════════════════════ */}
              {activeStep === 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Image Upload */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#222d34] rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4 text-[#008069]" />
                            <span>Attach Promotion Header Image</span>
                          </h3>
                          <p className="text-xs text-[#667781] dark:text-[#8696a0] mt-0.5">
                            All 10 Meta templates support an image header (analyzer photo, discount banner, or certificate).
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">
                          JPG / PNG only
                        </span>
                      </div>

                      {imageUrl ? (
                        <div className="relative rounded-xl overflow-hidden border border-[#e9edef] dark:border-[#222d34] group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageUrl}
                            alt="Uploaded Promotion Banner"
                            className="w-full h-56 object-cover bg-black/5"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setImageUrl(null);
                                setImageFile(null);
                              }}
                              className="p-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                              title="Remove image"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className={cn(
                            "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5",
                            uploadingImage
                              ? "bg-[#f0f2f5] border-[#008069]"
                              : "border-[#e9edef] dark:border-[#2f3b43] hover:border-[#008069] bg-[#f9fafb] dark:bg-[#182229]"
                          )}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={handleImageUpload}
                          />
                          <div className="w-12 h-12 rounded-full bg-[#008069]/10 text-[#008069] flex items-center justify-center">
                            {uploadingImage ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#111b21] dark:text-[#e9edef]">
                              {uploadingImage ? "Uploading to Meta WhatsApp CDN..." : "Click or Drag & Drop Image Banner"}
                            </p>
                            <p className="text-[11px] font-semibold text-[#008069] dark:text-[#00a884] mt-0.5">
                              Strict Meta Requirement: JPG (.jpg, .jpeg) or PNG (.png) only
                            </p>
                            <p className="text-[10px] text-[#667781] dark:text-[#8696a0] mt-0.5">
                              Max size: 5MB • WebP, GIF & other formats are strictly blocked
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <div>
                          <p className="font-bold">Strict Meta WhatsApp Image Rule</p>
                          <p className="text-[11px] opacity-90 mt-0.5">
                            Meta WhatsApp Cloud API strictly rejects WebP, PDF, or SVG files. Only standard JPG and PNG formats (up to 5MB) are accepted for guaranteed delivery.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Audience Target Selector */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#222d34] rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-[#008069]" />
                            <span>Select Target Audience & Leads</span>
                          </h3>
                          <p className="text-xs text-[#667781] dark:text-[#8696a0] mt-0.5">
                            Target engineers, customers, dealers, or manually entered numbers.
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-[#008069] dark:text-[#00a884]">
                            {selectedPhones.size} selected
                          </span>
                        </div>
                      </div>

                      {/* Category Filter Pills & Add Custom Numbers */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { id: "all", label: `All (${audienceCounts.all})` },
                            { id: "engineer", label: `Engineers (${audienceCounts.engineers})` },
                            { id: "customer", label: `Customers (${audienceCounts.customers})` },
                            { id: "dealer", label: `Dealers (${audienceCounts.dealers})` },
                            { id: "lead", label: `Leads (${audienceCounts.leads})` },
                            { id: "manual", label: `Manual (${manualContacts.length})` },
                          ].map(({ id, label }) => (
                            <button
                              key={id}
                              onClick={() => setAudienceCategory(id as any)}
                              className={cn(
                                "px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                                audienceCategory === id
                                  ? "bg-[#008069] text-white shadow-sm"
                                  : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-[#2a3942]"
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowManualAdd(!showManualAdd)}
                          className={cn(
                            "flex items-center gap-1.5 text-xs font-bold transition-all",
                            showManualAdd
                              ? "bg-[#008069] text-white hover:bg-[#008069]/90 border-[#008069]"
                              : "border-[#008069] text-[#008069] hover:bg-[#008069]/10"
                          )}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Custom Number</span>
                        </Button>
                      </div>

                      {/* Manual Number Entry Box */}
                      {showManualAdd && (
                        <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-[#182229] border border-emerald-200 dark:border-emerald-800/50 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <PhoneCall className="w-4 h-4 text-[#008069]" />
                              <h4 className="text-xs font-bold text-[#111b21] dark:text-[#e9edef]">
                                Add Custom Mobile Number(s)
                              </h4>
                            </div>
                            <button onClick={() => setShowManualAdd(false)} className="text-[#667781] hover:text-rose-500">
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-[#54656f] dark:text-[#8696a0] mb-1">
                                Mobile Number(s) <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={manualPhoneInput}
                                onChange={(e) => setManualPhoneInput(e.target.value)}
                                placeholder="e.g. 9876543210, 9123456780"
                                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43] text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:ring-1 focus:ring-[#008069]"
                              />
                              <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">
                                Single number or comma-separated list
                              </span>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-[#54656f] dark:text-[#8696a0] mb-1">
                                Contact Name (Optional)
                              </label>
                              <input
                                type="text"
                                value={manualNameInput}
                                onChange={(e) => setManualNameInput(e.target.value)}
                                placeholder="e.g. Rajesh Kumar"
                                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43] text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:ring-1 focus:ring-[#008069]"
                              />
                              <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">
                                Dynamic greeting name &#123;&#123;1&#125;&#125;
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <Button size="sm" variant="ghost" onClick={() => setShowManualAdd(false)}>
                              Cancel
                            </Button>
                            <Button size="sm" className="bg-[#008069] text-white hover:bg-[#008069]/90" onClick={handleAddManualContact}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Add Recipient
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Active Manual Contacts Chips */}
                      {manualContacts.length > 0 && (
                        <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                              <PhoneCall className="w-3.5 h-3.5" />
                              Manually Added Numbers ({manualContacts.length}):
                            </span>
                            <button
                              onClick={() => {
                                manualContacts.forEach((m) => handleRemoveManualContact(m.phone));
                              }}
                              className="text-[10px] text-rose-600 hover:underline font-medium"
                            >
                              Clear all manual
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {manualContacts.map((m) => (
                              <span
                                key={m.phone}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white dark:bg-[#202c33] border border-emerald-300 dark:border-emerald-700/60 text-[#111b21] dark:text-[#e9edef] shadow-sm"
                              >
                                <span className="font-bold">{m.name}:</span>
                                <span>{m.phone}</span>
                                <button
                                  onClick={() => handleRemoveManualContact(m.phone)}
                                  className="text-gray-400 hover:text-rose-500 ml-0.5"
                                  title="Remove number"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Search Bar & Batch Selection Toggles */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#667781]" />
                          <input
                            type="text"
                            value={audienceSearch}
                            onChange={(e) => setAudienceSearch(e.target.value)}
                            placeholder="Search contacts by name, phone, or location..."
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#f0f2f5] dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43] text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:ring-1 focus:ring-[#008069]"
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={handleSelectAllFiltered}>
                            Select All ({displayedContacts.length})
                          </Button>
                          {selectedPhones.size > 0 && (
                            <Button size="sm" variant="ghost" onClick={handleClearSelection}>
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Contacts Checkbox List */}
                      <div className="max-h-72 overflow-y-auto border border-[#e9edef] dark:border-[#222d34] rounded-xl divide-y divide-[#e9edef] dark:divide-[#222d34]">
                        {loadingAudience ? (
                          <div className="p-8 text-center text-xs text-[#667781]">Loading audience contacts...</div>
                        ) : displayedContacts.length === 0 ? (
                          <div className="p-8 text-center text-xs text-[#667781]">
                            {audienceCategory === "manual"
                              ? "No manual numbers added yet. Click 'Add Custom Number' above to enter numbers."
                              : "No contacts found matching criteria."}
                          </div>
                        ) : (
                          displayedContacts.map((c) => {
                            const isChecked = selectedPhones.has(c.phone);
                            return (
                              <div
                                key={c.phone}
                                onClick={() => toggleContact(c.phone)}
                                className={cn(
                                  "px-4 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors",
                                  isChecked
                                    ? "bg-[#e7f7ef] dark:bg-[#0a332c]/50"
                                    : "hover:bg-[#f5f6f6] dark:hover:bg-[#182229]"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                      isChecked
                                        ? "bg-[#008069] border-[#008069] text-white"
                                        : "border-[#8696a0] dark:border-gray-600"
                                    )}
                                  >
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <div>
                                    <div className="font-bold text-[#111b21] dark:text-[#e9edef] flex items-center gap-1.5">
                                      <span>{c.name}</span>
                                      <span
                                        className={cn(
                                          "px-1.5 py-0.2 rounded text-[9px] font-bold uppercase",
                                          c.category === "engineer"
                                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                                            : c.category === "customer"
                                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                            : c.category === "dealer"
                                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                            : c.category === "manual"
                                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                                        )}
                                      >
                                        {c.category}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-[#667781] dark:text-[#8696a0] font-mono">
                                      {c.phone} {(c as any).location && `• ${(c as any).location}`}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {c.category === "manual" && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveManualContact(c.phone);
                                      }}
                                      className="p-1 text-gray-400 hover:text-rose-500 rounded"
                                      title="Delete manual contact"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <Button variant="ghost" size="sm" onClick={() => setActiveStep(1)}>
                          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Template
                        </Button>
                        <Button
                          className="bg-[#008069] hover:bg-[#008069]/90 text-white font-bold"
                          disabled={selectedPhones.size === 0}
                          onClick={() => setActiveStep(3)}
                        >
                          Review & Preview ({selectedPhones.size} Leads) <ArrowRight className="w-4 h-4 ml-1.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════════
                  STEP 3: LIVE WHATSAPP PREVIEW & LAUNCH BROADCAST
                 ══════════════════════════════════════════════════════════════════ */}
              {activeStep === 3 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left Column: WhatsApp Mobile Preview Frame */}
                  <div className="lg:col-span-6 flex justify-center">
                    <div className="w-full max-w-sm rounded-3xl border-4 border-gray-800 dark:border-gray-700 bg-[#efeae2] dark:bg-[#0b141a] shadow-2xl overflow-hidden flex flex-col">
                      {/* WhatsApp Phone Mock Header */}
                      <div className="bg-[#008069] dark:bg-[#202c33] text-white px-4 py-3 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                            P
                          </div>
                          <div>
                            <div className="font-bold text-xs leading-tight">Poornasree Equipments</div>
                            <div className="text-[10px] opacity-80">Official WhatsApp Broadcast</div>
                          </div>
                        </div>
                        <ShieldCheck className="w-4 h-4 text-emerald-300" />
                      </div>

                      {/* WhatsApp Chat Wallpaper Body */}
                      <div className="p-4 flex-1 space-y-3 min-h-[420px] flex flex-col justify-end">
                        {/* Received Message Bubble */}
                        <div className="max-w-[90%] rounded-2xl bg-white dark:bg-[#202c33] shadow-md overflow-hidden self-start border-l-4 border-l-[#008069]">
                          {imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt="Header Attachment"
                              className="w-full h-44 object-cover bg-black/5"
                            />
                          )}
                          <div className="p-3 text-xs space-y-2">
                            <p className="whitespace-pre-line text-[#111b21] dark:text-[#e9edef] leading-relaxed">
                              {previewBodyText}
                            </p>
                            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-[#667781] dark:text-[#8696a0] flex justify-between items-center">
                              <span>{selectedTemplate?.footerText}</span>
                              <span>Just now ✓✓</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Broadcast Summary & Execution Card */}
                  <div className="lg:col-span-6 space-y-5">
                    <div className="bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#222d34] rounded-2xl p-6 shadow-sm space-y-5">
                      <div>
                        <h2 className="text-base font-bold text-[#111b21] dark:text-[#e9edef]">
                          Ready to Launch Promotion Campaign?
                        </h2>
                        <p className="text-xs text-[#667781] dark:text-[#8696a0] mt-0.5">
                          Review the final campaign summary before triggering the Meta WhatsApp broadcast.
                        </p>
                      </div>

                      {/* Campaign & Template Overview Card */}
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#182229] border border-[#e9edef] dark:border-[#2f3b43] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#54656f] dark:text-[#8696a0] font-medium">Selected Template:</span>
                          <span className="text-xs font-bold text-[#111b21] dark:text-[#e9edef] flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold">
                              {selectedTemplate?.badge}
                            </span>
                            {selectedTemplate?.title}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-gray-200/50 dark:border-gray-800 text-[11px]">
                          <span className="text-[#54656f] dark:text-[#8696a0]">Meta Template ID:</span>
                          <code className="font-mono text-[10px] px-1.5 py-0.5 bg-gray-200/60 dark:bg-gray-800 rounded">
                            {selectedTemplate?.name}
                          </code>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-gray-200/50 dark:border-gray-800 text-[11px]">
                          <span className="text-[#54656f] dark:text-[#8696a0]">Campaign Title:</span>
                          <span className="font-semibold text-[#111b21] dark:text-[#e9edef]">
                            {campaignTitle.trim() || `Promotion - ${selectedTemplate?.title}`}
                          </span>
                        </div>
                      </div>

                      {/* Summary Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-[#f0f2f5] dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43]">
                          <span className="text-[10px] text-[#667781] dark:text-[#8696a0] font-medium block">
                            Target Recipients
                          </span>
                          <span className="text-base font-bold text-[#008069] dark:text-[#00a884]">
                            {selectedPhones.size} Contacts
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#f0f2f5] dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43]">
                          <span className="text-[10px] text-[#667781] dark:text-[#8696a0] font-medium block">
                            Template Status
                          </span>
                          <span className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">
                            {selectedTemplate?.metaStatus || "Ready"}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#f0f2f5] dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2f3b43]">
                          <span className="text-[10px] text-[#667781] dark:text-[#8696a0] font-medium block">
                            Header Image
                          </span>
                          <span className="text-xs font-bold text-[#111b21] dark:text-[#e9edef]">
                            {imageUrl ? "Attached ✓" : "None"}
                          </span>
                        </div>
                      </div>

                      {/* Personalization Notice */}
                      <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Dynamic Contact Name Personalization Enabled</p>
                          <p className="text-[11px] opacity-90 mt-0.5">
                            Each recipient will receive a customized message addressing them by their actual registered name (engineers, dealers, and customers).
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons & Progress */}
                      {sendingBroadcast && broadcastProgress && (
                        <div className="space-y-2 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border">
                          <div className="flex justify-between text-xs font-semibold">
                            <span>Broadcasting messages via Meta Cloud API...</span>
                            <span>{broadcastProgress.sent} / {broadcastProgress.total}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <div
                              className="h-full bg-[#008069] transition-all duration-300"
                              style={{ width: `${(broadcastProgress.sent / broadcastProgress.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 pt-2">
                        <Button variant="outline" size="md" onClick={() => setActiveStep(2)} disabled={sendingBroadcast}>
                          <ChevronLeft className="w-4 h-4 mr-1" /> Adjust Audience
                        </Button>

                        <Button
                          size="md"
                          className="flex-1 bg-[#008069] hover:bg-[#008069]/90 text-white font-bold text-sm shadow-md"
                          onClick={handleSendBroadcast}
                          disabled={sendingBroadcast || selectedPhones.size === 0}
                        >
                          {sendingBroadcast ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Sending Broadcast...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Launch Promotion ({selectedPhones.size} Contacts)
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
