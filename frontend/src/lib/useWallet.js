import { useEffect, useState } from 'react';
import { loadBalance, loadWallet } from '@/lib/arc';

export function useWallet() {
  const [state, setState] = useState({ wallet: null, balance: 0 });

  useEffect(() => {
    const sync = () => setState({ wallet: loadWallet(), balance: loadBalance() });
    sync();
    window.addEventListener('bb:wallet', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('bb:wallet', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { wallet: state.wallet, balance: state.balance, connected: !!state.wallet };
}