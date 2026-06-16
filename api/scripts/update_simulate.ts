import fs from "fs";
import path from "path";

const filepath = path.join(__dirname, "../src/services/simulate.service.ts");
let content = fs.readFileSync(filepath, "utf8");

function applyReplacement(name: string, regex: RegExp | string, replacement: string) {
  const matched = typeof regex === "string" ? content.includes(regex) : regex.test(content);
  if (!matched) {
    console.error(`Error: Could not match replacement: ${name}`);
    process.exit(1);
  }
  content = content.replace(regex, replacement);
  console.log(`Success: Applied replacement: ${name}`);
}

// 1. Update SessionMeta language type
applyReplacement(
  "SessionMeta language type",
  /language\?:\s*"en"\s*\|\s*"hi";/,
  "language?:        Lang;"
);

// 2. Add EXTRA_TRANSLATIONS and update LANG_BUTTONS & getMainMenuList
const newLangHelpers = `const EXTRA_TRANSLATIONS: Record<string, Record<Lang, string>> = {
  NEXT_COMPLAINT_PROMPT: {
    en: "Please select your next complaint:",
    hi: "कृपया अपनी अगली शिकायत चुनें:",
    ta: "தயவுசெய்து உங்கள் அடுத்த புகாரைத் தேர்ந்தெடுக்கவும்:",
    kn: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಮುಂದಿನ ದೂರನ್ನು ಆರಿಸಿ:",
    mr: "कृपया आपली पुढील तक्रार निवडा:",
    te: "దయచేసి మీ తదుపరి ఫిర్యాదును ఎంచుకోండి:",
    bn: "অনুগ্রহ করে আপনার পরবর্তী অভিযোগটি নির্বাচন করুন:",
  },
  THANK_YOU: {
    en: "Thank you! Have a great day.",
    hi: "धन्यवाद! आपका दिन शुभ हो।",
    ta: "நன்றி! இனிய நாள் அமையட்டும்.",
    kn: "ಧನ್ಯವಾದಗಳು! ಶುಭ ದಿನವಾಗಿರಲಿ.",
    mr: "धन्यवाद! आपला दिवस चांगला जावो.",
    te: "ధన్యవాదాలు! మీ రోజు బాగుండాలి.",
    bn: "ধন্যবাদ! আপনার দিনটি শুভ হোক।",
  },
  DO_YOU_HAVE_ANOTHER: {
    en: "Do you have another complaint for this machine?",
    hi: "क्या आपको इस मशीन के लिए कोई और शिकायत दर्ज करनी है?",
    ta: "இந்த இயந்திரத்திற்கு வேறு ஏதேனும் புகார் உள்ளதா?",
    kn: "ಈ ಯಂತ್ರಕ್ಕಾಗಿ ನಿಮಗೆ ಮತ್ತೊಂದು ದೂರು ಇದೆಯೇ?",
    mr: "या मशीनसाठी आपल्याकडे दुसरी तक्रार आहे का?",
    te: "ఈ మెషిన్ కోసం మీకు మరొక ఫిర్యాదు ఉందా?",
    bn: "আপনার কি এই মেশিনের জন্য অন্য কোনও অভিযোগ আছে?",
  },
  SELECT_NEXT_COMPLAINT_BUTTON: {
    en: "Select Complaint 📝",
    hi: "शिकायत चुनें 📝",
    ta: "புகாரைத் தேர்ந்தெடுக்கவும் 📝",
    kn: "ದೂರು ಆರಿಸಿ 📝",
    mr: "तक्रार निवडा 📝",
    te: "ఫిర్యాదును ఎంచుకోండి 📝",
    bn: "অভিযোগ নির্বাচন করুন 📝",
  },
  SELECT_CATEGORY_BUTTON: {
    en: "Select Category 📝",
    hi: "श्रेणी चुनें 📝",
    ta: "வகையைத் தேர்ந்தெடுக்கவும் 📝",
    kn: "ವರ್ಗವನ್ನು ಆರಿಸಿ 📝",
    mr: "श्रेणी निवडा 📝",
    te: "వర్గాన్ని ఎంచుకోండి 📝",
    bn: "বিভাগ নির্বাচন করুন 📝",
  },
  YES_ANOTHER_ISSUE: {
    en: "Yes, Another Issue 📝",
    hi: "हाँ, दूसरी शिकायत 📝",
    ta: "ஆம், மற்றொரு பிரச்சினை 📝",
    kn: "ಹೌದು, ಮತ್ತೊಂದು ಸಮಸ್ಯೆ 📝",
    mr: "होय, दुसरी समस्या 📝",
    te: "అవును, మరొక समस्या 📝",
    bn: "হ্যাঁ, অন্য সমস্যা 📝",
  },
  NO_BUTTON: {
    en: "No ❌",
    hi: "नहीं ❌",
    ta: "இல்லை ❌",
    kn: "ಇಲ್ಲ ❌",
    mr: "नाही ❌",
    te: "లేదు ❌",
    bn: "না ❌",
  }
};

function t_extra(key: string, lang: Lang = "en"): string {
  return EXTRA_TRANSLATIONS[key]?.[lang] ?? EXTRA_TRANSLATIONS[key]?.en ?? key;
}

const LANG_BUTTONS: ReplyButton[] = [
  { id: "LANG_EN", title: "🇬🇧 English" },
  { id: "LANG_HI", title: "🇮🇳 हिंदी" },
];

function getLangList(lang: Lang): ReplyList {
  const buttonTexts: Record<Lang, string> = {
    en: "Select Language 🌐",
    hi: "भाषा चुनें 🌐",
    ta: "மொழியைத் தேர்ந்தெடுக்கவும் 🌐",
    kn: "ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ 🌐",
    mr: "भाषा निवडा 🌐",
    te: "భాషను ఎంచుకోండి 🌐",
    bn: "ভাষা নির্বাচন করুন 🌐",
  };
  return {
    buttonText: buttonTexts[lang] || buttonTexts.en,
    rows: [
      { id: "LANG_EN", title: "🇬🇧 English" },
      { id: "LANG_HI", title: "🇮🇳 हिंदी (Hindi)" },
      { id: "LANG_TA", title: "🇮🇳 தமிழ் (Tamil)" },
      { id: "LANG_KN", title: "🇮🇳 ಕನ್ನಡ (Kannada)" },
      { id: "LANG_MR", title: "🇮🇳 मराठी (Marathi)" },
      { id: "LANG_TE", title: "🇮🇳 తెలుగు (Telugu)" },
      { id: "LANG_BN", title: "🇮🇳 বাংলা (Bengali)" },
    ],
  };
}

function getYesResolvedButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "Yes, Resolved ✅",
    hi: "हाँ, हल हुआ ✅",
    ta: "ஆம், தீர்க்கப்பட்டது ✅",
    kn: "ಹೌದು, ಪರಿಹರಿಸಲಾಗಿದೆ ✅",
    mr: "होय, सुटली ✅",
    te: "అవును, పరిష్కరించబడింది ✅",
    bn: "হ্যাঁ, সমাধান হয়েছে ✅",
  };
  return { id: "YES", title: labels[lang] || labels.en };
}

function getNotResolvedButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "Not Resolved ❌",
    hi: "नहीं, हल नहीं हुआ ❌",
    ta: "இல்லை, தீர்க்கப்படவில்லை ❌",
    kn: "ಇಲ್ಲ, ಪರಿಹರಿಸಲಾಗಿಲ್ಲ ❌",
    mr: "नाही, सुटली नाही ❌",
    te: "లేదు, పరిష్కరించబడలేదు ❌",
    bn: "না, সমাধান হয়নি ❌",
  };
  return { id: "NOT_RESOLVED", title: labels[lang] || labels.en };
}

function getBookServiceButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "Book Service 🔧",
    hi: "सेवा बुक करें 🔧",
    ta: "சேவை முன்பதிவு 🔧",
    kn: "ಸೇವೆ ಬುಕ್ ಮಾಡಿ 🔧",
    mr: "सेवा बुक करा 🔧",
    te: "సేవ బుక్ చేయండి 🔧",
    bn: "পরিষেবা বুক করুন 🔧",
  };
  return { id: "BOOK_SERVICE", title: labels[lang] || labels.en };
}

function getNextStepButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "No, Next Step ➡️",
    hi: "नहीं, अगला चरण ➡️",
    ta: "இல்லை, அடுத்த படி ➡️",
    kn: "ಇಲ್ಲ, ಮುಂದಿನ ಹಂತ ➡️",
    mr: "नाही, पुढचे पाऊल ➡️",
    te: "లేదు, తదుపరి దశ ➡️",
    bn: "না, পরবর্তী ধাপ ➡️",
  };
  return { id: "NEXT_STEP", title: labels[lang] || labels.en };
}

function getShowVideoButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "Yes, Show Video 📹",
    hi: "हाँ, वीडियो दिखाएं 📹",
    ta: "ஆம், வீடியோவைக் காட்டு 📹",
    kn: "ಹೌದು, ವೀಡಿಯೊ ತೋರಿಸಿ 📹",
    mr: "होय, व्हिडिओ दाखवा 📹",
    te: "అవును, వీడియో చూపించు 📹",
    bn: "হ্যাঁ, видео দেখান 📹",
  };
  return { id: "YES", title: labels[lang] || labels.en };
}

function getNoBookServiceButton(lang: Lang): ReplyButton {
  const labels: Record<Lang, string> = {
    en: "No, Book Service 🔧",
    hi: "नहीं, सेवा बुक करें 🔧",
    ta: "இல்லை, சேவை முன்பதிவு 🔧",
    kn: "ಇಲ್ಲ, ಸೇವೆ ಬುಕ್ ಮಾಡಿ 🔧",
    mr: "नाही, सेवा बुक करा 🔧",
    te: "లేదు, సేవ బుక్ చేయండి 🔧",
    bn: "না, পরিষেবা বুক করুন 🔧",
  };
  return { id: "NO", title: labels[lang] || labels.en };
}

function getYesAnotherIssueButton(lang: Lang): ReplyButton {
  return { id: "YES", title: EXTRA_TRANSLATIONS.YES_ANOTHER_ISSUE[lang] || EXTRA_TRANSLATIONS.YES_ANOTHER_ISSUE.en };
}

function getNoButton(lang: Lang): ReplyButton {
  return { id: "NO", title: EXTRA_TRANSLATIONS.NO_BUTTON[lang] || EXTRA_TRANSLATIONS.NO_BUTTON.en };
}

function getMainMenuList(lang: Lang): ReplyList {
  const titles: Record<string, Record<Lang, string>> = {
    view_products: {
      en: "View Our Products",
      hi: "हमारे उत्पाद देखें",
      ta: "எங்களது தயாரிப்புகள்",
      kn: "ನಮ್ಮ ಉತ್ಪನ್ನಗಳನ್ನು ವೀಕ್ಷಿಸಿ",
      mr: "आमची उत्पादने पहा",
      te: "मा ఉత్పత్తులను చూడండి",
      bn: "আমাদের পণ্য দেখুন",
    },
    complaint_reg: {
      en: "Complaint Registration",
      hi: "शिकायत दर्ज करें",
      ta: "புகார் பதிவு",
      kn: "ದೂರು ನೋಂದಣಿ",
      mr: "तक्रार नोंदणी",
      te: "ఫిర్యాదు నమోదు",
      bn: "অভিযোগ নিবন্ধন",
    },
    complaint_status: {
      en: "Complaint Status",
      hi: "शिकायत की स्थिति",
      ta: "புகாரின் நிலை",
      kn: "ದೂರಿನ ಸ್ಥಿತಿ",
      mr: "तक्रारीची स्थिती",
      te: "ఫిర్యాదు స్థితి",
      bn: "অভিযোগের স্থিতি",
    },
    speak_support: {
      en: "Speak to Support",
      hi: "सहायता से बात करें",
      ta: "வாடிக்கையாளர் சேவை",
      kn: "ಬೆಂಬಲದೊಂದಿಗೆ ಮಾತನಾಡಿ",
      mr: "सपोर्ट टीमशी बोला",
      te: "మద్దతుతో మాట్లాడండి",
      bn: "সহায়তার সাথে কথা বলুন",
    },
    change_lang: {
      en: "Change Language",
      hi: "भाषा बदलें",
      ta: "மொழியை மாற்றவும்",
      kn: "ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಿ",
      mr: "भाषा बदला",
      te: "భాషను మార్చండి",
      bn: "ভাষা পরিবর্তন করুন",
    }
  };

  const descriptions: Record<string, Record<Lang, string>> = {
    view_products: {
      en: "Browse our product catalog",
      hi: "हमारा उत्पाद कैटलॉग",
      ta: "தயாரிப்பு அட்டவணை",
      kn: "ಉತ್ಪನ್ನ ಕ್ಯಾಟಲಾಗ್",
      mr: "उत्पादन कॅटलॉग",
      te: "ఉత్పత్తి కేటలాగ్",
      bn: "প্রোডাক্ট ক্যাটালগ",
    },
    complaint_reg: {
      en: "Register a new complaint",
      hi: "नई शिकायत दर्ज करें",
      ta: "புதிய புகாரைப் பதிவு செய்யவும்",
      kn: "ಹೊಸ ದೂರನ್ನು ನೋಂದಾಯಿಸಿ",
      mr: "नवीन तक्रार नोंदवा",
      te: "కొత్త ఫిర్యాదును నమోదు చేయండి",
      bn: "নতুন অভিযোগ নথিভুক্ত করুন",
    },
    complaint_status: {
      en: "Check existing ticket status",
      hi: "मौजूदा टिकट जांचें",
      ta: "தற்போதைய புகாரின் நிலையைச் சரிபார்க்கவும்",
      kn: "ಅಸ್ತಿತ್ವದಲ್ಲಿರುವ ದೂರಿನ ಸ್ಥಿತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ",
      mr: "सद्य तिकीट स्थिती तपासा",
      te: "ప్రస్తుత ఫిర్యాదు స్థితిని తనిఖీ చేయండి",
      bn: "বিদ্যমান টিকিট স্থিতি পরীক্ষা করুন",
    },
    speak_support: {
      en: "Connect with our support team",
      hi: "सहायता टीम से जुड़ें",
      ta: "எங்களது ஆதரவுக் குழுவைத் தொடர்பு கொள்ளவும்",
      kn: "ನಮ್ಮ ಬೆಂಬಲ ತಂಡದೊಂದಿಗೆ ಸಂಪರ್ಕ ಸಾಧಿಸಿ",
      mr: "आमच्या सपोर्ट टीमशी संपर्क साधा",
      te: "మా మద్దతు బృందంతో కనెక్ట్ అవ్వండి",
      bn: "আমাদের সহায়তা দলের সাথে সংযোগ করুন",
    },
    change_lang: {
      en: "Change your preferred language",
      hi: "अपनी भाषा बदलें",
      ta: "விரும்பிய மொழியைத் தேர்ந்தெடுக்கவும்",
      kn: "ನಿಮ್ಮ ಆದ್ಯತೆಯ ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಿ",
      mr: "आपली पसंतीची भाषा बदला",
      te: "మీ ప్రాధాన్యత భాషను మార్చండి",
      bn: "আপনার পছন্দের ভাষা পরিবর্তন করুন",
    }
  };

  return {
    buttonText: lang === "hi" ? "विकल्प देखें 📋" : (
      lang === "ta" ? "விருப்பங்கள் 📋" : (
        lang === "kn" ? "ಆಯ್ಕೆಗಳನ್ನು ನೋಡಿ 📋" : (
          lang === "mr" ? "पर्याय पहा 📋" : (
            lang === "te" ? "ఎంపికలను చూడండి 📋" : (
              lang === "bn" ? "বিকল্পগুলি দেখুন 📋" : "View Options 📋"
            )
          )
        )
      )
    ),
    rows: [
      { id: "1", title: titles.view_products[lang] || titles.view_products.en, description: descriptions.view_products[lang] || descriptions.view_products.en },
      { id: "2", title: titles.complaint_reg[lang] || titles.complaint_reg.en, description: descriptions.complaint_reg[lang] || descriptions.complaint_reg.en },
      { id: "3", title: titles.complaint_status[lang] || titles.complaint_status.en, description: descriptions.complaint_status[lang] || descriptions.complaint_status.en },
      { id: "4", title: titles.speak_support[lang] || titles.speak_support.en, description: descriptions.speak_support[lang] || descriptions.speak_support.en },
      { id: "5", title: titles.change_lang[lang] || titles.change_lang.en, description: descriptions.change_lang[lang] || descriptions.change_lang.en },
    ],
  };
}`;

