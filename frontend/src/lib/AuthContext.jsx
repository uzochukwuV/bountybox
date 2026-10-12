import { db } from '@/api/db';
import { supabase } from '@/api/supabaseClient';
import { bridgeSession } from '@/lib/privySupabase';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

const AuthContext = createContext();

// Pull a display name out of whichever Privy login method was used.
function displayName(privyUser) {
  const email = privyUser?.email?.address || '';
  const social =
    privyUser?.google?.name ||
    privyUser?.twitter?.name ||
    privyUser?.github?.name ||
    privyUser?.discord?.username ||
    '';
  return social || privyUser?.email?.name || (email ? email.split('@')[0] : 'Guest');
}

function walletAddress(privyUser) {
  if (privyUser?.wallet?.address) return privyUser.wallet.address;
  const linked = privyUser?.linkedAccounts?.find((account) => account.type === 'wallet');
  return linked?.address || '';
}

// The Privy identity, independent of whether a Supabase session was obtained.
function privyIdentity(privyUser) {
  if (!privyUser) return null;
  const email = privyUser.email?.address || '';
  return {
    did: privyUser.id,
    email,
    full_name: displayName(privyUser),
    wallet_address: walletAddress(privyUser),
  };
}

export const AuthProvider = ({ children }) => {
  const { ready, authenticated, user: privyUser, logout: privyLogout, getAccessToken } = usePrivy();

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState(null);
  const [sessionError, setSessionError] = useState(null);

  const syncSession = useCallback(async () => {
    const identity = privyIdentity(privyUser);
    setIsLoadingAuth(true);
    setAuthError(null);
    setSessionError(null);
    try {
      const accessToken = await getAccessToken();
      const session = await bridgeSession({ ...identity, accessToken });

      if (session) {
        const { error } = await supabase.auth.setSession(session);
        if (error) throw error;
      } else {
        // No bridge configured. Try an anonymous Supabase session so RLS still
        // works; this is device-bound and must be enabled in Supabase Auth.
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }

      // Make sure the profile row reflects the Privy identity (RLS allows a user
      // to insert/update only their own row).
      await db.auth.ensureProfile(identity).catch(() => {});
      const me = await db.auth.me();

      setUser({ ...me, ...identity });
      setIsAuthenticated(true);
    } catch (error) {
      // Privy login succeeded but the Supabase session could not be established.
      // Keep the app usable (wallet flows work) and surface the reason.
      setSessionError(error.message || 'Could not establish a database session');
      setUser({ id: null, ...identity, role: 'user', degraded: true });
      setIsAuthenticated(true);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [privyUser, getAccessToken]);

  useEffect(() => {
    if (!ready) return;
    if (authenticated) {
      syncSession();
    } else {
      setUser(null);
      setIsAuthenticated(false);
      setSessionError(null);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [ready, authenticated, syncSession]);

  // The Supabase session is minted by the bridge and expires (~1h); gotrue's own
  // refresh may not accept our refresh token. If the session drops while Privy is
  // still authenticated, re-mint instead of leaving the user signed out.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && authenticated) syncSession();
    });
    return () => data?.subscription?.unsubscribe?.();
  }, [authenticated, syncSession]);

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    await privyLogout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        sessionError,
        appPublicSettings,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth: syncSession,
        checkAppState: syncSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
