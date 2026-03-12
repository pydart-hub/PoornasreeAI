"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Eye, EyeOff, Mail, Lock, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

/* ── tiny helpers ── */
function FloatingOrb({
  className, style,
}: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`absolute rounded-full pointer-events-none blur-3xl opacity-30 ${className}`}
      style={style}
    />
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const user = await login(email, password);
      const role = user.role;
      if (role === "customer")       router.replace("/customer");
      else if (role === "admin")     router.replace("/admin");
      else if (role === "service")   router.replace("/service");
      else if (role === "sales")     router.replace("/sales");
      else if (role === "customer_service") router.replace("/customer-service");
      else                           router.replace("/chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full select-none overflow-hidden">

      {/* ── Animated background orbs ── */}
      <FloatingOrb
        className="w-32 h-32 sm:w-64 sm:h-64 bg-blue-400 animate-float-a -top-8 -right-8 sm:-top-16 sm:-right-16"
      />
      <FloatingOrb
        className="w-24 h-24 sm:w-48 sm:h-48 bg-green-400 animate-float-b -bottom-4 -left-6 sm:-bottom-8 sm:-left-12"
      />
      <FloatingOrb
        className="w-20 h-20 sm:w-32 sm:h-32 bg-purple-400 animate-float-c top-1/2 left-1/2 -translate-x-1/2"
      />

      {/* ── Brand header ── */}
      <div className="animate-fade-up delay-100 mb-5 sm:mb-7">
        <p className="text-xs font-black tracking-[0.3em] uppercase text-[#9CCB3B] mb-1">
          Welcome back
        </p>
        <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
          Sign in to{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7eb8ff] to-[#9CCB3B]">
            Poornasree AI
          </span>
        </h2>
        <p className="text-xs text-white/60 mt-0.5">
          Technical Support Assistant Portal
        </p>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="relative space-y-4">

        {/* Error banner */}
        {error && (
          <div className="animate-fade-up p-3 rounded-xl bg-red-50/80 dark:bg-red-950/40 border border-red-200/70 dark:border-red-800/50 backdrop-blur-sm text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
            <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
            {error}
          </div>
        )}

        {/* Email field */}
        <div className="animate-fade-up delay-200 space-y-1.5">
          <label className="block text-xs font-semibold text-white/80 tracking-wide">
            Email address
          </label>
          <div
            className={`relative flex items-center rounded-2xl border transition-all duration-300 ${
              focusedField === "email"
                ? "border-[#2B5F9E] shadow-[0_0_0_3px_rgba(43,95,158,0.12)] bg-white dark:bg-white/10"
                : "border-white/40 dark:border-white/10 bg-white/50 dark:bg-white/5"
            }`}
          >
            <span className={`pl-4 transition-colors duration-200 ${focusedField === "email" ? "text-[#2B5F9E]" : "text-gray-400"}`}>
              <Mail className="w-4 h-4" />
            </span>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              autoComplete="email"
              required
              className="w-full py-3.5 px-3 text-base sm:text-sm bg-transparent text-white placeholder:text-white/50 focus:outline-none"
            />
            {/* Active indicator dot */}
            {email && (
              <span className="mr-4 w-2 h-2 rounded-full bg-[#9CCB3B] animate-pulse-ring shrink-0" />
            )}
          </div>
        </div>

        {/* Password field */}
        <div className="animate-fade-up delay-300 space-y-1.5">
          <label className="block text-xs font-semibold text-white/80 tracking-wide">
            Password
          </label>
          <div
            className={`relative flex items-center rounded-2xl border transition-all duration-300 ${
              focusedField === "password"
                ? "border-[#2B5F9E] shadow-[0_0_0_3px_rgba(43,95,158,0.12)] bg-white dark:bg-white/10"
                : "border-white/40 dark:border-white/10 bg-white/50 dark:bg-white/5"
            }`}
          >
            <span className={`pl-4 transition-colors duration-200 ${focusedField === "password" ? "text-[#2B5F9E]" : "text-gray-400"}`}>
              <Lock className="w-4 h-4" />
            </span>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              autoComplete="current-password"
              required
              className="w-full py-3.5 px-3 text-base sm:text-sm bg-transparent text-white placeholder:text-white/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="mr-4 text-gray-400 hover:text-[#2B5F9E] dark:hover:text-[#9CCB3B] transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit button */}
        <div className="animate-fade-up delay-400 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="relative w-full overflow-hidden rounded-2xl py-3.5 font-semibold text-sm text-white transition-all duration-300 hover:shadow-lg hover:shadow-[#2B5F9E]/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed shimmer-btn group"
          >
            <span className="relative flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </span>
          </button>
        </div>
      </form>


    </div>
  );
}

