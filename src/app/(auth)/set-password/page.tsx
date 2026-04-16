"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Lock, CheckCircle } from "lucide-react";
import api from "@/lib/api";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword]               = useState("");
  const [confirm, setConfirm]                 = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [error, setError]                     = useState("");
  const [loading, setLoading]                 = useState(false);
  const [success, setSuccess]                 = useState(false);
  const [formVisible, setFormVisible]         = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFormVisible(true), 150);
    return () => clearTimeout(t);
  }, []);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <p className="text-red-600 font-medium">Invalid link. No token found.</p>
          <p className="text-gray-500 text-sm mt-2">Please ask your manager to resend the setup link.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password || !confirm) { setError("Please fill in both fields."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      await api.post("/auth/set-password", { token, password });
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid or expired link. Please ask your manager to resend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ═══════════════════════════════════════════════
          MOBILE VIEW  (< md)
      ═══════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen flex flex-col bg-emerald-700">
        {/* Top brand bar */}
        <div className="flex flex-col items-center pt-12 pb-6 px-6">
          <Image src="/images/logo.png" alt="Poornasree" width={56} height={56} className="rounded-xl mb-3" />
          <h1 className="text-white text-2xl font-bold tracking-tight">Poornasree AI</h1>
          <p className="text-emerald-200 text-sm mt-1">Set your password to get started</p>
        </div>

        {/* Slide-up card */}
        <div
          className={`flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-10 transition-transform duration-500 ${
            formVisible ? "translate-y-0" : "translate-y-full"
          }`}
        >
          {success ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
              <CheckCircle className="w-16 h-16 text-emerald-500" />
              <h2 className="text-xl font-bold text-gray-800">Password Set!</h2>
              <p className="text-gray-500 text-sm text-center">Redirecting to login&hellip;</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">Create Password</h2>
              <p className="text-gray-500 text-sm mb-6">Choose a secure password for your account.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <PasswordField
                  label="New Password"
                  value={password}
                  show={showPassword}
                  onChange={setPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  placeholder="Minimum 8 characters"
                />
                <PasswordField
                  label="Confirm Password"
                  value={confirm}
                  show={showConfirm}
                  onChange={setConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  placeholder="Re-enter your password"
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  {loading ? "Setting password…" : "Set Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          DESKTOP VIEW  (≥ md) — left green panel + right form
      ═══════════════════════════════════════════════ */}
      <div className="hidden md:flex min-h-screen">
        {/* Left green panel */}
        <div className="w-1/2 bg-gradient-to-br from-emerald-700 to-emerald-900 flex flex-col items-center justify-center px-12">
          <Image src="/images/logo.png" alt="Poornasree" width={72} height={72} className="rounded-2xl mb-6" />
          <h1 className="text-white text-3xl font-bold tracking-tight text-center">Poornasree AI</h1>
          <p className="text-emerald-200 text-base mt-3 text-center max-w-xs">
            Set up your account to start receiving and managing service tickets.
          </p>
        </div>

        {/* Right form panel */}
        <div className="w-1/2 flex items-center justify-center bg-gray-50 px-10">
          <div className="w-full max-w-md">
            {success ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <CheckCircle className="w-16 h-16 text-emerald-500" />
                <h2 className="text-2xl font-bold text-gray-800">Password Set!</h2>
                <p className="text-gray-500 text-sm">Redirecting to login&hellip;</p>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-gray-800">Create Password</h2>
                  <p className="text-gray-500 mt-1">Choose a secure password for your Poornasree account.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <PasswordField
                    label="New Password"
                    value={password}
                    show={showPassword}
                    onChange={setPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                    placeholder="Minimum 8 characters"
                  />
                  <PasswordField
                    label="Confirm Password"
                    value={confirm}
                    show={showConfirm}
                    onChange={setConfirm}
                    onToggle={() => setShowConfirm((v) => !v)}
                    placeholder="Re-enter your password"
                  />
                  {error && <p className="text-red-500 text-sm">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
                  >
                    {loading ? "Setting password…" : "Set Password"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Reusable password input ──────────────────────────────────────────────
function PasswordField({
  label,
  value,
  show,
  onChange,
  onToggle,
  placeholder,
}: {
  label: string;
  value: string;
  show: boolean;
  onChange: (v: string) => void;
  onToggle: () => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams requires it in Next.js 14 app router
export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
