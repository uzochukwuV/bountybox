import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_SUPABASE_JWT_SECRET lets the app mint a Supabase session in the browser
  // (src/lib/privySupabase.js). It is a full-privilege JWT secret and is dev-only:
  // a production build must use the privy-session Edge Function instead. Fail the
  // build loudly rather than shipping the secret in the bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const jwtSecret = env.VITE_SUPABASE_JWT_SECRET || process.env.VITE_SUPABASE_JWT_SECRET
  if (mode === 'production' && jwtSecret) {
    throw new Error(
      'VITE_SUPABASE_JWT_SECRET is set for a production build. The in-browser HS256 ' +
        'mint is development only; set VITE_PRIVY_SESSION_URL (the privy-session Edge ' +
        'Function) and remove the secret.'
    )
  }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 12000,
      allowedHosts: true,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
