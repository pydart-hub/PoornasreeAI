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
  languagePref: string;
  themePref: string;
  permissions: Record<string, boolean>;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
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

// ── Mock credential store (replace with real API later) ──
const MOCK_USERS: Array<{ email: string; password: string; user: User }> = [
  {
    email: "admin@poornasree.com",
    password: "Admin@123",
    user: {
      id: "usr_001",
      email: "admin@poornasree.com",
      firstName: "Admin",
      lastName: "Poornasree",
      role: "admin",
      department: "Administration",
      languagePref: "en",
      themePref: "system",
      permissions: { all: true },
    },
  },
  {
    email: "service@poornasree.com",
    password: "Service@123",
    user: {
      id: "usr_002",
      email: "service@poornasree.com",
      firstName: "Rajan",
      lastName: "Kumar",
      role: "service",
      department: "Service",
      languagePref: "en",
      themePref: "system",
      permissions: {
        chat: true,
        "documents.read": true,
        "documents.upload": true,
        "documents.delete": true,
        "users.read_department": true,
        "chats.read_department": true,
        "analytics.department": true,
        "profile.edit": true,
      },
    },
  },
  {
    email: "rd@poornasree.com",
    password: "RnD@123",
    user: {
      id: "usr_003",
      email: "rd@poornasree.com",
      firstName: "Priya",
      lastName: "Sharma",
      role: "r_and_d",
      department: "R&D",
      languagePref: "en",
      themePref: "system",
      permissions: {
        chat: true,
        "documents.read": true,
        "documents.upload": true,
        "documents.delete": true,
        "users.read_department": true,
        "chats.read_department": true,
        "analytics.department": true,
        "profile.edit": true,
      },
    },
  },
  {
    email: "customer@example.com",
    password: "Customer@123",
    user: {
      id: "usr_005",
      email: "customer@example.com",
      firstName: "Amit",
      lastName: "Patel",
      role: "customer",
      department: "Customer",
      languagePref: "en",
      themePref: "system",
      permissions: { chat: true },
    },
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Check for existing session on mount
  useEffect(() => {
    const stored = localStorage.getItem("poornasree_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setState({
          user,
          accessToken: localStorage.getItem("poornasree_token"),
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 600));

    const match = MOCK_USERS.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (!match) {
      throw new Error("Invalid email or password. Please try again.");
    }

    const mockToken = `mock-jwt-${match.user.role}-${Date.now()}`;

    localStorage.setItem("poornasree_user", JSON.stringify(match.user));
    localStorage.setItem("poornasree_token", mockToken);

    setState({
      user: match.user,
      accessToken: mockToken,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 600));
    // TODO: Replace with actual API call
    const mockUser: User = {
      id: crypto.randomUUID(),
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: "user",
      permissions: { chat: true, "documents.read": true, "profile.edit": true },
      languagePref: "en",
      themePref: "system",
    };
    const mockToken = "mock-jwt-token";

    localStorage.setItem("poornasree_user", JSON.stringify(mockUser));
    localStorage.setItem("poornasree_token", mockToken);

    setState({
      user: mockUser,
      accessToken: mockToken,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("poornasree_user");
    localStorage.removeItem("poornasree_token");
    setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const setUser = useCallback((user: User) => {
    localStorage.setItem("poornasree_user", JSON.stringify(user));
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
