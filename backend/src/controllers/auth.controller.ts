import type { Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { created, ok } from '../utils/ApiResponse';
import * as authService from '../services/auth.service';
import * as googleService from '../services/google.service';

const REFRESH_COOKIE = 'refresh_token';

/**
 * The refresh token goes in an httpOnly cookie AND the JSON body.
 *
 * Browsers get the cookie — httpOnly puts it out of reach of XSS, which is the
 * whole point of not storing it in localStorage. The React Native client has no
 * cookie jar, so it reads the body value and stores it in secure storage.
 * sameSite=lax still permits the top-level redirect back from Google.
 */
const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

const context = (req: Request) => ({
  userAgent: req.headers['user-agent'] ?? null,
  ipAddress: req.ip ?? null,
});

export const register = async (req: Request, res: Response) => {
  const result = await authService.register(req.body, context(req));
  setRefreshCookie(res, result.refreshToken);
  return created(res, result, 'Account created');
};

export const login = async (req: Request, res: Response) => {
  const result = await authService.login(req.body, context(req));
  setRefreshCookie(res, result.refreshToken);
  return ok(res, result, 'Signed in');
};

export const refresh = async (req: Request, res: Response) => {
  // Cookie first (browser), body second (native client).
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;

  if (!token) {
    throw ApiError.unauthorized('Refresh token is required');
  }

  const result = await authService.refresh(token, context(req));
  setRefreshCookie(res, result.refreshToken);
  return ok(res, result, 'Token refreshed');
};

export const logout = async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;

  if (token) {
    await authService.logout(token);
  }

  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  return ok(res, null, 'Signed out');
};

/**
 * Reads from the database rather than echoing the token.
 *
 * The JWT carries only what request scoping needs — id, email, role, timezone —
 * so returning it would omit the phone and name the profile screen exists to
 * show, and would serve stale values for up to the token's lifetime.
 */
export const me = async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  return ok(res, await authService.getProfile(req.user.id));
};

export const updateMe = async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { user, timezoneChanged } = await authService.updateProfile(req.user.id, req.body);

  return ok(
    res,
    user,
    timezoneChanged
      ? 'Profile updated. Refresh your access token for the new timezone to apply to reports.'
      : 'Profile updated'
  );
};

const OAUTH_STATE_COOKIE = 'oauth_state';

/**
 * Step 1: redirect to Google's consent screen.
 *
 * The `state` value is stored in a short-lived httpOnly cookie and echoed by
 * Google on the way back. Comparing them is what stops an attacker from
 * feeding the callback their own authorization code and silently linking the
 * victim's session to the attacker's Google account.
 */
export const googleRedirect = async (_req: Request, res: Response) => {
  const state = googleService.generateState();

  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  });

  return res.redirect(googleService.buildAuthUrl(state));
};

/** Step 2: verify state, exchange the code, sign the user in. */
export const googleCallback = async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    throw ApiError.unauthorized(`Google sign-in was cancelled or failed: ${error}`);
  }

  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
  if (!state || !expectedState || state !== expectedState) {
    throw ApiError.unauthorized('Invalid OAuth state. Please start sign-in again.');
  }
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth' });

  if (!code) {
    throw ApiError.badRequest('Missing authorization code');
  }

  const profile = await googleService.exchangeCodeForProfile(code);
  const result = await authService.googleSignIn(profile, context(req));
  setRefreshCookie(res, result.refreshToken);

  // Browsers get redirected back into the app; API clients without a configured
  // redirect receive the tokens as JSON.
  if (env.google.successRedirect) {
    const target = new URL(env.google.successRedirect);
    target.searchParams.set('access_token', result.accessToken);
    target.searchParams.set('refresh_token', result.refreshToken);
    return res.redirect(target.toString());
  }

  return ok(res, result, 'Signed in with Google');
};
