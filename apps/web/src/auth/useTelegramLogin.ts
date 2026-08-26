import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";

/**
 * Shared across tabs on purpose: Telegram often opens the deep link in a new tab,
 * so the tab that finishes the login is rarely the one that started it.
 */
const STORAGE_KEY = "poker.login.ticket";
const POLL_MS = 3000;

type Ticket = {
  code: string;
  phrase: string;
  url: string;
  expiresAt: string;
  /** Set once the visitor has actually been sent to the bot. */
  followed: boolean;
};

export type LoginPhase = "loading" | "ready" | "waiting" | "declined" | "expired" | "error";

export type TelegramLogin = {
  phase: LoginPhase;
  /** Where to send the visitor, and the phrase the bot will ask them to match. */
  ticket: Ticket | null;
  error: string | null;
  /** Call as the visitor leaves for Telegram: starts waiting for the tap. */
  follow: () => void;
  /** Throw the ticket away and ask for a fresh one. */
  restart: () => void;
};

function read(): Ticket | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Ticket;
    return Date.parse(parsed.expiresAt) > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function write(ticket: Ticket | null): void {
  try {
    if (ticket) localStorage.setItem(STORAGE_KEY, JSON.stringify(ticket));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing with storage denied: the flow still works within one tab.
  }
}

/**
 * Drives the "confirm in the bot" login: hands out a deep link and then asks the
 * server, every few seconds, whether the button has been pressed.
 *
 * A ticket outlives a page load, so returning to the site after confirming in
 * Telegram finishes the login instead of starting over.
 */
export function useTelegramLogin(enabled: boolean): TelegramLogin {
  const { startTelegramLogin, pollTelegramLogin } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(() => read());
  const [phase, setPhase] = useState<LoginPhase>(() => {
    const stored = read();
    return stored ? (stored.followed ? "waiting" : "ready") : "loading";
  });
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  const issue = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const fresh = await startTelegramLogin();
      const stored: Ticket = { ...fresh, followed: false };
      write(stored);
      setTicket(stored);
      setPhase("ready");
    } catch (cause) {
      setError((cause as Error).message);
      setPhase("error");
    }
  }, [startTelegramLogin]);

  // One ticket per visit; a stored one is reused so a reload keeps waiting.
  useEffect(() => {
    if (!enabled || ticket || requested.current) return;
    requested.current = true;
    void issue();
  }, [enabled, ticket, issue]);

  const follow = useCallback(() => {
    setTicket((current) => {
      if (!current) return current;
      const next = { ...current, followed: true };
      write(next);
      return next;
    });
    setPhase("waiting");
  }, []);

  const restart = useCallback(() => {
    write(null);
    setTicket(null);
    requested.current = false;
    void issue();
  }, [issue]);

  useEffect(() => {
    if (phase !== "waiting" || !ticket) return;

    let alive = true;
    const check = async (): Promise<void> => {
      try {
        const state = await pollTelegramLogin(ticket.code);
        if (!alive || state === "pending") return;
        // Confirmed sessions clear the ticket too: it is single-use either way.
        write(null);
        if (state !== "confirmed") setPhase(state);
      } catch {
        // A blip in the network is not an answer; the next tick asks again.
      }
    };

    const timer = window.setInterval(() => void check(), POLL_MS);
    // Coming back from the Telegram app should feel instant, not up to a tick late.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, ticket, pollTelegramLogin]);

  // The ticket has a five-minute life; stop waiting for a tap that cannot land.
  useEffect(() => {
    if (phase !== "waiting" || !ticket) return;
    const left = Date.parse(ticket.expiresAt) - Date.now();
    const timer = window.setTimeout(() => setPhase("expired"), Math.max(left, 0));
    return () => window.clearTimeout(timer);
  }, [phase, ticket]);

  return { phase, ticket, error, follow, restart };
}
