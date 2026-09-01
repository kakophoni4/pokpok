import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { App } from "../App";
import { setAccessToken } from "../lib/api";

type Route = {
  /** Matched against `${method} ${pathWithQuery}`, e.g. "GET /tournaments". */
  match: string;
  status?: number;
  /** A function lets a test change the response between refetches. */
  body?: unknown | (() => unknown);
};

export type FetchLog = { method: string; path: string; body: unknown }[];

/**
 * Replaces window.fetch with a tiny router over canned responses.
 *
 * A real bug this project already hit was the API base URL being wrong, so the
 * stub asserts on the full path including the /api prefix rather than on
 * whatever the client happens to request.
 */
export function stubApi(routes: Route[]): FetchLog {
  const log: FetchLog = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (!url.startsWith("/api/")) {
        throw new Error(`Request escaped the API base: ${method} ${url}`);
      }

      const path = url.slice("/api".length);
      const parsedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      log.push({ method, path, body: parsedBody });

      const route = routes.find((candidate) => `${method} ${path}`.startsWith(candidate.match));
      if (!route) {
        return jsonResponse(404, { code: "NOT_FOUND", message: `No stub for ${method} ${path}` });
      }

      const body = typeof route.body === "function" ? (route.body as () => unknown)() : route.body;
      return jsonResponse(route.status ?? 200, body ?? null);
    }),
  );

  return log;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function renderApp(path = "/"): ReturnType<typeof render> {
  window.history.pushState({}, "", path);
  setAccessToken(null);
  return render(<App /> as ReactElement);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export const SEASON = {
  id: "season1",
  title: "Сезон 2026",
  startsAt: "2026-01-15T00:00:00.000Z",
  endsAt: null,
  isActive: true,
  ratingConfig: {
    startingStack: 40_000,
    addonChips: 80_000,
    divisor: 200,
    defaultPaidPlaces: 9,
    lastPlaceShare: 0.1,
    shareCurve: 2,
    bestOfCount: 10,
  },
};

export function tournament(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Weekly Freezeout #16",
    paidPlaces: 9,
    minRating: null,
    status: "reg_open",
    startsAt: "2099-06-01T16:00:00.000Z",
    regOpensAt: null,
    regClosesAt: "2099-06-01T16:00:00.000Z",
    capacity: 12,
    ratingMultiplier: 1,
    venue: { id: "v1", title: "Покер-клуб «Роял»", address: "Тверская, 18" },
    registeredCount: 9,
    waitlistCount: 0,
    myRegistration: null,
    ...overrides,
  };
}

export function player(id: string, nickname: string) {
  return { id, nickname, avatarUrl: null, role: "player" };
}

export const ME = {
  id: "u1",
  nickname: "Ferz",
  displayName: "Артём Фёдоров",
  avatarUrl: null,
  role: "admin",
  status: "active",
  createdAt: "2026-01-20T10:00:00.000Z",
  identities: [{ provider: "telegram", username: "ferz", linkedAt: "2026-01-20T10:00:00.000Z" }],
  notifyTelegram: true,
  notifyVk: false,
};
