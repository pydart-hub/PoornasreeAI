"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/components/providers/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
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
    <div className="animate-fade-in flex flex-col justify-between h-full min-h-[420px]">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-content dark:text-content-dark">
          Welcome back
        </h2>
        <p className="text-content-secondary dark:text-content-dark-secondary mt-2">
          Sign in to continue to Poornasree AI
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-center space-y-8">
        {/* Error banner */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm animate-fade-in">
            {error}
          </div>
        )}

        {/* Email */}
        <Input
          label="Email address"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
          autoComplete="email"
          required
        />

        {/* Password */}
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          autoComplete="current-password"
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
          Sign in
        </Button>
      </form>


    </div>
  );
}