applyReplacement(
  "LANG_BUTTONS and getMainMenuList definitions",
  /const LANG_BUTTONS: ReplyButton\[\] = \[\r?\n\s*\{\s*id:\s*"LANG_EN",\s*title:\s*"🇬🇧 English"\s*\},\r?\n\s*\{\s*id:\s*"LANG_HI",\s*title:\s*"🇮🇳 हिंदी"\s*\},?\r?\n\];\r?\n\r?\nfunction getMainMenuList\(lang: Lang\): ReplyList \{[\s\S]*?\n\}/,
  newLangHelpers
);

// 3. Update choice 5 in handleMainMenu
applyReplacement(
  "Choice 5 in handleMainMenu",
  /if\s*\(choice\s*===\s*"5"\)\s*\{\r?\n\s*await updateSession\(sessionId,\s*"CHANGE_LANGUAGE",\s*meta\);\r?\n\s*return makeReply\(t\("LANG_SELECT",\s*lang\),\s*LANG_BUTTONS\);\r?\n\s*\}/,
  `if (choice === "5") {
    await updateSession(sessionId, "CHANGE_LANGUAGE", meta);
    return makeReply(t("LANG_SELECT", lang), undefined, getLangList(lang));
  }`
);

// 4. Update handleComplaintDescribe steps rendering
const newDescribeSteps = `  const stepsText = steps.map((s: string, i: number) => \`\${i + 1}. \${s}\`).join("\\n");
  const translatedStepsText = await translateText(stepsText, lang);

  await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", updatedMeta);

  return makeReply(
    t("STEPS_FOUND", lang, { steps: translatedStepsText }),
    [
      getYesResolvedButton(lang),
      getNotResolvedButton(lang),
      getMenuButton(lang),
    ]
  );`;

