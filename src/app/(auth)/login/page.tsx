"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const user = await login(email, password);
      const role = user.role;
      if (role === "customer")              router.replace("/customer");
      else if (role === "admin")            router.replace("/admin");
      else if (role === "service")          router.replace("/service");
      else if (role === "sales")            router.replace("/sales");
      else if (role === "customer_service") router.replace("/customer-service");
      else                                  router.replace("/chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full select-none">

      {/* ── Brand header ── */}
      <div className="flex flex-col items-center mb-7 sm:mb-8">

        {/* Icon badge: flogo inside a glowing ring */}
        <div className="relative mb-4">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(43,95,158,0.35) 0%, transparent 70%)", filter: "blur(14px)", transform: "scale(1.6)" }}
          />
          <div
            className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border border-white/10"
            style={{ background: "linear-gradient(145deg, rgba(43,95,158,0.3) 0%, rgba(5,14,28,0.8) 100%)" }}
          >
            <div className="relative w-8 h-8 sm:w-9 sm:h-9">
              <Image src="/flogo.png" alt="" fill className="object-contain" priority />
            </div>
          </div>
        </div>

        {/* Full logo wordmark */}
        <div className="relative w-40 h-11 sm:w-52 sm:h-14 mb-3">
          <Image
            src="/fulllogo.png"
            alt="Poornasree AI"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Tagline */}
        <div className="flex items-center gap-2">
          <span className="block w-6 h-[1px] bg-gradient-to-r from-transparent to-[#9CCB3B]/50" />
          <p className="text-[9px] font-bold tracking-[0.3em] uppercase text-[#9CCB3B]/70">
            AI-Powered Support Portal
          </p>
          <span className="block w-6 h-[1px] bg-gradient-to-l from-transparent to-[#9CCB3B]/50" />
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="mb-6 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* ── Welcome ── */}
      <div className="text-center mb-6 sm:mb-7">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-white/40">
          Sign in to your account to continue
        </p>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
            <span className="shrink-0 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[9px] font-bold">!</span>
            {error}
          </div>
        )}

        {/* Email */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4a8cc7]/80 mb-2 pl-1">
            Email address
          </label>
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all duration-200"
            style={{
              background: focusedField === "email" ? "rgba(43,95,158,0.12)" : "rgba(255,255,255,0.04)",
              border: focusedField === "email" ? "1px solid rgba(43,95,158,0.5)" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: focusedField === "email" ? "0 0 0 3px rgba(43,95,158,0.1)" : "none",
            }}
          >
            <Mail className="w-4 h-4 shrink-0" style={{ color: focusedField === "email" ? "#9CCB3B" : "rgba(255,255,255,0.25)" }} />
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              autoComplete="email"
              required
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/20 focus:outline-none caret-[#9CCB3B]"
            />
            {email && <span className="w-1.5 h-1.5 rounded-full bg-[#9CCB3B] shrink-0 animate-pulse" />}
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4a8cc7]/80 mb-2 pl-1">
            Password
          </label>
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all duration-200"
            style={{
              background: focusedField === "password" ? "rgba(43,95,158,0.12)" : "rgba(255,255,255,0.04)",
              border: focusedField === "password" ? "1px solid rgba(43,95,158,0.5)" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: focusedField === "password" ? "0 0 0 3px rgba(43,95,158,0.1)" : "none",
            }}
          >
            <Lock className="w-4 h-4 shrink-0" style={{ color: focusedField === "password" ? "#9CCB3B" : "rgba(255,255,255,0.25)" }} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              autoComplete="current-password"
              required
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/20 focus:outline-none caret-[#9CCB3B]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="shrink-0 text-white/25 hover:text-white/60 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="relative w-full overflow-hidden rounded-xl py-3.5 sm:py-4 font-bold text-sm text-white transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed group"
            style={{
              background: "linear-gradient(135deg, #2B5F9E 0%, #1e4f8a 50%, #163d6e 100%)",
              boxShadow: "0 4px 24px rgba(43,95,158,0.35)",
              border: "1px solid rgba(43,95,158,0.4)",
            }}
          >
            {/* shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <span className="relative flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                </>
              )}
            </span>
          </button>
        </div>

        {/* Footer note */}
        <p className="text-center text-[10px] text-white/15 pt-1">
          Poornasree AI &middot; Technical Support Portal
        </p>
      </form>
    </div>
  );
}
