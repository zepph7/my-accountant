import {
  clearSession,
  getSession,
  updateStoredSession,
  type Session,
} from './session';

/**
 * The transport every screen goes through.
 *
 * Responsibilities, in order: find the API, attach the access token, and when
 * that token has expired, refresh it once and replay the request. Everything
 * above this file deals in resources, never in headers or status codes.
 */

export type FieldErrors = Record<string, string>;

export const baseUrl = () => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new ApiError(
      0,
      'The app has no API address configured. Set EXPO_PUBLIC_API_URL and restart the bundler.'
    );
  }
  return url.replace(/\/+$/, '');
};

/**
 * A failed request, carrying whatever the API could attribute to a particular
 * field so a form can put the message next to the input that caused it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** True when retrying the same request might work. */
  get isTransient() {
    return this.status === 0 || this.status >= 500;
  }
}

interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: { field: string; message: string }[];
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  pagination: PaginationMeta;
}

const toFieldErrors = (
  errors: { field: string; message: string }[] | undefined,
  rename: Record<string, string> = {}
): FieldErrors => {
  const mapped: FieldErrors = {};
  for (const issue of errors ?? []) {
    const field = rename[issue.field] ?? issue.field;
    if (field === '(root)') continue;
    // First message per field wins; a second for the same input would replace
    // it before the user ever read it.
    mapped[field] ??= issue.message;
  }
  return mapped;
};

/* ------------------------------------------------------------------ session */

/**
 * Called when the refresh token is refused. The auth provider registers a
 * handler so a dead session sends the user to the sign-in screen instead of
 * leaving every screen showing an unexplained error.
 */
let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (handler: (() => void) | null) => {
  onSignedOut = handler;
};

/**
 * In-flight refresh, shared by every caller.
 *
 * A dashboard fires six requests at once. If each one refreshed independently,
 * five of them would present a token that the first had already rotated — and
 * the API treats a replayed refresh token as theft and revokes every session
 * the user has. One refresh, awaited by all of them.
 */
let refreshing: Promise<Session | null> | null = null;

const performRefresh = async (refreshToken: string): Promise<Session | null> => {
  try {
    const response = await fetch(`${baseUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const payload = (await response.json().catch(() => null)) as Envelope<{
      accessToken: string;
      refreshToken: string;
    }> | null;

    if (!response.ok || !payload?.success || !payload.data) return null;

    const session = {
      accessToken: payload.data.accessToken,
      refreshToken: payload.data.refreshToken,
    };
    await updateStoredSession(session);
    return session;
  } catch {
    // A network failure is not proof the session is dead, so the caller
    // surfaces it as a transient error rather than signing the user out.
    return null;
  }
};

const refreshSession = (refreshToken: string) => {
  refreshing ??= performRefresh(refreshToken).finally(() => {
    refreshing = null;
  });
  return refreshing;
};

/* ------------------------------------------------------------------ request */

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Skips the Authorization header — used by register, login and refresh. */
  anonymous?: boolean;
  /** Maps API field names onto the names a form is using. */
  renameFields?: Record<string, string>;
}

const buildUrl = (path: string, query?: Query) => {
  const url = `${baseUrl()}${path}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Undefined and null mean "no filter", which is not the same as an empty
    // string — the API validates types and would reject `?wallet=`.
    if (value === undefined || value === null || value === '') continue;
    search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
};

const send = async (path: string, options: RequestOptions, token: string | null) => {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
};

/**
 * Performs a request and unwraps the API envelope.
 *
 * On a 401 with a refresh token in hand, the token is refreshed once and the
 * request replayed. Only once: if the replay is also refused, the session is
 * genuinely dead and retrying would loop.
 */
export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const session = options.anonymous ? null : getSession();

  let response: Response;
  try {
    response = await send(path, options, session?.accessToken ?? null);
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 401 && session?.refreshToken && !options.anonymous) {
    const renewed = await refreshSession(session.refreshToken);

    if (!renewed) {
      await clearSession();
      onSignedOut?.();
      throw new ApiError(401, 'Your session has expired. Sign in again.');
    }

    try {
      response = await send(path, options, renewed.accessToken);
    } catch {
      throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
    }

    if (response.status === 401) {
      await clearSession();
      onSignedOut?.();
      throw new ApiError(401, 'Your session has expired. Sign in again.');
    }
  }

  // 204 has no body to parse.
  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok || !payload?.success) {
    throw new ApiError(
      response.status,
      payload?.message ??
        (response.status >= 500
          ? 'The server ran into a problem. Try again in a moment.'
          : 'That request could not be completed.'),
      toFieldErrors(payload?.errors, options.renameFields)
    );
  }

  /**
   * Listing endpoints put the rows and the page meta at the top level rather
   * than inside `data`, alongside any resource-level extras — the distribution
   * list ships its percentage total that way. Everything but the envelope
   * bookkeeping is handed back so those extras are not silently dropped.
   */
  if (payload.pagination) {
    const rest = { ...(payload as unknown as Record<string, unknown>) };
    delete rest.success;
    delete rest.message;
    delete rest.errors;
    return rest as T;
  }

  return payload.data as T;
};
