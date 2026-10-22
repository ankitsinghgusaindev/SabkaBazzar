import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, TOKEN_KEY } from "./api";
import type { Me, Role } from "../types";

interface RegisterBody {
  name: string;
  phone: string;
  password: string;
  role: Role;
}

interface AuthValue {
  me: Me | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<Me>;
  register: (body: RegisterBody) => Promise<Me>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>("/me"));
    } catch {
      setMe(null);
      localStorage.removeItem(TOKEN_KEY);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const onLogout = () => setMe(null);
    window.addEventListener("sb:logout", onLogout);
    return () => window.removeEventListener("sb:logout", onLogout);
  }, [refresh]);

  const startSession = async (token: string): Promise<Me> => {
    localStorage.setItem(TOKEN_KEY, token);
    const profile = await api<Me>("/me");
    setMe(profile);
    return profile;
  };

  const login = async (phone: string, password: string) => {
    const res = await api<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    });
    return startSession(res.access_token);
  };

  const register = async (body: RegisterBody) => {
    const res = await api<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return startSession(res.access_token);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setMe(null);
  };

  const value = useMemo(() => ({ me, loading, login, register, logout, refresh }), [me, loading, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function homePath(me: Me): string {
  if (me.role === "admin") return "/admin";
  if (me.role === "customer") return "/customer";
  return me.shop ? "/seller" : "/seller/enroll";
}
