import { db } from '@/api/db';
import { supabase } from '@/api/supabaseClient';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState(null);

  const loadUser = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await db.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data?.session) {
        await loadUser();
      } else {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthChecked(true);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        loadUser();
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, [loadUser]);

  const logout = async () => {
    await db.auth.logout();
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
        appPublicSettings,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth: loadUser,
        checkAppState: loadUser,
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
