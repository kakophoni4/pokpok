import type {
  LoginTicketOutcome,
  LoginTicketStatus,
  MeUser,
  SessionResponse,
  StartLoginResponse,
  UserRole,
} from "@poker/contracts";
import { hasRole } from "@poker/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, refreshSession, setAccessToken } from "../lib/api";
import { platform } from "../platform/platform";

type AuthState = {
  user: MeUser | null;
  status: "loading" | "authenticated" | "anonymous";
  can: (role: UserRole) => boolean;
  loginWithTelegramWidget: (payload: Record<string, unknown>) => Promise<void>;
  /** Opens a ticket to confirm in the bot; returns the deep link to follow. */
  startTelegramLogin: () => Promise<StartLoginResponse>;
  /** Asks whether the tap happened. A confirmed ticket signs us in on the spot. */
  pollTelegramLogin: (code: string) => Promise<LoginTicketOutcome>;
  loginAsDev: (nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const queryClient = useQueryClient();

  const applySession = useCallback(
    (session: SessionResponse) => {
      setAccessToken(session.accessToken);
      setUser(session.user);
      setStatus("authenticated");
      // Server responses embed "my registration" flags, so they must be refetched.
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  /**
   * Restores a session on load. Inside Telegram we can authenticate silently
   * from initData; on the web we rely on the refresh cookie.
   */
  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      platform.ready();
      const initData = (await platform.telegramInitDataSoon()) ?? platform.telegramInitData();

      if (initData) {
        try {
          const session = await api.post<SessionResponse>("/auth/telegram/miniapp", { initData });
          if (!cancelled) applySession(session);
          return;
        } catch {
          // Fall through to the cookie path below.
        }
      }

      const restored = await refreshSession();
      if (cancelled) return;

      if (!restored) {
        setStatus("anonymous");
        return;
      }

      try {
        setUser(await api.get<MeUser>("/auth/me"));
        setStatus("authenticated");
      } catch {
        setStatus("anonymous");
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      status,
      can: (role) => (user ? hasRole(user.role, role) : false),

      loginWithTelegramWidget: async (payload) => {
        applySession(await api.post<SessionResponse>("/auth/telegram/widget", payload));
      },

      startTelegramLogin: () => api.post<StartLoginResponse>("/auth/telegram/login"),

      pollTelegramLogin: async (code) => {
        const status = await api.get<LoginTicketStatus>(
          `/auth/telegram/login/${encodeURIComponent(code)}`,
        );
        if (status.state === "confirmed" && status.session) applySession(status.session);
        return status.state;
      },

      loginAsDev: async (nickname) => {
        applySession(await api.post<SessionResponse>("/auth/dev/login", { nickname }));
      },

      logout: async () => {
        try {
          await api.post("/auth/logout");
        } finally {
          setAccessToken(null);
          setUser(null);
          setStatus("anonymous");
          queryClient.clear();
        }
      },

      refresh: async () => {
        setUser(await api.get<MeUser>("/auth/me"));
      },
    }),
    [user, status, applySession, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
