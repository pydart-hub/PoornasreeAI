"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, Monitor, Users, BarChart3 } from "lucide-react";
import { Logo } from "@/components/ui";
import { useAuth } from "@/components/providers/AuthProvider";

// ── Feature list shown on the left hero panel ─────────────────────────
const FEATURES = [
  {
    icon: <Monitor className="w-4 h-4 text-primary-300" />,
    title: "AI-Powered Support",
    desc: "Instant answers from trained service documents",
  },
  {
    icon: <Users className="w-4 h-4 text-primary-300" />,
    title: "Multi-tier Access",
    desc: "Admin → Manager → Engineer → Dealer",
  },
  {
    icon: <BarChart3 className="w-4 h-4 text-primary-300" />,
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
    case "assistant_service_manager": return "/assistant-manager";
    case "dealer":           return "/dealer";
    case "customer":         return "/customer";
    case "sales":            return "/sales";
    case "marketing":        return "/marketing";
    case "customer_service": return "/customer-service";
    case "customer_support": return "/support-dashboard";
    default:                 return "/";
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
        className="md:hidden h-[100dvh] flex flex-col overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950"
      >
        {/* Radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 60% at 20% 80%, rgba(0,82,157,0.15) 0%, transparent 70%)" }}
        />

        {/* Green hero — sits above the white card, never overlaps */}
        <div className="relative z-10 shrink-0 flex flex-col items-center justify-center gap-4 pt-10 pb-6 px-4">
          <div className="scale-[1.15] mb-2">
            <Logo variant="brand" size="md" priority />
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-[11px] text-primary-100 font-medium tracking-wide">AI-Powered Service Platform</span>
          </div>
        </div>

        {/* White form card — bottom sheet style */}
        <div
          className={[
            "relative z-10 flex-1 bg-white rounded-t-[2rem] px-6 pt-5 pb-8 flex flex-col overflow-y-auto font-sans shadow-[0_-10px_40px_rgba(0,0,0,0.2)]",
            "transition-transform duration-700 ease-out",
            formVisible ? "translate-y-0" : "translate-y-full",
          ].join(" ")}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 rounded-full bg-gray-200 self-center mb-5 shrink-0" />

          <h2 className="text-2xl font-bold font-sans text-gray-900 mb-1 shrink-0 tracking-tight">Welcome Back</h2>
          <p className="text-sm font-sans text-gray-500 mb-5 shrink-0">Sign in to your account to continue</p>

          {error && (
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm shrink-0 shadow-sm">
              <span className="shrink-0 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[11px] font-bold shadow-sm">!</span>
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email or Username</label>
              <div className="flex items-center gap-3 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all bg-slate-50 hover:bg-white">
                <Mail className="w-5 h-5 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="you@example.com or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="flex-1 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <div className="flex items-center gap-3 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all bg-slate-50 hover:bg-white">
                <Lock className="w-5 h-5 text-gray-400 shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="flex-1 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              <div className="flex justify-between items-center mt-3 px-1">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 transition-colors" />
                  <span className="text-[13px] text-gray-600 group-hover:text-gray-900 transition-colors font-medium">Remember me</span>
                </label>
                <button type="button" className="text-[13px] text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                  Forgot password?
                </button>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className={["w-full py-3.5 rounded-2xl font-bold text-[15px] text-white transition-all active:scale-[0.98] disabled:opacity-60", loading ? "bg-gray-400" : "bg-primary hover:bg-primary-hover hover:-translate-y-0.5 hover:shadow-xl shadow-primary/30"].join(" ")}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : "Sign In"}
              </button>
            </div>
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
                     md:w-[44%] lg:w-[42%] xl:w-[40%] shrink-0 overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900"
        >
          {/* Subtle radial glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 80% 60% at 20% 80%, rgba(0,82,157,0.10) 0%, transparent 70%)" }}
          />

          {/* Top content */}
          <div className="relative z-10 flex flex-col gap-5">
            {/* Live badge */}
            <div className="flex items-center gap-2 w-fit px-3 py-1.5 rounded-full border border-primary-600/40 bg-primary-900/30">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
              <span className="text-xs text-primary-300 font-medium">Live at ai.poornasreecloud.com</span>
            </div>

            {/* Headline */}
            <div className="mt-1">
              <h1 className="text-3xl md:text-4xl xl:text-5xl font-black leading-tight tracking-tight text-white">
                AI-Powered
              </h1>
              <h1 className="text-3xl md:text-4xl xl:text-5xl font-black leading-tight tracking-tight text-primary-300">
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
                  <div className="w-7 h-7 rounded-lg bg-primary-900/60 flex items-center justify-center shrink-0 mt-0.5">
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
        </div>

        {/* RIGHT – white form panel */}
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 px-6 py-10 md:px-14 lg:px-20 font-sans">
          <div className="w-full max-w-md">

            {/* Logo + welcome — grouped with consistent spacing */}
            <div className="flex flex-col items-center text-center mb-6">
              <Logo variant="brand" size="md" priority />
              <div className="mt-4 w-full">
                <h2 className="text-xl font-semibold text-gray-900">Welcome to</h2>
                <p className="text-sm text-gray-500 mt-1">Sign in to your account to continue</p>
              </div>
            </div>

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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email or Username</label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 transition-all bg-white shadow-sm hover:border-gray-300">
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
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 transition-all bg-white shadow-sm hover:border-gray-300">
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
                <div className="flex justify-between items-center mt-2 px-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary/30 transition-colors" />
                    <span className="text-xs text-gray-600 group-hover:text-gray-800 transition-colors">Remember me</span>
                  </label>
                  <button type="button" className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors">
                    Forgot password?
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className={["w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.99] disabled:opacity-60", loading ? "bg-gray-400" : "bg-primary hover:bg-primary-hover hover:-translate-y-0.5 hover:shadow-lg shadow-primary/25"].join(" ")}
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
