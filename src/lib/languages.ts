// Shared language configuration used across the application
export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi", flag: "🇮🇳" },
  { code: "mr", label: "Marathi", flag: "🇮🇳" },
  { code: "bn", label: "Bengali", flag: "🇮🇳" },
  { code: "te", label: "Telugu", flag: "🇮🇳" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

// BCP-47 tags used by Web Speech API (STT & TTS)
export const LANG_BCP47: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  te: "te-IN",
};
