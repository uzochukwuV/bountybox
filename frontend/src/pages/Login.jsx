import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Loader2, Wallet } from 'lucide-react';

import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { safeReturnTo } from '@/lib/authReturnTo';

export default function Login() {
  const { ready, authenticated, login } = usePrivy();
  const { isAuthenticated, isLoadingAuth, sessionError } = useAuth();
  const navigate = useNavigate();
  const returnTo = safeReturnTo();

  // Once Privy is authenticated and the session bridge has settled, continue.
  useEffect(() => {
    if (authenticated && !isLoadingAuth && isAuthenticated) {
      navigate(returnTo, { replace: true });
    }
  }, [authenticated, isLoadingAuth, isAuthenticated, navigate, returnTo]);

  if (authenticated && isAuthenticated && !isLoadingAuth) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <AuthLayout
      icon={Wallet}
      title="Sign in to BountyBox"
      subtitle="Log in with email, social, or a wallet — no password."
    >
      {sessionError && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Signed in, but the database session could not be established: {sessionError}
        </div>
      )}

      <Button
        className="h-12 w-full text-sm font-medium"
        onClick={login}
        disabled={!ready || isLoadingAuth}
        data-testid="privy-login"
      >
        {!ready || isLoadingAuth ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Preparing…
          </>
        ) : (
          'Continue'
        )}
      </Button>

      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
        A wallet is created for you automatically. It funds escrow and receives USDC
        payouts on Arc.
      </p>
    </AuthLayout>
  );
}
