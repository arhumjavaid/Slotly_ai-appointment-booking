/**
 * The single place the frontend talks to the API.
 *
 * Components never call `fetch` directly — they go through the typed service
 * modules, which go through here. That keeps credential handling, error
 * translation and the base URL in one auditable spot.
 */

/**
 * Where API calls go.
 *
 * In production this is empty by design: requests become same-origin `/api/*`
 * and the rewrite in next.config.ts forwards them to the backend. That keeps the
 * HttpOnly session cookie first-party, which a direct cross-site call to a
 * separate API domain cannot do once third-party cookies are blocked.
 *
 * Local development talks to the backend on its own port, which is same-site.
 * NEXT_PUBLIC_API_URL overrides both if the API is ever addressed directly.
 */
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export interface ApiErrorDetail {
  field: string;
  message: string;
}

/** A failed API response, already translated into something showable. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True when the failure is the AI specifically, not the booking system. */
  get isAiFailure(): boolean {
    return this.code === 'AI_UNAVAILABLE' || this.code === 'AI_INVALID_OUTPUT';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      // The session JWT is an HttpOnly cookie, so it must be sent explicitly on
      // cross-origin requests — it is deliberately not readable from JS.
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server returned an unreadable response.');
  }

  const envelope = payload as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string; details?: ApiErrorDetail[] };
  };

  if (!response.ok || envelope.success === false) {
    throw new ApiError(
      response.status,
      envelope.error?.code ?? 'UNKNOWN_ERROR',
      envelope.error?.message ?? 'Something went wrong.',
      envelope.error?.details ?? [],
    );
  }

  return envelope.data as T;
}

/** Message for a caught error, without leaking non-Error values into the UI. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** The browser's IANA timezone, sent so bookings resolve to the right instant. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
