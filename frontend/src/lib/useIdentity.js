import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/useWallet';

// The signed-in Privy identity plus its embedded wallet on Arc.
export function useIdentity() {
  const { user } = useAuth();
  const { address, connected, balance } = useWallet();

  const email = user?.email || '';
  const name = user?.full_name || (email ? email.split('@')[0] : 'Guest');

  return {
    id: user?.id || null,
    did: user?.did || null,
    name,
    email,
    walletAddress: address || user?.wallet_address || '',
    connected,
    balance,
  };
}