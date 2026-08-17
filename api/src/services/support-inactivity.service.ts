// ── Support Inactivity Auto Turn-On Service ─────────────────────────────────
// Automatically turns the chatbot back ON if a live support session remains
// inactive / still for 2 minutes (120 seconds). Sends a localized WhatsApp notification
// to the customer with an interactive [💬 Talk to Support] button and broadcasts
// real-time Socket.IO events to the customer support dashboard.

import prisma from "../lib/prisma";
import * as WhatsAppService from "./whatsapp.service";
import { io } from "../lib/socket";

export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes (120,000 ms)

// In-memory debounce timers: phoneNumber -> Timeout
const activeTimers = new Map<string, NodeJS.Timeout>();

// Localized customer notification copy
const TIMEOUT_NOTIFICATIONS: Record<
  string,
  {
    body: string;
    supportBtn: string;
    menuBtn: string;
  }
> = {
  en: {
    body: "⏳ *Live support chat ended due to 2 minutes of inactivity.*\n\nOur AI Assistant is now active again and ready to help you.\n\n👉 If you still need help from a human support agent, tap *[💬 Talk to Support]* below.",
    supportBtn: "💬 Talk to Support",
    menuBtn: "🏠 Main Menu",
  },
  ml: {
    body: "⏳ *2 മിനിറ്റ് പ്രതികരണമില്ലാത്തതിനാൽ ലൈവ് സപ്പോർട്ട് ചാറ്റ് അവസാനിച്ചു.*\n\nഞങ്ങളുടെ AI അസിസ്റ്റന്റ് ഇപ്പോൾ വീണ്ടും സജീവമാണ്.\n\n👉 വീണ്ടും സപ്പോർട്ട് ടീമുമായി സംസാരിക്കാൻ താഴെയുള്ള *[💬 Talk to Support]* ബട്ടൺ ക്ലിക്ക് ചെയ്യുക.",
    supportBtn: "💬 Talk to Support",
    menuBtn: "🏠 Main Menu",
  },
  hi: {
    body: "⏳ *2 मिनट तक कोई गतिविधि न होने के कारण लाइव सपोर्ट चैट समाप्त हो गई है।*\n\nहमारा AI सहायक अब पुनः सक्रिय है।\n\n👉 दोबारा सपोर्ट टीम से बात करने के लिए नीचे दिए गए बटन पर टैप करें।",
    supportBtn: "💬 Talk to Support",
    menuBtn: "🏠 Main Menu",
  },
  ta: {
    body: "⏳ *2 நிமிடங்கள் செயலற்ற நிலை காரணமாக நேரலை உதவி அரட்டை முடிவடைந்தது.*\n\nஎங்கள் AI உதவியாளர் மீண்டும் செயலில் உள்ளார்.\n\n👉 மீண்டும் ஆதரவு குழுவுடன் பேச கீழே உள்ள பொத்தானைத் தட்டவும்.",
    supportBtn: "💬 Talk to Support",
    menuBtn: "🏠 Main Menu",
  },
  kn: {
    body: "⏳ *2 ನಿಮಿಷಗಳ ನಿಷ್ಕ್ರಿಯತೆಯ ಕಾರಣ ನೇರ ಬೆಂಬಲ ಚಾಟ್ ಮುಕ್ತಾಯಗೊಂಡಿದೆ.*\n\nನಮ್ಮ AI ಸಹಾಯಕ ಈಗ ಮತ್ತೆ ಸಕ್ರಿಯವಾಗಿದೆ.\n\n👉 ಮತ್ತೆ ಬೆಂಬಲ ತಂಡದೊಂದಿಗೆ ಮಾತನಾಡಲು ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿರಿ.",
    supportBtn: "💬 Talk to Support",
    menuBtn: "🏠 Main Menu",
  },
  te: {
    body: "⏳ *2 నిమిషాల నిష్క్రియాత్మకత కారణంగా లైవ్ సపోర్ట్ చాట్ ముగిసింది.*\n\nమా AI అసిస్టెంట్ ఇప్పుడు మళ్లీ అందుబాటులో ఉంది.\n\n👉 మళ్లీ సపోర్ట్ బృందంతో మాట్లాడటానికి క్రింది బటన్‌ను నొక్కండి.",
    supportBtn: "💬 Talk to Support",
    menuBtn: "🏠 Main Menu",
  },
  mr: {
    body: "⏳ *2 मिनिटे कोणतीही हालचाल न झाल्यामुळे थेट सपोर्ट चॅट समाप्त झाली आहे.*\n\nआमचा AI सहाय्यक आता पुन्हा सक्रिय झाला आहे.\n\n👉 पुन्हा सपोर्ट टीमशी बोलण्यासाठी खालील बटणावर टॅप करा.",
    supportBtn: "💬 Talk to Support",
    menuBtn: "🏠 Main Menu",
  },
  bn: {
    body: "⏳ *২ মিনিট নিষ্ক্রিয় থাকার কারণে লাইভ সাপোর্ট চ্যাট শেষ হয়েছে।*\n\nআমাদের AI সহায়ক এখন আবার সক্রিয়।\n\n👉 আবার সাপোর্ট দলের সাথে কথা বলতে নিচের বোতামে চাপ দিন।",
    supportBtn: "💬 Talk to Support",
    menuBtn: "🏠 Main Menu",
  },
};

/**
 * Call whenever there is activity in a paused support session:
 * - Support agent pauses bot (POST /toggle-bot with isBotPaused: true)
 * - Support agent sends a message (POST /send-message/:phoneNumber)
 * - Customer sends a WhatsApp message while bot is paused
 *
 * Resets the 2-minute countdown timer.
 */
