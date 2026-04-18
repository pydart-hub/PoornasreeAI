"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import {
  Send,
  Bot,
  User,
  Globe,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Phone,
  MapPin,
  Package,
  AlertCircle,
} from "lucide-react";
import { Logo, ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "@/lib/languages";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TYPES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ChatButton {
  label: string;
  value: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  buttons?: ChatButton[];
}

type ChatState =
  | "IDLE"
  | "ASK_PHONE"
  | "ASK_NAME"
  | "MENU"
  | "VIEW_PRODUCTS"
  | "COMPLAINT_FORM"
  | "COMPLAINT_ASK_PHONE"
  | "CHECK_STATUS"
  | "CHECK_STATUS_ASK_PHONE"
  | "INSTALLATION_INFO"
  | "SPEAK_SUPPORT";

interface CustomerInfo {
  name: string;
  phone: string;
  verified: boolean;
}

interface ProductItem {
  id: string;
  name: string;
  description?: string | null;
}

interface TicketItem {
  ticketNumber: string;
  status: string;
  problemDescription: string;
  machineName?: string | null;
  createdAt: string;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STATIC MESSAGES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NOT_REGISTERED_MSG =
  `ðŸ“± This mobile number is not registered with us.\n\n` +
  `If you are a Registered Customer, please provide your registered 10 digit mobile number.\n\n` +
  `Eg. 9633503333\n\n` +
  `Else Click Skip Button to Continue. ðŸ‘‡`;

const MENU_BUTTONS: ChatButton[] = [
  { label: "1ï¸âƒ£ View Our Products", value: "1" },
  { label: "2ï¸âƒ£ Complaint Registration", value: "2" },
  { label: "3ï¸âƒ£ Complaint Status", value: "3" },
  { label: "4ï¸âƒ£ Product Installation", value: "4" },
  { label: "5ï¸âƒ£ Speak to Support", value: "5" },
];

function makeMenuMessage(name?: string): ChatMessage {
  const greeting = name ? `Hello ${name},` : "Hello,";
  return {
    id: `menu-${Date.now()}`,
    role: "assistant",
    content: `${greeting}\n\nWelcome to poornasreeHelpDesk.ðŸ¤–ðŸ“²\n\nðŸ“œ Here are the options for you.ðŸ‘‡`,
    buttons: MENU_BUTTONS,
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function CustomerChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatState, setChatState] = useState<ChatState>("IDLE");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ name: "", phone: "", verified: false });
  const [language, setLanguage] = useState<string>("en");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Complaint form state
  const [complaintForm, setComplaintForm] = useState({
    name: "", phone: "", pincode: "", serialNumber: "", product: "", issue: "",
  });
  const [complaintPincodeInfo, setComplaintPincodeInfo] = useState<{ place?: string; district?: string; state?: string } | null>(null);
  const [complaintSerialInfo, setComplaintSerialInfo] = useState<{ model?: string; customer?: string; location?: string } | null>(null);
  const [complaintProducts, setComplaintProducts] = useState<ProductItem[]>([]);
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);
  const [pincodeValidating, setPincodeValidating] = useState(false);
  const [serialValidating, setSerialValidating] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Helper: add message ─────────────────────────────────────────────────
  const addBotMessage = useCallback((content: string, buttons?: ChatButton[]) => {
    setMessages((prev) => [...prev, {
      id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content,
      buttons,
    }]);
  }, []);

  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content,
    }]);
  }, []);

  // ── Show menu ───────────────────────────────────────────────────────────
  const showMenu = useCallback((name?: string) => {
    setMessages((prev) => [...prev, makeMenuMessage(name)]);
    setChatState("MENU");
  }, []);

  // ── Phone lookup ────────────────────────────────────────────────────────
  const lookupPhone = useCallback(async (phone: string): Promise<{ found: boolean; name?: string }> => {
    try {
      const res = await fetch("/api/customer-chat/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) return res.json();
    } catch { /* non-fatal */ }
    return { found: false };
  }, []);

  // ── Open complaint form ─────────────────────────────────────────────────
  const openComplaintForm = useCallback(async (phoneOverride?: string) => {
    addBotMessage("📝 Please fill in the complaint details below:");
    setChatState("COMPLAINT_FORM");

    // Fetch products for dropdown
    try {
      const res = await fetch("/api/customer-chat/products");
      const data = await res.json();
      setComplaintProducts(data.products || []);
    } catch {
      setComplaintProducts([
        { id: "1", name: "Milk Analyzer" },
        { id: "2", name: "VIBRO Stirrer" },
        { id: "3", name: "Water Pump" },
        { id: "4", name: "Motor Controller" },
        { id: "5", name: "Display Unit" },
      ]);
    }

    setComplaintForm({
      name: customerInfo.name || "",
      phone: phoneOverride || customerInfo.phone || "",
      pincode: "",
      serialNumber: "",
      product: "",
      issue: "",
    });
    setComplaintPincodeInfo(null);
    setComplaintSerialInfo(null);
  }, [customerInfo, addBotMessage]);

  // ── Fetch and show tickets ──────────────────────────────────────────────
  const fetchAndShowTickets = useCallback(async (phone: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/customer-chat/ticket-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      const tickets: TicketItem[] = data.tickets || [];

      if (tickets.length === 0) {
        addBotMessage(
          "📋 No tickets found for your number.\n\nYou can register a new complaint with option 2️⃣.",
          [{ label: "⬅️ Back to Menu", value: "__MENU__" }]
        );
      } else {
        const statusEmoji: Record<string, string> = {
          OPEN: "🔵", ASSIGNED: "🟡", IN_PROGRESS: "🟠", PENDING_OTP: "🟣", CLOSED: "✅",
        };
        const lines = tickets.map((t, i) => {
          const emoji = statusEmoji[t.status] || "⚪";
          const date = new Date(t.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          const complaint = t.problemDescription?.slice(0, 40) || "—";
          return `${i + 1}. *${t.ticketNumber}*\n   ${emoji} ${t.status.replace(/_/g, " ")}\n   📅 ${date}\n   📝 ${complaint}`;
        });
        addBotMessage(
          `📋 *Your Tickets (${tickets.length}):*\n\n${lines.join("\n\n")}`,
          [{ label: "⬅️ Back to Menu", value: "__MENU__" }]
        );
      }
    } catch {
      addBotMessage("Sorry, couldn't fetch ticket status. Please try again.", [{ label: "⬅️ Back to Menu", value: "__MENU__" }]);
    }
    setIsLoading(false);
    setChatState("CHECK_STATUS");
  }, [addBotMessage]);

  // ── Handle chat message (state machine) ─────────────────────────────────
  const handleChatMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    switch (chatState) {
      case "IDLE": {
        addUserMessage(trimmed);
        addBotMessage(NOT_REGISTERED_MSG, [{ label: "Skip ⏭️", value: "__SKIP__" }]);
        setChatState("ASK_PHONE");
        break;
      }

      case "ASK_PHONE": {
        if (trimmed === "__SKIP__") {
          addUserMessage("Skip");
          showMenu();
          return;
        }

        addUserMessage(trimmed);
        const digits = trimmed.replace(/\D/g, "");
        if (digits.length !== 10) {
          addBotMessage(
            "⚠️ Please enter a valid 10-digit mobile number.\n\nEg. 9633503333\n\nOr Click Skip Button to Continue. 👇",
            [{ label: "Skip ⏭️", value: "__SKIP__" }]
          );
          return;
        }

        setIsLoading(true);
        const result = await lookupPhone(digits);
        setIsLoading(false);

        if (result.found && result.name) {
          setCustomerInfo({ name: result.name, phone: digits, verified: true });
          addBotMessage(`✅ Welcome back, ${result.name}! 👋\n\nYour phone number has been verified.`);
          showMenu(result.name);
        } else {
          setCustomerInfo((prev) => ({ ...prev, phone: digits }));
          addBotMessage("👤 Please enter your name:");
          setChatState("ASK_NAME");
        }
        break;
      }

      case "ASK_NAME": {
        addUserMessage(trimmed);
        if (trimmed.length < 2) {
          addBotMessage("Please enter your full name (at least 2 characters):");
          return;
        }
        setCustomerInfo((prev) => ({ ...prev, name: trimmed, verified: false }));
        addBotMessage(`✅ Thank you, ${trimmed}! Your phone number ${customerInfo.phone} has been noted.`);
        showMenu(trimmed);
        break;
      }

      case "MENU": {
        addUserMessage(trimmed);
        const choice = trimmed;

        if (choice === "1") {
          setIsLoading(true);
          try {
            const res = await fetch("/api/customer-chat/products");
            const data = await res.json();
            const products: ProductItem[] = data.products || [];
            const productList = products.map((p: ProductItem, i: number) => `${i + 1}. ${p.name}`).join("\n");
            addBotMessage(
              `📦 *Our Products:*\n\n${productList}\n\nClick Back to Menu to return.`,
              [{ label: "⬅️ Back to Menu", value: "__MENU__" }]
            );
          } catch {
            addBotMessage("Sorry, couldn't load products. Please try again.", [{ label: "⬅️ Back to Menu", value: "__MENU__" }]);
          }
          setIsLoading(false);
          setChatState("VIEW_PRODUCTS");
          return;
        }

        if (choice === "2") {
          if (!customerInfo.phone) {
            addBotMessage("📱 To register a complaint, please provide your 10-digit mobile number first:");
            setChatState("COMPLAINT_ASK_PHONE");
            return;
          }
          openComplaintForm();
          return;
        }

        if (choice === "3") {
          if (!customerInfo.phone) {
            addBotMessage("📱 To check complaint status, please provide your 10-digit mobile number:");
            setChatState("CHECK_STATUS_ASK_PHONE");
            return;
          }
          await fetchAndShowTickets(customerInfo.phone);
          return;
        }

        if (choice === "4") {
          addBotMessage(
            `🔧 *Product Installation*\n\n` +
            `For product installation requests, please contact our service team.\n\n` +
            `Or register a complaint with option 2️⃣ Complaint Registration and mention "Installation" as the issue.`,
            [{ label: "⬅️ Back to Menu", value: "__MENU__" }]
          );
          setChatState("INSTALLATION_INFO");
          return;
        }

        if (choice === "5") {
          addBotMessage(
            `📞 *Speak to Support*\n\nOur support team will reach out to you shortly.`,
            [{ label: "⬅️ Back to Menu", value: "__MENU__" }]
          );
          setChatState("SPEAK_SUPPORT");
          return;
        }

        addBotMessage("Please select a valid option (1-5):", MENU_BUTTONS);
        break;
      }

      case "VIEW_PRODUCTS":
      case "INSTALLATION_INFO":
      case "SPEAK_SUPPORT":
      case "CHECK_STATUS": {
        if (trimmed === "__MENU__") {
          addUserMessage("Back to Menu");
          showMenu(customerInfo.name || undefined);
          return;
        }
        addUserMessage(trimmed);
        addBotMessage("Click Back to Menu to return.", [{ label: "⬅️ Back to Menu", value: "__MENU__" }]);
        break;
      }

      case "COMPLAINT_ASK_PHONE": {
        addUserMessage(trimmed);
        const digits = trimmed.replace(/\D/g, "");
        if (digits.length !== 10) {
          addBotMessage("⚠️ Please enter a valid 10-digit mobile number.\n\nEg. 9633503333");
          return;
        }
        setCustomerInfo((prev) => ({ ...prev, phone: digits }));

        setIsLoading(true);
        const result = await lookupPhone(digits);
        setIsLoading(false);
        if (result.found && result.name) {
          setCustomerInfo({ name: result.name, phone: digits, verified: true });
          addBotMessage(`✅ Verified: ${result.name}`);
        }

        openComplaintForm(digits);
        break;
      }

      case "CHECK_STATUS_ASK_PHONE": {
        addUserMessage(trimmed);
        const digits = trimmed.replace(/\D/g, "");
        if (digits.length !== 10) {
          addBotMessage("⚠️ Please enter a valid 10-digit mobile number.\n\nEg. 9633503333");
          return;
        }
        setCustomerInfo((prev) => ({ ...prev, phone: digits }));
        await fetchAndShowTickets(digits);
        break;
      }

      case "COMPLAINT_FORM": {
        if (trimmed === "__MENU__") {
          addUserMessage("Back to Menu");
          showMenu(customerInfo.name || undefined);
          return;
        }
        break;
      }

      default:
        break;
    }
  }, [chatState, customerInfo, addUserMessage, addBotMessage, showMenu, lookupPhone, openComplaintForm, fetchAndShowTickets]);

  // ── Validate pincode ────────────────────────────────────────────────────
  const validatePincode = useCallback(async (pincode: string) => {
    if (!/^\d{6}$/.test(pincode)) { setComplaintPincodeInfo(null); return; }
    setPincodeValidating(true);
    try {
      const res = await fetch("/api/customer-chat/validate-pincode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pincode }),
      });
      const data = await res.json();
      if (data.valid) {
        setComplaintPincodeInfo({ place: data.place, district: data.district, state: data.state });
      } else {
        setComplaintPincodeInfo(null);
      }
    } catch { setComplaintPincodeInfo(null); }
    setPincodeValidating(false);
  }, []);

  // ── Validate serial number ──────────────────────────────────────────────
  const validateSerial = useCallback(async (serial: string) => {
    if (!serial.trim()) { setComplaintSerialInfo(null); return; }
    setSerialValidating(true);
    try {
      const res = await fetch("/api/customer-chat/validate-serial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: serial }),
      });
      const data = await res.json();
      if (data.found) {
        setComplaintSerialInfo(data.machine);
      } else {
        setComplaintSerialInfo(null);
      }
    } catch { setComplaintSerialInfo(null); }
    setSerialValidating(false);
  }, []);

  // ── Submit complaint ────────────────────────────────────────────────────
  const handleSubmitComplaint = useCallback(async () => {
    const { name, phone, pincode, product, issue, serialNumber } = complaintForm;
    if (!name.trim() || !phone.trim() || !pincode.trim() || !product.trim() || !issue.trim()) return;

    setComplaintSubmitting(true);
    try {
      const res = await fetch("/api/customer-chat/complaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), pincode: pincode.trim(), serialNumber: serialNumber.trim() || undefined, product: product.trim(), issue: issue.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        addBotMessage(
          `✅ Your complaint has been registered successfully!\n\n` +
          `🎫 Ticket: *${data.ticketNumber}*\n` +
          `📦 Product: ${product.trim()}\n` +
          `📝 Issue: ${issue.trim()}\n\n` +
          `A service engineer will be assigned to you shortly.`,
          [{ label: "⬅️ Back to Menu", value: "__MENU__" }]
        );
        setChatState("CHECK_STATUS");
      } else {
        addBotMessage(`❌ ${data.error || "Failed to submit complaint. Please try again."}`, [{ label: "⬅️ Back to Menu", value: "__MENU__" }]);
        setChatState("CHECK_STATUS");
      }
    } catch {
      addBotMessage("❌ Failed to submit complaint. Please try again.", [{ label: "⬅️ Back to Menu", value: "__MENU__" }]);
      setChatState("CHECK_STATUS");
    }
    setComplaintSubmitting(false);
  }, [complaintForm, addBotMessage]);

  // ── Handle text input submit ────────────────────────────────────────────
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleChatMessage(input);
    setInput("");
  };

  // ── Complaint form is valid? ────────────────────────────────────────────
  const isComplaintValid =
    complaintForm.name.trim().length >= 2 &&
    complaintForm.phone.replace(/\D/g, "").length === 10 &&
    /^\d{6}$/.test(complaintForm.pincode) &&
    complaintForm.product.trim() !== "" &&
    complaintForm.issue.trim().length >= 3;

  return (
    <div className="h-[100dvh] flex flex-col bg-surface dark:bg-surface-dark overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-1.5 sm:gap-3 sticky top-0 z-20">
        <Logo variant="full" size="sm" className="hidden sm:flex" />
        <Logo variant="icon" size="sm" className="flex sm:hidden" />

        <div className="hidden md:flex flex-col -ml-1">
          <span className="text-sm font-semibold text-content dark:text-content-dark leading-tight">
            Poornasree HelpDesk
          </span>
          <span className="text-[10px] text-content-secondary dark:text-content-dark-secondary leading-none">
            Customer Support 🤖📲
          </span>
        </div>

        {/* Status pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Online</span>
        </div>

        <div className="flex-1" />

        {/* Language selector */}
        <div className="relative shrink-0">
          <button
            onClick={() => setLangMenuOpen((v) => !v)}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-line dark:border-line-dark text-xs font-medium text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {LANGUAGES.find((l) => l.code === language)?.flag}{" "}
            <span className="hidden sm:inline">{LANGUAGES.find((l) => l.code === language)?.label}</span>
          </button>
          {langMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setLangMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-36 rounded-xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card shadow-lg overflow-hidden">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { setLanguage(l.code); setLangMenuOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2",
                      language === l.code
                        ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium"
                        : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                    )}
                  >
                    <span>{l.flag}</span> {l.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="hidden sm:block"><ThemeToggle /></div>
      </header>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 scrollbar-thin">
        <div className="max-w-2xl mx-auto w-full space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onButtonClick={(val) => handleChatMessage(val)}
            />
          ))}

          {/* Complaint form inline */}
          {chatState === "COMPLAINT_FORM" && (
            <ComplaintForm
              form={complaintForm}
              setForm={setComplaintForm}
              pincodeInfo={complaintPincodeInfo}
              serialInfo={complaintSerialInfo}
              products={complaintProducts}
              onValidatePincode={validatePincode}
              onValidateSerial={validateSerial}
              onSubmit={handleSubmitComplaint}
              onCancel={() => { showMenu(customerInfo.name || undefined); }}
              isValid={isComplaintValid}
              submitting={complaintSubmitting}
              pincodeValidating={pincodeValidating}
              serialValidating={serialValidating}
            />
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-end gap-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary dark:text-primary-300" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="block w-2 h-2 rounded-full bg-primary/60 dark:bg-primary-400/60 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </main>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card px-3 sm:px-6 py-3">
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto flex items-center gap-2"
        >
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark focus-within:border-primary dark:focus-within:border-primary-400 transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                chatState === "IDLE" ? "Type Hi to start…" :
                chatState === "ASK_PHONE" ? "Enter your 10-digit mobile number…" :
                chatState === "ASK_NAME" ? "Enter your name…" :
                chatState === "COMPLAINT_FORM" ? "Fill in the form above…" :
                "Type a message…"
              }
              disabled={chatState === "COMPLAINT_FORM"}
              className="flex-1 bg-transparent text-base sm:text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={input.trim() === "" || chatState === "COMPLAINT_FORM"}
            className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="max-w-2xl mx-auto mt-2">
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
            Poornasree HelpDesk · v1.0
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE BUBBLE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onButtonClick,
}: {
  msg: ChatMessage;
  onButtonClick: (value: string) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-2 items-end">
        <div className="max-w-[80%] sm:max-w-[65%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-primary text-white text-sm font-medium shadow-sm">
          {msg.content}
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-primary dark:text-primary-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
        <Bot className="w-4 h-4 text-primary dark:text-primary-300" />
      </div>
      <div className="flex-1 space-y-2.5 max-w-[90%] sm:max-w-[80%]">
        {/* Main text bubble */}
        <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-sm">
          <p className="text-sm text-content dark:text-content-dark whitespace-pre-line leading-relaxed">
            {msg.content.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
          </p>
        </div>

        {/* Action buttons */}
        {msg.buttons && msg.buttons.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-1">
            {msg.buttons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => onButtonClick(btn.value)}
                className="px-4 py-2 rounded-xl border border-primary/30 dark:border-primary-400/30 bg-primary/5 dark:bg-primary-400/5 text-primary dark:text-primary-300 text-sm font-medium hover:bg-primary/10 dark:hover:bg-primary-400/10 hover:border-primary/50 dark:hover:border-primary-400/50 transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLAINT FORM COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function ComplaintForm({
  form,
  setForm,
  pincodeInfo,
  serialInfo,
  products,
  onValidatePincode,
  onValidateSerial,
  onSubmit,
  onCancel,
  isValid,
  submitting,
  pincodeValidating,
  serialValidating,
}: {
  form: { name: string; phone: string; pincode: string; serialNumber: string; product: string; issue: string };
  setForm: (fn: (prev: typeof form) => typeof form) => void;
  pincodeInfo: { place?: string; district?: string; state?: string } | null;
  serialInfo: { model?: string; customer?: string; location?: string } | null;
  products: ProductItem[];
  onValidatePincode: (pincode: string) => void;
  onValidateSerial: (serial: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isValid: boolean;
  submitting: boolean;
  pincodeValidating: boolean;
  serialValidating: boolean;
}) {
  const pincodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serialTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className="flex items-end gap-2">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center self-start mt-1">
        <Bot className="w-4 h-4 text-primary dark:text-primary-300" />
      </div>
      <div className="flex-1 max-w-[90%] sm:max-w-[80%]">
        <div className="rounded-2xl rounded-bl-sm bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-content dark:text-content-dark flex items-center gap-2">
            📝 Complaint Registration
          </p>

          {/* Name */}
          <div>
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary flex items-center gap-1 mb-1">
              <User className="w-3 h-3" /> Name *
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Your full name"
              className="w-full text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary flex items-center gap-1 mb-1">
              <Phone className="w-3 h-3" /> Phone *
            </label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="10-digit mobile number"
              maxLength={10}
              className="w-full text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Pincode */}
          <div>
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary flex items-center gap-1 mb-1">
              <MapPin className="w-3 h-3" /> Pincode *
            </label>
            <input
              value={form.pincode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setForm((f) => ({ ...f, pincode: val }));
                if (pincodeTimeoutRef.current) clearTimeout(pincodeTimeoutRef.current);
                if (val.length === 6) {
                  pincodeTimeoutRef.current = setTimeout(() => onValidatePincode(val), 300);
                }
              }}
              placeholder="6-digit pincode"
              maxLength={6}
              className="w-full text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {pincodeValidating && (
              <p className="text-[11px] text-content-secondary dark:text-content-dark-secondary mt-1 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Validating…
              </p>
            )}
            {pincodeInfo && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                📍 {[pincodeInfo.place, pincodeInfo.district, pincodeInfo.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          {/* Serial Number (optional) */}
          <div>
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary flex items-center gap-1 mb-1">
              🔧 Serial Number (optional)
            </label>
            <input
              value={form.serialNumber}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({ ...f, serialNumber: val }));
                if (serialTimeoutRef.current) clearTimeout(serialTimeoutRef.current);
                if (val.trim().length >= 3) {
                  serialTimeoutRef.current = setTimeout(() => onValidateSerial(val), 500);
                }
              }}
              placeholder="Machine serial number"
              className="w-full text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {serialValidating && (
              <p className="text-[11px] text-content-secondary dark:text-content-dark-secondary mt-1 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Validating…
              </p>
            )}
            {serialInfo && (
              <div className="mt-1 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">✅ Machine found!</p>
                {serialInfo.model && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">🔧 Model: {serialInfo.model}</p>}
                {serialInfo.customer && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">👤 Customer: {serialInfo.customer}</p>}
                {serialInfo.location && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">📍 Location: {serialInfo.location}</p>}
              </div>
            )}
          </div>

          {/* Product */}
          <div>
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary flex items-center gap-1 mb-1">
              <Package className="w-3 h-3" /> Product *
            </label>
            <select
              value={form.product}
              onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
              className="w-full text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Issue */}
          <div>
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary flex items-center gap-1 mb-1">
              <AlertCircle className="w-3 h-3" /> Issue Description *
            </label>
            <textarea
              value={form.issue}
              onChange={(e) => setForm((f) => ({ ...f, issue: e.target.value }))}
              placeholder="Describe your issue… e.g. LED blinking continuously"
              rows={3}
              className="w-full text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
            </button>
            <button
              onClick={onSubmit}
              disabled={!isValid || submitting}
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</>
              ) : (
                <><CheckCircle2 className="w-3.5 h-3.5" /> Submit Complaint</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