applyReplacement(
  "Steps rendering in handleComplaintDescribe",
  /const stepsText = steps\.map\(\(s:\s*string,\s*i:\s*number\)\s*=>\s*`\$\{i\s*\+\s*1\}\.\s*\$\{s\}`\)\.join\("\\n"\);\r?\n\r?\n\s*await updateSession\(sessionId,\s*"TROUBLESHOOT_DONE_OPTIONS",\s*updatedMeta\);\r?\n\r?\n\s*return makeReply\(\r?\n\s*t\("STEPS_FOUND",\s*lang,\s*\{\s*steps:\s*stepsText\s*\}\),\r?\n\s*\[\r?\n\s*\{\s*id:\s*"YES",\s*title:\s*lang\s*===\s*"hi"\s*\?\s*"हाँ, हल हुआ ✅"\s*:\s*"Yes, Resolved ✅"\s*\},\r?\n\s*\{\s*id:\s*"NOT_RESOLVED",\s*title:\s*lang\s*===\s*"hi"\s*\?\s*"नहीं, हल नहीं हुआ ❌"\s*:\s*"Not Resolved ❌"\s*\},\r?\n\s*getMenuButton\(lang\),\r?\n\s*\]\r?\n\s*\);/,
  newDescribeSteps
);

// 5. Replace handleTroubleshootStep function
const newHandleTroubleshootStep = `async function handleTroubleshootStep(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();
  const steps = meta.tsSteps ?? [];
  const currentStep = meta.tsCurrentStep ?? 1;
  const totalSteps = steps.length;

  if (upper === "YES" || upper === "1") {
    await updateSession(sessionId, "ANOTHER_COMPLAINT_PROMPT", meta);
    return makeReply(
      t("ISSUE_RESOLVED", lang) + "\\n\\n" + t_extra("DO_YOU_HAVE_ANOTHER", lang),
      [
        getYesAnotherIssueButton(lang),
        getNoButton(lang),
        getMenuButton(lang)
      ]
    );
  }

  if (upper === "BOOK_SERVICE" || upper === "3") {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  if (upper === "NEXT_STEP" || upper === "NO" || upper === "2") {
    const nextStep = currentStep + 1;
    if (nextStep > totalSteps) {
      const videos = meta.videoSearchQuery ? await findVideosForQuery(meta.videoSearchQuery, 1) : [];
      if (videos.length > 0) {
        await updateSession(sessionId, "ASK_VIDEO_TUTORIAL", meta);
        return makeReply(
          t("ALL_STEPS_DONE_BASE", lang) + "\\n\\n" + t("ASK_VIDEO_TUTORIAL", lang),
          [
            getShowVideoButton(lang),
            getNoBookServiceButton(lang),
          ]
        );
      }
      // All steps exhausted — fall back to book-service prompt
      await updateSession(sessionId, "TROUBLESHOOT_DONE_OPTIONS", meta);
      return makeReply(
        t("ALL_STEPS_DONE", lang, { total: String(totalSteps) }),
        [getBookServiceButton(lang), getMenuButton(lang)]
      );
    }

    const updatedMeta: SessionMeta = { ...meta, tsCurrentStep: nextStep };
    await updateSession(sessionId, "TROUBLESHOOT_STEP", updatedMeta);

    const buttons: ReplyButton[] = [getYesResolvedButton(lang)];
    if (nextStep < totalSteps) buttons.push(getNextStepButton(lang));
    buttons.push(getBookServiceButton(lang));

    const stepContent = await translateText(steps[nextStep - 1], lang);
    return makeReply(
      t("STEP_DISPLAY", lang, { current: String(nextStep), total: String(totalSteps), step: stepContent }),
      buttons
    );
  }

  // Unrecognised input — re-show current step
  const buttons: ReplyButton[] = [getYesResolvedButton(lang)];
  if (currentStep < totalSteps) buttons.push(getNextStepButton(lang));
  buttons.push(getBookServiceButton(lang));

  const stepContent = await translateText(steps[currentStep - 1] ?? "", lang);
  return makeReply(
    t("STEP_DISPLAY", lang, { current: String(currentStep), total: String(totalSteps), step: stepContent }),
    buttons
  );
}`;

