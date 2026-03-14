"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";
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

      {/* ── Header ── */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2B5F9E] to-[#9CCB3B] mb-4 shadow-lg shadow-[#2B5F9E]/30">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">
          Welcome back
        </h2>
        <p className="text-sm text-white/50 mt-1">
          Sign in to your account to continue
        </p>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
            <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
            {error}
          </div>
        )}

        {/* Email field */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-white/60 tracking-widest uppercase">
            Email address
          </label>
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all duration-200 ${
              focusedField === "email"
                ? "border-[#9CCB3B]/70 bg-white/10 shadow-[0_0_0_3px_rgba(156,203,59,0.12)]"
                : "border-white/15 bg-white/5 hover:border-white/30"
            }`}
          >
            <Mail className={`w-4 h-4 shrink-0 transition-colors duration-200 ${focusedField === "email" ? "text-[#9CCB3B]" : "text-white/30"}`} />
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              autoComplete="email"
              required
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none caret-[#9CCB3B]"
            />
            {email && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#9CCB3B] shrink-0" />
            )}
          </div>
        </div>

        {/* Password field */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-white/60 tracking-widest uppercase">
            Password
          </label>
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all duration-200 ${
              focusedField === "password"
                ? "border-[#9CCB3B]/70 bg-white/10 shadow-[0_0_0_3px_rgba(156,203,59,0.12)]"
                : "border-white/15 bg-white/5 hover:border-white/30"
            }`}
          >
            <Lock className={`w-4 h-4 shrink-0 transition-colors duration-200 ${focusedField === "password" ? "text-[#9CCB3B]" : "text-white/30"}`} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              autoComplete="current-password"
              required
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none caret-[#9CCB3B]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="shrink-0 text-white/30 hover:text-white/70 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="pt-1">
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="relative w-full overflow-hidden rounded-xl py-3.5 font-semibold text-sm text-white bg-gradient-to-r from-[#2B5F9E] to-[#1a4a7d] hover:from-[#3570b5] hover:to-[#2B5F9E] border border-white/10 transition-all duration-300 hover:shadow-xl hover:shadow-[#2B5F9E]/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed group"
        >
          <span className="flex items-center justify-center gap-2">
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

        {/* Bottom note */}
        <p className="text-center text-[11px] text-white/25 pt-1">
          Poornasree AI · Technical Support Portal
        </p>
      </form>
    </div>
  );
}

