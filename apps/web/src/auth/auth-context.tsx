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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, refreshSession, setAccessToken } from "../lib/api";
import { platform } from "../platform/platform";

type AuthState = {
  user: MeUser | null;
  status: "loading" | "authenticated" | "anonymous";
  /**
   * The Telegram hand-off is still in flight. Screens wait on this rather than
   * on "are we inside Telegram", so a launch that never delivers initData ends
   * in an ordinary sign-in screen instead of a spinner that never stops.
   */
  signingIn: boolean;
  can: (role: UserRole) => boolean;
  loginWithTelegramWidget: (payload: Record<string, unknown>) => Promise<void>;
  /** Signs in from Telegram Mini App initData. Throws if Telegram sent nothing. */
  loginWithMiniApp: () => Promise<void>;
  /** Opens a ticket to confirm in the bot; returns the deep link to follow. */
  startTelegramLogin: () => Promise<StartLoginResponse>;
  /** Asks whether the tap happened. A confirmed ticket signs us in on the spot. */
  pollTelegramLogin: (code: string) => Promise<LoginTicketOutcome>;
  loginAsDev: (nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** How long a Mini App launch gets to produce initData before we give up. */
const TELEGRAM_HANDOFF_MS = 12_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [signingIn, setSigningIn] = useState(() => platform.isEmbedded);
  // Absolute, so re-running the poll effect cannot extend the wait.
  const handoffDeadline = useRef(Date.now() + TELEGRAM_HANDOFF_MS);
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
   * Restores a session on load. Cookie first for the plain web; Mini App initData
   * is also polled in the background so a late WebView payload still signs us in.
   */
  useEffect(() => {
    let cancelled = false;

    async function loginWithInitData(initData: string): Promise<boolean> {
      try {
        const session = await api.post<SessionResponse>("/auth/telegram/miniapp", { initData });
        if (!cancelled) applySession(session);
        return true;
      } catch {
        return false;
      }
    }

    async function restore(): Promise<void> {
      platform.ready();
      const immediate = platform.telegramInitData();
      if (immediate && (await loginWithInitData(immediate))) return;

      if (platform.isEmbedded) {
        const later = await platform.telegramInitDataSoon(8000);
        if (later && (await loginWithInitData(later))) return;
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

  /**
   * Telegram can fill initData after the first paint. Keep trying for a while
   * whether or not we already decided this is a Mini App — detection is racy.
   */
  useEffect(() => {
    if (status === "authenticated") {
      setSigningIn(false);
      return;
    }

    let cancelled = false;
    let timer = 0;

    const tick = (): void => {
      if (cancelled) return;
      if (Date.now() >= handoffDeadline.current) {
        window.clearInterval(timer);
        setSigningIn(false);
        return;
      }
      platform.ready();
      const initData = platform.telegramInitData();
      if (!initData) return;
      void (async () => {
        try {
          const session = await api.post<SessionResponse>("/auth/telegram/miniapp", { initData });
          if (!cancelled) applySession(session);
        } catch {
          /* next tick retries until the deadline */
        }
      })();
    };

    tick();
    timer = window.setInterval(tick, 250);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, applySession]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      status,
      signingIn,
      can: (role) => (user ? hasRole(user.role, role) : false),

      loginWithTelegramWidget: async (payload) => {
        applySession(await api.post<SessionResponse>("/auth/telegram/widget", payload));
      },

      loginWithMiniApp: async () => {
        platform.ready();
        const initData = (await platform.telegramInitDataSoon()) ?? platform.telegramInitData();
        if (!initData) {
          throw new Error("Telegram не передал данные входа. Откройте клуб из меню бота.");
        }
        applySession(await api.post<SessionResponse>("/auth/telegram/miniapp", { initData }));
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
    [user, status, signingIn, applySession, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
