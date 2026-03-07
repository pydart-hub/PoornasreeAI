"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  ArrowRight,
  Building2,
  Check,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/components/providers/AuthProvider";

const DEPARTMENTS = [
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
];

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    department: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const passwordStrength = PASSWORD_RULES.filter((r) =>
    r.test(form.password)
  ).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.firstName || !form.email || !form.password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (passwordStrength < PASSWORD_RULES.length) {
      setError("Password does not meet all requirements.");
      return;
    }

    setLoading(true);
    try {
      await register({ email: form.email, password: form.password, firstName: form.firstName, lastName: form.lastName || undefined });
      router.push("/chat");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-content dark:text-content-dark">
          Create account
        </h2>
        <p className="text-content-secondary dark:text-content-dark-secondary mt-1">
          Get started with Poornasree AI
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {/* Error banner */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm animate-fade-in">
            {error}
          </div>
        )}

        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name *"
            placeholder="John"
            value={form.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            leftIcon={<User className="w-4 h-4" />}
            autoComplete="given-name"
            required
          />
          <Input
            label="Last name"
            placeholder="Doe"
            value={form.lastName}
            onChange={(e) => update("lastName", e.target.value)}
            autoComplete="family-name"
          />
        </div>

        {/* Email */}
        <Input
          label="Work email *"
          type="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
          autoComplete="email"
          required
        />

        {/* Department */}
        <div>
          <label className="block text-sm font-medium text-content dark:text-content-dark mb-1.5">
            Department
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-content-secondary dark:text-content-dark-secondary pointer-events-none">
              <Building2 className="w-4 h-4" />
            </div>
            <select
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-line dark:border-line-dark bg-surface-input dark:bg-surface-dark-input text-content dark:text-content-dark text-sm appearance-none cursor-pointer focus-ring transition-colors"
            >
              <option value="">Select department</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Password */}
        <Input
          label="Password *"
          type={showPassword ? "text" : "password"}
          placeholder="Create a strong password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          }
          autoComplete="new-password"
          required
        />

        {/* Password strength */}
        {form.password && (
          <div className="space-y-2 animate-fade-in">
            {/* Strength bar */}
            <div className="flex gap-1">
              {PASSWORD_RULES.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < passwordStrength
                      ? passwordStrength <= 2
                        ? "bg-red-400"
                        : passwordStrength === 3
                        ? "bg-yellow-400"
                        : "bg-accent"
                      : "bg-line dark:bg-line-dark"
                  }`}
                />
              ))}
            </div>

            {/* Rules checklist */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {PASSWORD_RULES.map((rule) => {
                const passed = rule.test(form.password);
                return (
                  <div
                    key={rule.label}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                      passed
                        ? "text-accent-600 dark:text-accent-400"
                        : "text-content-secondary dark:text-content-dark-secondary"
                    }`}
                  >
                    <Check
                      className={`w-3 h-3 ${
                        passed ? "opacity-100" : "opacity-30"
                      }`}
                    />
                    {rule.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Confirm Password */}
        <Input
          label="Confirm password *"
          type={showPassword ? "text" : "password"}
          placeholder="Repeat your password"
          value={form.confirmPassword}
          onChange={(e) => update("confirmPassword", e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          autoComplete="new-password"
          error={
            form.confirmPassword && form.password !== form.confirmPassword
              ? "Passwords do not match"
              : undefined
          }
          required
        />

        {/* Submit */}
        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={loading}
          icon={<ArrowRight className="w-4 h-4" />}
        >
          Create account
        </Button>
      </form>

      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line dark:border-line-dark" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white/80 dark:bg-gray-900/80 text-content-secondary dark:text-content-dark-secondary">
            Already have an account?
          </span>
        </div>
      </div>

      {/* Login link */}
      <Link href="/login" className="block">
        <Button variant="outline" className="w-full" size="lg">
          Sign in instead
        </Button>
      </Link>
    </div>
  );
}
