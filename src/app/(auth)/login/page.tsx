"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Mail, Lock, ArrowRight, Sparkles } from "lucide-react";
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

      {/* Logo area with decorative ring */}
      <div className="mb-6 sm:mb-8 text-center">
        <div className="flex justify-center mb-3 sm:mb-4">
          <div className="relative">
            {/* Decorative glow behind logo */}
            <div className="absolute inset-0 rounded-full bg-[#2B5F9E]/10 blur-xl scale-150" />
            <div className="relative w-40 h-12 sm:w-52 sm:h-16">
              <Image src="/fulllogo.png" alt="Poornasree AI" fill className="object-contain drop-shadow-[0_0_20px_rgba(43,95,158,0.3)]" priority />
            </div>
          </div>
        </div>

        {/* Tagline with decorative dots */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-4 sm:mb-5">
          <div className="w-5 sm:w-8 h-[1px] bg-gradient-to-r from-transparent to-[#9CCB3B]/40" />
          <p className="text-[8px] sm:text-[9px] font-black tracking-[0.3em] sm:tracking-[0.35em] uppercase text-[#9CCB3B]/90">
            AI-Powered Support Portal
          </p>
          <div className="w-5 sm:w-8 h-[1px] bg-gradient-to-l from-transparent to-[#9CCB3B]/40" />
        </div>

        {/* Decorative separator */}
        <div className="relative">
          <div className="h-[1px] bg-gradient-to-r from-transparent via-[#1e3a6e]/60 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#1e3a6e]/40 border border-[#2B5F9E]/30" />
        </div>

        {/* Welcome text */}
        <div className="mt-5 sm:mt-6">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-1">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#9CCB3B]/60" />
            <h2 className="text-[22px] sm:text-[26px] font-extrabold text-white tracking-tight">
              Welcome back
            </h2>
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#9CCB3B]/60" />
          </div>
          <p className="text-[12px] sm:text-[13px] text-[#5f8bb3]">
            Sign in to your account to continue
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">

        {error && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-950/50 border border-red-500/30 text-red-300 text-xs animate-[shake_0.3s_ease-in-out]">
            <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
            {error}
          </div>
        )}

        {/* Email */}
        <div className="space-y-2.5">
          <label className="block text-[11px] font-bold text-[#4a8cc7] tracking-[0.15em] uppercase pl-1">
            Email address
          </label>
          <div className="relative group">
            {focusedField === "email" && (
              <div className="absolute -inset-[1px] rounded-[14px] bg-gradient-to-r from-[#2B5F9E]/40 via-[#9CCB3B]/20 to-[#2B5F9E]/40 blur-[2px] transition-opacity duration-300" />
            )}
            <div
              className={`relative flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all duration-300 ${
                focusedField === "email"
                  ? "border-[#2B5F9E]/60 bg-[#0c1d36]"
                  : "border-[#152d52] bg-[#080f1f] hover:border-[#1e3a6e] hover:bg-[#0a1525]"
              }`}
            >
              <div className={`p-1.5 rounded-lg transition-all duration-300 ${focusedField === "email" ? "bg-[#2B5F9E]/20" : "bg-[#0f1f35]"}`}>
                <Mail className={`w-3.5 h-3.5 transition-colors duration-300 ${focusedField === "email" ? "text-[#9CCB3B]" : "text-[#2e5682]"}`} />
              </div>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                autoComplete="email"
                required
                className="flex-1 bg-transparent text-[#e2ecf5] text-sm placeholder:text-[#263d5a] focus:outline-none caret-[#9CCB3B]"
              />
              {email && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9CCB3B] animate-pulse" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="space-y-2.5">
          <label className="block text-[11px] font-bold text-[#4a8cc7] tracking-[0.15em] uppercase pl-1">
            Password
          </label>
          <div className="relative group">
            {focusedField === "password" && (
              <div className="absolute -inset-[1px] rounded-[14px] bg-gradient-to-r from-[#2B5F9E]/40 via-[#9CCB3B]/20 to-[#2B5F9E]/40 blur-[2px] transition-opacity duration-300" />
            )}
            <div
              className={`relative flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all duration-300 ${
                focusedField === "password"
                  ? "border-[#2B5F9E]/60 bg-[#0c1d36]"
                  : "border-[#152d52] bg-[#080f1f] hover:border-[#1e3a6e] hover:bg-[#0a1525]"
              }`}
            >
              <div className={`p-1.5 rounded-lg transition-all duration-300 ${focusedField === "password" ? "bg-[#2B5F9E]/20" : "bg-[#0f1f35]"}`}>
                <Lock className={`w-3.5 h-3.5 transition-colors duration-300 ${focusedField === "password" ? "text-[#9CCB3B]" : "text-[#2e5682]"}`} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                autoComplete="current-password"
                required
                className="flex-1 bg-transparent text-[#e2ecf5] text-sm placeholder:text-[#263d5a] focus:outline-none caret-[#9CCB3B]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="p-1.5 rounded-lg bg-[#0f1f35] hover:bg-[#162d4e] text-[#2e5682] hover:text-[#9CCB3B] transition-all duration-200"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Decorative divider */}
        <div className="py-1">
          <div className="relative">
            <div className="h-[1px] bg-gradient-to-r from-transparent via-[#1a3260]/50 to-transparent" />
          </div>
        </div>

        {/* Submit button with shimmer */}
        <div className="relative group">
          <div className="absolute -inset-[1px] rounded-[14px] bg-gradient-to-r from-[#2B5F9E] via-[#3d7cc4] to-[#2B5F9E] opacity-0 group-hover:opacity-50 blur-sm transition-opacity duration-500" />
          <button
            type="submit"
            disabled={loading}
              className="relative w-full overflow-hidden rounded-xl py-3.5 sm:py-4 font-bold text-sm text-white bg-gradient-to-r from-[#2B5F9E] via-[#3068a8] to-[#1d4f8a] border border-[#3d7cc4]/30 transition-all duration-300 hover:shadow-[0_8px_30px_-5px_rgba(43,95,158,0.5)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <span className="relative flex items-center justify-center gap-2.5">
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
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </span>
          </button>
        </div>

        {/* Bottom branding */}
        <div className="pt-2 flex items-center justify-center gap-2">
          <div className="w-4 h-[1px] bg-[#152d52]" />
          <p className="text-[10px] text-[#1e3a5e] font-medium tracking-wider">
            Poornasree AI
          </p>
          <span className="text-[10px] text-[#152d52]">|</span>
          <p className="text-[10px] text-[#1e3a5e] font-medium tracking-wider">
            Technical Support Portal
          </p>
          <div className="w-4 h-[1px] bg-[#152d52]" />
        </div>
      </form>
    </div>
  );
}
