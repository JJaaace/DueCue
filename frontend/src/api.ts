import { authorizationHeader } from "./auth";

const DEFAULT_TIMEOUT_MS = 12_000;
const STARTUP_ATTEMPTS = 4;
const DEMO_SESSION_KEY = "duecue:anonymous-demo-session:v1";

export type ApiFailureKind = "configuration" | "timeout" | "network" | "authentication" | "not_found" | "server" | "request";

export class ApiError extends Error {
  constructor(message: string, public readonly kind: ApiFailureKind, public readonly status?: number, public readonly retryable = false) {
    super(message);
    this.name = "ApiError";
  }
}

export const resolveApiBaseUrl = (configured: string | undefined, production: boolean) => {
  const value = configured?.trim();
  if (value) return value.replace(/\/$/, "");
  if (production) throw new ApiError("DueCue is not connected to its server.", "configuration");
  return "";
};
export const apiBaseUrl = () => resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, import.meta.env.PROD);

export const getAnonymousDemoSessionId = () => {
  try { return window.localStorage.getItem(DEMO_SESSION_KEY); } catch { return null; }
};

export const setAnonymousDemoSessionId = (sessionId: string | null) => {
  try {
    if (sessionId) window.localStorage.setItem(DEMO_SESSION_KEY, sessionId);
    else window.localStorage.removeItem(DEMO_SESSION_KEY);
  } catch { /* The backend can issue a fresh temporary session if storage is unavailable. */ }
};

type ApiOptions = RequestInit & {
  anonymousDemo?: boolean;
  timeoutMs?: number;
  attempts?: number;
  onRetry?: (attempt: number, error: ApiError) => void;
};

const wait = (milliseconds: number) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
const retryDelay = (attempt: number) => Math.min(1_000 * 2 ** (attempt - 1), 8_000);

function responseError(status: number, message?: string) {
  if (status === 401 || status === 403) return new ApiError("Your session could not be verified.", "authentication", status);
  if (status === 404) return new ApiError("The requested DueCue resource was not found.", "not_found", status);
  if (status >= 500 || status === 408 || status === 429) return new ApiError("The DueCue server is temporarily unavailable.", "server", status, true);
  return new ApiError(message || "DueCue could not complete that request.", "request", status);
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { anonymousDemo, timeoutMs = DEFAULT_TIMEOUT_MS, attempts = 1, onRetry, ...requestOptions } = options;
  const endpoint = `${apiBaseUrl()}/api${path}`;
  let lastError: ApiError | undefined;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(requestOptions.headers);
      headers.set("Content-Type", "application/json");
      for (const [name, value] of Object.entries(await authorizationHeader())) headers.set(name, value);
      if (anonymousDemo) {
        const sessionId = getAnonymousDemoSessionId();
        if (sessionId) headers.set("X-DueCue-Demo-Session", sessionId);
      }
      const response = await fetch(endpoint, { ...requestOptions, headers, signal: controller.signal });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw responseError(response.status, payload.error);
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ApiError) lastError = error;
      else if (error instanceof DOMException && error.name === "AbortError") lastError = new ApiError("The DueCue server took too long to respond.", "timeout", undefined, true);
      else lastError = new ApiError("DueCue could not reach its server.", "network", undefined, true);
      if (!lastError.retryable || attempt >= attempts) break;
      onRetry?.(attempt, lastError);
      await wait(retryDelay(attempt));
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  if (import.meta.env.DEV) console.error("DueCue API request failed", { endpoint, kind: lastError?.kind, status: lastError?.status });
  throw lastError ?? new ApiError("DueCue could not complete that request.", "request");
}

export const startupApi = <T,>(path: string, options: ApiOptions = {}) => api<T>(path, { ...options, attempts: STARTUP_ATTEMPTS });
