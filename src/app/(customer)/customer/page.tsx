"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import {
  Send,
  Bot,
  User,
  Globe,
  Loader2,
} from "lucide-react";
import { Logo, ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "@/lib/languages";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

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
  | "COMPLAINT_ASK_PHONE"
  | "COMPLAINT_ASK_SERIAL"
  | "COMPLAINT_CONFIRM_DETAILS"
  | "COMPLAINT_MANUAL_NAME"
  | "COMPLAINT_MANUAL_PINCODE"
  | "COMPLAINT_MANUAL_PRODUCT"
  | "COMPLAINT_ASK_ISSUE"
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

// ─────────────────────────────────────────────────────────────────────────────
// STATIC MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

const NOT_REGISTERED_MSG =
  `📱 This mobile number is not registered with us.\n\n` +
  `If you are a Registered Customer, please provide your registered 10 digit mobile number.\n\n` +
  `Eg. 9633503333\n\n` +
  `Else Click Skip Button to Continue. 👇`;

const MENU_BUTTONS: ChatButton[] = [
  { label: "1️⃣ View Our Products", value: "1" },
  { label: "2️⃣ Complaint Registration", value: "2" },
  { label: "3️⃣ Complaint Status", value: "3" },
  { label: "4️⃣ Product Installation", value: "4" },
  { label: "5️⃣ Speak to Support", value: "5" },
];

function makeMenuMessage(name?: string): ChatMessage {
  const greeting = name ? `Hello ${name},` : "Hello,";
  return {
    id: `menu-${Date.now()}`,
    role: "assistant",
    content: `${greeting}\n\nWelcome to poornasreeHelpDesk.🤖📲\n\n📜 Here are the options for you.👇`,
    buttons: MENU_BUTTONS,
  };
}
// -----------------------------------------------------------------------------
// COMPONENT
// -----------------------------------------------------------------------------

export default function CustomerChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatState, setChatState] = useState<ChatState>("IDLE");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ name: "", phone: "", verified: false });
  const [language, setLanguage] = useState<string>("en");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Complaint draft state (step-by-step flow)
  const [complaintDraft, setComplaintDraft] = useState<{
    serialNumber?: string;
    name?: string;
    phone?: string;
    pincode?: string;
    place?: string;
    district?: string;
    state?: string;
    product?: string;
    dealerId?: string;
    dealerName?: string;
    machineCustomer?: string;
    machineModel?: string;
    machineLocation?: string;
  }>({});
  const [complaintProducts, setComplaintProducts] = useState<ProductItem[]>([]);
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // -- Scroll to bottom on new messages ------------------------------------
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // -- Helper: add message -------------------------------------------------
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

  // -- Show menu -----------------------------------------------------------
  const showMenu = useCallback((name?: string) => {
    setMessages((prev) => [...prev, makeMenuMessage(name)]);
    setChatState("MENU");
  }, []);

  // -- Phone lookup --------------------------------------------------------
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

  // -- Start complaint flow (serial-first) ---------------------------------
  const startComplaintFlow = useCallback(async (phoneArg: string) => {
    // Load products in background for manual path
    fetch("/api/customer-chat/products")
      .then((r) => r.json())
      .then((d) => setComplaintProducts(d.products || []))
      .catch(() => setComplaintProducts([
        { id: "1", name: "Milk Analyzer" },
        { id: "2", name: "VIBRO Stirrer" },
        { id: "3", name: "Water Pump" },
        { id: "4", name: "Motor Controller" },
        { id: "5", name: "Display Unit" },
      ]));

    setComplaintDraft({ name: customerInfo.name || "", phone: phoneArg });
    addBotMessage(
      "?? Please enter your machine *serial number* to get started.\n\n" +
      "(Type *skip* if you don't have the serial number handy)"
    );
    setChatState("COMPLAINT_ASK_SERIAL");
  }, [customerInfo.name, addBotMessage]);

  // -- Submit new complaint -------------------------------------------------
  const submitNewComplaint = useCallback(async (issue: string) => {
    setIsSubmittingComplaint(true);
    const draft = complaintDraft;
    try {
      const body: Record<string, unknown> = {
        name: draft.name || customerInfo.name || "Customer",
        phone: draft.phone || customerInfo.phone,
        issue: issue.trim(),
        product: draft.product || draft.machineModel || "Unknown Product",
        serialNumber: draft.serialNumber,
      };
      if (draft.dealerId) {
        body.dealerId = draft.dealerId;
        body.place = draft.machineLocation;
      } else {
        body.pincode = draft.pincode;
        body.place = draft.place;
      }

      const res = await fetch("/api/customer-chat/complaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        const dealerNote = draft.dealerId && draft.dealerName
          ? `\n?? Dealer: ${draft.dealerName} has been notified.`
          : "\n?? A service engineer will be assigned to you shortly.";
        addBotMessage(
          `? Your complaint has been registered!\n\n` +
          `?? Ticket: *${data.ticketNumber}*\n` +
          `?? Product: ${body.product}\n` +
          `?? Issue: ${issue.trim()}` +
          dealerNote,
          [{ label: "?? Back to Menu", value: "__MENU__" }]
        );
      } else {
        addBotMessage(
          `? ${data.error || "Failed to submit. Please try again."}`,
          [{ label: "?? Back to Menu", value: "__MENU__" }]
        );
      }
    } catch {
      addBotMessage("? Failed to submit complaint. Please try again.", [{ label: "?? Back to Menu", value: "__MENU__" }]);
    }
    setComplaintDraft({});
    setIsSubmittingComplaint(false);
    setChatState("CHECK_STATUS");
  }, [complaintDraft, customerInfo, addBotMessage]);

  // -- Fetch and show tickets ----------------------------------------------
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
          "?? No tickets found for your number.\n\nYou can register a new complaint with option 2??.",
          [{ label: "?? Back to Menu", value: "__MENU__" }]
        );
      } else {
        const statusEmoji: Record<string, string> = {
          OPEN: "??", ASSIGNED: "??", IN_PROGRESS: "??", PENDING_OTP: "??", CLOSED: "?",
        };
        const lines = tickets.map((t, i) => {
          const emoji = statusEmoji[t.status] || "?";
          const date = new Date(t.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          const complaint = t.problemDescription?.slice(0, 40) || "�";
          return `${i + 1}. *${t.ticketNumber}*\n   ${emoji} ${t.status.replace(/_/g, " ")}\n   ?? ${date}\n   ?? ${complaint}`;
        });
        addBotMessage(
          `?? *Your Tickets (${tickets.length}):*\n\n${lines.join("\n\n")}`,
          [{ label: "?? Back to Menu", value: "__MENU__" }]
        );
      }
    } catch {
      addBotMessage("Sorry, couldn't fetch ticket status. Please try again.", [{ label: "?? Back to Menu", value: "__MENU__" }]);
    }
    setIsLoading(false);
    setChatState("CHECK_STATUS");
  }, [addBotMessage]);

  // -- Handle chat message (state machine) ---------------------------------
  const handleChatMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    switch (chatState) {
      case "IDLE": {
        addUserMessage(trimmed);
        addBotMessage(NOT_REGISTERED_MSG, [{ label: "Skip ??", value: "__SKIP__" }]);
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
            "?? Please enter a valid 10-digit mobile number.\n\nEg. 9633503333\n\nOr Click Skip Button to Continue. ??",
            [{ label: "Skip ??", value: "__SKIP__" }]
          );
          return;
        }

        setIsLoading(true);
        const result = await lookupPhone(digits);
        setIsLoading(false);

        if (result.found && result.name) {
          setCustomerInfo({ name: result.name, phone: digits, verified: true });
          addBotMessage(`? Welcome back, ${result.name}! ??\n\nYour phone number has been verified.`);
          showMenu(result.name);
        } else {
          setCustomerInfo((prev) => ({ ...prev, phone: digits }));
          addBotMessage("?? Please enter your name:");
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
        addBotMessage(`? Thank you, ${trimmed}! Your phone number ${customerInfo.phone} has been noted.`);
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
              `?? *Our Products:*\n\n${productList}\n\nClick Back to Menu to return.`,
              [{ label: "?? Back to Menu", value: "__MENU__" }]
            );
          } catch {
            addBotMessage("Sorry, couldn't load products. Please try again.", [{ label: "?? Back to Menu", value: "__MENU__" }]);
          }
          setIsLoading(false);
          setChatState("VIEW_PRODUCTS");
          return;
        }

        if (choice === "2") {
          if (!customerInfo.phone) {
            addBotMessage("?? To register a complaint, please provide your 10-digit mobile number first:");
            setChatState("COMPLAINT_ASK_PHONE");
            return;
          }
          startComplaintFlow(customerInfo.phone);
          return;
        }

        if (choice === "3") {
          if (!customerInfo.phone) {
            addBotMessage("?? To check complaint status, please provide your 10-digit mobile number:");
            setChatState("CHECK_STATUS_ASK_PHONE");
            return;
          }
          await fetchAndShowTickets(customerInfo.phone);
          return;
        }

        if (choice === "4") {
          addBotMessage(
            `?? *Product Installation*\n\n` +
            `For product installation requests, please contact our service team.\n\n` +
            `Or register a complaint with option 2?? Complaint Registration and mention "Installation" as the issue.`,
            [{ label: "?? Back to Menu", value: "__MENU__" }]
          );
          setChatState("INSTALLATION_INFO");
          return;
        }

        if (choice === "5") {
          addBotMessage(
            `?? *Speak to Support*\n\nOur support team will reach out to you shortly.`,
            [{ label: "?? Back to Menu", value: "__MENU__" }]
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
        addBotMessage("Click Back to Menu to return.", [{ label: "?? Back to Menu", value: "__MENU__" }]);
        break;
      }

      case "COMPLAINT_ASK_PHONE": {
        addUserMessage(trimmed);
        const digits = trimmed.replace(/\D/g, "");
        if (digits.length !== 10) {
          addBotMessage("?? Please enter a valid 10-digit mobile number.\n\nEg. 9633503333");
          return;
        }
        setCustomerInfo((prev) => ({ ...prev, phone: digits }));

        setIsLoading(true);
        const result = await lookupPhone(digits);
        setIsLoading(false);
        if (result.found && result.name) {
          setCustomerInfo({ name: result.name, phone: digits, verified: true });
          addBotMessage(`? Verified: ${result.name}`);
        }

        startComplaintFlow(digits);
        break;
      }

      case "COMPLAINT_ASK_SERIAL": {
        if (trimmed === "__MENU__") { addUserMessage("Back to Menu"); showMenu(customerInfo.name || undefined); return; }

        const skipSerial = trimmed.toLowerCase() === "skip";
        addUserMessage(skipSerial ? "Skip" : trimmed);

        if (skipSerial) {
          // Manual path � ask name if not known
          if (complaintDraft.name && complaintDraft.name.length >= 2) {
            addBotMessage("?? Please enter your *pincode* (6 digits):");
            setChatState("COMPLAINT_MANUAL_PINCODE");
          } else {
            addBotMessage("?? Please enter your *full name*:");
            setChatState("COMPLAINT_MANUAL_NAME");
          }
          return;
        }

        // Fetch serial from Passtest
        setIsLoading(true);
        try {
          const res = await fetch("/api/customer-chat/validate-serial", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serialNumber: trimmed }),
          });
          const data = await res.json();
          setIsLoading(false);

          if (data.found && data.machine) {
            const m = data.machine;
            setComplaintDraft((prev) => ({
              ...prev,
              serialNumber: trimmed.replace(/\s+/g, "").toUpperCase(),
              machineCustomer: m.customer || undefined,
              machineModel: m.model || undefined,
              machineLocation: m.location || undefined,
              dealerId: m.dealerId || undefined,
              dealerName: m.dealerName || undefined,
            }));

            const lines: string[] = ["?? *Machine details found:*\n"];
            if (m.customer) lines.push(`?? Name: ${m.customer}`);
            if (m.location) lines.push(`?? Location: ${m.location}`);
            if (m.model) lines.push(`?? Product: ${m.model}`);
            if (m.dealerName) lines.push(`?? Dealer: ${m.dealerName}`);
            lines.push("\nAre these details *correct*?");

            addBotMessage(lines.join("\n"), [
              { label: "? Yes, correct", value: "CONFIRM_YES" },
              { label: "?? No, enter manually", value: "CONFIRM_NO" },
            ]);
            setChatState("COMPLAINT_CONFIRM_DETAILS");
          } else {
            addBotMessage(
              "?? Serial number not found in our records.\n\nLet's fill in the details manually."
            );
            if (complaintDraft.name && complaintDraft.name.length >= 2) {
              addBotMessage("?? Please enter your *pincode* (6 digits):");
              setChatState("COMPLAINT_MANUAL_PINCODE");
            } else {
              addBotMessage("?? Please enter your *full name*:");
              setChatState("COMPLAINT_MANUAL_NAME");
            }
          }
        } catch {
          setIsLoading(false);
          addBotMessage("?? Could not look up serial number. Let's fill in manually.");
          if (complaintDraft.name && complaintDraft.name.length >= 2) {
            addBotMessage("?? Please enter your *pincode* (6 digits):");
            setChatState("COMPLAINT_MANUAL_PINCODE");
          } else {
            addBotMessage("?? Please enter your *full name*:");
            setChatState("COMPLAINT_MANUAL_NAME");
          }
        }
        break;
      }

      case "COMPLAINT_CONFIRM_DETAILS": {
        if (trimmed === "__MENU__") { addUserMessage("Back to Menu"); showMenu(customerInfo.name || undefined); return; }

        if (trimmed === "CONFIRM_YES") {
          addUserMessage("? Yes, correct");
          // Use machine customer name as name if we don't have one
          if (complaintDraft.machineCustomer && (!complaintDraft.name || complaintDraft.name.length < 2)) {
            setComplaintDraft((prev) => ({ ...prev, name: prev.machineCustomer }));
          }
          // Set product from model if available
          if (complaintDraft.machineModel) {
            setComplaintDraft((prev) => ({ ...prev, product: prev.machineModel }));
          }
          addBotMessage("?? Please describe your *complaint* in detail:");
          setChatState("COMPLAINT_ASK_ISSUE");
          return;
        }

        if (trimmed === "CONFIRM_NO") {
          addUserMessage("?? Enter manually");
          if (complaintDraft.name && complaintDraft.name.length >= 2) {
            addBotMessage("?? Please enter your *pincode* (6 digits):");
            setChatState("COMPLAINT_MANUAL_PINCODE");
          } else {
            addBotMessage("?? Please enter your *full name*:");
            setChatState("COMPLAINT_MANUAL_NAME");
          }
          return;
        }
        break;
      }

      case "COMPLAINT_MANUAL_NAME": {
        if (trimmed === "__MENU__") { addUserMessage("Back to Menu"); showMenu(customerInfo.name || undefined); return; }
        addUserMessage(trimmed);
        if (trimmed.length < 2) {
          addBotMessage("?? Please enter your full name (at least 2 characters):");
          return;
        }
        setComplaintDraft((prev) => ({ ...prev, name: trimmed }));
        addBotMessage("?? Please enter your *pincode* (6 digits):");
        setChatState("COMPLAINT_MANUAL_PINCODE");
        break;
      }

      case "COMPLAINT_MANUAL_PINCODE": {
        if (trimmed === "__MENU__") { addUserMessage("Back to Menu"); showMenu(customerInfo.name || undefined); return; }
        addUserMessage(trimmed);
        const pincodeVal = trimmed.replace(/\D/g, "");
        if (pincodeVal.length !== 6) {
          addBotMessage("?? Please enter a valid 6-digit pincode:");
          return;
        }

        setIsLoading(true);
        try {
          const res = await fetch("/api/customer-chat/validate-pincode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pincode: pincodeVal }),
          });
          const data = await res.json();
          setIsLoading(false);
          if (data.valid) {
            setComplaintDraft((prev) => ({
              ...prev,
              pincode: pincodeVal,
              place: data.place || undefined,
              district: data.district || undefined,
              state: data.state || undefined,
            }));
            const loc = [data.place, data.district, data.state].filter(Boolean).join(", ");
            addBotMessage(`? ?? ${loc}\n\nPlease select or type your *product name*:`,
              complaintProducts.length > 0
                ? complaintProducts.map((p) => ({ label: p.name, value: `PRODUCT:${p.name}` }))
                : undefined
            );
          } else {
            setComplaintDraft((prev) => ({ ...prev, pincode: pincodeVal }));
            addBotMessage("?? Pincode noted.\n\nPlease select or type your *product name*:",
              complaintProducts.length > 0
                ? complaintProducts.map((p) => ({ label: p.name, value: `PRODUCT:${p.name}` }))
                : undefined
            );
          }
        } catch {
          setIsLoading(false);
          setComplaintDraft((prev) => ({ ...prev, pincode: pincodeVal }));
          addBotMessage("Please select or type your *product name*:",
            complaintProducts.length > 0
              ? complaintProducts.map((p) => ({ label: p.name, value: `PRODUCT:${p.name}` }))
              : undefined
          );
        }
        setChatState("COMPLAINT_MANUAL_PRODUCT");
        break;
      }

      case "COMPLAINT_MANUAL_PRODUCT": {
        if (trimmed === "__MENU__") { addUserMessage("Back to Menu"); showMenu(customerInfo.name || undefined); return; }
        const productValue = trimmed.startsWith("PRODUCT:") ? trimmed.slice(8) : trimmed;
        addUserMessage(productValue);
        if (!productValue.trim()) {
          addBotMessage("?? Please enter a product name:");
          return;
        }
        setComplaintDraft((prev) => ({ ...prev, product: productValue.trim() }));
        addBotMessage("?? Please describe your *complaint* in detail:");
        setChatState("COMPLAINT_ASK_ISSUE");
        break;
      }

      case "COMPLAINT_ASK_ISSUE": {
        if (trimmed === "__MENU__") { addUserMessage("Back to Menu"); showMenu(customerInfo.name || undefined); return; }
        addUserMessage(trimmed);
        if (trimmed.length < 3) {
          addBotMessage("?? Please describe your issue in at least 3 characters:");
          return;
        }
        if (isSubmittingComplaint) return;
        await submitNewComplaint(trimmed);
        break;
      } {
        addUserMessage(trimmed);
        const digits = trimmed.replace(/\D/g, "");
        if (digits.length !== 10) {
          addBotMessage("?? Please enter a valid 10-digit mobile number.\n\nEg. 9633503333");
          return;
        }
        setCustomerInfo((prev) => ({ ...prev, phone: digits }));
        await fetchAndShowTickets(digits);
        break;
      }

      default:
        break;
    }
  }, [chatState, customerInfo, complaintDraft, complaintProducts, isSubmittingComplaint, addUserMessage, addBotMessage, showMenu, lookupPhone, startComplaintFlow, submitNewComplaint, fetchAndShowTickets]);

  // -- Handle text input submit --------------------------------------------
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleChatMessage(input);
    setInput("");
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-surface dark:bg-surface-dark overflow-hidden">

      {/* -- Header ------------------------------------------------------------ */}
      <header className="shrink-0 bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-1.5 sm:gap-3 sticky top-0 z-20">
        <Logo variant="full" size="sm" className="hidden sm:flex" />
        <Logo variant="icon" size="sm" className="flex sm:hidden" />

        <div className="hidden md:flex flex-col -ml-1">
          <span className="text-sm font-semibold text-content dark:text-content-dark leading-tight">
            Poornasree HelpDesk
          </span>
          <span className="text-[10px] text-content-secondary dark:text-content-dark-secondary leading-none">
            Customer Support ????
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

      {/* -- Messages -------------------------------------------------------- */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 scrollbar-thin">
        <div className="max-w-2xl mx-auto w-full space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onButtonClick={(val) => handleChatMessage(val)}
            />
          ))}

          {/* Submitting indicator */}
          {isSubmittingComplaint && (
            <div className="flex items-end gap-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary dark:text-primary-300" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Registering your complaint…
                </p>
              </div>
            </div>
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

      {/* -- Input ----------------------------------------------------------- */}
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
                chatState === "IDLE" ? "Type Hi to start�" :
                chatState === "ASK_PHONE" ? "Enter your 10-digit mobile number�" :
                chatState === "ASK_NAME" ? "Enter your name�" :
                chatState === "COMPLAINT_ASK_SERIAL" ? "Enter serial number or type skip�" :
                chatState === "COMPLAINT_CONFIRM_DETAILS" ? "Use the buttons above�" :
                chatState === "COMPLAINT_MANUAL_NAME" ? "Enter your full name�" :
                chatState === "COMPLAINT_MANUAL_PINCODE" ? "Enter 6-digit pincode�" :
                chatState === "COMPLAINT_MANUAL_PRODUCT" ? "Enter product name�" :
                chatState === "COMPLAINT_ASK_ISSUE" ? "Describe your complaint�" :
                "Type a message�"
              }
              disabled={chatState === "COMPLAINT_CONFIRM_DETAILS"}
              className="flex-1 bg-transparent text-base sm:text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={input.trim() === "" || chatState === "COMPLAINT_CONFIRM_DETAILS"}
            className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="max-w-2xl mx-auto mt-2">
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
            Poornasree HelpDesk � v1.0
          </p>
        </div>
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MESSAGE BUBBLE COMPONENT
// -----------------------------------------------------------------------------

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
