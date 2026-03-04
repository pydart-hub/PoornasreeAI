"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

// ── Types ──
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  avatarUrl?: string;
  role: string;
  department?: string;
  languagePref?: string;
  themePref?: string;
  permissions?: Record<string, boolean>;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
}

// ── Role → permissions mapping ──
const ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  admin: { all: true },
  service: {
    chat: true,
    "documents.read": true,
    "documents.upload": true,
    "documents.delete": true,
    "users.read_department": true,
    "chats.read_department": true,
    "analytics.department": true,
    "profile.edit": true,
  },
  r_and_d: {
    chat: true,
    "documents.read": true,
    "documents.upload": true,
    "documents.delete": true,
    "users.read_department": true,
    "chats.read_department": true,
    "analytics.department": true,
    "profile.edit": true,
  },
  customer: { chat: true, "profile.edit": true },
};

function enrichUser(raw: Omit<User, "permissions" | "languagePref" | "themePref">): User {
  return {
    ...raw,
    permissions: ROLE_PERMISSIONS[raw.role] || { chat: true },
    languagePref: "en",
    themePref: "system",
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Check for existing session on mount via /api/auth/me
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          const { user } = await res.json();
          setState({
            user: enrichUser(user),
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      })
      .catch(() => {
        setState((s) => ({ ...s, isLoading: false }));
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Invalid email or password.");
    }

    setState({
      user: enrichUser(data.user),
      isAuthenticated: true,
      isLoading: false,
    });

    return enrichUser(data.user);
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || "Registration failed.");
    }

    // Auto-login after successful registration
    await login(data.email, data.password);
  }, [login]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});

    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const setUser = useCallback((user: User) => {
    setState((s) => ({ ...s, user }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
