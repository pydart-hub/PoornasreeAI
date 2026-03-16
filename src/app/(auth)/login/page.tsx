"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);

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
    <>
      {/* ══════════════════════════════════════
          DESKTOP: side-by-side split panel
      ══════════════════════════════════════ */}
      <div className="hidden md:grid md:grid-cols-2 h-full min-h-[calc(100dvh-48px)]">

        {/* Left hero */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden h-full">
          <Image src="/flower.png" alt="" fill className="object-cover" priority />
          <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgba(43,95,158,0.88) 0%, rgba(22,61,110,0.92) 50%, rgba(10,30,60,0.95) 100%)" }} />
          <div className="relative z-10 flex flex-col items-center text-center px-10 py-12">
            <div className="relative w-56 h-16 mb-8">
              <Image src="/fulllogo.png" alt="Poornasree AI" fill className="object-contain brightness-0 invert" priority />
            </div>
            <h2 className="text-3xl font-extrabold text-white mb-3 tracking-tight">Hey! Welcome</h2>
            <p className="text-white/70 text-sm max-w-[260px] leading-relaxed">
              AI-Powered Technical Support Portal for Poornasree Constructions
            </p>
          </div>
        </div>

        {/* Right form */}
        <div className="flex flex-col justify-center h-full px-12 py-14 border-l border-white/[0.06]" style={{ background: "#0b1a2d" }}>
          <h1 className="text-3xl font-extrabold text-white mb-8">Log in</h1>
          {error && (
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
              <span className="shrink-0 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">!</span>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3 border border-white/10 rounded-xl px-4 py-3.5 focus-within:border-[#2B5F9E] transition-colors bg-white/5">
              <svg className="w-4 h-4 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none" />
            </div>
            <div className="flex items-center gap-3 border border-white/10 rounded-xl px-4 py-3.5 focus-within:border-[#2B5F9E] transition-colors bg-white/5">
              <svg className="w-4 h-4 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1} className="shrink-0 text-white/30 hover:text-white/60 transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={showPassword} onChange={() => setShowPassword(!showPassword)} className="w-4 h-4 rounded border-white/20 accent-[#2B5F9E]" />
              <span className="text-sm text-white/50">Show my Password</span>
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-xl py-3.5 font-bold text-sm text-white hover:opacity-90 active:scale-[0.99] disabled:opacity-50 transition-all" style={{ background: "linear-gradient(135deg, #2B5F9E 0%, #1e4f8a 50%, #163d6e 100%)" }}>
              {loading ? "Signing in..." : "Log in"}
            </button>
          </form>
          <p className="text-center text-xs text-white/20 mt-8">Poornasree AI &middot; Technical Support Portal</p>
        </div>
      </div>

      {/* ══════════════════════════════════════
          MOBILE: Spotify-style
      ══════════════════════════════════════ */}
      <div className="md:hidden flex flex-col min-h-[100dvh]" style={{ background: "#04101e" }}>

        {/* Top glow blob */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[340px] h-[340px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(43,95,158,0.3) 0%, transparent 70%)", filter: "blur(60px)" }} />

        {/* Scrollable content */}
        <div className="relative z-10 flex flex-col flex-1 px-8 pt-20 pb-12">

          {/* Logo block */}
          <div className="flex flex-col items-center mb-12">
            <div className="relative w-52 h-[58px]">
              <Image src="/fulllogo.png" alt="Poornasree AI" fill className="object-contain" priority />
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-[2rem] font-black text-white tracking-tight mb-1">
            Log in
          </h1>
          <p className="text-white/40 text-sm mb-10">
            Use your Poornasree account
          </p>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl bg-red-500/10 text-red-400 text-sm">
              <span className="shrink-0 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Email label + input */}
            <div>
              <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Email address</label>
              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full rounded-full px-5 py-4 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#2B5F9E] transition-all"
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
            </div>

            {/* Password label + input */}
            <div>
              <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Password</label>
              <div
                className="flex items-center rounded-full px-5 py-4 focus-within:ring-2 focus-within:ring-[#2B5F9E] transition-all"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1} className="ml-2 text-white/30 hover:text-white/70 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit — big pill */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full py-4 mt-2 font-black text-base tracking-wide text-white disabled:opacity-50 active:scale-95 transition-all duration-200"
              style={{ background: "linear-gradient(135deg, #2B5F9E 0%, #9CCB3B 100%)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in...
                </span>
              ) : "Log in"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-8">
            <div className="flex-1 h-[1px] bg-white/10" />
            <span className="text-xs text-white/30 font-medium">Poornasree AI</span>
            <div className="flex-1 h-[1px] bg-white/10" />
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-white/20">
            &copy; 2025 Pydart Intellicom Pvt. Ltd.
          </p>
        </div>
      </div>
    </>
  );
}
