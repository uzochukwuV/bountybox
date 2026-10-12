import React from 'react'
import ReactDOM from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import App from '@/App.jsx'
import { ARC_CHAIN } from '@/lib/arc'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <PrivyProvider
    appId={import.meta.env.VITE_PRIVY_APP_ID}
    config={{
      loginMethods: ['email', 'google', 'wallet'],
      embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
      defaultChain: ARC_CHAIN,
      supportedChains: [ARC_CHAIN],
      appearance: { theme: 'light', accentColor: '#1a1a1a' },
    }}
  >
    <App />
  </PrivyProvider>
)
