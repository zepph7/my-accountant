import * as SecureStore from 'expo-secure-store';

/**
 * Where the tokens live.
 *
 * The refresh token is a bearer credential with a thirty-day life — anyone
 * holding it can mint access tokens until it is revoked. It goes in the
 * platform keystore (Keychain on iOS, EncryptedSharedPreferences on Android),
 * never in AsyncStorage, which is a plaintext file any process with the app's
 * uid can read.
 *
 * The in-memory copy is the source of truth for the running process. Storage is
 * only how a session survives a cold start, and when "Remember me" is off it is
 * skipped entirely — the session then dies with the process, which is the
 * behaviour that checkbox is actually promising.
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_KEY = 'ma.access_token';
const REFRESH_KEY = 'ma.refresh_token';

let current: Session | null = null;

/**
 * SecureStore has no web implementation and throws when called there. Web is a
 * development convenience for this project, not a shipping target, so it
 * degrades to a memory-only session rather than failing to boot.
 */
const persistent = SecureStore.isAvailableAsync !== undefined;

const write = async (key: string, value: string | null) => {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Keystore unavailable (web, or a device with no screen lock on some
    // Android builds). The in-memory session still works for this run.
  }
};

const read = async (key: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

/** The session for this process, or null when signed out. */
export const getSession = (): Session | null => current;

/** Updates the in-memory session without touching storage. */
export const setSession = (session: Session | null) => {
  current = session;
};

export const saveSession = async (session: Session, remember: boolean) => {
  current = session;
  if (!persistent || !remember) return;
  await Promise.all([
    write(ACCESS_KEY, session.accessToken),
    write(REFRESH_KEY, session.refreshToken),
  ]);
};

/**
 * Rewrites the stored tokens after a refresh, but only if a session was stored
 * in the first place. Rotating tokens must not quietly turn a "don't remember
 * me" session into a remembered one.
 */
export const updateStoredSession = async (session: Session) => {
  current = session;
  if (!persistent) return;
  const stored = await read(REFRESH_KEY);
  if (!stored) return;
  await Promise.all([
    write(ACCESS_KEY, session.accessToken),
    write(REFRESH_KEY, session.refreshToken),
  ]);
};

export const restoreSession = async (): Promise<Session | null> => {
  if (!persistent) return null;
  const [accessToken, refreshToken] = await Promise.all([read(ACCESS_KEY), read(REFRESH_KEY)]);
  // A refresh token alone is enough — the access token is short-lived and the
  // first authenticated request will mint a new one.
  if (!refreshToken) return null;
  current = { accessToken: accessToken ?? '', refreshToken };
  return current;
};

export const clearSession = async () => {
  current = null;
  await Promise.all([write(ACCESS_KEY, null), write(REFRESH_KEY, null)]);
};