applyReplacement(
  "handleTroubleshootStep function",
  /async function handleTroubleshootStep\(sessionId:\s*string,\s*phoneNumber:\s*string,\s*meta:\s*SessionMeta,\s*text:\s*string\) \{[\s\S]*?\n\}/,
  newHandleTroubleshootStep
);

// 6. Replace handleTroubleshootDoneOptions function
const newHandleTroubleshootDoneOptions = `async function handleTroubleshootDoneOptions(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "YES" || upper === "1") {
    await updateSession(sessionId, "ANOTHER_COMPLAINT_PROMPT", meta);
    return makeReply(
      t("ISSUE_RESOLVED", lang) + "\\n\\n" + t_extra("DO_YOU_HAVE_ANOTHER", lang),
      [
        getYesAnotherIssueButton(lang),
        getNoButton(lang),
        getMenuButton(lang)
      ]
    );
  }

  // "Not Resolved" → show Book Service or Main Menu
  if (upper === "NOT_RESOLVED" || upper === "NO" || upper === "2") {
    const videos = meta.videoSearchQuery ? await findVideosForQuery(meta.videoSearchQuery, 1) : [];
    if (videos.length > 0) {
      await updateSession(sessionId, "ASK_VIDEO_TUTORIAL", meta);
      return makeReply(
        t("ASK_VIDEO_TUTORIAL", lang),
        [
          getShowVideoButton(lang),
          getNoBookServiceButton(lang),
        ]
      );
    }

    await updateSession(sessionId, "ASK_BOOK_SERVICE", meta);
    return makeReply(
      t("ASK_BOOK_SERVICE", lang),
      [
        getBookServiceButton(lang),
        getMenuButton(lang),
      ],
    );
  }

  // Direct Book Service (from NO_STEPS flow where there are no troubleshoot steps)
  if (upper === "BOOK_SERVICE") {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  return makeReply(
    t("SELECT_VALID", lang),
    [
      getYesResolvedButton(lang),
      getNotResolvedButton(lang),
      getMenuButton(lang),
    ]
  );
}`;

