import type { ApiError, SessionResponse } from "@poker/contracts";

/**
 * Same-origin by default: the dev server and the production reverse proxy both
 * forward /api to the backend, which keeps the httpOnly refresh cookie working
 * without any CORS configuration. An override must include the /api suffix.
 */
const BASE = import.meta.env.VITE_API_URL?.trim() || "/api";

/**
 * The access token lives in memory only. Anything in localStorage is readable by
 * any injected script; the long-lived credential is the httpOnly refresh cookie,
 * which JavaScript cannot touch at all.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

const listeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function onTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

type RequestOptions = {
  body?: unknown;
  /** Set for the refresh call itself, to avoid an infinite refresh loop. */
  skipRefresh?: boolean;
  signal?: AbortSignal;
};

async function send<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    // Needed so the refresh cookie travels with same-origin requests.
    credentials: "include",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (response.status === 401 && !options.skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) return send<T>(method, path, { ...options, skipRefresh: true });
  }

  if (!response.ok) throw await toRequestError(response);

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function toRequestError(response: Response): Promise<RequestError> {
  let payload: Partial<ApiError> = {};
  try {
    payload = (await response.json()) as Partial<ApiError>;
  } catch {
    // Non-JSON error (proxy, gateway); the status alone has to do.
  }

  return new RequestError(
    response.status,
    payload.code ?? "ERROR",
    payload.message ?? `Запрос не удался (${response.status})`,
    payload.details,
  );
}

/** Concurrent 401s share one refresh request instead of stampeding the endpoint. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const session = await send<SessionResponse>("POST", "/auth/refresh", { skipRefresh: true });
      setAccessToken(session.accessToken);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => send<T>("GET", path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => send<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) => send<T>("PATCH", path, { body }),
  delete: <T>(path: string) => send<T>("DELETE", path),
};

/** Builds a query string, dropping empty values so URLs stay readable. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}
