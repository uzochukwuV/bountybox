import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/useWallet';

// The signed-in account plus the mock connected wallet.
export function useIdentity() {
  const { user } = useAuth();
  const { wallet, balance, connected } = useWallet();

  const email = user?.email || '';
  const name = user?.full_name || (email ? email.split('@')[0] : 'Guest');

  return {
    id: user?.id || null,
    name,
    email,
    walletAddress: wallet?.address || '',
    connected,
    balance,
  };
}