applyReplacement(
  "handleTroubleshootDoneOptions function",
  /async function handleTroubleshootDoneOptions\(sessionId:\s*string,\s*phoneNumber:\s*string,\s*meta:\s*SessionMeta,\s*text:\s*string\) \{[\s\S]*?\n\}/,
  newHandleTroubleshootDoneOptions
);

// 7. Replace handleAskVideoTutorial, handleVideoHelped, handleAnotherComplaintPrompt functions
const newVideoPromptAndHelpers = `async function handleAskVideoTutorial(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "YES" || upper === "1") {
    const videos = meta.videoSearchQuery ? await findVideosForQuery(meta.videoSearchQuery, 3) : [];
    if (videos.length === 0) {
      await updateSession(sessionId, "ASK_BOOK_SERVICE", meta);
      return makeReply(
        t("ASK_BOOK_SERVICE", lang),
        [getBookServiceButton(lang), getMenuButton(lang)]
      );
    }

    const videoMessage = formatVideoSuggestions(videos, lang).trim();
    await updateSession(sessionId, "VIDEO_HELPED", meta);

    return makeReply(
      videoMessage + "\\n\\n" + t("ASK_VIDEO_HELPED", lang),
      [
        getYesResolvedButton(lang),
        getNoBookServiceButton(lang),
      ]
    );
  }

  if (upper === "NO" || upper === "2" || upper === "BOOK_SERVICE") {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  return makeReply(
    t("SELECT_VALID", lang),
    [
      getShowVideoButton(lang),
      getNoBookServiceButton(lang),
    ]
  );
}

// ── VIDEO_HELPED ──────────────────────────────────────────────────────────
async function handleVideoHelped(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "YES" || upper === "1") {
    await updateSession(sessionId, "ANOTHER_COMPLAINT_PROMPT", meta);
    return makeReply(
      t("ISSUE_RESOLVED", lang) + "\\n\\n" + t_extra("DO_YOU_HAVE_ANOTHER", lang),
      [
        getYesAnotherIssueButton(lang),
        getNoButton(lang),
        getMenuButton(lang)
      ]
    );
  }

  if (upper === "NO" || upper === "2" || upper === "BOOK_SERVICE") {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  return makeReply(
    t("SELECT_VALID", lang),
    [
      getYesResolvedButton(lang),
      getNoBookServiceButton(lang),
    ]
  );
}

// ── ANOTHER_COMPLAINT_PROMPT ───────────────────────────────────────────────
async function handleAnotherComplaintPrompt(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "YES" || upper === "1") {
    const productName = meta.selectedProduct || meta.machineData?.m_model;
    const listRows = await fetchComplaintListRows(lang, productName, undefined, meta.productCategory);
    const hasSubCategories = listRows.some(r => r.id.startsWith("SUBCAT_"));
    const nextState = hasSubCategories ? "COMPLAINT_SUBCATEGORY" : "COMPLAINT_DESCRIBE";
    
    // Clear the previous complaint data but keep the product and machine data
    const updatedMeta: SessionMeta = { ...meta, complaint: undefined, complaintSubcategory: undefined, tsSteps: undefined, tsCurrentStep: undefined };
    await updateSession(sessionId, nextState, updatedMeta);
    
    return makeReply(
      t_extra("NEXT_COMPLAINT_PROMPT", lang),
      undefined,
      listRows.length > 1 ? { buttonText: hasSubCategories ? t_extra("SELECT_CATEGORY_BUTTON", lang) : t_extra("SELECT_NEXT_COMPLAINT_BUTTON", lang), rows: listRows } : undefined
    );
  }

  if (upper === "NO" || upper === "2") {
    await updateSession(sessionId, "COMPLETED", {});
    return makeReply(t_extra("THANK_YOU", lang), [getMenuButton(lang)]);
  }

  return makeReply(
    t("SELECT_VALID", lang),
    [
      getYesAnotherIssueButton(lang),
      getNoButton(lang),
      getMenuButton(lang)
    ]
  );
}`;

