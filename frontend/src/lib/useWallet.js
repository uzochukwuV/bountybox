// Privy-backed wallet session on Arc.
//
// Wraps Privy's embedded (or external) wallet in a viem wallet client bound to
// Arc, and exposes the ERC-20 USDC balance. Replaces the old mock wallet.

import { useCallback, useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom } from 'viem';
import { ARC_CHAIN, USDC_DECIMALS, formatUSDCUnits, getUSDCBalance } from '@/lib/arc';

// Privy's embedded wallet is reported as walletClientType 'privy'; a connected
// MetaMask etc. shows up as its own type. Prefer the embedded wallet.
function pickWallet(wallets) {
  return wallets.find((w) => w.walletClientType === 'privy') || wallets[0] || null;
}

export function useWallet() {
  const { authenticated } = usePrivy();
  const { wallets, ready } = useWallets();
  const [balance, setBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const wallet = pickWallet(wallets);
  const address = wallet?.address || '';
  const connected = !!address;
  const onArc = Number(wallet?.chainId) === ARC_CHAIN.id;

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(0);
      return;
    }
    setBalanceLoading(true);
    try {
      const units = await getUSDCBalance(address);
      setBalance(Number(formatUSDCUnits(units)));
    } catch {
      setBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const getWalletClient = useCallback(async () => {
    if (!wallet) throw new Error('No wallet connected');
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({
      account: address,
      chain: ARC_CHAIN,
      transport: custom(provider),
    });
  }, [wallet, address]);

  const switchToArc = useCallback(async () => {
    if (!wallet) return;
    await wallet.switchChain(ARC_CHAIN.id);
  }, [wallet]);

  return {
    ready,
    authenticated,
    wallet,
    address,
    connected,
    onArc,
    balance,
    balanceLoading,
    usdcDecimals: USDC_DECIMALS,
    getWalletClient,
    switchToArc,
    refreshBalance,
  };
}
