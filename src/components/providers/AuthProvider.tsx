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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const login = useCallback(async (email: string, _password: string) => {
    // TODO: Replace with actual API call
    const mockUser: User = {
      id: "1",
      email,
      firstName: email.split("@")[0],
      role: "admin",
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

  const register = useCallback(async (data: RegisterData) => {
    // TODO: Replace with actual API call
    const mockUser: User = {
      id: "1",
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: "user",
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
