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
    <div className="relative w-full select-none text-center">

      {/* Logo */}
      <div className="mb-6 sm:mb-8">
        <div className="flex justify-center mb-4">
          <div className="relative w-44 h-12 sm:w-56 sm:h-16">
            <Image
              src="/fulllogo.png"
              alt="Poornasree AI"
              fill
              className="object-contain drop-shadow-[0_2px_15px_rgba(255,255,255,0.15)]"
              priority
            />
          </div>
        </div>
        <p className="text-[9px] sm:text-[10px] font-bold tracking-[0.35em] uppercase text-[#9CCB3B]/80">
          AI-Powered Support Portal
        </p>
      </div>

      {/* Welcome heading */}
      <div className="mb-8 sm:mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-lg">
          Welcome Back!
        </h1>
        <p className="mt-2 text-sm sm:text-base text-white/50">
          Sign in to your account to continue
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 max-w-sm mx-auto">

        {error && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/15 backdrop-blur-sm border border-red-500/25 text-red-200 text-xs text-left">
            <span className="shrink-0 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
            {error}
          </div>
        )}

        {/* Email field */}
        <div
          className={`flex items-center gap-3 rounded-xl border backdrop-blur-md px-4 py-3.5 sm:py-4 transition-all duration-300 ${
            focusedField === "email"
              ? "border-white/40 bg-white/15"
              : "border-white/20 bg-white/8 hover:bg-white/12 hover:border-white/30"
          }`}
        >
          <Mail className={`w-5 h-5 shrink-0 transition-colors duration-200 ${focusedField === "email" ? "text-white/80" : "text-white/40"}`} />
          <input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            autoComplete="email"
            required
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/35 focus:outline-none caret-white"
          />
        </div>

        {/* Password field */}
        <div
          className={`flex items-center gap-3 rounded-xl border backdrop-blur-md px-4 py-3.5 sm:py-4 transition-all duration-300 ${
            focusedField === "password"
              ? "border-white/40 bg-white/15"
              : "border-white/20 bg-white/8 hover:bg-white/12 hover:border-white/30"
          }`}
        >
          <Lock className={`w-5 h-5 shrink-0 transition-colors duration-200 ${focusedField === "password" ? "text-white/80" : "text-white/40"}`} />
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            autoComplete="current-password"
            required
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/35 focus:outline-none caret-white"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            className="shrink-0 text-white/30 hover:text-white/70 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
          </button>
        </div>

        {/* Sign in button */}
        <div className="pt-2 sm:pt-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 sm:py-4 rounded-xl font-bold text-sm uppercase tracking-[0.15em] text-white border-2 border-white/30 bg-white/5 backdrop-blur-sm hover:bg-white/15 hover:border-white/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <span className="flex items-center justify-center gap-2.5">
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
                  Sign In
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </span>
          </button>
        </div>

        {/* Bottom text */}
        <p className="text-[11px] text-white/20 pt-2">
          Poornasree AI &middot; Technical Support Portal
        </p>
      </form>
    </div>
  );
}
