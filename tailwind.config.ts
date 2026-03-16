import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Core brand
        primary: {
          DEFAULT: "#2B5F9E",
          hover: "#234D80",
          light: "#F4F7FB",
          50: "#EBF0F7",
          100: "#D6E1EF",
          200: "#ADC3DF",
          300: "#85A5CF",
          400: "#5C87BF",
          500: "#2B5F9E",
          600: "#234D80",
          700: "#1B3B62",
          800: "#132944",
          900: "#0C1726",
        },
        accent: {
          DEFAULT: "#9CCB3B",
          hover: "#88B432",
          light: "#F4F9E8",
          50: "#F4F9E8",
          100: "#E5F2C8",
          200: "#CCE594",
          300: "#B3D860",
          400: "#9CCB3B",
          500: "#7FA832",
          600: "#638529",
          700: "#476220",
          800: "#2B3F17",
          900: "#0F1C0E",
        },
        // Surfaces
        surface: {
          DEFAULT: "#F1F5FA",
          secondary: "#E8EFF9",
          tertiary: "#DCE6F4",
          sidebar: "#FFFFFF",
          input: "#EDF1F8",
          hover: "#EBF0F7",
          card: "#FFFFFF",
          dark: {
            DEFAULT: "#111827",
            secondary: "#1F2937",
            tertiary: "#374151",
            sidebar: "#0F172A",
            input: "#1F2937",
            hover: "#1F2937",
            card: "#1E293B",
          },
        },
        // Text
        content: {
          DEFAULT: "#0F172A",
          secondary: "#475569",
          tertiary: "#94A3B8",
          inverse: "#FFFFFF",
          dark: {
            DEFAULT: "#F9FAFB",
            secondary: "#9CA3AF",
            tertiary: "#6B7280",
          },
        },
        // Chat bubbles
        bubble: {
          user: "#2B5F9E",
          bot: "#EDF2FB",
          dark: {
            user: "#2B5F9E",
            bot: "#1E293B",
          },
        },
        // Borders
        line: {
          DEFAULT: "#C8D5E8",
          dark: "#374151",
        },
        // Status
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 2s linear infinite",
        "bounce-dot": "bounceDot 1.4s infinite ease-in-out both",
        blink: "blink 1s step-end infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        bounceDot: {
          "0%, 80%, 100%": { transform: "scale(0)" },
          "40%": { transform: "scale(1)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
