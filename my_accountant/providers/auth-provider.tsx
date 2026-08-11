import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { setSignedOutHandler } from '@/lib/api';
import {
  continueWithGoogle,
  createAccount,
  getProfile,
  signIn,
  signOutRemote,
  type AuthResult,
  type AuthenticatedUser,
} from '@/lib/auth-client';
import { clearSession, restoreSession, saveSession, setSession } from '@/lib/session';

/**
 * Who is signed in, for the whole app.
 *
 * `status` is three-valued rather than a boolean because "we have not looked
 * yet" is a real state: the stored session is read from the keystore
 * asynchronously, and a two-valued flag would report "signed out" during that
 * read and bounce a returning user to the login screen every cold start.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  signInWithPassword: (
    credentials: { email?: string; phone?: string; password: string },
    remember: boolean
  ) => Promise<void>;
  signUpWithPassword: (
    input: {
      email: string;
      phone: string;
      password: string;
      firstName: string;
      lastName: string;
      timezone?: string;
    },
    remember: boolean
  ) => Promise<void>;
  /** Resolves false when the user backs out of Google's consent screen. */
  signInWithGoogle: (remember: boolean) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Re-reads the profile — call after changing it, so the app reflects the change. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  const adopt = useCallback(async (result: AuthResult, remember: boolean) => {
    await saveSession(
      { accessToken: result.accessToken, refreshToken: result.refreshToken },
      remember
    );
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const forget = useCallback(async () => {
    await clearSession();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  /**
   * The transport signs the user out when a refresh token is refused. Without
   * this bridge a dead session would leave every screen showing an error and no
   * way back to the sign-in form.
   */
  useEffect(() => {
    setSignedOutHandler(() => {
      setSession(null);
      setUser(null);
      setStatus('unauthenticated');
    });
    return () => setSignedOutHandler(null);
  }, []);

  /**
   * Cold start: restore the stored tokens, then prove they still work by
   * reading the profile. The access token has almost certainly expired by now —
   * the transport refreshes it transparently, and only a refusal of the refresh
   * token means the session is genuinely over.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = await restoreSession();
      if (!stored) {
        if (!cancelled) setStatus('unauthenticated');
        return;
      }

      try {
        const profile = await getProfile();
        if (cancelled) return;
        setUser(profile);
        setStatus('authenticated');
      } catch {
        // Covers both a revoked session and an unreachable server. Signing out
        // is the safe reading: the alternative is a signed-in shell with no
        // data in it and no explanation.
        if (cancelled) return;
        await clearSession();
        setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,

      signInWithPassword: async (credentials, remember) => {
        await adopt(await signIn(credentials), remember);
      },

      signUpWithPassword: async (input, remember) => {
        await adopt(await createAccount(input), remember);
      },

      signInWithGoogle: async (remember) => {
        const result = await continueWithGoogle();
        if (!result) return false;
        await adopt(result, remember);
        return true;
      },

      signOut: async () => {
        // Revoked server-side first, while the token is still in hand.
        await signOutRemote();
        await forget();
      },

      refreshUser: async () => {
        setUser(await getProfile());
      },
    }),
    [status, user, adopt, forget]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