export function touchSupportActivity(phoneNumber: string): void {
  const cleanPhone = phoneNumber.trim();
  if (!cleanPhone) return;

  // Clear any pending timer for this phone
  clearSupportActivity(cleanPhone);

  // Set new 2-minute debounce timer
  const timer = setTimeout(() => {
    resumeBotDueToInactivity(cleanPhone).catch((err) =>
      console.error(`[support-inactivity] Error resuming bot for ${cleanPhone}:`, err)
    );
  }, INACTIVITY_TIMEOUT_MS);

  activeTimers.set(cleanPhone, timer);
  console.log(`[support-inactivity] Timer set: ${cleanPhone} will auto-resume in 2 minutes.`);
}

/**
 * Call when the support agent manually turns the bot back ON.
 * Clears any pending inactivity timers.
 */
export function clearSupportActivity(phoneNumber: string): void {
  const cleanPhone = phoneNumber.trim();
  const existing = activeTimers.get(cleanPhone);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(cleanPhone);
  }
}

/**
 * Automatically resumes the AI chatbot for a given phone number after 2 minutes of inactivity.
 */
export async function resumeBotDueToInactivity(phoneNumber: string): Promise<void> {
  const cleanPhone = phoneNumber.trim();
  clearSupportActivity(cleanPhone);

  try {
    const session = await prisma.conversationSession.findFirst({
      where: { phoneNumber: cleanPhone },
      orderBy: { updatedAt: "desc" },
    });

    if (!session || !session.isBotPaused) {
      // Bot is already active or session doesn't exist
      return;
    }

    // 1. Atomically turn bot back ON in database
    const updatedSession = await prisma.conversationSession.update({
      where: { id: session.id },
      data: { isBotPaused: false },
    });

    console.log(`[support-inactivity] Auto-resumed chatbot for ${cleanPhone} after 2 min timeout.`);

    // 2. Determine customer language preference
    const meta = (session.metadata as Record<string, unknown>) || {};
    const lang = typeof meta.language === "string" && TIMEOUT_NOTIFICATIONS[meta.language]
      ? meta.language
      : "en";

    const copy = TIMEOUT_NOTIFICATIONS[lang] || TIMEOUT_NOTIFICATIONS.en;

    // 3. Send WhatsApp notification with interactive buttons
    const interactiveButtons: WhatsAppService.WaButton[] = [
      { id: "talk_to_support", title: copy.supportBtn },
      { id: "menu", title: copy.menuBtn },
    ];

    const sentInteractive = await WhatsAppService.sendInteractiveButtons(
      cleanPhone,
      copy.body,
      interactiveButtons
    );

    if (!sentInteractive) {
      // Fallback to plain text if interactive buttons are unavailable
      await WhatsAppService.sendMessage(cleanPhone, copy.body).catch(() => {});
    }

    // 4. Save system audit record in database
    const systemMsg = await prisma.simulateMessage.create({
      data: {
        phoneNumber: cleanPhone,
        role: "system",
        content: "Chatbot automatically resumed after 2 minutes of support inactivity",
      },
    });

    // 5. Broadcast real-time Socket.IO events to customer support dashboard
    if (io) {
      io.to("customer_support").emit("support-chat:bot-status", {
        phoneNumber: cleanPhone,
        isBotPaused: false,
        reason: "inactivity_timeout",
        session: updatedSession,
      });

      io.to("customer_support").emit("support-chat:message", {
        phoneNumber: cleanPhone,
        message: systemMsg,
      });
    }
  } catch (error) {
    console.error(`[support-inactivity] Failed to auto-resume bot for ${cleanPhone}:`, error);
  }
}

/**
 * Starts a periodic background scanner (every 15 seconds) to ensure that
 * any paused sessions surviving server restarts or memory resets auto-resume
 * if 2 minutes have elapsed since the last message.
 */
export function startSupportInactivityMonitor(): void {
  const SCAN_INTERVAL_MS = 15 * 1000; // Check every 15s

  setInterval(async () => {
    try {
      const pausedSessions = await prisma.conversationSession.findMany({
        where: { isBotPaused: true },
      });

      if (pausedSessions.length === 0) return;

      const now = Date.now();

      for (const session of pausedSessions) {
        // Find the latest message timestamp for this customer
        const lastMsg = await prisma.simulateMessage.findFirst({
          where: { phoneNumber: session.phoneNumber },
          orderBy: { createdAt: "desc" },
        });

        const lastActivityTime = lastMsg
          ? new Date(lastMsg.createdAt).getTime()
          : new Date(session.updatedAt).getTime();

        const elapsed = now - lastActivityTime;

        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          console.log(
            `[support-inactivity] Scanner detected idle session for ${session.phoneNumber} (${Math.round(
              elapsed / 1000
            )}s idle). Auto-resuming...`
          );
          await resumeBotDueToInactivity(session.phoneNumber);
        } else if (!activeTimers.has(session.phoneNumber)) {
          // If timer was lost (e.g. server restarted), restore remaining timeout
          const remainingMs = INACTIVITY_TIMEOUT_MS - elapsed;
          const timer = setTimeout(() => {
            resumeBotDueToInactivity(session.phoneNumber).catch(() => {});
          }, remainingMs);
          activeTimers.set(session.phoneNumber, timer);
        }
      }
    } catch (err) {
      console.error("[support-inactivity] Background scanner error:", err);
    }
  }, SCAN_INTERVAL_MS);

  console.log("[support-inactivity] Support inactivity monitor started (2 min timeout).");
}