applyReplacement(
  "handleAskVideoTutorial, handleVideoHelped, handleAnotherComplaintPrompt functions",
  /async function handleAskVideoTutorial\(sessionId:\s*string,\s*phoneNumber:\s*string,\s*meta:\s*SessionMeta,\s*text:\s*string\) \{[\s\S]*?async function handleAnotherComplaintPrompt\(sessionId:\s*string,\s*phoneNumber:\s*string,\s*meta:\s*SessionMeta,\s*text:\s*string\) \{[\s\S]*?\n\}/,
  newVideoPromptAndHelpers
);

// 8. Replace handleAskBookService function
const newHandleAskBookService = `async function handleAskBookService(sessionId: string, phoneNumber: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "BOOK_SERVICE" || upper === "1") {
    if (meta.tsSerialPath && meta.machineData) {
      return beginPasstestTicketBooking(sessionId, phoneNumber, meta);
    }
    await updateSession(sessionId, "COMPLAINT_MANUAL_NAME", meta);
    return makeReply(t("ENTER_NAME", lang));
  }

  if (upper === "MENU") {
    return startGreeting(phoneNumber);
  }

  return makeReply(
    t("SELECT_VALID", lang),
    [
      getBookServiceButton(lang),
      getMenuButton(lang),
    ],
  );
}`;

applyReplacement(
  "handleAskBookService function",
  /async function handleAskBookService\(sessionId:\s*string,\s*phoneNumber:\s*string,\s*meta:\s*SessionMeta,\s*text:\s*string\) \{[\s\S]*?\n\}/,
  newHandleAskBookService
);

// 9. Replace handleChangeLanguage function
const newHandleChangeLanguage = `// ── CHANGE_LANGUAGE ───────────────────────────────────────────────────────
async function handleChangeLanguage(sessionId: string, meta: SessionMeta, text: string) {
  const lang: Lang = (meta.language ?? "en") as Lang;
  const upper = text.toUpperCase().trim();

  if (upper === "LANG_EN" || upper === "EN" || upper === "ENGLISH") {
    const newMeta: SessionMeta = { ...meta, language: "en" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_EN", "en") + "\\n\\n" + t("MAIN_MENU_MSG", "en"),
      undefined,
      getMainMenuList("en"),
    );
  }
  if (upper === "LANG_HI" || upper === "HINDI" || text === "हिंदी") {
    const newMeta: SessionMeta = { ...meta, language: "hi" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_HI", "hi") + "\\n\\n" + t("MAIN_MENU_MSG", "hi"),
      undefined,
      getMainMenuList("hi"),
    );
  }
  if (upper === "LANG_TA" || upper === "TAMIL" || text === "தமிழ்") {
    const newMeta: SessionMeta = { ...meta, language: "ta" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_TA", "ta") + "\\n\\n" + t("MAIN_MENU_MSG", "ta"),
      undefined,
      getMainMenuList("ta"),
    );
  }
  if (upper === "LANG_KN" || upper === "KANNADA" || text === "ಕನ್ನಡ") {
    const newMeta: SessionMeta = { ...meta, language: "kn" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_KN", "kn") + "\\n\\n" + t("MAIN_MENU_MSG", "kn"),
      undefined,
      getMainMenuList("kn"),
    );
  }
  if (upper === "LANG_MR" || upper === "MARATHI" || text === "मराठी") {
    const newMeta: SessionMeta = { ...meta, language: "mr" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_MR", "mr") + "\\n\\n" + t("MAIN_MENU_MSG", "mr"),
      undefined,
      getMainMenuList("mr"),
    );
  }
  if (upper === "LANG_TE" || upper === "TELUGU" || text === "తెలుగు") {
    const newMeta: SessionMeta = { ...meta, language: "te" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_TE", "te") + "\\n\\n" + t("MAIN_MENU_MSG", "te"),
      undefined,
      getMainMenuList("te"),
    );
  }
  if (upper === "LANG_BN" || upper === "BENGALI" || text === "বাংলা") {
    const newMeta: SessionMeta = { ...meta, language: "bn" };
    await updateSession(sessionId, "MAIN_MENU", newMeta);
    return makeReply(
      t("LANG_CHANGED_BN", "bn") + "\\n\\n" + t("MAIN_MENU_MSG", "bn"),
      undefined,
      getMainMenuList("bn"),
    );
  }
  if (upper === "CHANGE_LANGUAGE") {
    return makeReply(t("LANG_SELECT", lang), undefined, getLangList(lang));
  }
  // Unrecognized input → waiting-for-input nudge with list
  return makeReply(
    t("WAITING_INPUT", lang),
    [
      getMenuButton(lang),
      { id: "CHANGE_LANGUAGE", title: lang === "hi" ? "🌐 भाषा बदलें" : (
        lang === "ta" ? "🌐 மொழியை மாற்றவும்" : (
          lang === "kn" ? "🌐 ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಿ" : (
            lang === "mr" ? "🌐 भाषा बदला" : (
              lang === "te" ? "🌐 भाषा మార్చండి" : (
                lang === "bn" ? "🌐 ভাষা পরিবর্তন" : "🌐 Change Language"
              )
            )
          )
        )
      ) },
      { id: "CLOSE", title: lang === "hi" ? "❌ बंद करें" : (
        lang === "ta" ? "❌ மூடு" : (
          lang === "kn" ? "❌ ಮುಚ್ಚಿ" : (
            lang === "mr" ? "❌ बंद करा" : (
              lang === "te" ? "❌ మూసివేయి" : (
                lang === "bn" ? "❌ বন্ধ করুন" : "❌ Close"
              )
            )
          )
        )
      ) },
    ]
  );
}`;

applyReplacement(
  "handleChangeLanguage function",
  /\/\/ ── CHANGE_LANGUAGE ───────────────────────────────────────────────────────\r?\nasync function handleChangeLanguage\(sessionId:\s*string,\s*meta:\s*SessionMeta,\s*text:\s*string\) \{[\s\S]*?\n\}/,
  newHandleChangeLanguage
);

fs.writeFileSync(filepath, content, "utf8");
console.log("Successfully updated simulate.service.ts with all multilingual support features!");
