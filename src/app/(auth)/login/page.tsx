"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Mail, Lock, Monitor, Users, BarChart3 } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

// ── Feature list shown on the left hero panel ─────────────────────────
const FEATURES = [
  {
    icon: <Monitor className="w-4 h-4 text-emerald-300" />,
    title: "AI-Powered Support",
    desc: "Instant answers from trained service documents",
  },
  {
    icon: <Users className="w-4 h-4 text-emerald-300" />,
    title: "Multi-tier Access",
    desc: "Admin → Manager → Engineer → Dealer",
  },
  {
    icon: <BarChart3 className="w-4 h-4 text-emerald-300" />,
    title: "Real-time Ticket Tracking",
    desc: "End-to-end service lifecycle management",
  },
];

// ── Role → route map ──────────────────────────────────────────────────
function roleRoute(role: string): string {
  switch (role) {
    case "admin":            return "/admin";
    case "service":
    case "service_engineer": return "/service";
    case "service_manager":  return "/service-manager";
    case "dealer":           return "/dealer";
    case "customer":         return "/customer";
    case "sales":            return "/sales";
    case "customer_service": return "/customer-service";
    default:                 return "/chat";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [formVisible, setFormVisible]   = useState(false);

  // Trigger slide-up animation on mount (mobile)
  useEffect(() => {
    const t = setTimeout(() => setFormVisible(true), 150);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      router.replace(roleRoute(user.role));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ═══════════════════════════════════════════════
          MOBILE VIEW  (< md)
          Green header → white card slides up from below
      ═══════════════════════════════════════════════ */}
      <div
        className="md:hidden h-[100dvh] flex flex-col overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0d2e1b 0%, #0a2416 50%, #071c10 100%)" }}
      >
        {/* Radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 60% at 20% 80%, rgba(34,197,94,0.12) 0%, transparent 70%)" }}
        />

        {/* Green hero — sits above the white card, never overlaps */}
        <div className="relative z-10 shrink-0 flex flex-col items-center gap-3 pt-12 pb-8 px-6">
          <div className="relative w-14 h-14">
            <Image src="/flower.png" alt="Poornasree" fill className="object-contain" priority />
          </div>
          <div className="text-center">
            <p className="text-xl font-black text-white">Poornasree®</p>
            <p className="text-[10px] tracking-[0.2em] text-white/40 uppercase mt-0.5">Equipments</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-600/40 bg-emerald-900/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-300 font-medium">AI-Powered Service Platform</span>
          </div>
        </div>

        {/* White form card — slides up from below the green area */}
        <div
          className={[
            "relative z-10 flex-1 bg-white rounded-[2rem] mx-2 mb-2 px-6 pt-6 pb-8 flex flex-col overflow-y-auto",
            "transition-transform duration-700 ease-out",
            formVisible ? "translate-y-0" : "translate-y-full",
          ].join(" ")}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 rounded-full bg-gray-200 self-center mb-6 shrink-0" />

          <h2 className="text-2xl font-bold text-gray-900 mb-1 shrink-0">Welcome back</h2>
          <p className="text-sm text-gray-400 mb-6 shrink-0">Sign in to continue</p>

          {error && (
            <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm shrink-0">
              <span className="shrink-0 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email or Username</label>
              <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition-all bg-white">
                <Mail className="w-4 h-4 text-gray-300 shrink-0" />
                <input
                  type="text"
                  placeholder="you@example.com or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition-all bg-white">
                <Lock className="w-4 h-4 text-gray-300 shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="text-gray-300 hover:text-gray-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <button type="button" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                  Forgot password?
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.99] disabled:opacity-60"
              style={{ background: loading ? "#9ca3af" : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : "Sign In"}
            </button>
          </form>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          DESKTOP VIEW  (md+) — unchanged
      ═══════════════════════════════════════════════ */}
      <div className="hidden md:flex min-h-[100dvh]">

        {/* LEFT – dark green hero panel */}
        <div
          className="relative flex flex-col justify-between px-8 py-8 md:px-12 md:py-14
                     md:w-[44%] lg:w-[42%] xl:w-[40%] shrink-0 overflow-hidden"
          style={{ background: "linear-gradient(160deg, #0d2e1b 0%, #0a2416 50%, #071c10 100%)" }}
        >
          {/* Subtle radial glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 80% 60% at 20% 80%, rgba(34,197,94,0.10) 0%, transparent 70%)" }}
          />

          {/* Top content */}
          <div className="relative z-10 flex flex-col gap-5">
            {/* Live badge */}
            <div className="flex items-center gap-2 w-fit px-3 py-1.5 rounded-full border border-emerald-600/40 bg-emerald-900/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-300 font-medium">Live at poornasree.pydart.com</span>
            </div>

            {/* Headline */}
            <div className="mt-1">
              <h1 className="text-3xl md:text-4xl xl:text-5xl font-black leading-tight tracking-tight text-white">
                AI-Powered
              </h1>
              <h1 className="text-3xl md:text-4xl xl:text-5xl font-black leading-tight tracking-tight text-emerald-400">
                Service Platform
              </h1>
            </div>

            {/* Subtitle */}
            <p className="text-sm text-white/50 leading-relaxed max-w-xs">
              Smart equipment ticketing, AI chat support, and complete service lifecycle management for Poornasree Equipments.
            </p>

            {/* Feature cards */}
            <div className="flex flex-col gap-3 mt-1">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-900/60 flex items-center justify-center shrink-0 mt-0.5">
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-xs text-white/40 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: copyright */}
          <div className="relative z-10 mt-10">
            <p className="text-xs text-white/20">© 2026 Pydart Intellicom Pvt. Ltd.</p>
          </div>
        </div>

        {/* RIGHT – white form panel */}
        <div className="flex-1 flex flex-col items-center justify-center bg-white px-6 py-10 md:px-14 lg:px-20">
          <div className="w-full max-w-md">

            {/* Logo */}
            <div className="flex flex-col items-center mb-7">
              <div className="relative w-11 h-11 mb-2.5">
                <Image src="/flower.png" alt="Poornasree" fill className="object-contain" priority />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-gray-800 leading-none">Poornasree®</p>
                <p className="text-[10px] tracking-[0.2em] text-gray-400 uppercase mt-0.5">Equipments</p>
              </div>
            </div>

            {/* Heading */}
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">Welcome back</h2>
            <p className="text-sm text-gray-400 text-center mb-7">Sign in to your account to continue</p>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
                <span className="shrink-0 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email or Username
                </label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition-all bg-white">
                  <Mail className="w-4 h-4 text-gray-300 shrink-0" />
                  <input
                    type="text"
                    placeholder="you@example.com or username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition-all bg-white">
                  <Lock className="w-4 h-4 text-gray-300 shrink-0" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end mt-1.5">
                  <button type="button" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                    Forgot password?
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.99] disabled:opacity-60"
                style={{ background: loading ? "#9ca3af" : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : "Sign In"}
              </button>
            </form>


          </div>
        </div>
      </div>
    </>
  );
}
