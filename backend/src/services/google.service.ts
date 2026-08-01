import { randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

let client: OAuth2Client | null = null;

const getClient = () => {
  if (!env.google.enabled) {
    throw ApiError.badRequest('Google sign-in is not configured on this server');
  }
  client ??= new OAuth2Client({
    clientId: env.google.clientId,
    clientSecret: env.google.clientSecret,
    redirectUri: env.google.callbackUrl,
  });
  return client;
};

/** Opaque random value echoed back by Google; guards the callback against CSRF. */
export const generateState = (): string => randomBytes(16).toString('base64url');

export const buildAuthUrl = (state: string): string =>
  getClient().generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    // Google omits a refresh token on repeat consents unless asked; we do not
    // use it today, but losing it silently would be a trap later.
    prompt: 'consent',
  });

/**
 * Exchanges the authorization code for tokens and verifies the id_token.
 *
 * Verification is the security-critical step: it checks Google's signature,
 * the audience (our client id), and the issuer. Reading the JWT payload
 * without verifying would let anyone mint an id_token for any email and
 * impersonate any user.
 */
export const exchangeCodeForProfile = async (code: string): Promise<GoogleProfile> => {
  const oauth = getClient();

  let idToken: string | undefined;
  try {
    const { tokens } = await oauth.getToken(code);
    idToken = tokens.id_token ?? undefined;
  } catch {
    throw ApiError.unauthorized('Google rejected the authorization code');
  }

  if (!idToken) {
    throw ApiError.unauthorized('Google did not return an identity token');
  }

  const ticket = await oauth.verifyIdToken({ idToken, audience: env.google.clientId! });
  const payload = ticket.getPayload();

  if (!payload?.email || !payload.sub) {
    throw ApiError.unauthorized('Google profile is missing an email address');
  }

  // An unverified Google email could belong to someone else, and we link
  // accounts by email — accepting it would be an account-takeover vector.
  if (payload.email_verified === false) {
    throw ApiError.forbidden('Your Google email address is not verified');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    firstName: payload.given_name ?? 'User',
    lastName: payload.family_name ?? '',
    avatarUrl: payload.picture ?? null,
  };
};
