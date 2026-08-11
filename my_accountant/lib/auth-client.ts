import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { ApiError, baseUrl, request } from './api';
import { getSession } from './session';

// Closes the popup that a web build leaves open when it returns from Google.
// A no-op on native.
WebBrowser.maybeCompleteAuthSession();

export interface AuthenticatedUser {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
  timezone: string;
  isVerified: boolean;
  createdAt: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

/** Sign in with either an email or a phone number, plus the password. */
export const signIn = (body: { email?: string; phone?: string; password: string }) =>
  request<AuthResult>('/api/auth/login', {
    method: 'POST',
    body,
    anonymous: true,
    // The screen shows one identifier field; the API reports a bad identifier
    // against whichever key was sent.
    renameFields: { email: 'identifier', phone: 'identifier' },
  });

/** Create an account. The API requires both an email and a phone number. */
export const createAccount = (body: {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  timezone?: string;
}) => request<AuthResult>('/api/auth/register', { method: 'POST', body, anonymous: true });

export const getProfile = () => request<AuthenticatedUser>('/api/auth/me');

export const updateProfile = (body: {
  phone?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
}) => request<AuthenticatedUser>('/api/auth/me', { method: 'PATCH', body });

/**
 * Revokes the refresh token server-side.
 *
 * Sent anonymously and deliberately: the endpoint identifies the session by the
 * token in the body, and the access token may already have expired — a logout
 * that fails because the user waited fifteen minutes would leave a live refresh
 * token behind.
 */
export const signOutRemote = async () => {
  const refreshToken = getSession()?.refreshToken;
  if (!refreshToken) return;
  try {
    await request<null>('/api/auth/logout', { method: 'POST', body: { refreshToken }, anonymous: true });
  } catch {
    // Local sign-out proceeds regardless. The token expires on its own, and
    // stranding the user in a signed-in state because the network was down is
    // the worse failure.
  }
};

/**
 * Google sign-in and sign-up are the same call — the API decides which it is.
 *
 * `/api/auth/google` matches on the Google account id first, then on a verified
 * email. So someone who registered with a password and later taps this button
 * is linked to the account they already have, rather than given a second one
 * holding none of their financial history.
 *
 * The flow runs in the system's authentication browser — `ASWebAuthenticationSession`
 * on iOS, a Custom Tab on Android — not a WebView. That matters twice over:
 * Google refuses to serve its consent screen to an embedded WebView, and the
 * `oauth_state` cookie the API sets on the way out is only returned on the way
 * back because it is the same browser session.
 *
 * The API redirects to its `OAUTH_SUCCESS_REDIRECT` carrying the tokens, so on
 * a device that value has to be this app's deep link — `myaccountant://auth/callback`.
 * It ships pointing at `http://localhost:8081/auth/callback`, which is the web
 * bundler, not the app.
 *
 * Returns `null` when the user backs out, which is not an error and should not
 * be reported as one.
 */
export const continueWithGoogle = async (): Promise<AuthResult | null> => {
  const redirectUrl = Linking.createURL('auth/callback');

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(`${baseUrl()}/api/auth/google`, redirectUrl);
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError(0, 'Could not open Google sign-in. Try again.');
  }

  if (result.type !== 'success') return null;

  const { queryParams } = Linking.parse(result.url);
  const accessToken = typeof queryParams?.access_token === 'string' ? queryParams.access_token : null;
  const refreshToken =
    typeof queryParams?.refresh_token === 'string' ? queryParams.refresh_token : null;

  if (!accessToken || !refreshToken) {
    // The API redirects here on failure too, so prefer whatever it said over a
    // guess about what went wrong.
    const message = typeof queryParams?.message === 'string' ? queryParams.message : null;
    throw new ApiError(0, message ?? 'Google sign-in did not complete. Try again.');
  }

  // The redirect carries tokens but no profile, so it is read back with the
  // token that was just issued.
  const response = await fetch(`${baseUrl()}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const payload = (await response.json().catch(() => null)) as
    | { success: boolean; data?: AuthenticatedUser; message?: string }
    | null;

  if (!response.ok || !payload?.success || !payload.data) {
    throw new ApiError(
      response.status,
      payload?.message ?? 'Signed in, but the profile could not be loaded.'
    );
  }

  return { accessToken, refreshToken, user: payload.data };
};
